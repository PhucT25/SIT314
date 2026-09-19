output "sqs_queue_url" { value = aws_sqs_queue.events.url }
output "sqs_dlq_url" { value = aws_sqs_queue.dlq.url }
output "ecs_cluster_name" { value = aws_ecs_cluster.main.name }
output "ecs_service_name" { value = aws_ecs_service.processor.name }
output "iot_rule_name" { value = aws_iot_topic_rule.telemetry.name }
output "processor_log_group" { value = aws_cloudwatch_log_group.processor.name }

