# Realms API

## CI/CD Setup with CircleCI and AWS S3

### Prerequisites
1. CircleCI account
2. AWS account with S3 access
3. AWS CLI installed locally

### AWS Setup
1. Create S3 buckets for each environment:
```bash
# QA environment
aws s3 mb s3://your-qa-bucket-name

# Staging environment
aws s3 mb s3://your-staging-bucket-name

# Production environment
aws s3 mb s3://your-prod-bucket-name
```

2. Configure buckets for static website hosting:
```bash
# QA environment
aws s3 website s3://your-qa-bucket-name --index-document index.html

# Staging environment
aws s3 website s3://your-staging-bucket-name --index-document index.html

# Production environment
aws s3 website s3://your-prod-bucket-name --index-document index.html
```

3. Create an IAM user with S3 access:
   - Go to AWS IAM Console
   - Create a new user
   - Attach the `AmazonS3FullAccess` policy
   - Save the Access Key ID and Secret Access Key

### CircleCI Setup
1. Fork this repository
2. Go to CircleCI and add the project
3. Add the following environment variables in CircleCI project settings:
   - `AWS_ACCESS_KEY_ID`: Your AWS access key
   - `AWS_SECRET_ACCESS_KEY`: Your AWS secret key
   - `AWS_S3_BUCKET_QA`: Your QA bucket name
   - `AWS_S3_BUCKET_STAGING`: Your staging bucket name
   - `AWS_S3_BUCKET_PROD`: Your production bucket name
   - `AWS_DEFAULT_REGION`: Your AWS region (e.g., us-east-1)

### Branch Strategy
- `develop` branch -> QA environment
- `staging` branch -> Staging environment
- `main` branch -> Production environment

### Deployment
The pipeline will automatically:
1. Run tests
2. Build the project
3. Deploy to the appropriate S3 bucket based on the branch:
   - Pushes to `develop` -> QA bucket
   - Pushes to `staging` -> Staging bucket
   - Pushes to `main` -> Production bucket

### Manual Deployment
To deploy manually to a specific environment:
```bash
# Build the project
npm run build

# Deploy to QA
aws s3 sync dist/ s3://your-qa-bucket-name --delete

# Deploy to Staging
aws s3 sync dist/ s3://your-staging-bucket-name --delete

# Deploy to Production
aws s3 sync dist/ s3://your-prod-bucket-name --delete
```

## Development
```bash
# Install dependencies
npm install

# Run development server
npm run dev

# Run tests
npm test

# Build for production
npm run build
``` 