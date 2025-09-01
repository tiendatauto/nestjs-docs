# Docker Configuration for Team NestJS Project

## Tổng quan

Docker giúp đóng gói ứng dụng và dependencies vào containers, đảm bảo consistency giữa các environments và dễ dàng deployment. Tài liệu này sẽ hướng dẫn cách setup Docker cho NestJS project từ development đến production.

## 1. Prerequisites

### 1.1 Cài đặt Docker

```bash
# Windows/Mac: Download Docker Desktop
# Linux Ubuntu:
sudo apt-get update
sudo apt-get install docker-ce docker-ce-cli containerd.io docker-compose-plugin

# Verify installation
docker --version
docker-compose --version
```

### 1.2 Project Structure cần thiết

```
project/
├── Dockerfile
├── docker-compose.yml
├── docker-compose.dev.yml
├── docker-compose.prod.yml
├── .dockerignore
├── scripts/
│   ├── docker-entrypoint.sh
│   └── wait-for-it.sh
└── docker/
    ├── nginx/
    │   └── nginx.conf
    └── postgres/
        └── init.sql
```

## 2. Dockerfile Configuration

### 2.1 Multi-stage Dockerfile cho Production

```dockerfile
# Dockerfile
# Stage 1: Builder
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Install dependencies
RUN npm ci --only=production && npm cache clean --force

# Copy source code
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Build application
RUN npm run build

# Stage 2: Production
FROM node:18-alpine AS runner

# Create app directory
WORKDIR /app

# Create non-root user
RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nestjs

# Copy built application from builder stage
COPY --from=builder --chown=nestjs:nodejs /app/dist ./dist
COPY --from=builder --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nestjs:nodejs /app/prisma ./prisma
COPY --from=builder --chown=nestjs:nodejs /app/package*.json ./

# Copy entrypoint script
COPY --chown=nestjs:nodejs scripts/docker-entrypoint.sh ./scripts/
RUN chmod +x ./scripts/docker-entrypoint.sh

# Switch to non-root user
USER nestjs

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/health || exit 1

# Start application
ENTRYPOINT ["./scripts/docker-entrypoint.sh"]
CMD ["npm", "run", "start:prod"]
```

### 2.2 Development Dockerfile

```dockerfile
# Dockerfile.dev
FROM node:18-alpine

WORKDIR /app

# Install curl for health checks
RUN apk add --no-cache curl

# Copy package files
COPY package*.json ./
COPY prisma ./prisma/

# Install all dependencies (including devDependencies)
RUN npm ci

# Copy source code
COPY . .

# Generate Prisma client
RUN npx prisma generate

# Expose port
EXPOSE 3000

# Start in development mode
CMD ["npm", "run", "start:dev"]
```

## 3. Docker Compose Configuration

### 3.1 Base Docker Compose

```yaml
# docker-compose.yml
version: '3.8'

services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
    container_name: nestjs-app
    restart: unless-stopped
    ports:
      - '3000:3000'
    environment:
      - NODE_ENV=production
    depends_on:
      db:
        condition: service_healthy
      redis:
        condition: service_healthy
    networks:
      - app-network
    volumes:
      - ./uploads:/app/uploads
      - ./logs:/app/logs

  db:
    image: postgres:15-alpine
    container_name: nestjs-db
    restart: unless-stopped
    environment:
      POSTGRES_DB: ${DB_NAME:-nestjs_app}
      POSTGRES_USER: ${DB_USER:-postgres}
      POSTGRES_PASSWORD: ${DB_PASSWORD:-postgres}
    ports:
      - '5432:5432'
    volumes:
      - postgres_data:/var/lib/postgresql/data
      - ./docker/postgres/init.sql:/docker-entrypoint-initdb.d/init.sql
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U ${DB_USER:-postgres}']
      interval: 10s
      timeout: 5s
      retries: 5
    networks:
      - app-network

  redis:
    image: redis:7-alpine
    container_name: nestjs-redis
    restart: unless-stopped
    ports:
      - '6379:6379'
    command: redis-server --appendonly yes --requirepass ${REDIS_PASSWORD:-redis123}
    volumes:
      - redis_data:/data
    healthcheck:
      test: ['CMD', 'redis-cli', '--raw', 'incr', 'ping']
      interval: 10s
      timeout: 3s
      retries: 5
    networks:
      - app-network

  nginx:
    image: nginx:alpine
    container_name: nestjs-nginx
    restart: unless-stopped
    ports:
      - '80:80'
      - '443:443'
    volumes:
      - ./docker/nginx/nginx.conf:/etc/nginx/nginx.conf
      - ./docker/nginx/ssl:/etc/nginx/ssl
    depends_on:
      - app
    networks:
      - app-network

volumes:
  postgres_data:
  redis_data:

networks:
  app-network:
    driver: bridge
```

### 3.2 Development Override

```yaml
# docker-compose.dev.yml
version: '3.8'

services:
  app:
    build:
      context: .
      dockerfile: Dockerfile.dev
    environment:
      - NODE_ENV=development
      - DATABASE_URL=postgresql://${DB_USER:-postgres}:${DB_PASSWORD:-postgres}@db:5432/${DB_NAME:-nestjs_app}
      - REDIS_URL=redis://:${REDIS_PASSWORD:-redis123}@redis:6379
    volumes:
      - .:/app
      - /app/node_modules
      - ./uploads:/app/uploads
    command: npm run start:dev

  db:
    environment:
      POSTGRES_DB: ${DB_NAME:-nestjs_app_dev}
    ports:
      - '5433:5432'

  redis:
    ports:
      - '6380:6379'

  # Development tools
  adminer:
    image: adminer
    container_name: nestjs-adminer
    restart: unless-stopped
    ports:
      - '8080:8080'
    environment:
      ADMINER_DEFAULT_SERVER: db
    networks:
      - app-network

  redis-commander:
    image: rediscommander/redis-commander:latest
    container_name: nestjs-redis-commander
    restart: unless-stopped
    ports:
      - '8081:8081'
    environment:
      REDIS_HOSTS: local:redis:6379:0:${REDIS_PASSWORD:-redis123}
    networks:
      - app-network
```

## 4. Configuration Files

### 4.1 .dockerignore

```dockerignore
# .dockerignore
node_modules
npm-debug.log
.env
.env.*
!.env.example
.git
.gitignore
README.md
.eslintrc.js
.prettierrc
coverage
.nyc_output
dist
logs
*.log
.DS_Store
Thumbs.db
.vscode
.idea
*.md
!README.md
docker-compose*.yml
Dockerfile*
.dockerignore
test
spec
__tests__
```

### 4.2 Docker Entrypoint Script

```bash
#!/bin/sh
# scripts/docker-entrypoint.sh

set -e

echo "🚀 Starting NestJS application..."

# Wait for database to be ready
echo "⏳ Waiting for database..."
until nc -z db 5432; do
  echo "Database is unavailable - sleeping"
  sleep 1
done
echo "✅ Database is ready!"

# Run database migrations
echo "🔄 Running database migrations..."
npx prisma migrate deploy

# Generate Prisma client (if not already generated)
echo "🔧 Generating Prisma client..."
npx prisma generate

# Seed database in development
if [ "$NODE_ENV" = "development" ]; then
  echo "🌱 Seeding database..."
  npx prisma db seed || echo "⚠️ Seeding failed or no seed script found"
fi

echo "✅ Application setup complete!"

# Execute the main command
exec "$@"
```

## 5. Development Workflow

### 5.1 Make Commands

```makefile
# Makefile
.PHONY: dev prod build up down logs shell db-shell clean

# Development
dev:
	docker-compose -f docker-compose.yml -f docker-compose.dev.yml up --build

dev-detached:
	docker-compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build

# Production
prod:
	docker-compose -f docker-compose.yml -f docker-compose.prod.yml up --build

# Build
build:
	docker-compose build

# Control
up:
	docker-compose up -d

down:
	docker-compose down

# Monitoring
logs:
	docker-compose logs -f

shell:
	docker-compose exec app sh

db-shell:
	docker-compose exec db psql -U postgres -d nestjs_app

# Cleanup
clean:
	docker-compose down -v
	docker system prune -f
```

### 5.2 NPM Scripts for Docker

```json
{
  "scripts": {
    "docker:dev": "docker-compose -f docker-compose.yml -f docker-compose.dev.yml up --build",
    "docker:prod": "docker-compose -f docker-compose.yml -f docker-compose.prod.yml up --build",
    "docker:build": "docker-compose build",
    "docker:up": "docker-compose up -d",
    "docker:down": "docker-compose down",
    "docker:logs": "docker-compose logs -f",
    "docker:shell": "docker-compose exec app sh",
    "docker:clean": "docker-compose down -v && docker system prune -f"
  }
}
```

## 6. Security Best Practices

### 6.1 Security-focused Dockerfile

```dockerfile
# Security additions
FROM node:18-alpine

# Update packages and install security updates
RUN apk update && apk upgrade && apk add --no-cache dumb-init

# Use dumb-init as PID 1
ENTRYPOINT ["dumb-init", "--"]

# Drop root privileges
USER node

# Set security environment variables
ENV NODE_ENV=production
ENV NPM_CONFIG_AUDIT_LEVEL=moderate
```

### 6.2 Docker Compose Security

```yaml
# Security additions to docker-compose.yml
services:
  app:
    security_opt:
      - no-new-privileges:true
    read_only: true
    tmpfs:
      - /tmp
      - /app/logs
    cap_drop:
      - ALL
    cap_add:
      - CHOWN
      - SETGID
      - SETUID
```

## 7. Troubleshooting

### 7.1 Common Issues

**Issue 1: Permission denied**

```bash
chmod +x scripts/docker-entrypoint.sh
```

**Issue 2: Database connection failed**

```bash
docker-compose logs db
docker-compose exec app nc -z db 5432
```

**Issue 3: Port already in use**

```bash
lsof -i :3000
# Change port in docker-compose.yml
```

### 7.2 Debugging Commands

```bash
# View logs
docker-compose logs -f [service_name]

# Execute commands
docker-compose exec app sh

# Check processes
docker-compose top

# Resource usage
docker stats

# Inspect container
docker inspect [container_name]
```

## 8. Best Practices Summary

### 8.1 Development

- Use separate compose files cho environments
- Mount source code cho hot reload
- Expose debug ports
- Use development tools (Adminer)

### 8.2 Production

- Multi-stage builds cho optimization
- Non-root user
- Health checks
- Resource limits
- Proper logging

### 8.3 Security

- Scan images for vulnerabilities
- Minimal base images
- Keep secrets out of Dockerfiles
- Network segmentation

## Kết luận

Docker configuration cho NestJS project cần balance giữa ease of development và production readiness. Follow best practices này sẽ đảm bảo:

- **Consistent environments** across stages
- **Easy local development** setup
- **Production-ready** containers
- **Scalable architecture**
- **Security-first** approach
