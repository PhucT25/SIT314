# AWS Academy deployment

This profile deploys the queue and auto-scaling worker into AWS Academy Learner Lab while keeping the full MongoDB/PostgreSQL application local. It intentionally avoids RDS, DocumentDB, NAT Gateway and a load balancer so the demonstration remains comfortably inside the course budget.

The live Academy fallback can use the public AWS Python runtime with an embedded SQS validation worker when a private ECR image cannot be uploaded. This preserves the queue, Fargate and backlog-per-task scaling experiment; the complete Node.js application remains the locally verified implementation.

## Cost guardrail

The profile runs one 0.25-vCPU/0.5-GB Fargate task and may scale to four tasks during an intentional load test. SQS, CloudWatch Logs and a small ECR image add only light usage. Destroy the stack after evidence capture; Learner Lab resources persist when the four-hour session ends.

## Academy differences

- Uses the pre-created `LabRole`; it does not create IAM users or roles.
- Uses `STORAGE_MODE=scaling-demo`, which validates and drains telemetry without external databases.
- Retains logs for three days.
- Does not create public endpoints, elastic load balancers or NAT gateways.

The normal `infrastructure/terraform` profile remains the production design with IoT Core, persistent databases and command publishing.

## Deployment outline

1. Start Learner Lab and copy its temporary AWS CLI credentials.
2. Create `luminascale-processor` in ECR.
3. Build and push `docker/node-service.Dockerfile` with `SERVICE=processor`.
4. Apply `infrastructure/academy` with the image URI.
5. Send the simulator load to the output queue URL and capture ECS/CloudWatch scaling evidence.
6. Run `terraform destroy` after evidence capture.

The verified live results are recorded in [../evidence/AWS_DEPLOYMENT.md](../evidence/AWS_DEPLOYMENT.md).
