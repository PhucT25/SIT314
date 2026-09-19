import { randomUUID } from "node:crypto";

const TELEMETRY_TYPES = new Set(["lux", "motion", "power", "state"]);

export function validateTelemetry(value) {
  const errors = [];
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, errors: ["payload must be an object"] };
  }
  for (const field of ["eventId", "deviceId", "buildingId", "apartmentId", "timestamp", "type", "sequenceNo"]) {
    if (value[field] === undefined || value[field] === null || value[field] === "") {
      errors.push(`${field} is required`);
    }
  }
  if (value.eventId && typeof value.eventId !== "string") errors.push("eventId must be a string");
  if (value.deviceId && typeof value.deviceId !== "string") errors.push("deviceId must be a string");
  if (value.type && !TELEMETRY_TYPES.has(value.type)) errors.push("type is not supported");
  if (!Number.isInteger(value.sequenceNo) || value.sequenceNo < 0) errors.push("sequenceNo must be a non-negative integer");
  if (value.timestamp && Number.isNaN(Date.parse(value.timestamp))) errors.push("timestamp must be ISO-8601");
  if (value.type === "lux" && (!Number.isFinite(value.lux) || value.lux < 0)) errors.push("lux must be a non-negative number");
  if (value.type === "motion" && typeof value.motion !== "boolean") errors.push("motion must be boolean");
  if (value.brightness !== undefined && (!Number.isFinite(value.brightness) || value.brightness < 0 || value.brightness > 100)) {
    errors.push("brightness must be between 0 and 100");
  }
  if (value.watts !== undefined && (!Number.isFinite(value.watts) || value.watts < 0)) errors.push("watts must be non-negative");
  return { ok: errors.length === 0, errors };
}

export function buildTelemetry({ deviceId, buildingId, apartmentId, type, sequenceNo, ...measurements }) {
  return {
    eventId: randomUUID(),
    deviceId,
    buildingId,
    apartmentId,
    timestamp: new Date().toISOString(),
    type,
    sequenceNo,
    ...measurements,
  };
}

export function movingAverage(values) {
  const finite = values.filter(Number.isFinite);
  if (!finite.length) return null;
  return finite.reduce((sum, value) => sum + value, 0) / finite.length;
}

export function evaluateLightingRule({ filteredLux, occupied, rule }) {
  if (!rule?.enabled) return { activate: false, reason: "rule-disabled" };
  if (!Number.isFinite(filteredLux)) return { activate: false, reason: "missing-lux" };
  if (rule.motionRequired && !occupied) return { activate: false, reason: "no-occupancy" };
  if (filteredLux > rule.luxThreshold) return { activate: false, reason: "sufficient-light" };
  return { activate: true, brightness: rule.brightness, reason: "threshold-crossed" };
}

export function desiredBrightness({ filteredLux, occupied, rule, currentBrightness }) {
  const decision = evaluateLightingRule({ filteredLux, occupied, rule });
  let target = null;
  if (decision.activate) target = decision.brightness;
  if (decision.reason === "no-occupancy" || decision.reason === "sufficient-light") target = 0;
  if (target === null || target === currentBrightness) return { target: null, reason: "already-at-target" };
  return { target, reason: decision.reason };
}

export function buildCommand({ deviceId, buildingId, apartmentId, brightness, source = "automation", correlationId }) {
  return {
    commandId: randomUUID(),
    correlationId,
    deviceId,
    buildingId,
    apartmentId,
    type: "setBrightness",
    brightness,
    source,
    timestamp: new Date().toISOString(),
  };
}

export function commandTopic(buildingId, apartmentId, deviceId = "all") {
  return `luminascale/${buildingId}/${apartmentId}/command/${deviceId}`;
}

export function telemetryTopic(buildingId, apartmentId) {
  return `luminascale/${buildingId}/${apartmentId}/telemetry`;
}
