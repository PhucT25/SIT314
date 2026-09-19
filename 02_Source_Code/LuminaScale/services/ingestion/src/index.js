import mqtt from "mqtt";
import { SendMessageCommand, SQSClient } from "@aws-sdk/client-sqs";
import { validateTelemetry } from "@luminascale/core";

const config = {
  mqttUrl: process.env.MQTT_URL ?? "mqtt://localhost:1883",
  mqttTopic: process.env.MQTT_TOPIC ?? "luminascale/+/+/telemetry",
  queueUrl: process.env.SQS_QUEUE_URL,
  region: process.env.AWS_REGION ?? "ap-southeast-2",
  sqsEndpoint: process.env.SQS_ENDPOINT,
};

if (!config.queueUrl) throw new Error("SQS_QUEUE_URL is required");

const sqs = new SQSClient({
  region: config.region,
  endpoint: config.sqsEndpoint,
  credentials: config.sqsEndpoint ? { accessKeyId: "local", secretAccessKey: "local" } : undefined,
});
const client = mqtt.connect(config.mqttUrl, {
  clientId: `luminascale-ingestion-${process.pid}`,
  clean: true,
  reconnectPeriod: 1500,
});

let accepted = 0;
let rejected = 0;

function log(level, message, fields = {}) {
  console.log(JSON.stringify({ level, service: "ingestion", message, ...fields, timestamp: new Date().toISOString() }));
}

client.on("connect", () => {
  client.subscribe(config.mqttTopic, { qos: 1 }, (error) => {
    if (error) log("error", "subscription failed", { error: error.message });
    else log("info", "subscribed to telemetry", { topic: config.mqttTopic });
  });
});

client.on("message", async (topic, raw) => {
  try {
    const event = JSON.parse(raw.toString("utf8"));
    const validation = validateTelemetry(event);
    if (!validation.ok) {
      rejected += 1;
      log("warn", "rejected telemetry", { topic, errors: validation.errors, rejected });
      return;
    }
    await sqs.send(new SendMessageCommand({
      QueueUrl: config.queueUrl,
      MessageBody: JSON.stringify({ ...event, receivedAt: new Date().toISOString(), mqttTopic: topic }),
      MessageAttributes: {
        eventType: { DataType: "String", StringValue: event.type },
        buildingId: { DataType: "String", StringValue: event.buildingId },
      },
    }));
    accepted += 1;
    if (accepted % 1000 === 0) log("info", "telemetry accepted", { accepted, rejected });
  } catch (error) {
    rejected += 1;
    log("error", "failed to ingest message", { topic, error: error.message, rejected });
  }
});

client.on("error", (error) => log("error", "mqtt error", { error: error.message }));

function shutdown(signal) {
  log("info", "shutting down", { signal, accepted, rejected });
  client.end(false, {}, () => process.exit(0));
}
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

