variable "aws_region" {
  type    = string
  default = "us-east-1"
}

variable "processor_image" {
  description = "Full ECR image URI for the LuminaScale processor."
  type        = string
}

variable "lab_role_name" {
  description = "Pre-created AWS Academy IAM role."
  type        = string
  default     = "LabRole"
}

variable "min_tasks" {
  type    = number
  default = 1
}

variable "max_tasks" {
  type    = number
  default = 4
}

variable "backlog_per_task_target" {
  type    = number
  default = 100
}
