# Khởi tạo Project Scalable cho Team

## Tổng quan

Khi khởi tạo một project NestJS scalable cho team, cần có một quy trình chuẩn để đảm bảo tính nhất quán, dễ bảo trì và có thể mở rộng. Tài liệu này sẽ hướng dẫn từng bước chi tiết.

## 1. Project Structure Planning

### 1.1 Folder Structure Chuẩn

```
src/
├── app.module.ts              # Root module
├── main.ts                    # Entry point
├── shared/                    # Shared resources
│   ├── config/               # Configuration files
│   ├── constants/            # Application constants
│   ├── decorators/           # Custom decorators
│   ├── dtos/                 # Data Transfer Objects
│   ├── filters/              # Exception filters
│   ├── guards/               # Authentication/Authorization guards
│   ├── interceptors/         # Request/Response interceptors
│   ├── middlewares/          # Custom middlewares
│   ├── pipes/                # Validation pipes
│   ├── services/             # Shared services
│   └── types/                # TypeScript type definitions
├── modules/                  # Feature modules
│   ├── auth/                 # Authentication module
│   ├── users/                # Users module
│   └── products/             # Products module
└── database/                 # Database related files
    ├── migrations/           # Database migrations
    ├── seeds/                # Database seeders
    └── entities/             # Database entities
```

### 1.2 Module Organization

```typescript
// Feature module structure
modules/
├── users/
│   ├── users.module.ts
│   ├── users.controller.ts
│   ├── users.service.ts
│   ├── dto/
│   │   ├── create-user.dto.ts
│   │   └── update-user.dto.ts
│   ├── entities/
│   │   └── user.entity.ts
│   ├── repositories/
│   │   └── users.repository.ts
│   └── tests/
│       ├── users.controller.spec.ts
│       └── users.service.spec.ts
```

## 2. Environment Configuration

### 2.1 Environment Variables Setup

Tạo các file environment cho từng môi trường:

```bash
# .env.development
NODE_ENV=development
PORT=3000
DATABASE_URL="postgresql://username:password@localhost:5432/dbname_dev"

# .env.staging
NODE_ENV=staging
PORT=3000
DATABASE_URL="postgresql://username:password@staging-host:5432/dbname_staging"

# .env.production
NODE_ENV=production
PORT=3000
DATABASE_URL="postgresql://username:password@prod-host:5432/dbname_prod"
```

### 2.2 Configuration Module

```typescript
// src/shared/config/env.config.ts
import { z } from 'zod'
import { config } from 'dotenv'
import { resolve } from 'path'

// Load environment specific config
const env = process.env.NODE_ENV || 'development'
config({ path: resolve(`.env.${env}`) })

const configSchema = z.object({
  NODE_ENV: z.enum(['development', 'staging', 'production']),
  PORT: z.string().transform(Number),
  DATABASE_URL: z.string(),
  JWT_SECRET: z.string(),
  JWT_EXPIRES_IN: z.string(),
  REDIS_URL: z.string().optional(),
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
})

const configValidation = configSchema.safeParse(process.env)

if (!configValidation.success) {
  console.error('❌ Invalid environment variables:', configValidation.error.format())
  process.exit(1)
}

export const envConfig = configValidation.data
```

### 2.3 Configuration Module

```typescript
// src/shared/config/configuration.module.ts
import { Global, Module } from '@nestjs/common'
import { ConfigModule } from '@nestjs/config'
import { envConfig } from './env.config'

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [() => envConfig],
    }),
  ],
  providers: [
    {
      provide: 'ENV_CONFIG',
      useValue: envConfig,
    },
  ],
  exports: ['ENV_CONFIG'],
})
export class ConfigurationModule {}
```

## 3. Database Setup

### 3.1 Prisma Configuration

```typescript
// prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id        String   @id @default(cuid())
  email     String   @unique
  name      String?
  password  String
  role      Role     @default(USER)
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@map("users")
}

enum Role {
  USER
  ADMIN
  MODERATOR
}
```

### 3.2 Database Service

```typescript
// src/shared/services/database.service.ts
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'

@Injectable()
export class DatabaseService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() {
    await this.$connect()
  }

  async onModuleDestroy() {
    await this.$disconnect()
  }
}
```

## 4. Logging Strategy

### 4.1 Logger Configuration

```typescript
// src/shared/services/logger.service.ts
import { Injectable, LoggerService as NestLoggerService } from '@nestjs/common'
import { createLogger, format, transports, Logger } from 'winston'

@Injectable()
export class LoggerService implements NestLoggerService {
  private logger: Logger

  constructor() {
    this.logger = createLogger({
      level: process.env.LOG_LEVEL || 'info',
      format: format.combine(format.timestamp(), format.errors({ stack: true }), format.json()),
      transports: [
        new transports.Console({
          format: format.combine(format.colorize(), format.simple()),
        }),
        new transports.File({ filename: 'logs/error.log', level: 'error' }),
        new transports.File({ filename: 'logs/combined.log' }),
      ],
    })
  }

  log(message: string, context?: string) {
    this.logger.info(message, { context })
  }

  error(message: string, trace?: string, context?: string) {
    this.logger.error(message, { trace, context })
  }

  warn(message: string, context?: string) {
    this.logger.warn(message, { context })
  }

  debug(message: string, context?: string) {
    this.logger.debug(message, { context })
  }

  verbose(message: string, context?: string) {
    this.logger.verbose(message, { context })
  }
}
```

## 5. Authentication & Authorization

### 5.1 JWT Strategy

```typescript
// src/modules/auth/strategies/jwt.strategy.ts
import { Injectable, UnauthorizedException } from '@nestjs/common'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'
import { DatabaseService } from 'src/shared/services/database.service'

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private readonly database: DatabaseService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET,
    })
  }

  async validate(payload: any) {
    const user = await this.database.user.findUnique({
      where: { id: payload.sub },
      select: { id: true, email: true, role: true, isActive: true },
    })

    if (!user || !user.isActive) {
      throw new UnauthorizedException()
    }

    return user
  }
}
```

### 5.2 Auth Module

```typescript
// src/modules/auth/auth.module.ts
import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { PassportModule } from '@nestjs/passport'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'
import { JwtStrategy } from './strategies/jwt.strategy'

@Module({
  imports: [
    PassportModule,
    JwtModule.register({
      secret: process.env.JWT_SECRET,
      signOptions: { expiresIn: process.env.JWT_EXPIRES_IN || '1d' },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
```

## 6. Validation & Error Handling

### 6.1 Global Validation Pipe

```typescript
// src/main.ts
import { ValidationPipe } from '@nestjs/common'
import { NestFactory } from '@nestjs/core'
import { AppModule } from './app.module'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: {
        enableImplicitConversion: true,
      },
    }),
  )

  await app.listen(process.env.PORT || 3000)
}
bootstrap()
```

### 6.2 Global Exception Filter

```typescript
// src/shared/filters/http-exception.filter.ts
import { ExceptionFilter, Catch, ArgumentsHost, HttpException, HttpStatus } from '@nestjs/common'
import { Request, Response } from 'express'
import { LoggerService } from '../services/logger.service'

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  constructor(private readonly logger: LoggerService) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp()
    const response = ctx.getResponse<Response>()
    const request = ctx.getRequest<Request>()

    const status = exception instanceof HttpException ? exception.getStatus() : HttpStatus.INTERNAL_SERVER_ERROR

    const message = exception instanceof HttpException ? exception.getResponse() : 'Internal server error'

    const errorResponse = {
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      method: request.method,
      message,
    }

    this.logger.error(
      `HTTP Exception: ${JSON.stringify(errorResponse)}`,
      exception instanceof Error ? exception.stack : '',
      'ExceptionFilter',
    )

    response.status(status).json(errorResponse)
  }
}
```

## 7. API Documentation

### 7.1 Swagger Setup

```typescript
// src/main.ts
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)

  // Swagger configuration
  const config = new DocumentBuilder()
    .setTitle('API Documentation')
    .setDescription('The API description')
    .setVersion('1.0')
    .addBearerAuth()
    .build()

  const document = SwaggerModule.createDocument(app, config)
  SwaggerModule.setup('api/docs', app, document)

  await app.listen(process.env.PORT || 3000)
}
bootstrap()
```

### 7.2 DTO with Swagger Decorators

```typescript
// src/modules/users/dto/create-user.dto.ts
import { ApiProperty } from '@nestjs/swagger'
import { IsEmail, IsString, MinLength, IsOptional } from 'class-validator'

export class CreateUserDto {
  @ApiProperty({ example: 'john@example.com', description: 'User email' })
  @IsEmail()
  email: string

  @ApiProperty({ example: 'John Doe', description: 'User full name' })
  @IsString()
  @IsOptional()
  name?: string

  @ApiProperty({ example: 'password123', description: 'User password', minLength: 6 })
  @IsString()
  @MinLength(6)
  password: string
}
```

## 8. Testing Setup

### 8.1 Unit Test Configuration

```typescript
// src/modules/users/tests/users.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing'
import { UsersService } from '../users.service'
import { DatabaseService } from 'src/shared/services/database.service'

describe('UsersService', () => {
  let service: UsersService
  let database: DatabaseService

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: DatabaseService,
          useValue: {
            user: {
              create: jest.fn(),
              findMany: jest.fn(),
              findUnique: jest.fn(),
              update: jest.fn(),
              delete: jest.fn(),
            },
          },
        },
      ],
    }).compile()

    service = module.get<UsersService>(UsersService)
    database = module.get<DatabaseService>(DatabaseService)
  })

  it('should be defined', () => {
    expect(service).toBeDefined()
  })
})
```

### 8.2 E2E Test Configuration

```typescript
// test/app.e2e-spec.ts
import { Test, TestingModule } from '@nestjs/testing'
import { INestApplication } from '@nestjs/common'
import * as request from 'supertest'
import { AppModule } from './../src/app.module'

describe('AppController (e2e)', () => {
  let app: INestApplication

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile()

    app = moduleFixture.createNestApplication()
    await app.init()
  })

  it('/ (GET)', () => {
    return request(app.getHttpServer()).get('/').expect(200).expect('Hello World!')
  })
})
```

## 9. Performance & Monitoring

### 9.1 Request Timeout Interceptor

```typescript
// src/shared/interceptors/timeout.interceptor.ts
import { Injectable, NestInterceptor, ExecutionContext, CallHandler, RequestTimeoutException } from '@nestjs/common'
import { Observable, throwError, TimeoutError } from 'rxjs'
import { catchError, timeout } from 'rxjs/operators'

@Injectable()
export class TimeoutInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      timeout(5000),
      catchError((err) => {
        if (err instanceof TimeoutError) {
          return throwError(() => new RequestTimeoutException())
        }
        return throwError(() => err)
      }),
    )
  }
}
```

### 9.2 Response Time Interceptor

```typescript
// src/shared/interceptors/response-time.interceptor.ts
import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common'
import { Observable } from 'rxjs'
import { tap } from 'rxjs/operators'

@Injectable()
export class ResponseTimeInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const start = Date.now()
    return next.handle().pipe(
      tap(() => {
        const response = context.switchToHttp().getResponse()
        const responseTime = Date.now() - start
        response.set('X-Response-Time', `${responseTime}ms`)
      }),
    )
  }
}
```

## 10. Security Best Practices

### 10.1 Security Headers

```typescript
// src/main.ts
import helmet from 'helmet'
import { rateLimit } from 'express-rate-limit'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)

  // Security headers
  app.use(helmet())

  // Rate limiting
  app.use(
    rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 100, // limit each IP to 100 requests per windowMs
    }),
  )

  // CORS configuration
  app.enableCors({
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
    credentials: true,
  })

  await app.listen(process.env.PORT || 3000)
}
bootstrap()
```

### 10.2 Password Hashing Service

```typescript
// src/shared/services/bcrypt.service.ts
import { Injectable } from '@nestjs/common'
import * as bcrypt from 'bcrypt'

@Injectable()
export class BcryptService {
  async hash(password: string): Promise<string> {
    const saltRounds = 10
    return bcrypt.hash(password, saltRounds)
  }

  async compare(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash)
  }
}
```

## 11. Deployment Preparation

### 11.1 Health Check

```typescript
// src/modules/health/health.controller.ts
import { Controller, Get } from '@nestjs/common'
import { HealthCheck, HealthCheckService, PrismaHealthIndicator } from '@nestjs/terminus'
import { DatabaseService } from 'src/shared/services/database.service'

@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private db: PrismaHealthIndicator,
    private database: DatabaseService,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([() => this.db.pingCheck('database', this.database)])
  }
}
```

### 11.2 Docker Configuration

```dockerfile
# Dockerfile
FROM node:18-alpine AS builder

WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma/
RUN npm ci --only=production && npm cache clean --force

FROM node:18-alpine AS runner
WORKDIR /app

COPY --from=builder /app/node_modules ./node_modules
COPY . .

RUN npx prisma generate
RUN npm run build

EXPOSE 3000
CMD ["npm", "run", "start:prod"]
```

## 12. CI/CD Pipeline

### 12.1 GitHub Actions

```yaml
# .github/workflows/ci.yml
name: CI/CD Pipeline

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:13
        env:
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: test_db
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run tests
        run: npm run test

      - name: Run e2e tests
        run: npm run test:e2e
```

## Checklist cho Team Lead

### Trước khi bắt đầu project:

- [ ] **Architecture Planning**
  - [ ] Xác định tech stack
  - [ ] Thiết kế database schema
  - [ ] Lập kế hoạch API endpoints
  - [ ] Xác định authentication strategy

- [ ] **Development Environment**
  - [ ] Setup shared development environment
  - [ ] Cấu hình Docker cho local development
  - [ ] Setup database migrations
  - [ ] Chuẩn bị seed data

- [ ] **Code Standards**
  - [ ] Setup ESLint & Prettier
  - [ ] Định nghĩa coding conventions
  - [ ] Setup pre-commit hooks
  - [ ] Tạo pull request templates

- [ ] **Documentation**
  - [ ] API documentation với Swagger
  - [ ] README cho setup project
  - [ ] Architecture decision records
  - [ ] Deployment guide

- [ ] **Testing Strategy**
  - [ ] Unit testing setup
  - [ ] Integration testing
  - [ ] E2E testing
  - [ ] Test coverage requirements

- [ ] **Security**
  - [ ] Environment variables management
  - [ ] Authentication & authorization
  - [ ] Input validation
  - [ ] Security headers

- [ ] **Monitoring & Logging**
  - [ ] Application logging
  - [ ] Error tracking
  - [ ] Performance monitoring
  - [ ] Health checks

- [ ] **Deployment**
  - [ ] CI/CD pipeline
  - [ ] Environment configuration
  - [ ] Database migration strategy
  - [ ] Rollback procedures

## Best Practices cho Team

1. **Consistency**: Sử dụng shared configurations và standards
2. **Documentation**: Ghi chép mọi quyết định quan trọng
3. **Testing**: Maintain test coverage trên 80%
4. **Security**: Security-first approach
5. **Performance**: Monitor và optimize từ đầu
6. **Scalability**: Design cho future growth
7. **Maintainability**: Clean code và proper abstractions

## Kết luận

Việc khởi tạo project scalable cho team đòi hỏi sự chuẩn bị kỹ lưỡng và tuân thủ các best practices. Bằng cách follow checklist này, team sẽ có một foundation vững chắc để phát triển ứng dụng một cách hiệu quả và bền vững.
