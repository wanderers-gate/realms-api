FROM node:20-alpine

WORKDIR /app

# Install git and dependencies for building native modules
RUN apk add --no-cache git python3 make g++

# Copy package.json and install dependencies
COPY package*.json ./
RUN npm install

# Copy source code
COPY . .

# Use TypeScript directly instead of bundling
RUN npm install -g typescript
RUN tsc

# Expose the port
EXPOSE 3000

# Start the app
CMD ["node", "./dist/server.js"] 