# LuminaScale Architecture

## Event path

1. Node-RED publishes JSON telemetry to `luminascale/{buildingId}/{apartmentId}/telemetry` using MQTT QoS 1.
2. The local ingestion service validates each payload and sends it to the SQS-compatible queue. In AWS, the IoT Core rule performs this routing directly.
3. Stateless processor tasks long-poll the queue, write telemetry to MongoDB, load rules from PostgreSQL, and calculate the rolling lux average.
4. A rule creates a brightness command only when the filtered lux level is at or below its threshold and required occupancy is present.
5. The command is published to `luminascale/{buildingId}/{apartmentId}/command/{deviceId}`.
6. Node-RED applies the command and publishes an acknowledgement as a state telemetry event.

## Delivery semantics

The queue and MQTT QoS 1 both provide at-least-once delivery. Each event has a unique `eventId`; MongoDB enforces a unique index on this value, so a retried event does not produce a second write or command. A per-device `sequenceNo` exposes delayed or out-of-order device messages.

The AWS IoT Core SQS rule action supports standard queues, not FIFO queues. LuminaScale therefore avoids any global-ordering claim. Rules use the latest timestamped values per apartment, and processors are safe to retry.

## Storage ownership

- MongoDB owns high-volume telemetry and the current calculated apartment state.
- PostgreSQL owns users, the device registry and lighting rules that require relational constraints.
- SQS owns transient, unprocessed work. The dead-letter queue owns messages that exceed the retry limit.

## Scaling

ECS processor tasks are stateless. CloudWatch calculates:

`backlog per task = visible SQS messages / running ECS tasks`

The high alarm adds tasks quickly. The low alarm waits for three periods before removing a task, reducing scale-in oscillation. The Terraform defaults cap the service at ten tasks to control cost.

## Local and AWS mapping

| Local component | AWS component |
|---|---|
| Mosquitto | AWS IoT Core |
| ElasticMQ | Amazon SQS and dead-letter queue |
| Processor container | ECS Fargate processor service |
| Local MongoDB | MongoDB Atlas |
| Local PostgreSQL | Amazon RDS PostgreSQL or another managed PostgreSQL service |
| Docker logs | CloudWatch Logs |

