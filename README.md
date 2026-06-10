# Realms API

## Deployment (Docker)
The product ships as a single image: this API serves the built frontend in production
(`NODE_ENV=production`). The Dockerfile lives in the parent directory because its build
context needs both `realms-app/` and `realms-api/`.

```bash
# From the directory containing both repos
docker build -t realms .
docker run -p 3000:3000 -v realms-data:/data -e REALMS_DATA_DIR=/data realms
```

All persistent state (SQLite database and uploads) lives under `REALMS_DATA_DIR`,
so the single named volume covers everything. `docker compose up` from the same
directory does the same thing.

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