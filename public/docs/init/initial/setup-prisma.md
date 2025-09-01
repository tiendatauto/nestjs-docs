# Prisma Setup for Team NestJS Project

## Tổng quan

Prisma là modern database toolkit cho Node.js và TypeScript. Nó cung cấp type-safe database client, intuitive data model, và powerful migration system phù hợp cho team development.

## 1. Lý do chọn Prisma

### 1.1 Benefits

- **Type Safety**: Auto-generated TypeScript types
- **Developer Experience**: IntelliSense và auto-completion
- **Database Migration**: Version-controlled schema changes
- **Multi-Database**: Support PostgreSQL, MySQL, SQLite, MongoDB
- **Performance**: Optimized queries và connection pooling
- **Team Collaboration**: Schema-first development

## 2. Installation & Setup

### 2.1 Cài đặt Prisma

```bash
# Install Prisma CLI và Client
npm install prisma @prisma/client

# Install database driver (PostgreSQL example)
npm install pg
npm install --save-dev @types/pg

# Initialize Prisma
npx prisma init
```

### 2.2 Initial Project Structure

```
project/
├── prisma/
│   ├── schema.prisma        # Database schema
│   ├── migrations/          # Migration files
│   │   └── migration_lock.toml
│   └── seed.ts             # Database seeding
├── src/
│   └── shared/
│       └── services/
│           └── prisma.service.ts
```

## 3. Schema Configuration

### 3.1 Basic Schema Setup

```prisma
// prisma/schema.prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// User model
model User {
  id        String   @id @default(cuid())
  email     String   @unique
  name      String?
  password  String
  role      Role     @default(USER)
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  // Relations
  posts     Post[]
  profile   Profile?

  @@map("users")
}

// Profile model
model Profile {
  id       String  @id @default(cuid())
  bio      String?
  avatar   String?
  userId   String  @unique
  user     User    @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("profiles")
}

// Post model
model Post {
  id          String      @id @default(cuid())
  title       String
  content     String?
  published   Boolean     @default(false)
  authorId    String
  author      User        @relation(fields: [authorId], references: [id], onDelete: Cascade)
  categories  Category[]
  createdAt   DateTime    @default(now())
  updatedAt   DateTime    @updatedAt

  @@map("posts")
}

// Category model
model Category {
  id    String @id @default(cuid())
  name  String @unique
  posts Post[]

  @@map("categories")
}

// Enums
enum Role {
  USER
  ADMIN
  MODERATOR
}
```

### 3.2 Advanced Schema Features

```prisma
// Advanced schema example
model User {
  id        String   @id @default(cuid())
  email     String   @unique
  name      String?
  password  String
  role      Role     @default(USER)
  isActive  Boolean  @default(true)
  metadata  Json?    // JSON field
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  // Compound unique constraint
  @@unique([email, isActive])

  // Index for performance
  @@index([email, role])

  @@map("users")
}

// Audit log model
model AuditLog {
  id        String    @id @default(cuid())
  action    String
  table     String
  recordId  String
  oldData   Json?
  newData   Json?
  userId    String?
  createdAt DateTime  @default(now())

  @@index([table, recordId])
  @@index([userId, createdAt])
  @@map("audit_logs")
}

// Settings model with JSON
model Setting {
  id    String @id @default(cuid())
  key   String @unique
  value Json
  type  SettingType

  @@map("settings")
}

enum SettingType {
  STRING
  NUMBER
  BOOLEAN
  JSON
}
```

## 4. Prisma Service Integration

### 4.1 Basic Prisma Service

```typescript
// src/shared/services/prisma.service.ts
import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name)

  constructor() {
    super({
      log: [
        {
          emit: 'event',
          level: 'query',
        },
        {
          emit: 'event',
          level: 'error',
        },
        {
          emit: 'event',
          level: 'info',
        },
        {
          emit: 'event',
          level: 'warn',
        },
      ],
      errorFormat: 'pretty',
    })

    // Query logging for development
    if (process.env.NODE_ENV === 'development') {
      this.$on('query', (e) => {
        this.logger.debug(`Query: ${e.query}`)
        this.logger.debug(`Params: ${e.params}`)
        this.logger.debug(`Duration: ${e.duration}ms`)
      })
    }

    this.$on('error', (e) => {
      this.logger.error('Prisma error:', e)
    })
  }

  async onModuleInit() {
    try {
      await this.$connect()
      this.logger.log('✅ Database connected successfully')

      // Test connection
      await this.$queryRaw`SELECT 1`
      this.logger.log('✅ Database connection test passed')
    } catch (error) {
      this.logger.error('❌ Database connection failed:', error)
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

  // Soft delete implementation
  async softDelete(model: string, where: any) {
    return this[model].update({
      where,
      data: {
        deletedAt: new Date(),
        isActive: false,
      },
    })
  }

  // Pagination helper
  async paginate<T>(
    model: string,
    {
      page = 1,
      limit = 10,
      where = {},
      orderBy = {},
      include = {},
    }: {
      page?: number
      limit?: number
      where?: any
      orderBy?: any
      include?: any
    },
  ) {
    const skip = (page - 1) * limit

    const [data, total] = await Promise.all([
      this[model].findMany({
        skip,
        take: limit,
        where,
        orderBy,
        include,
      }),
      this[model].count({ where }),
    ])

    return {
      data,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
        hasNext: page * limit < total,
        hasPrev: page > 1,
      },
    }
  }
}
```

### 4.2 Module Integration

```typescript
// src/shared/shared.module.ts
import { Global, Module } from '@nestjs/common'
import { PrismaService } from './services/prisma.service'

@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class SharedModule {}
```

## 5. Database Migrations

### 5.1 Migration Workflow

```bash
# Create and apply migration
npx prisma migrate dev --name init

# Generate Prisma client after schema changes
npx prisma generate

# Apply migrations to production
npx prisma migrate deploy

# Reset database (development only)
npx prisma migrate reset

# Check migration status
npx prisma migrate status
```

### 5.2 Migration Best Practices

```bash
# Naming conventions for migrations
npx prisma migrate dev --name add_user_profile_relation
npx prisma migrate dev --name update_post_schema
npx prisma migrate dev --name create_audit_log_table

# Create migration without applying (for review)
npx prisma migrate dev --create-only --name add_indexes

# Apply specific migration
npx prisma migrate resolve --applied <migration_name>
```

### 5.3 Migration Scripts

```json
// package.json scripts
{
  "scripts": {
    "db:migrate": "npx prisma migrate dev",
    "db:migrate:deploy": "npx prisma migrate deploy",
    "db:migrate:reset": "npx prisma migrate reset --force",
    "db:generate": "npx prisma generate",
    "db:studio": "npx prisma studio",
    "db:seed": "npx prisma db seed",
    "db:push": "npx prisma db push"
  }
}
```

## 6. Database Seeding

### 6.1 Seed Script Setup

```typescript
// prisma/seed.ts
import { PrismaClient } from '@prisma/client'
import * as bcrypt from 'bcrypt'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Starting database seeding...')

  // Create admin user
  const adminPassword = await bcrypt.hash('admin123', 10)
  const admin = await prisma.user.upsert({
    where: { email: 'admin@example.com' },
    update: {},
    create: {
      email: 'admin@example.com',
      name: 'Admin User',
      password: adminPassword,
      role: 'ADMIN',
      profile: {
        create: {
          bio: 'System Administrator',
        },
      },
    },
  })

  console.log('✅ Admin user created:', admin)

  // Create sample categories
  const categories = await Promise.all([
    prisma.category.upsert({
      where: { name: 'Technology' },
      update: {},
      create: { name: 'Technology' },
    }),
    prisma.category.upsert({
      where: { name: 'Programming' },
      update: {},
      create: { name: 'Programming' },
    }),
    prisma.category.upsert({
      where: { name: 'Web Development' },
      update: {},
      create: { name: 'Web Development' },
    }),
  ])

  console.log('✅ Categories created:', categories.length)

  // Create sample posts
  const posts = await Promise.all([
    prisma.post.create({
      data: {
        title: 'Getting Started with NestJS',
        content: 'Learn how to build scalable Node.js applications with NestJS...',
        published: true,
        authorId: admin.id,
        categories: {
          connect: [{ id: categories[0].id }, { id: categories[1].id }],
        },
      },
    }),
    prisma.post.create({
      data: {
        title: 'Prisma with PostgreSQL',
        content: 'A comprehensive guide to using Prisma with PostgreSQL...',
        published: true,
        authorId: admin.id,
        categories: {
          connect: [{ id: categories[1].id }, { id: categories[2].id }],
        },
      },
    }),
  ])

  console.log('✅ Posts created:', posts.length)

  // Create settings
  const settings = await Promise.all([
    prisma.setting.upsert({
      where: { key: 'app_name' },
      update: {},
      create: {
        key: 'app_name',
        value: 'My NestJS App',
        type: 'STRING',
      },
    }),
    prisma.setting.upsert({
      where: { key: 'max_upload_size' },
      update: {},
      create: {
        key: 'max_upload_size',
        value: 10485760, // 10MB
        type: 'NUMBER',
      },
    }),
  ])

  console.log('✅ Settings created:', settings.length)
  console.log('🎉 Database seeding completed!')
}

main()
  .catch((e) => {
    console.error('❌ Seeding failed:', e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
```

### 6.2 Seed Configuration

```json
// package.json
{
  "prisma": {
    "seed": "ts-node --compiler-options {\"module\":\"CommonJS\"} prisma/seed.ts"
  }
}
```

## 7. Repository Pattern Implementation

### 7.1 Base Repository

```typescript
// src/shared/repositories/base.repository.ts
import { Injectable } from '@nestjs/common'
import { PrismaService } from '../services/prisma.service'

@Injectable()
export abstract class BaseRepository<T, CreateDto, UpdateDto> {
  constructor(
    protected readonly prisma: PrismaService,
    protected readonly modelName: string,
  ) {}

  async create(data: CreateDto): Promise<T> {
    return this.prisma[this.modelName].create({ data })
  }

  async findAll(args?: any): Promise<T[]> {
    return this.prisma[this.modelName].findMany(args)
  }

  async findById(id: string): Promise<T | null> {
    return this.prisma[this.modelName].findUnique({ where: { id } })
  }

  async update(id: string, data: UpdateDto): Promise<T> {
    return this.prisma[this.modelName].update({
      where: { id },
      data,
    })
  }

  async delete(id: string): Promise<T> {
    return this.prisma[this.modelName].delete({ where: { id } })
  }

  async count(where?: any): Promise<number> {
    return this.prisma[this.modelName].count({ where })
  }

  async exists(where: any): Promise<boolean> {
    const count = await this.prisma[this.modelName].count({ where })
    return count > 0
  }
}
```

### 7.2 User Repository Example

```typescript
// src/modules/users/repositories/users.repository.ts
import { Injectable } from '@nestjs/common'
import { User, Prisma } from '@prisma/client'
import { BaseRepository } from 'src/shared/repositories/base.repository'
import { PrismaService } from 'src/shared/services/prisma.service'
import { CreateUserDto } from '../dto/create-user.dto'
import { UpdateUserDto } from '../dto/update-user.dto'

@Injectable()
export class UsersRepository extends BaseRepository<User, CreateUserDto, UpdateUserDto> {
  constructor(prisma: PrismaService) {
    super(prisma, 'user')
  }

  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { email },
      include: {
        profile: true,
      },
    })
  }

  async findActiveUsers(): Promise<User[]> {
    return this.prisma.user.findMany({
      where: { isActive: true },
      include: {
        profile: true,
        posts: {
          where: { published: true },
          take: 5,
          orderBy: { createdAt: 'desc' },
        },
      },
    })
  }

  async updateLastLogin(id: string): Promise<void> {
    await this.prisma.user.update({
      where: { id },
      data: { lastLoginAt: new Date() },
    })
  }

  async getUserStats(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            posts: true,
          },
        },
        posts: {
          where: { published: true },
          select: {
            createdAt: true,
          },
        },
      },
    })

    return {
      ...user,
      stats: {
        totalPosts: user?._count.posts || 0,
        lastPostDate: user?.posts[0]?.createdAt || null,
      },
    }
  }
}
```

## 8. Testing with Prisma

### 8.1 Test Database Setup

```typescript
// test/prisma-test.service.ts
import { PrismaClient } from '@prisma/client'

export class PrismaTestService extends PrismaClient {
  constructor() {
    super({
      datasources: {
        db: {
          url: process.env.DATABASE_TEST_URL,
        },
      },
    })
  }

  async cleanDatabase() {
    const models = Reflect.ownKeys(this).filter((key) => key[0] !== '_')

    return Promise.all(models.map((modelKey) => this[modelKey].deleteMany()))
  }

  async disconnect() {
    await this.$disconnect()
  }
}
```

### 8.2 Test Setup

```typescript
// test/setup.ts
import { PrismaTestService } from './prisma-test.service'

let prisma: PrismaTestService

beforeAll(async () => {
  prisma = new PrismaTestService()
  await prisma.$connect()
})

beforeEach(async () => {
  await prisma.cleanDatabase()
})

afterAll(async () => {
  await prisma.disconnect()
})

export { prisma }
```

## 9. Performance Optimization

### 9.1 Connection Pooling

```typescript
// Enhanced Prisma Service with connection pooling
@Injectable()
export class PrismaService extends PrismaClient {
  constructor() {
    super({
      datasources: {
        db: {
          url: process.env.DATABASE_URL,
        },
      },
      log: ['warn', 'error'],
      errorFormat: 'pretty',
    })

    // Connection pool configuration
    this.$use(async (params, next) => {
      const before = Date.now()
      const result = await next(params)
      const after = Date.now()

      console.log(`Query ${params.model}.${params.action} took ${after - before}ms`)
      return result
    })
  }
}
```

### 9.2 Query Optimization

```typescript
// Optimized queries example
export class PostsRepository {
  async findPostsWithAuthors() {
    return this.prisma.post.findMany({
      select: {
        id: true,
        title: true,
        content: true,
        author: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        categories: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      where: {
        published: true,
      },
      orderBy: {
        createdAt: 'desc',
      },
    })
  }

  // Using raw queries for complex operations
  async getPostAnalytics() {
    return this.prisma.$queryRaw`
      SELECT 
        EXTRACT(MONTH FROM created_at) as month,
        COUNT(*) as post_count,
        COUNT(DISTINCT author_id) as unique_authors
      FROM posts 
      WHERE published = true 
        AND created_at >= NOW() - INTERVAL '12 months'
      GROUP BY EXTRACT(MONTH FROM created_at)
      ORDER BY month;
    `
  }
}
```

## 10. Deployment & Production

### 10.1 Production Configuration

```bash
# Environment variables for production
DATABASE_URL="postgresql://user:password@host:5432/database?connection_limit=20&pool_timeout=20"
SHADOW_DATABASE_URL="postgresql://user:password@host:5432/shadow_database"
```

### 10.2 Migration in Production

```bash
# Production deployment script
#!/bin/bash

echo "🚀 Starting deployment..."

# Run migrations
echo "📦 Running database migrations..."
npx prisma migrate deploy

# Generate client
echo "🔧 Generating Prisma client..."
npx prisma generate

# Start application
echo "✅ Starting application..."
npm run start:prod
```

## 11. Best Practices

### 11.1 Schema Design

- Use meaningful table và field names
- Add proper indexes cho performance
- Use enums cho limited value sets
- Implement soft deletes khi cần
- Add audit fields (createdAt, updatedAt)

### 11.2 Migration Management

- Review migrations trước khi apply
- Backup database trước major migrations
- Test migrations on staging trước
- Use descriptive migration names
- Never edit applied migrations

### 11.3 Query Optimization

- Use select để limit returned fields
- Implement pagination cho large datasets
- Use transactions cho related operations
- Monitor query performance
- Use raw queries cho complex operations

## Kết luận

Prisma setup cho team NestJS project cung cấp:

- **Type Safety**: End-to-end type safety
- **Developer Experience**: Excellent tooling và IntelliSense
- **Team Collaboration**: Schema-first development
- **Performance**: Optimized queries và connection pooling
- **Maintainability**: Clear migration history

Follow best practices này sẽ đảm bảo scalable và maintainable database layer cho project!
