# Realms API

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