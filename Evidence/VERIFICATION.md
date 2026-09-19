# Local Verification Results

Verified with Docker Desktop and the local Compose stack.

## Functional result

- All eight application containers started successfully.
- Node-RED connected to Mosquitto and generated telemetry for 20 apartments.
- The ingestion service validated MQTT payloads and placed them on the SQS-compatible queue.
- The processor stored telemetry in MongoDB, loaded the seeded PostgreSQL rule, calculated the rolling lux average and published automatic brightness commands.
- Node-RED acknowledged actuator commands as state telemetry.
- The manager API accepted a manual brightness command and returned a unique command ID.
- The dashboard summary reported 1,020 apartment/device state records and 14,326 processed telemetry events at evidence-capture time.

## Load result

- Requested rate: 20,000 events per minute.
- Short calibrated run: 3,312 events in 10.004 seconds.
- Achieved rate: 19,864 events per minute.
- Main queue after recovery: 0 visible and 0 in-flight messages.
- Dead-letter queue after recovery: 0 messages.

This is a local functional and throughput check, not evidence of AWS automatic scaling. The AWS experiment must capture ECS task-count changes and CloudWatch backlog-per-task alarms after deployment.

## Automated checks

- Six domain tests passed.
- JavaScript syntax checks passed for ingestion, processor, API, simulator and load generator.
- Node-RED flow JSON parsed successfully.
- Docker Compose configuration validated successfully.
- Terraform initialized and validated successfully with Terraform 1.9.8 and AWS provider 5.100.0.

## Evidence files

- `summary.json` contains the API snapshot.
- `containers.json` contains container status at capture time.
- `service-logs.txt` contains recent ingestion, processor, API and Node-RED logs.

