# SQS Queue for Notifications
resource "aws_sqs_queue" "notifications" {
  name                      = "${var.project_name}-notifications"
  delay_seconds             = 0
  max_message_size          = 262144
  message_retention_seconds = 86400
  receive_wait_time_seconds = 10

  tags = {
    Name = "${var.project_name}-notifications-queue"
  }
}

# Lambda Execution Role
resource "aws_iam_role" "lambda_execution" {
  name = "${var.project_name}-lambda-execution-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Name = "${var.project_name}-lambda-execution-role"
  }
}

# Lambda Basic Execution Policy
resource "aws_iam_role_policy_attachment" "lambda_basic" {
  role       = aws_iam_role.lambda_execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# Lambda Function
resource "aws_lambda_function" "order_validator" {
  filename      = "${path.module}/../../lambda/lambda.zip"
  function_name = "${var.project_name}-order-validator"
  role          = aws_iam_role.lambda_execution.arn
  handler       = "index.handler"
  runtime       = "nodejs20.x"
  timeout       = 30
  memory_size   = 256

  source_code_hash = fileexists("${path.module}/../../lambda/lambda.zip") ? filebase64sha256("${path.module}/../../lambda/lambda.zip") : ""

  environment {
    variables = {
      NODE_ENV                    = "production"
      OTEL_SERVICE_NAME           = "order-validator-lambda"
      OTEL_EXPORTER_OTLP_ENDPOINT = var.otel_endpoint
    }
  }

  tags = {
    Name = "${var.project_name}-order-validator"
  }
}

# Lambda Function URL (for easy invocation)
resource "aws_lambda_function_url" "order_validator" {
  function_name      = aws_lambda_function.order_validator.function_name
  authorization_type = "NONE"

  cors {
    allow_credentials = true
    allow_origins     = ["*"]
    allow_methods     = ["POST"]
    allow_headers     = ["*"]
    max_age           = 86400
  }
}

# CloudWatch Log Group for Lambda
resource "aws_cloudwatch_log_group" "lambda" {
  name              = "/aws/lambda/${aws_lambda_function.order_validator.function_name}"
  retention_in_days = 7

  tags = {
    Name = "${var.project_name}-lambda-logs"
  }
}
