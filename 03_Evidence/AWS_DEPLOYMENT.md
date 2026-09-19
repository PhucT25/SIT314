# AWS Academy live deployment evidence

Deployment completed in AWS Academy Learner Lab on 18 September 2026 (Australia/Sydney).

## Environment

- AWS account: `505777545628`
- Region: `us-east-1`
- ECS cluster: `luminascale-academy`
- ECS service: `processor`
- Queue: `luminascale-academy-events`
- Dead-letter queue: `luminascale-academy-dlq`
- Task size: 0.25 vCPU, 0.5 GB memory
- Scaling range: 1–4 Fargate tasks
- CloudWatch log retention: 3 days

The Academy profile uses the pre-created `LabRole`, an outbound-only security group, SQS-managed encryption, a public AWS Python runtime image and an embedded validation/drain worker. This avoids RDS, DocumentDB, NAT Gateway, Elastic Load Balancing and private-image storage costs. The complete Node.js/MongoDB/PostgreSQL processing path remains available and verified in the local stack.

## Live scaling experiment

| Measurement | Result |
|---|---:|
| Submitted telemetry events | 8,000 |
| Submission throughput | 12,021 events/minute |
| Peak visible/in-flight backlog | 6,440 messages |
| Minimum desired workers | 1 |
| Peak desired workers | 4 |
| Running task ARNs observed after scale-out | 4 |
| Final visible queue depth | 0 |
| Final in-flight messages | 0 |

The backlog-per-task target tracking policy increased desired capacity from one to four workers. The queue subsequently drained to zero, confirming that the service recovered from the burst.

## Cost guardrail

The lab showed `$0.30` used before deployment. This profile runs only small Fargate tasks plus low-volume SQS and CloudWatch usage. It creates no load balancer, NAT Gateway, RDS instance or DocumentDB cluster. Scale-in cooldown is three minutes and the service returns toward its one-task minimum after the test.

## Verification timeline

- 13:40:25 — temporary Learner Lab session verified
- 13:40:32 — backlog-per-task scaling configured
- 13:43:34 — 8,000-event load test started
- 13:44:14 — load submission completed
- 13:49:06 — scaling and queue-drain verification completed

Temporary AWS credentials were held in process memory only and cleared after verification. They were not written to the project, Terraform files or AWS credential files.
