import mqtt from "mqtt";
import { MongoClient } from "mongodb";
import pg from "pg";
import {
  DeleteMessageBatchCommand,
  ReceiveMessageCommand,
  SQSClient,
} from "@aws-sdk/client-sqs";
import { IoTDataPlaneClient, PublishCommand } from "@aws-sdk/client-iot-data-plane";
import {
  buildCommand,
  commandTopic,
  desiredBrightness,
  movingAverage,
  validateTelemetry,
} from "@luminascale/core";

const { Pool } = pg;
const config = {
  queueUrl: process.env.SQS_QUEUE_URL,
  sqsEndpoint: process.env.SQS_ENDPOINT,
  region: process.env.AWS_REGION ?? "ap-southeast-2",
  mongoUrl: process.env.MONGO_URL ?? "mongodb://localhost:27017",
  mongoDatabase: process.env.MONGO_DATABASE ?? "luminascale",
  postgresUrl: process.env.POSTGRES_URL,
  mqttUrl: process.env.MQTT_URL,
  iotDataEndpoint: process.env.IOT_DATA_ENDPOINT,
  luxWindow: Number.parseInt(process.env.LUX_WINDOW ?? "5", 10),
  storageMode: process.env.STORAGE_MODE ?? "persistent",
  processingDelayMs: Number.parseInt(process.env.PROCESSING_DELAY_MS ?? "25", 10),
};

if (!config.queueUrl) throw new Error("SQS_QUEUE_URL is required");
if (config.storageMode === "persistent" && !config.postgresUrl) {
  throw new Error("POSTGRES_URL is required in persistent storage mode");
}

function log(level, message, fields = {}) {
  console.log(JSON.stringify({ level, service: "processor", message, ...fields, timestamp: new Date().toISOString() }));
}

const sqs = new SQSClient({
  region: config.region,
  endpoint: config.sqsEndpoint,
  credentials: config.sqsEndpoint ? { accessKeyId: "local", secretAccessKey: "local" } : undefined,
});
const mongo = config.storageMode === "persistent" ? new MongoClient(config.mongoUrl) : null;
const postgres = config.storageMode === "persistent" ? new Pool({ connectionString: config.postgresUrl, max: 5 }) : null;
const mqttClient = config.mqttUrl ? mqtt.connect(config.mqttUrl, { clientId: `luminascale-processor-${process.pid}` }) : null;
const iot = config.iotDataEndpoint ? new IoTDataPlaneClient({ region: config.region, endpoint: config.iotDataEndpoint }) : null;

let running = true;
let telemetry;
let deviceState;
let processed = 0;

async function publishCommand(command) {
  const topic = commandTopic(command.buildingId, command.apartmentId, command.deviceId);
  const payload = JSON.stringify(command);
  if (mqttClient) {
    await new Promise((resolve, reject) => mqttClient.publish(topic, payload, { qos: 1 }, (error) => error ? reject(error) : resolve()));
    return;
  }
  if (iot) {
    await iot.send(new PublishCommand({ topic, qos: 1, payload: Buffer.from(payload) }));
    return;
  }
  throw new Error("No command publisher configured; set MQTT_URL or IOT_DATA_ENDPOINT");
}

async function loadRule(event) {
  const result = await postgres.query(
    `SELECT enabled, lux_threshold AS "luxThreshold", motion_required AS "motionRequired", brightness
       FROM lighting_rules
      WHERE (building_id = $1 OR building_id IS NULL)
        AND (apartment_id = $2 OR apartment_id IS NULL)
      ORDER BY apartment_id NULLS LAST, building_id NULLS LAST
      LIMIT 1`,
    [event.buildingId, event.apartmentId],
  );
  return result.rows[0] ?? null;
}

async function processEvent(event) {
  const validation = validateTelemetry(event);
  if (!validation.ok) throw new Error(`invalid queued event: ${validation.errors.join(", ")}`);

  // Academy mode keeps the cloud scaling demonstration inexpensive. The full
  // persistence and lighting-rule path remains enabled locally and in normal AWS.
  if (config.storageMode === "scaling-demo") {
    if (config.processingDelayMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, config.processingDelayMs));
    }
    return { validated: true, storageMode: config.storageMode };
  }

  try {
    await telemetry.insertOne(event);
  } catch (error) {
    if (error.code === 11000) return { duplicate: true };
    throw error;
  }

  const patch = { updatedAt: new Date(), lastSequenceNo: event.sequenceNo };
  if (event.type === "motion") patch.occupied = event.motion;
  if (event.type === "lux") patch.lastLux = event.lux;
  if (event.brightness !== undefined) patch.brightness = event.brightness;
  if (event.watts !== undefined) patch.watts = event.watts;
  await deviceState.updateOne(
    { buildingId: event.buildingId, apartmentId: event.apartmentId },
    { $set: patch, $setOnInsert: { createdAt: new Date() } },
    { upsert: true },
  );

  if (event.type !== "lux" && event.type !== "motion") return { stored: true };
  const state = await deviceState.findOne({ buildingId: event.buildingId, apartmentId: event.apartmentId });
  const samples = await telemetry.find({
    buildingId: event.buildingId,
    apartmentId: event.apartmentId,
    type: "lux",
  }).sort({ timestamp: -1 }).limit(config.luxWindow).project({ lux: 1 }).toArray();
  const filteredLux = movingAverage(samples.map((sample) => sample.lux));
  const rule = await loadRule(event);
  const desired = desiredBrightness({
    filteredLux,
    occupied: Boolean(state?.occupied),
    rule,
    currentBrightness: state?.brightness ?? state?.lastCommand?.brightness ?? 0,
  });
  if (desired.target === null) return { stored: true, decision: desired.reason, filteredLux };

  const command = buildCommand({
    deviceId: `light-${event.apartmentId}`,
    buildingId: event.buildingId,
    apartmentId: event.apartmentId,
    brightness: desired.target,
    correlationId: event.eventId,
  });
  await publishCommand(command);
  await deviceState.updateOne(
    { buildingId: event.buildingId, apartmentId: event.apartmentId },
    { $set: { lastCommand: command, filteredLux } },
  );
  return { stored: true, commandId: command.commandId, filteredLux };
}

async function poll() {
  while (running) {
    try {
      const response = await sqs.send(new ReceiveMessageCommand({
        QueueUrl: config.queueUrl,
        MaxNumberOfMessages: 10,
        WaitTimeSeconds: 10,
        VisibilityTimeout: 60,
      }));
      const deletions = [];
      for (const message of response.Messages ?? []) {
        try {
          const event = JSON.parse(message.Body);
          const result = await processEvent(event);
          deletions.push({ Id: message.MessageId, ReceiptHandle: message.ReceiptHandle });
          processed += 1;
          if (result.commandId || processed % 1000 === 0) log("info", "event processed", { processed, eventId: event.eventId, ...result });
        } catch (error) {
          log("error", "message processing failed", { messageId: message.MessageId, error: error.message });
        }
      }
      if (deletions.length) {
        await sqs.send(new DeleteMessageBatchCommand({ QueueUrl: config.queueUrl, Entries: deletions }));
      }
    } catch (error) {
      log("error", "queue poll failed", { error: error.message });
      await new Promise((resolve) => setTimeout(resolve, 2000));
    }
  }
}

async function main() {
  if (config.storageMode === "persistent") {
    await mongo.connect();
    const db = mongo.db(config.mongoDatabase);
    telemetry = db.collection("telemetry");
    deviceState = db.collection("device_state");
    await telemetry.createIndex({ eventId: 1 }, { unique: true });
    await telemetry.createIndex({ deviceId: 1, timestamp: -1 });
    await deviceState.createIndex({ buildingId: 1, apartmentId: 1 }, { unique: true });
    await postgres.query("SELECT 1");
  }
  log("info", "processor ready", { luxWindow: config.luxWindow, storageMode: config.storageMode });
  await poll();
}

async function shutdown(signal) {
  running = false;
  log("info", "shutting down", { signal, processed });
  mqttClient?.end(true);
  await Promise.allSettled([mongo?.close(), postgres?.end()].filter(Boolean));
  process.exit(0);
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

main().catch((error) => {
  log("fatal", "processor failed", { error: error.stack ?? error.message });
  process.exit(1);
});
