output "vpc_id" {
  description = "ID of the VPC"
  value       = aws_vpc.main.id
}

output "alb_dns_name" {
  description = "DNS name of the Application Load Balancer"
  value       = aws_lb.main.dns_name
}

output "api_gateway_url" {
  description = "URL of the API Gateway service"
  value       = "http://${aws_lb.main.dns_name}"
}

output "lambda_function_name" {
  description = "Name of the Lambda function"
  value       = aws_lambda_function.order_validator.function_name
}

output "lambda_function_arn" {
  description = "ARN of the Lambda function"
  value       = aws_lambda_function.order_validator.arn
}

output "sqs_queue_url" {
  description = "URL of the SQS queue"
  value       = aws_sqs_queue.notifications.url
}

output "ecs_cluster_name" {
  description = "Name of the ECS cluster"
  value       = aws_ecs_cluster.main.name
}

output "jaeger_ui_url" {
  description = "Jaeger UI URL (if enabled)"
  value       = var.enable_jaeger ? "http://${aws_lb.main.dns_name}:16686" : "Jaeger not enabled"
}
