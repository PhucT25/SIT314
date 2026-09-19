import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import mqtt from "mqtt";
import { MongoClient } from "mongodb";
import pg from "pg";
import { IoTDataPlaneClient, PublishCommand } from "@aws-sdk/client-iot-data-plane";
import { buildCommand, commandTopic } from "@luminascale/core";

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const config = {
  port: Number.parseInt(process.env.PORT ?? "3000", 10),
  apiKey: process.env.API_KEY ?? "local-demo-key",
  mongoUrl: process.env.MONGO_URL ?? "mongodb://localhost:27017",
  mongoDatabase: process.env.MONGO_DATABASE ?? "luminascale",
  postgresUrl: process.env.POSTGRES_URL,
  mqttUrl: process.env.MQTT_URL,
  region: process.env.AWS_REGION ?? "ap-southeast-2",
  iotDataEndpoint: process.env.IOT_DATA_ENDPOINT,
};
if (!config.postgresUrl) throw new Error("POSTGRES_URL is required");

const app = express();
app.use(express.json({ limit: "32kb" }));
app.use(express.static(path.join(__dirname, "..", "public")));

const mongo = new MongoClient(config.mongoUrl);
const postgres = new Pool({ connectionString: config.postgresUrl, max: 5 });
const mqttClient = config.mqttUrl ? mqtt.connect(config.mqttUrl, { clientId: `luminascale-api-${process.pid}` }) : null;
const iot = config.iotDataEndpoint ? new IoTDataPlaneClient({ region: config.region, endpoint: config.iotDataEndpoint }) : null;
let telemetry;
let deviceState;

function requireApiKey(req, res, next) {
  if (req.path === "/health" || req.path === "/") return next();
  const key = req.get("x-api-key") ?? req.query.apiKey;
  if (key !== config.apiKey) return res.status(401).json({ error: "unauthorised" });
  next();
}
app.use("/api", requireApiKey);

async function publish(command) {
  const topic = commandTopic(command.buildingId, command.apartmentId, command.deviceId);
  const payload = JSON.stringify(command);
  if (mqttClient) {
    await new Promise((resolve, reject) => mqttClient.publish(topic, payload, { qos: 1 }, (error) => error ? reject(error) : resolve()));
    return topic;
  }
  if (iot) {
    await iot.send(new PublishCommand({ topic, qos: 1, payload: Buffer.from(payload) }));
    return topic;
  }
  throw new Error("No command publisher configured");
}

app.get("/health", (_req, res) => res.json({ status: "ok", service: "api" }));

app.get("/api/summary", async (_req, res, next) => {
  try {
    const [devices, events, activeRules] = await Promise.all([
      deviceState.countDocuments(),
      telemetry.countDocuments(),
      postgres.query("SELECT COUNT(*)::int AS count FROM lighting_rules WHERE enabled = true"),
    ]);
    const recent = await deviceState.find({}).sort({ updatedAt: -1 }).limit(25).toArray();
    res.json({ devices, events, activeRules: activeRules.rows[0].count, recent });
  } catch (error) { next(error); }
});

app.get("/api/devices/:deviceId/telemetry", async (req, res, next) => {
  try {
    const limit = Math.min(Number.parseInt(req.query.limit ?? "100", 10), 500);
    const rows = await telemetry.find({ deviceId: req.params.deviceId }).sort({ timestamp: -1 }).limit(limit).toArray();
    res.json(rows);
  } catch (error) { next(error); }
});

app.post("/api/commands", async (req, res, next) => {
  try {
    const { buildingId, apartmentId, deviceId = `light-${req.body.apartmentId}`, brightness } = req.body;
    if (!buildingId || !apartmentId || !Number.isFinite(brightness) || brightness < 0 || brightness > 100) {
      return res.status(400).json({ error: "buildingId, apartmentId and brightness 0-100 are required" });
    }
    const command = buildCommand({ buildingId, apartmentId, deviceId, brightness, source: "manager" });
    const topic = await publish(command);
    res.status(202).json({ topic, command });
  } catch (error) { next(error); }
});

app.use((error, _req, res, _next) => {
  console.error(JSON.stringify({ level: "error", service: "api", error: error.stack ?? error.message }));
  res.status(500).json({ error: "internal-error" });
});

async function main() {
  await mongo.connect();
  const db = mongo.db(config.mongoDatabase);
  telemetry = db.collection("telemetry");
  deviceState = db.collection("device_state");
  await postgres.query("SELECT 1");
  app.listen(config.port, "0.0.0.0", () => console.log(JSON.stringify({ level: "info", service: "api", port: config.port })));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

