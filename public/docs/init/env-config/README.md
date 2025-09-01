# Environment Configuration Setup

## Tổng quan

Environment configuration là một phần quan trọng để quản lý các cấu hình khác nhau cho từng môi trường (development, staging, production). Việc này giúp đảm bảo tính bảo mật và linh hoạt của ứng dụng.

## 1. Cài đặt Dependencies

```bash
npm install --save dotenv zod
npm install --save-dev @types/node
```

## 2. Tạo Environment Files

### 2.1 Base Environment Template

```bash
# .env.example (Template file for team)
NODE_ENV=development
PORT=3000

# Database Configuration
DATABASE_URL="postgresql://username:password@localhost:5432/dbname"

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key
JWT_EXPIRES_IN=1d
REFRESH_TOKEN_SECRET=your-refresh-token-secret
REFRESH_TOKEN_EXPIRES_IN=7d

# Email Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password

# File Upload Configuration
MAX_FILE_SIZE=10485760
UPLOAD_FOLDER=uploads

# Redis Configuration
REDIS_URL=redis://localhost:6379

# Logging
LOG_LEVEL=info

# Security
BCRYPT_ROUNDS=10
RATE_LIMIT_WINDOW=900000
RATE_LIMIT_MAX=100

# External APIs
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3000/auth/google/callback

# AWS S3 Configuration
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
S3_BUCKET_NAME=your-bucket-name

# Payment Gateway
STRIPE_SECRET_KEY=sk_test_your-stripe-secret
STRIPE_WEBHOOK_SECRET=whsec_your-webhook-secret

# Monitoring
SENTRY_DSN=your-sentry-dsn
```

### 2.2 Environment Specific Files

```bash
# .env.development
NODE_ENV=development
PORT=3000
DATABASE_URL="postgresql://dev_user:dev_pass@localhost:5432/myapp_dev"
JWT_SECRET=dev-jwt-secret-key
LOG_LEVEL=debug
RATE_LIMIT_MAX=1000

# .env.staging
NODE_ENV=staging
PORT=3000
DATABASE_URL="postgresql://staging_user:staging_pass@staging-db:5432/myapp_staging"
JWT_SECRET=staging-jwt-secret-key
LOG_LEVEL=info
RATE_LIMIT_MAX=500

# .env.production
NODE_ENV=production
PORT=3000
DATABASE_URL="postgresql://prod_user:prod_pass@prod-db:5432/myapp_prod"
JWT_SECRET=super-secure-production-jwt-secret
LOG_LEVEL=warn
RATE_LIMIT_MAX=100
```

## 3. Validation Schema với Zod

### 3.1 Environment Schema Definition

```typescript
// src/shared/config/env.schema.ts
import { z } from 'zod'

export const envSchema = z.object({
  // Application
  NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  PORT: z.string().transform(Number).pipe(z.number().min(1).max(65535)),

  // Database
  DATABASE_URL: z.string().url(),

  // JWT
  JWT_SECRET: z.string().min(32, 'JWT Secret must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('1d'),
  REFRESH_TOKEN_SECRET: z.string().min(32),
  REFRESH_TOKEN_EXPIRES_IN: z.string().default('7d'),

  // Email
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().transform(Number).pipe(z.number()).optional(),
  SMTP_USER: z.string().email().optional(),
  SMTP_PASS: z.string().optional(),

  // File Upload
  MAX_FILE_SIZE: z.string().transform(Number).pipe(z.number().positive()).default('10485760'),
  UPLOAD_FOLDER: z.string().default('uploads'),

  // Redis
  REDIS_URL: z.string().url().optional(),

  // Logging
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),

  // Security
  BCRYPT_ROUNDS: z.string().transform(Number).pipe(z.number().min(10).max(15)).default('12'),
  RATE_LIMIT_WINDOW: z.string().transform(Number).pipe(z.number().positive()).default('900000'),
  RATE_LIMIT_MAX: z.string().transform(Number).pipe(z.number().positive()).default('100'),

  // External APIs
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.string().url().optional(),

  // AWS S3
  AWS_REGION: z.string().optional(),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  S3_BUCKET_NAME: z.string().optional(),

  // Payment
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),

  // Monitoring
  SENTRY_DSN: z.string().url().optional(),
})

export type EnvConfig = z.infer<typeof envSchema>
```

### 3.2 Environment Configuration Service

```typescript
// src/shared/config/env.config.ts
import { config } from 'dotenv'
import { resolve } from 'path'
import { existsSync } from 'fs'
import { envSchema, EnvConfig } from './env.schema'

class EnvironmentConfigService {
  private config: EnvConfig

  constructor() {
    this.loadEnvironmentFile()
    this.validateConfiguration()
  }

  private loadEnvironmentFile(): void {
    const env = process.env.NODE_ENV || 'development'
    const envFile = `.env.${env}`
    const envPath = resolve(envFile)

    // Load environment specific file first
    if (existsSync(envPath)) {
      config({ path: envPath })
      console.log(`✅ Loaded environment from ${envFile}`)
    } else {
      console.warn(`⚠️  Environment file ${envFile} not found, falling back to .env`)

      // Fallback to .env file
      if (existsSync('.env')) {
        config({ path: '.env' })
        console.log('✅ Loaded environment from .env')
      } else {
        console.error('❌ No environment file found')
        process.exit(1)
      }
    }
  }

  private validateConfiguration(): void {
    const result = envSchema.safeParse(process.env)

    if (!result.success) {
      console.error('❌ Invalid environment configuration:')
      console.error(result.error.format())
      process.exit(1)
    }

    this.config = result.data
    console.log('✅ Environment configuration validated successfully')
  }

  get(): EnvConfig {
    return this.config
  }

  // Convenience getters
  get isDevelopment(): boolean {
    return this.config.NODE_ENV === 'development'
  }

  get isProduction(): boolean {
    return this.config.NODE_ENV === 'production'
  }

  get isStaging(): boolean {
    return this.config.NODE_ENV === 'staging'
  }

  // Database configuration
  get database() {
    return {
      url: this.config.DATABASE_URL,
    }
  }

  // JWT configuration
  get jwt() {
    return {
      secret: this.config.JWT_SECRET,
      expiresIn: this.config.JWT_EXPIRES_IN,
      refreshSecret: this.config.REFRESH_TOKEN_SECRET,
      refreshExpiresIn: this.config.REFRESH_TOKEN_EXPIRES_IN,
    }
  }

  // Email configuration
  get email() {
    return {
      host: this.config.SMTP_HOST,
      port: this.config.SMTP_PORT,
      user: this.config.SMTP_USER,
      pass: this.config.SMTP_PASS,
    }
  }

  // File upload configuration
  get upload() {
    return {
      maxSize: this.config.MAX_FILE_SIZE,
      folder: this.config.UPLOAD_FOLDER,
    }
  }

  // Security configuration
  get security() {
    return {
      bcryptRounds: this.config.BCRYPT_ROUNDS,
      rateLimit: {
        window: this.config.RATE_LIMIT_WINDOW,
        max: this.config.RATE_LIMIT_MAX,
      },
    }
  }

  // External APIs
  get google() {
    return {
      clientId: this.config.GOOGLE_CLIENT_ID,
      clientSecret: this.config.GOOGLE_CLIENT_SECRET,
      redirectUri: this.config.GOOGLE_REDIRECT_URI,
    }
  }

  // AWS S3 configuration
  get aws() {
    return {
      region: this.config.AWS_REGION,
      accessKeyId: this.config.AWS_ACCESS_KEY_ID,
      secretAccessKey: this.config.AWS_SECRET_ACCESS_KEY,
      s3BucketName: this.config.S3_BUCKET_NAME,
    }
  }
}

export const envConfig = new EnvironmentConfigService().get()
export const envService = new EnvironmentConfigService()
```

## 4. NestJS Configuration Module

### 4.1 Configuration Module Setup

```typescript
// src/shared/config/configuration.module.ts
import { Global, Module } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { envConfig, envService } from './env.config'

@Global()
@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [() => envConfig],
      cache: true,
    }),
  ],
  providers: [
    {
      provide: 'ENV_CONFIG',
      useValue: envConfig,
    },
    {
      provide: 'ENV_SERVICE',
      useValue: envService,
    },
  ],
  exports: ['ENV_CONFIG', 'ENV_SERVICE', ConfigService],
})
export class ConfigurationModule {}
```

### 4.2 Using Configuration in Services

```typescript
// Example: Using configuration in a service
import { Injectable, Inject } from '@nestjs/common'
import { EnvConfig } from '../config/env.schema'

@Injectable()
export class EmailService {
  constructor(@Inject('ENV_CONFIG') private readonly config: EnvConfig) {}

  async sendEmail(to: string, subject: string, body: string) {
    const emailConfig = {
      host: this.config.SMTP_HOST,
      port: this.config.SMTP_PORT,
      user: this.config.SMTP_USER,
      pass: this.config.SMTP_PASS,
    }

    // Email sending logic here
  }
}
```

## 5. Environment-specific Database Configuration

### 5.1 Prisma Schema với Environment Variables

```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// Development only features
generator erd {
  provider = "prisma-erd-generator"
  output   = "../docs/erd.svg"
}
```

### 5.2 Database Connection Service

```typescript
// src/shared/services/database.service.ts
import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'
import { envService } from '../config/env.config'

@Injectable()
export class DatabaseService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DatabaseService.name)

  constructor() {
    super({
      log: envService.isDevelopment ? ['query', 'info', 'warn', 'error'] : ['warn', 'error'],
      errorFormat: 'pretty',
    })
  }

  async onModuleInit() {
    try {
      await this.$connect()
      this.logger.log('✅ Database connected successfully')
    } catch (error) {
      this.logger.error('❌ Database connection failed', error)
      throw error
    }
  }

  async onModuleDestroy() {
    await this.$disconnect()
    this.logger.log('🔌 Database disconnected')
  }

  // Health check method
  async isHealthy(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`
      return true
    } catch {
      return false
    }
  }
}
```

## 6. Runtime Configuration Validation

### 6.1 Configuration Validation Service

```typescript
// src/shared/config/config-validation.service.ts
import { Injectable, OnModuleInit, Logger } from '@nestjs/common'
import { envService } from './env.config'

@Injectable()
export class ConfigValidationService implements OnModuleInit {
  private readonly logger = new Logger(ConfigValidationService.name)

  onModuleInit() {
    this.validateRequiredConfigurations()
    this.validateEnvironmentSpecificSettings()
    this.logConfigurationSummary()
  }

  private validateRequiredConfigurations() {
    const config = envService.get()

    // Validate JWT configuration
    if (config.JWT_SECRET.length < 32) {
      throw new Error('JWT_SECRET must be at least 32 characters long')
    }

    // Validate database URL format
    if (!config.DATABASE_URL.startsWith('postgresql://')) {
      throw new Error('DATABASE_URL must be a valid PostgreSQL connection string')
    }

    this.logger.log('✅ Required configurations validated')
  }

  private validateEnvironmentSpecificSettings() {
    if (envService.isProduction) {
      this.validateProductionSettings()
    } else if (envService.isDevelopment) {
      this.validateDevelopmentSettings()
    }
  }

  private validateProductionSettings() {
    const config = envService.get()

    // Ensure production has secure settings
    if (config.LOG_LEVEL === 'debug') {
      this.logger.warn('⚠️  DEBUG logging enabled in production')
    }

    if (config.BCRYPT_ROUNDS < 12) {
      this.logger.warn('⚠️  Consider using higher bcrypt rounds in production')
    }

    this.logger.log('✅ Production configuration validated')
  }

  private validateDevelopmentSettings() {
    // Development specific validations
    this.logger.log('✅ Development configuration validated')
  }

  private logConfigurationSummary() {
    const config = envService.get()

    this.logger.log('📋 Configuration Summary:')
    this.logger.log(`   Environment: ${config.NODE_ENV}`)
    this.logger.log(`   Port: ${config.PORT}`)
    this.logger.log(`   Log Level: ${config.LOG_LEVEL}`)
    this.logger.log(`   Database: ${config.DATABASE_URL.split('@')[1] || 'Hidden'}`)
    this.logger.log(`   Redis: ${config.REDIS_URL ? 'Configured' : 'Not configured'}`)
  }
}
```

## 7. Environment Switching Scripts

### 7.1 Package.json Scripts

```json
{
  "scripts": {
    "start": "nest start",
    "start:dev": "NODE_ENV=development nest start --watch",
    "start:staging": "NODE_ENV=staging nest start",
    "start:prod": "NODE_ENV=production node dist/main",
    "build": "nest build",
    "build:staging": "NODE_ENV=staging nest build",
    "build:prod": "NODE_ENV=production nest build",
    "db:migrate:dev": "NODE_ENV=development npx prisma migrate dev",
    "db:migrate:staging": "NODE_ENV=staging npx prisma migrate deploy",
    "db:migrate:prod": "NODE_ENV=production npx prisma migrate deploy",
    "db:seed:dev": "NODE_ENV=development npx prisma db seed",
    "db:studio:dev": "NODE_ENV=development npx prisma studio",
    "test": "NODE_ENV=test jest",
    "test:e2e": "NODE_ENV=test jest --config ./test/jest-e2e.json"
  }
}
```

### 7.2 Environment Switching Helper

```typescript
// scripts/env-switch.ts
import { writeFileSync, existsSync, copyFileSync } from 'fs'

const environments = ['development', 'staging', 'production']

function switchEnvironment(env: string) {
  if (!environments.includes(env)) {
    console.error(`❌ Invalid environment. Available: ${environments.join(', ')}`)
    process.exit(1)
  }

  const sourceFile = `.env.${env}`
  const targetFile = '.env'

  if (!existsSync(sourceFile)) {
    console.error(`❌ Environment file ${sourceFile} not found`)
    process.exit(1)
  }

  copyFileSync(sourceFile, targetFile)
  console.log(`✅ Switched to ${env} environment`)
}

const env = process.argv[2]
if (env) {
  switchEnvironment(env)
} else {
  console.log('Usage: npm run env:switch <environment>')
  console.log(`Available environments: ${environments.join(', ')}`)
}
```

## 8. Best Practices

### 8.1 Security Best Practices

1. **Never commit .env files** với sensitive data
2. **Use different secrets** cho mỗi environment
3. **Rotate secrets regularly** đặc biệt là production
4. **Minimize environment variables** exposure in logs
5. **Use encrypted storage** cho production secrets

### 8.2 Team Collaboration

1. **Share .env.example** với team
2. **Document all environment variables** và purpose
3. **Use consistent naming conventions**
4. **Validate configurations** on application startup
5. **Provide default values** khi có thể

### 8.3 Deployment Considerations

1. **Environment-specific builds** nếu cần
2. **Health checks** với configuration validation
3. **Graceful fallbacks** cho optional configurations
4. **Configuration reload** without restart (nếu cần)

## 9. Troubleshooting

### 9.1 Common Issues

**Issue**: Environment variables not loading

```bash
# Check if file exists
ls -la .env*

# Check file content
cat .env.development

# Verify environment
echo $NODE_ENV
```

**Issue**: Validation errors

```typescript
// Add more detailed error logging
const result = envSchema.safeParse(process.env)
if (!result.success) {
  console.error('Validation errors:', result.error.issues)
}
```

**Issue**: Wrong environment loaded

```typescript
// Debug environment loading
console.log('Current NODE_ENV:', process.env.NODE_ENV)
console.log('Loaded from file:', process.env.DATABASE_URL)
```

### 9.2 Debugging Tools

```typescript
// src/shared/config/debug.ts
export function debugConfiguration() {
  console.log('🔍 Configuration Debug Info:')
  console.log('NODE_ENV:', process.env.NODE_ENV)
  console.log('PWD:', process.cwd())
  console.log('Available .env files:' /* list env files */)
  console.log(
    'Loaded variables:',
    Object.keys(process.env).filter((key) => !key.startsWith('npm_')),
  )
}
```

## Kết luận

Environment configuration là foundation của mọi ứng dụng production-ready. Việc setup đúng cách sẽ giúp team có thể:

- **Deploy an toàn** giữa các environments
- **Manage secrets** một cách bảo mật
- **Debug issues** nhanh chóng
- **Scale application** dễ dàng
- **Collaborate effectively** trong team

Hãy đảm bảo follow tất cả best practices được nêu trong tài liệu này để có một foundation vững chắc cho project.
