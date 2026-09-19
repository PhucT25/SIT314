import mqtt from "mqtt";
import { buildTelemetry, telemetryTopic } from "@luminascale/core";

const config = {
  mqttUrl: process.env.MQTT_URL ?? "mqtt://localhost:1883",
  buildings: Number.parseInt(process.env.SIM_BUILDINGS ?? "1", 10),
  apartments: Number.parseInt(process.env.SIM_APARTMENTS_PER_BUILDING ?? "20", 10),
  intervalMs: Number.parseInt(process.env.SIM_INTERVAL_MS ?? "2000", 10),
};

const client = mqtt.connect(config.mqttUrl, { clientId: `luminascale-simulator-${process.pid}` });
const sequence = new Map();
const brightness = new Map();

function nextSequence(deviceId) {
  const value = (sequence.get(deviceId) ?? 0) + 1;
  sequence.set(deviceId, value);
  return value;
}

function publish(event) {
  client.publish(telemetryTopic(event.buildingId, event.apartmentId), JSON.stringify(event), { qos: 1 });
}

function emitApartment(buildingId, apartmentId) {
  const minute = new Date().getMinutes();
  const sunsetFactor = Math.max(0, 1 - minute / 60);
  const lux = Math.max(2, Math.round(250 * sunsetFactor + Math.random() * 35));
  const occupied = Math.random() > 0.38;
  const luxId = `lux-${buildingId}-${apartmentId}`;
  const pirId = `pir-${buildingId}-${apartmentId}`;
  const lightId = `light-${apartmentId}`;
  publish(buildTelemetry({ deviceId: luxId, buildingId, apartmentId, type: "lux", sequenceNo: nextSequence(luxId), lux }));
  publish(buildTelemetry({ deviceId: pirId, buildingId, apartmentId, type: "motion", sequenceNo: nextSequence(pirId), motion: occupied }));
  publish(buildTelemetry({
    deviceId: lightId, buildingId, apartmentId, type: "power", sequenceNo: nextSequence(lightId),
    brightness: brightness.get(`${buildingId}/${apartmentId}`) ?? 0,
    watts: Number((((brightness.get(`${buildingId}/${apartmentId}`) ?? 0) / 100) * 9).toFixed(2)),
  }));
}

client.on("connect", () => {
  console.log(`simulator connected to ${config.mqttUrl}`);
  client.subscribe("luminascale/+/+/command/+", { qos: 1 });
  setInterval(() => {
    for (let b = 1; b <= config.buildings; b += 1) {
      for (let a = 1; a <= config.apartments; a += 1) emitApartment(`building-${b}`, `apt-${a}`);
    }
  }, config.intervalMs);
});

client.on("message", (topic, payload) => {
  try {
    const command = JSON.parse(payload.toString("utf8"));
    brightness.set(`${command.buildingId}/${command.apartmentId}`, command.brightness);
    console.log(JSON.stringify({ message: "command applied", topic, commandId: command.commandId, brightness: command.brightness }));
  } catch (error) {
    console.error(`invalid command: ${error.message}`);
  }
});

