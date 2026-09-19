import test from "node:test";
import assert from "node:assert/strict";
import {
  buildCommand,
  buildTelemetry,
  desiredBrightness,
  evaluateLightingRule,
  movingAverage,
  validateTelemetry,
} from "../src/index.js";

test("valid telemetry passes validation", () => {
  const event = buildTelemetry({
    deviceId: "lux-1",
    buildingId: "b1",
    apartmentId: "a1",
    type: "lux",
    sequenceNo: 1,
    lux: 45,
  });
  assert.equal(validateTelemetry(event).ok, true);
});

test("invalid lux and sequence values are rejected", () => {
  const result = validateTelemetry({
    eventId: "e1", deviceId: "d1", buildingId: "b1", apartmentId: "a1",
    timestamp: new Date().toISOString(), type: "lux", sequenceNo: -1, lux: -3,
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /sequenceNo/);
  assert.match(result.errors.join(" "), /lux/);
});

test("moving average ignores non-finite samples", () => {
  assert.equal(movingAverage([10, 20, Number.NaN, 30]), 20);
});

test("lighting rule requires low lux and occupancy", () => {
  const rule = { enabled: true, luxThreshold: 80, motionRequired: true, brightness: 70 };
  assert.deepEqual(evaluateLightingRule({ filteredLux: 50, occupied: true, rule }), {
    activate: true, brightness: 70, reason: "threshold-crossed",
  });
  assert.equal(evaluateLightingRule({ filteredLux: 50, occupied: false, rule }).activate, false);
  assert.equal(evaluateLightingRule({ filteredLux: 120, occupied: true, rule }).activate, false);
});

test("commands include traceable identifiers", () => {
  const command = buildCommand({
    deviceId: "light-1", buildingId: "b1", apartmentId: "a1",
    brightness: 60, correlationId: "event-1",
  });
  assert.equal(command.correlationId, "event-1");
  assert.equal(command.type, "setBrightness");
  assert.ok(command.commandId);
});

test("desired brightness avoids command storms and turns unoccupied lights off", () => {
  const rule = { enabled: true, luxThreshold: 80, motionRequired: true, brightness: 70 };
  assert.equal(desiredBrightness({ filteredLux: 40, occupied: true, rule, currentBrightness: 0 }).target, 70);
  assert.equal(desiredBrightness({ filteredLux: 40, occupied: true, rule, currentBrightness: 70 }).target, null);
  assert.equal(desiredBrightness({ filteredLux: 40, occupied: false, rule, currentBrightness: 70 }).target, 0);
});
