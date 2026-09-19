variable "aws_region" {
  description = "AWS region for the prototype."
  type        = string
  default     = "ap-southeast-2"
}

variable "processor_image" {
  description = "ECR image URI for the processor service."
  type        = string
}

variable "mongo_url" {
  description = "MongoDB Atlas connection string."
  type        = string
  sensitive   = true
}

variable "postgres_url" {
  description = "PostgreSQL connection string."
  type        = string
  sensitive   = true
}

variable "iot_data_endpoint" {
  description = "AWS IoT data endpoint such as https://abc-ats.iot.ap-southeast-2.amazonaws.com."
  type        = string
}

variable "min_tasks" {
  type    = number
  default = 1
}

variable "max_tasks" {
  type    = number
  default = 10
}

variable "backlog_per_task_target" {
  description = "Maximum target number of visible messages per running task."
  type        = number
  default     = 100
}

