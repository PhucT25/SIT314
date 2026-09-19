# AWS Deployment Runbook

## Prerequisites

- AWS account with a configured AWS CLI profile
- Terraform 1.7 or later
- Docker and an Amazon ECR repository
- MongoDB Atlas connection string
- PostgreSQL connection string, preferably an Amazon RDS database in private subnets

## Build and push the processor

Build from the repository root and replace the example account and region values:

```powershell
docker build -f docker/node-service.Dockerfile --build-arg SERVICE=processor -t luminascale-processor .
aws ecr get-login-password --region ap-southeast-2 | docker login --username AWS --password-stdin 123456789012.dkr.ecr.ap-southeast-2.amazonaws.com
docker tag luminascale-processor:latest 123456789012.dkr.ecr.ap-southeast-2.amazonaws.com/luminascale-processor:latest
docker push 123456789012.dkr.ecr.ap-southeast-2.amazonaws.com/luminascale-processor:latest
```

## Obtain the IoT data endpoint

```powershell
aws iot describe-endpoint --endpoint-type iot:Data-ATS --region ap-southeast-2
```

Prefix the returned endpoint with `https://` in the Terraform variable.

## Apply Terraform

```powershell
cd infrastructure/terraform
Copy-Item terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars with real image and database connection strings.
terraform init
terraform plan
terraform apply
```

The deployment creates a standard SQS queue and dead-letter queue, an IoT Core rule, secrets, an ECS Fargate processor service, Container Insights, logs and backlog-per-task scaling alarms.

## Device certificates

Create a unique X.509 certificate and restricted IoT policy for each simulated hub. Permit only the hub's telemetry topics for publish and its command topics for subscribe/receive. Do not use the local anonymous Mosquitto configuration outside local development.

## Evidence to capture

Capture the following during the load experiment:

1. IoT Core rule and SQS queue configuration.
2. CloudWatch graph for `ApproximateNumberOfMessagesVisible`.
3. ECS `RunningTaskCount` and the backlog-per-task alarm state.
4. ECS service scaling activity from one task to multiple tasks and back.
5. Processor logs showing published, processed, duplicate and failed totals.
6. Dead-letter queue count, which should remain zero for a successful test.
7. The AWS Cost Explorer or Billing estimate for the test window.

Destroy temporary infrastructure after evidence capture:

```powershell
terraform destroy
```

