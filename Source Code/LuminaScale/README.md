# LuminaScale

LuminaScale is a scalable, event-driven IoT smart-lighting prototype for large apartment complexes. It demonstrates Node-RED sensor simulation, MQTT ingestion, queue-based Node.js microservices, automatic lighting rules, persistent telemetry, manager control and AWS Fargate scaling infrastructure.

## What is included

- Node-RED flow for lux and PIR simulation, 2.5-second motion debouncing, MQTT publishing and actuator acknowledgement
- MQTT ingestion service with schema validation
- SQS-compatible queue and dead-letter queue for local development
- Stateless Node.js processor with MongoDB idempotency, rolling lux average and PostgreSQL rules
- Browser dashboard and manager command API
- Repeatable load generator targeting 20,000 events per minute
- Terraform for AWS IoT Core, SQS, ECS Fargate, CloudWatch and backlog-per-task scaling
- Unit tests, local verification and evidence-capture scripts

## Architecture

```text
Node-RED sensors -> MQTT -> ingestion -> SQS-compatible queue -> processor workers
                                                               |-> MongoDB telemetry
                                                               |-> PostgreSQL rules
                                                               `-> MQTT command -> Node-RED actuator
Dashboard/API -----------------------------------------------> MQTT manual command
```

In AWS, IoT Core routes telemetry directly to SQS. ECS Fargate runs the same processor container and publishes commands through the IoT data endpoint.

## Start locally

Docker Desktop must be running.

```powershell
Copy-Item .env.example .env
docker compose up --build -d
docker compose ps
```

Allow about 30 seconds for the first telemetry events. Then open:

- Operations dashboard: <http://localhost:3000/?apiKey=local-demo-key>
- Node-RED editor: <http://localhost:1880>
- ElasticMQ queue UI: <http://localhost:9325>

Verify the complete path:

```powershell
./scripts/verify-local.ps1
```

## Run a load experiment

The command below publishes about 20,000 events per minute for two minutes:

```powershell
docker compose --profile load run --rm load-generator
```

Run additional processor replicas during a local scaling comparison:

```powershell
docker compose up -d --scale processor=4
```

Capture local evidence after the experiment:

```powershell
./scripts/capture-evidence.ps1
```

For AWS deployment and automatic scaling evidence, follow [docs/AWS_DEPLOYMENT.md](docs/AWS_DEPLOYMENT.md).
For the restricted $50 AWS Academy Learner Lab, use [docs/AWS_ACADEMY_DEPLOYMENT.md](docs/AWS_ACADEMY_DEPLOYMENT.md).

## Test and validation commands

```powershell
npm test
npm run check
docker compose config --quiet
```

## Main configuration

| Variable | Default | Purpose |
|---|---:|---|
| `API_KEY` | `local-demo-key` | Protects prototype API endpoints |
| `LOAD_EVENTS_PER_MINUTE` | `20000` | Load generator target |
| `LOAD_DURATION_SECONDS` | `120` | Load-test duration |
| `LUX_WINDOW` | `5` | Moving-average sample count |
| `SQS_QUEUE_URL` | local queue URL | Event queue used by workers |
| `IOT_DATA_ENDPOINT` | unset locally | AWS IoT publishing endpoint |

## Security boundary

The local Mosquitto broker allows anonymous access so the project can start without certificates. It is bound to a development machine and must not be exposed publicly. The AWS design uses unique X.509 device certificates, restricted IoT policies, least-privilege task roles, Secrets Manager and encryption at rest.

## Repository map

```text
config/                    Local broker, queue and database configuration
docs/                      Architecture, schemas and AWS runbook
infrastructure/terraform/  AWS resources and scaling alarms
node-red/                  Importable Node-RED simulation flow
packages/core/             Validation and rule-domain functions
services/ingestion/        MQTT-to-queue adapter for local development
services/processor/        Queue worker and automation engine
services/api/              Dashboard and manager command API
simulator/                 Optional simulator and load generator
scripts/                   Verification and evidence capture
```
