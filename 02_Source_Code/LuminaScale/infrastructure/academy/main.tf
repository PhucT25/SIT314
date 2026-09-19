data "aws_caller_identity" "current" {}
data "aws_iam_role" "lab" { name = var.lab_role_name }
data "aws_vpc" "default" { default = true }
data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}

resource "aws_sqs_queue" "dlq" {
  name                      = "luminascale-academy-dlq"
  message_retention_seconds = 1209600
  sqs_managed_sse_enabled   = true
}

resource "aws_sqs_queue" "events" {
  name                       = "luminascale-academy-events"
  visibility_timeout_seconds = 60
  receive_wait_time_seconds  = 20
  message_retention_seconds  = 86400
  sqs_managed_sse_enabled    = true
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.dlq.arn
    maxReceiveCount     = 5
  })
}

resource "aws_ecs_cluster" "main" {
  name = "luminascale-academy"
  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}

resource "aws_cloudwatch_log_group" "processor" {
  name              = "/ecs/luminascale-academy/processor"
  retention_in_days = 3
}

resource "aws_security_group" "processor" {
  name        = "luminascale-academy-processor"
  description = "Outbound-only access for the LuminaScale Academy worker"
  vpc_id      = data.aws_vpc.default.id

  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_ecs_task_definition" "processor" {
  family                   = "luminascale-academy-processor"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = data.aws_iam_role.lab.arn
  task_role_arn            = data.aws_iam_role.lab.arn

  container_definitions = jsonencode([{
    name      = "processor"
    image     = var.processor_image
    essential = true
    environment = [
      { name = "AWS_REGION", value = var.aws_region },
      { name = "SQS_QUEUE_URL", value = aws_sqs_queue.events.url },
      { name = "STORAGE_MODE", value = "scaling-demo" },
      { name = "PROCESSING_DELAY_MS", value = "25" }
    ]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.processor.name
        awslogs-region        = var.aws_region
        awslogs-stream-prefix = "processor"
      }
    }
  }])
}

resource "aws_ecs_service" "processor" {
  name            = "processor"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.processor.arn
  desired_count   = var.min_tasks
  launch_type     = "FARGATE"

  network_configuration {
    subnets          = data.aws_subnets.default.ids
    security_groups  = [aws_security_group.processor.id]
    assign_public_ip = true
  }

  lifecycle { ignore_changes = [desired_count] }
}

resource "aws_appautoscaling_target" "processor" {
  max_capacity       = var.max_tasks
  min_capacity       = var.min_tasks
  resource_id        = "service/${aws_ecs_cluster.main.name}/${aws_ecs_service.processor.name}"
  scalable_dimension = "ecs:service:DesiredCount"
  service_namespace  = "ecs"
}

resource "aws_appautoscaling_policy" "tracking" {
  name               = "luminascale-academy-backlog-tracking"
  policy_type        = "TargetTrackingScaling"
  resource_id        = aws_appautoscaling_target.processor.resource_id
  scalable_dimension = aws_appautoscaling_target.processor.scalable_dimension
  service_namespace  = aws_appautoscaling_target.processor.service_namespace

  target_tracking_scaling_policy_configuration {
    target_value       = var.backlog_per_task_target
    scale_in_cooldown  = 180
    scale_out_cooldown = 60

    customized_metric_specification {
      metrics {
        id          = "backlog"
        expression  = "IF(tasks>0,messages/tasks,messages)"
        label       = "SQS backlog per running task"
        return_data = true
      }
      metrics {
        id = "messages"
        metric_stat {
          metric {
            metric_name = "ApproximateNumberOfMessagesVisible"
            namespace   = "AWS/SQS"
            dimensions {
              name  = "QueueName"
              value = aws_sqs_queue.events.name
            }
          }
          stat = "Average"
        }
        return_data = false
      }
      metrics {
        id = "tasks"
        metric_stat {
          metric {
            metric_name = "RunningTaskCount"
            namespace   = "ECS/ContainerInsights"
            dimensions {
              name  = "ClusterName"
              value = aws_ecs_cluster.main.name
            }
            dimensions {
              name  = "ServiceName"
              value = aws_ecs_service.processor.name
            }
          }
          stat = "Average"
        }
        return_data = false
      }
    }
  }
}
