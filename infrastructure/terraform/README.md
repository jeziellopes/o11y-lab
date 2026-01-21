# Terraform Infrastructure

## Overview
This directory contains Terraform configuration for deploying the observability demo to AWS.

## Architecture
- **VPC**: Public and private subnets across 2 AZs
- **ECS Fargate**: Runs containerized microservices
- **Application Load Balancer**: Routes traffic to services
- **Lambda**: Serverless order validation function
- **SQS**: Message queue for async processing
- **ECR**: Container image registry
- **CloudWatch**: Logging

## Prerequisites
1. AWS CLI configured with credentials
2. Terraform >= 1.0 installed
3. Docker images built and pushed to ECR

## Setup

### 1. Configure Variables
```bash
cp terraform.tfvars.example terraform.tfvars
# Edit terraform.tfvars with your settings
```

### 2. Initialize Terraform
```bash
terraform init
```

### 3. Plan Deployment
```bash
terraform plan
```

### 4. Deploy Infrastructure
```bash
terraform apply
```

## Build and Push Docker Images

```bash
# Set your AWS account ID and region
export AWS_ACCOUNT_ID="your-account-id"
export AWS_REGION="us-east-1"

# Login to ECR
aws ecr get-login-password --region $AWS_REGION | docker login --username AWS --password-stdin $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com

# Build and push each service
for service in api-gateway user-service order-service notification-service; do
  cd ../../services/$service
  docker build -t observability-demo/$service:latest .
  docker tag observability-demo/$service:latest $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/observability-demo/$service:latest
  docker push $AWS_ACCOUNT_ID.dkr.ecr.$AWS_REGION.amazonaws.com/observability-demo/$service:latest
done
```

## Deploy Lambda Function

```bash
cd ../../lambda
npm install
npm run build
terraform apply -target=aws_lambda_function.order_validator
```

## Outputs
After deployment, Terraform will output:
- `alb_dns_name`: Load balancer URL
- `api_gateway_url`: API Gateway endpoint
- `lambda_function_name`: Lambda function name
- `sqs_queue_url`: SQS queue URL

## Testing

```bash
# Get ALB DNS
export ALB_DNS=$(terraform output -raw alb_dns_name)

# Test API Gateway
curl http://$ALB_DNS/api/users

# Test Lambda function
aws lambda invoke \
  --function-name $(terraform output -raw lambda_function_name) \
  --payload '{"body":"{\"userId\":1,\"items\":[\"test\"],\"total\":99.99}"}' \
  response.json
```

## Cleanup

```bash
terraform destroy
```

## Cost Estimation
- ECS Fargate: ~$30-50/month (4 services, minimal CPU/memory)
- ALB: ~$16/month
- NAT Gateway: ~$32/month
- Lambda: Free tier eligible
- SQS: Free tier eligible

**Total estimated cost**: ~$80-100/month

## Notes
- This is a demo setup, not production-ready
- Consider using ECS Service Discovery for production
- Enable ALB access logs for production
- Use HTTPS with ACM certificates
- Implement proper secret management (AWS Secrets Manager)
- Configure auto-scaling based on load
