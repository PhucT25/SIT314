output "account_id" { value = data.aws_caller_identity.current.account_id }
output "queue_url" { value = aws_sqs_queue.events.url }
output "dlq_url" { value = aws_sqs_queue.dlq.url }
output "cluster_name" { value = aws_ecs_cluster.main.name }
output "service_name" { value = aws_ecs_service.processor.name }
output "log_group" { value = aws_cloudwatch_log_group.processor.name }
