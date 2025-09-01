# Hướng dẫn chạy dự án với Docker & Docker Compose

## 1. Chạy ứng dụng với Docker Compose (khuyên dùng)

### Bước 1: Cấu hình biến môi trường

# Docker Configuration for NestJS Project

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
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3
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

## 4. Hướng dẫn chạy dự án với Docker Compose (khuyên dùng)

### Bước 1: Cấu hình biến môi trường

Tạo file `.env` ở thư mục gốc (đã có sẵn mẫu):

```
DATABASE_URL=postgresql://postgres:postgres@db:5432/nestdb
PORT=4000
```

### Bước 2: Khởi động toàn bộ hệ thống (app và database đều tự động chạy)

**Có 2 cách sử dụng docker compose:**

#### 1. Dùng 1 lệnh duy nhất (tự động build nếu có thay đổi Dockerfile hoặc source):

```bash
docker compose up --build
```

> Lệnh này sẽ build lại image nếu có thay đổi và khởi động toàn bộ hệ thống (app + database). Thường dùng khi bạn vừa chỉnh sửa code hoặc Dockerfile.

#### 2. Build và chạy tách biệt:

```bash
docker compose build
docker compose up
```

> Sử dụng khi bạn muốn chủ động build lại image trước, sau đó chỉ cần `up` để khởi động lại container mà không build lại (tiết kiệm thời gian nếu code không đổi).

#### 3. Chỉ chạy lại container (không build lại image):

```bash
docker compose up
```

> Dùng khi bạn chắc chắn image đã build đúng, chỉ muốn khởi động lại app và database.

---

Sau khi chạy các lệnh trên:

- Ứng dụng sẽ chạy ở cổng 4000
- PostgreSQL sẽ chạy ở cổng 5432
- Không cần build hay run thủ công từng container, mọi thứ sẽ tự động sẵn sàng

- Các biến môi trường của app sẽ được nạp từ file `.env` nhờ cấu hình `env_file` trong `docker-compose.yml`.
- Mặc định, database sẽ có:
  - user: `postgres`
  - password: `postgres`
  - db name: `nestdb`
- Biến môi trường kết nối: `DATABASE_URL=postgresql://postgres:postgres@db:5432/nestdb`

### Lưu ý khi build và chạy Docker

- Đảm bảo Dockerfile có dòng:
  ```dockerfile
  CMD ["node", "dist/main.js"]
  ```
  hoặc đúng tên file build ra trong thư mục dist.
- Nếu gặp lỗi `Empty reply from server` hoặc không truy cập được app:
  - Kiểm tra lại log container app: `docker compose logs app`
  - Đảm bảo đã build lại image sau khi sửa code: `docker compose up --build` hoặc `docker compose build`

  - Kiểm tra file build đã đúng chưa (có file dist/main.js)

## 2. Chạy thủ công từng container (không khuyến khích)

### Build image:

```bash
docker build -t nestjs-dat-app .
```

### Chạy PostgreSQL:

```bash
docker run --name nestjs-dat-db -e POSTGRES_USER=postgres -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=nestdb -p 5432:5432 -d postgres:16
```

### Chạy app:

```bash
docker run --name nestjs-dat-app --link nestjs-dat-db:db -e DATABASE_URL=postgresql://postgres:postgres@db:5432/nestdb -p 4000:4000 nestjs-dat-app
```

## 3. Ghi chú

- Dockerfile sử dụng Node.js 22.
- PostgreSQL sẽ lưu data vào volume `pgdata` (xem docker-compose.yml).
- Ứng dụng sẽ tự động cài đặt dependencies và chạy ở chế độ production.
