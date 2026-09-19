import { once } from "node:events";
import mqtt from "mqtt";
import { buildTelemetry, telemetryTopic } from "@luminascale/core";

const mqttUrl = process.env.MQTT_URL ?? "mqtt://localhost:1883";
const ratePerMinute = Number.parseInt(process.env.LOAD_EVENTS_PER_MINUTE ?? "20000", 10);
const durationSeconds = Number.parseInt(process.env.LOAD_DURATION_SECONDS ?? "120", 10);
const apartments = Number.parseInt(process.env.LOAD_APARTMENTS ?? "1000", 10);
const batchIntervalMs = 100;

const client = mqtt.connect(mqttUrl, { clientId: `luminascale-load-${process.pid}` });
await once(client, "connect");

let published = 0;
let sequenceNo = 0;
const started = Date.now();
const timer = setInterval(() => {
  const targetPublished = Math.floor(((Date.now() - started) / 60000) * ratePerMinute);
  const batchSize = Math.max(0, targetPublished - published);
  for (let i = 0; i < batchSize; i += 1) {
    const apartment = `apt-${(published % apartments) + 1}`;
    sequenceNo += 1;
    const event = buildTelemetry({
      deviceId: `load-lux-${apartment}`,
      buildingId: "building-load",
      apartmentId: apartment,
      type: "lux",
      sequenceNo,
      lux: Math.max(1, 90 - Math.floor((Date.now() - started) / 1000) + Math.random() * 12),
    });
    client.publish(telemetryTopic(event.buildingId, event.apartmentId), JSON.stringify(event), { qos: 1 });
    published += 1;
  }
}, batchIntervalMs);

const progress = setInterval(() => {
  const elapsed = (Date.now() - started) / 1000;
  console.log(JSON.stringify({ elapsedSeconds: Math.round(elapsed), published, achievedPerMinute: Math.round(published / elapsed * 60) }));
}, 5000);

setTimeout(() => {
  clearInterval(timer);
  clearInterval(progress);
  client.end(false, {}, () => {
    const elapsed = (Date.now() - started) / 1000;
    console.log(JSON.stringify({ complete: true, elapsedSeconds: elapsed, published, achievedPerMinute: Math.round(published / elapsed * 60) }));
  });
}, durationSeconds * 1000);
