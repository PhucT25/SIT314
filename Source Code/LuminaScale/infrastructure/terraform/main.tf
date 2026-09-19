data "aws_caller_identity" "current" {}
data "aws_vpc" "default" { default = true }
data "aws_subnets" "default" {
  filter {
    name   = "vpc-id"
    values = [data.aws_vpc.default.id]
  }
}

resource "aws_sqs_queue" "dlq" {
  name                      = "luminascale-events-dlq"
  message_retention_seconds = 1209600
  sqs_managed_sse_enabled   = true
}

resource "aws_sqs_queue" "events" {
  name                       = "luminascale-events"
  visibility_timeout_seconds = 60
  receive_wait_time_seconds  = 20
  message_retention_seconds  = 345600
  sqs_managed_sse_enabled    = true
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.dlq.arn
    maxReceiveCount     = 5
  })
}

resource "aws_iam_role" "iot_rule" {
  name = "luminascale-iot-rule"
  assume_role_policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Principal = { Service = "iot.amazonaws.com" }, Action = "sts:AssumeRole" }]
  })
}

resource "aws_iam_role_policy" "iot_rule" {
  role = aws_iam_role.iot_rule.id
  policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Action = ["sqs:SendMessage"], Resource = aws_sqs_queue.events.arn }]
  })
}

resource "aws_iot_topic_rule" "telemetry" {
  name        = "luminascale_telemetry_to_sqs"
  description = "Route validated LuminaScale telemetry to the worker queue"
  enabled     = true
  sql         = "SELECT *, timestamp() AS receivedAt FROM 'luminascale/+/+/telemetry'"
  sql_version = "2016-03-23"

  sqs {
    queue_url  = aws_sqs_queue.events.url
    role_arn   = aws_iam_role.iot_rule.arn
    use_base64 = false
  }

  error_action {
    cloudwatch_logs {
      log_group_name = aws_cloudwatch_log_group.iot_errors.name
      role_arn       = aws_iam_role.iot_logs.arn
    }
  }
}

resource "aws_cloudwatch_log_group" "iot_errors" {
  name              = "/luminascale/iot-rule-errors"
  retention_in_days = 14
}

resource "aws_iam_role" "iot_logs" {
  name = "luminascale-iot-rule-logs"
  assume_role_policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Principal = { Service = "iot.amazonaws.com" }, Action = "sts:AssumeRole" }]
  })
}

resource "aws_iam_role_policy" "iot_logs" {
  role = aws_iam_role.iot_logs.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["logs:CreateLogStream", "logs:PutLogEvents"]
      Resource = "${aws_cloudwatch_log_group.iot_errors.arn}:*"
    }]
  })
}

resource "aws_secretsmanager_secret" "mongo" { name = "luminascale/mongo-url" }
resource "aws_secretsmanager_secret_version" "mongo" {
  secret_id     = aws_secretsmanager_secret.mongo.id
  secret_string = var.mongo_url
}
resource "aws_secretsmanager_secret" "postgres" { name = "luminascale/postgres-url" }
resource "aws_secretsmanager_secret_version" "postgres" {
  secret_id     = aws_secretsmanager_secret.postgres.id
  secret_string = var.postgres_url
}

resource "aws_ecs_cluster" "main" {
  name = "luminascale"
  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}

resource "aws_cloudwatch_log_group" "processor" {
  name              = "/ecs/luminascale/processor"
  retention_in_days = 14
}

resource "aws_iam_role" "execution" {
  name = "luminascale-ecs-execution"
  assume_role_policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Principal = { Service = "ecs-tasks.amazonaws.com" }, Action = "sts:AssumeRole" }]
  })
}

resource "aws_iam_role_policy_attachment" "execution" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy" "execution_secrets" {
  role = aws_iam_role.execution.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["secretsmanager:GetSecretValue"]
      Resource = [aws_secretsmanager_secret.mongo.arn, aws_secretsmanager_secret.postgres.arn]
    }]
  })
}

resource "aws_iam_role" "processor" {
  name = "luminascale-processor-task"
  assume_role_policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Principal = { Service = "ecs-tasks.amazonaws.com" }, Action = "sts:AssumeRole" }]
  })
}

resource "aws_iam_role_policy" "processor" {
  role = aws_iam_role.processor.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect   = "Allow"
        Action   = ["sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:ChangeMessageVisibility", "sqs:GetQueueAttributes"]
        Resource = aws_sqs_queue.events.arn
      },
      {
        Effect   = "Allow"
        Action   = ["iot:Publish"]
        Resource = "arn:aws:iot:${var.aws_region}:${data.aws_caller_identity.current.account_id}:topic/luminascale/*"
      }
    ]
  })
}

resource "aws_security_group" "processor" {
  name        = "luminascale-processor"
  description = "Outbound access for LuminaScale processor"
  vpc_id      = data.aws_vpc.default.id
  egress {
    from_port   = 0
    to_port     = 0
    protocol    = "-1"
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_ecs_task_definition" "processor" {
  family                   = "luminascale-processor"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = 256
  memory                   = 512
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.processor.arn
  container_definitions = jsonencode([{
    name      = "processor"
    image     = var.processor_image
    essential = true
    environment = [
      { name = "SQS_QUEUE_URL", value = aws_sqs_queue.events.url },
      { name = "AWS_REGION", value = var.aws_region },
      { name = "IOT_DATA_ENDPOINT", value = var.iot_data_endpoint },
      { name = "MONGO_DATABASE", value = "luminascale" },
      { name = "LUX_WINDOW", value = "5" }
    ]
    secrets = [
      { name = "MONGO_URL", valueFrom = aws_secretsmanager_secret.mongo.arn },
      { name = "POSTGRES_URL", valueFrom = aws_secretsmanager_secret.postgres.arn }
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

resource "aws_appautoscaling_policy" "scale_out" {
  name               = "luminascale-backlog-scale-out"
  policy_type        = "StepScaling"
  resource_id        = aws_appautoscaling_target.processor.resource_id
  scalable_dimension = aws_appautoscaling_target.processor.scalable_dimension
  service_namespace  = aws_appautoscaling_target.processor.service_namespace
  step_scaling_policy_configuration {
    adjustment_type         = "ChangeInCapacity"
    cooldown                = 60
    metric_aggregation_type = "Average"
    step_adjustment {
      metric_interval_lower_bound = 0
      scaling_adjustment          = 1
    }
    step_adjustment {
      metric_interval_lower_bound = var.backlog_per_task_target
      scaling_adjustment          = 2
    }
  }
}

resource "aws_appautoscaling_policy" "scale_in" {
  name               = "luminascale-backlog-scale-in"
  policy_type        = "StepScaling"
  resource_id        = aws_appautoscaling_target.processor.resource_id
  scalable_dimension = aws_appautoscaling_target.processor.scalable_dimension
  service_namespace  = aws_appautoscaling_target.processor.service_namespace
  step_scaling_policy_configuration {
    adjustment_type         = "ChangeInCapacity"
    cooldown                = 180
    metric_aggregation_type = "Average"
    step_adjustment {
      metric_interval_upper_bound = 0
      scaling_adjustment          = -1
    }
  }
}

resource "aws_cloudwatch_metric_alarm" "backlog_high" {
  alarm_name          = "luminascale-backlog-per-task-high"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  threshold           = var.backlog_per_task_target
  alarm_actions       = [aws_appautoscaling_policy.scale_out.arn]
  treat_missing_data  = "notBreaching"

  metric_query {
    id          = "e1"
    expression  = "IF(t1>0,q1/t1,q1)"
    label       = "Backlog per running task"
    return_data = true
  }
  metric_query {
    id = "q1"
    metric {
      metric_name = "ApproximateNumberOfMessagesVisible"
      namespace   = "AWS/SQS"
      period      = 60
      stat        = "Average"
      dimensions  = { QueueName = aws_sqs_queue.events.name }
    }
  }
  metric_query {
    id = "t1"
    metric {
      metric_name = "RunningTaskCount"
      namespace   = "ECS/ContainerInsights"
      period      = 60
      stat        = "Average"
      dimensions  = { ClusterName = aws_ecs_cluster.main.name, ServiceName = aws_ecs_service.processor.name }
    }
  }
}

resource "aws_cloudwatch_metric_alarm" "backlog_low" {
  alarm_name          = "luminascale-backlog-per-task-low"
  comparison_operator = "LessThanThreshold"
  evaluation_periods  = 3
  datapoints_to_alarm = 3
  threshold           = var.backlog_per_task_target / 2
  alarm_actions       = [aws_appautoscaling_policy.scale_in.arn]
  treat_missing_data  = "notBreaching"

  metric_query {
    id          = "e1"
    expression  = "IF(t1>0,q1/t1,q1)"
    label       = "Backlog per running task"
    return_data = true
  }
  metric_query {
    id = "q1"
    metric {
      metric_name = "ApproximateNumberOfMessagesVisible"
      namespace   = "AWS/SQS"
      period      = 60
      stat        = "Average"
      dimensions  = { QueueName = aws_sqs_queue.events.name }
    }
  }
  metric_query {
    id = "t1"
    metric {
      metric_name = "RunningTaskCount"
      namespace   = "ECS/ContainerInsights"
      period      = 60
      stat        = "Average"
      dimensions  = { ClusterName = aws_ecs_cluster.main.name, ServiceName = aws_ecs_service.processor.name }
    }
  }
}
