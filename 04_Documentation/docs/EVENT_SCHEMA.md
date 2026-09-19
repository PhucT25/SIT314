# Telemetry and Command Schemas

## MQTT topics

- Telemetry: `luminascale/{buildingId}/{apartmentId}/telemetry`
- Commands: `luminascale/{buildingId}/{apartmentId}/command/{deviceId}`

## Telemetry event

```json
{
  "eventId": "3ea2678e-fd80-4a89-a28c-e476d66bb57a",
  "deviceId": "lux-building-1-apt-1",
  "buildingId": "building-1",
  "apartmentId": "apt-1",
  "timestamp": "2026-09-18T02:00:00.000Z",
  "type": "lux",
  "sequenceNo": 42,
  "lux": 56
}
```

Allowed `type` values are `lux`, `motion`, `power` and `state`. Type-specific fields are:

- `lux`: non-negative `lux` number
- `motion`: Boolean `motion`
- `power`: `brightness` from 0 to 100 and non-negative `watts`
- `state`: acknowledged `brightness` and optional `commandId`

## Actuator command

```json
{
  "commandId": "c2e8f48f-aa25-456f-93ba-711250f93e78",
  "correlationId": "3ea2678e-fd80-4a89-a28c-e476d66bb57a",
  "deviceId": "light-apt-1",
  "buildingId": "building-1",
  "apartmentId": "apt-1",
  "type": "setBrightness",
  "brightness": 70,
  "source": "automation",
  "timestamp": "2026-09-18T02:00:00.450Z"
}
```

