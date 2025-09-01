# 🗄️ Prisma ORM trong NestJS

## 🔍 Prisma là gì?

Prisma là next-generation ORM (Object-Relational Mapping) hiện đại cho Node.js và TypeScript, được thiết kế để đơn giản hóa database access và management:

- **Vai trò chính**: Type-safe database client với auto-completion và compile-time error checking
- **Cách hoạt động**: Schema-first approach với code generation và migration management
- **Execution order**: Schema Definition → Prisma Generate → Database Migration → Type-safe Client Usage
- **Lifecycle**: Schema design → Migration creation → Database sync → Client generation → Application usage

> 💡 **Tại sao cần Prisma?**
> Prisma cung cấp type safety 100%, giảm runtime errors về database, và có thể cải thiện developer productivity lên đến 40% so với traditional ORMs.

## 🎯 Cách implement Prisma

### Basic Implementation

#### 1. Initial Setup và Configuration

```bash
# Install Prisma
npm install prisma @prisma/client
npm install -D prisma

# Initialize Prisma
npx prisma init
```

```prisma
// prisma/schema.prisma - Basic configuration
generator client {
  provider = "prisma-client-js"
  output   = "../node_modules/.prisma/client"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// Basic User model
model User {
  id        String   @id @default(cuid())
  email     String   @unique
  name      String?
  password  String
  role      Role     @default(USER)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  // Relations
  posts     Post[]
  profile   Profile?

  @@map("users")
}

// Enum example
enum Role {
  USER
  ADMIN
  MODERATOR
}
```

#### 2. Prisma Service Setup

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
        { level: 'query', emit: 'event' },
        { level: 'error', emit: 'stdout' },
        { level: 'info', emit: 'stdout' },
        { level: 'warn', emit: 'stdout' },
      ],
      errorFormat: 'colored',
    })

    // Log all queries in development
    if (process.env.NODE_ENV === 'development') {
      this.$on('query', (e) => {
        this.logger.debug(`Query: ${e.query}`)
        this.logger.debug(`Duration: ${e.duration}ms`)
      })
    }
  }

  async onModuleInit() {
    this.logger.log('Connecting to database...')
    await this.$connect()
    this.logger.log('Database connected successfully')
  }

  async onModuleDestroy() {
    this.logger.log('Disconnecting from database...')
    await this.$disconnect()
  }

  // Custom method for health check
  async healthCheck(): Promise<boolean> {
    try {
      await this.$queryRaw`SELECT 1`
      return true
    } catch (error) {
      this.logger.error('Database health check failed', error)
      return false
    }
  }

  // Enable query debugging
  enableQueryLogging() {
    this.$on('query', (e) => {
      console.log('Query: ' + e.query)
      console.log('Params: ' + e.params)
      console.log('Duration: ' + e.duration + 'ms')
    })
  }
}
```

#### 3. Basic Repository Pattern

```typescript
// src/shared/repositories/base.repository.ts
import { Injectable } from '@nestjs/common'
import { PrismaService } from '../services/prisma.service'

@Injectable()
export abstract class BaseRepository<T> {
  constructor(protected prisma: PrismaService) {}

  // Abstract methods to be implemented by child repositories
  protected abstract getModelName(): string
  protected abstract getModel(): any

  // Generic CRUD operations
  async findById(id: string): Promise<T | null> {
    return this.getModel().findUnique({
      where: { id },
    })
  }

  async findMany(params: { skip?: number; take?: number; where?: any; orderBy?: any; include?: any }): Promise<T[]> {
    const { skip, take, where, orderBy, include } = params
    return this.getModel().findMany({
      skip,
      take,
      where,
      orderBy,
      include,
    })
  }

  async create(data: any): Promise<T> {
    return this.getModel().create({
      data,
    })
  }

  async update(id: string, data: any): Promise<T> {
    return this.getModel().update({
      where: { id },
      data,
    })
  }

  async delete(id: string): Promise<T> {
    return this.getModel().delete({
      where: { id },
    })
  }

  async count(where?: any): Promise<number> {
    return this.getModel().count({ where })
  }

  async exists(where: any): Promise<boolean> {
    const count = await this.getModel().count({ where })
    return count > 0
  }
}
```

### Advanced Implementation

#### 1. Advanced Schema với Relations và Constraints

```prisma
// prisma/schema.prisma - Advanced schema
generator client {
  provider        = "prisma-client-js"
  previewFeatures = ["fullTextSearch", "fullTextIndex"]
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// User với advanced features
model User {
  id        String   @id @default(cuid())
  email     String   @unique
  username  String   @unique
  name      String?
  avatar    String?
  password  String
  role      Role     @default(USER)
  status    UserStatus @default(ACTIVE)

  // Timestamps
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  lastLogin DateTime?

  // JSON fields
  preferences Json?
  metadata    Json?

  // Relations
  posts       Post[]
  comments    Comment[]
  profile     Profile?
  sessions    Session[]

  // Many-to-many relations
  followedBy  User[] @relation("UserFollows")
  following   User[] @relation("UserFollows")

  @@map("users")
  @@index([email])
  @@index([username])
  @@index([createdAt])
}

// Profile với one-to-one relation
model Profile {
  id          String    @id @default(cuid())
  bio         String?
  website     String?
  location    String?
  birthDate   DateTime?
  phoneNumber String?

  // One-to-one relation
  user        User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  userId      String    @unique

  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  @@map("profiles")
}

// Post với full-text search và advanced indexing
model Post {
  id          String      @id @default(cuid())
  title       String
  content     String
  excerpt     String?
  slug        String      @unique
  published   Boolean     @default(false)
  featured    Boolean     @default(false)
  viewCount   Int         @default(0)
  likeCount   Int         @default(0)

  // Timestamps
  createdAt   DateTime    @default(now())
  updatedAt   DateTime    @updatedAt
  publishedAt DateTime?

  // Relations
  author      User        @relation(fields: [authorId], references: [id], onDelete: Cascade)
  authorId    String
  comments    Comment[]
  categories  Category[]  @relation("PostCategories")
  tags        Tag[]       @relation("PostTags")

  @@map("posts")
  @@index([authorId])
  @@index([published, publishedAt])
  @@index([slug])
  @@fulltext([title, content])
}

// Comment với nested relations
model Comment {
  id        String    @id @default(cuid())
  content   String
  approved  Boolean   @default(false)

  // Self-referencing relation for replies
  parentId  String?
  parent    Comment?  @relation("CommentReplies", fields: [parentId], references: [id])
  replies   Comment[] @relation("CommentReplies")

  // Relations
  post      Post      @relation(fields: [postId], references: [id], onDelete: Cascade)
  postId    String
  author    User      @relation(fields: [authorId], references: [id], onDelete: Cascade)
  authorId  String

  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt

  @@map("comments")
  @@index([postId])
  @@index([authorId])
  @@index([parentId])
}

// Many-to-many junction tables
model Category {
  id          String @id @default(cuid())
  name        String @unique
  description String?
  slug        String @unique

  posts       Post[] @relation("PostCategories")

  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@map("categories")
}

model Tag {
  id    String @id @default(cuid())
  name  String @unique
  slug  String @unique
  color String @default("#gray")

  posts Post[] @relation("PostTags")

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@map("tags")
}

// Session management
model Session {
  id           String   @id @default(cuid())
  sessionToken String   @unique
  refreshToken String?  @unique
  expires      DateTime

  user         User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  userId       String

  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  @@map("sessions")
  @@index([sessionToken])
  @@index([userId])
}

// Enums
enum Role {
  USER
  ADMIN
  MODERATOR
  EDITOR
}

enum UserStatus {
  ACTIVE
  INACTIVE
  BANNED
  PENDING
}
```

#### 2. Advanced Repository với Type Safety

```typescript
// src/users/users.repository.ts
import { Injectable } from '@nestjs/common'
import { Prisma, User, UserStatus } from '@prisma/client'
import { BaseRepository } from '../shared/repositories/base.repository'

@Injectable()
export class UsersRepository extends BaseRepository<User> {
  protected getModelName(): string {
    return 'user'
  }

  protected getModel() {
    return this.prisma.user
  }

  // Advanced user queries với type safety
  async findByEmail(email: string): Promise<User | null> {
    return this.prisma.user.findUnique({
      where: { email },
      include: {
        profile: true,
        _count: {
          select: {
            posts: true,
            comments: true,
            following: true,
            followedBy: true,
          },
        },
      },
    })
  }

  // Complex query với multiple conditions
  async findUsersWithFilters(params: {
    search?: string
    role?: string
    status?: UserStatus
    hasProfile?: boolean
    createdAfter?: Date
    page?: number
    limit?: number
  }) {
    const { search, role, status, hasProfile, createdAfter, page = 1, limit = 10 } = params

    const where: Prisma.UserWhereInput = {}

    // Search trong multiple fields
    if (search) {
      where.OR = [
        { name: { contains: search, mode: 'insensitive' } },
        { email: { contains: search, mode: 'insensitive' } },
        { username: { contains: search, mode: 'insensitive' } },
      ]
    }

    // Filter by role
    if (role) {
      where.role = role as any
    }

    // Filter by status
    if (status) {
      where.status = status
    }

    // Filter by profile existence
    if (hasProfile !== undefined) {
      where.profile = hasProfile ? { isNot: null } : { is: null }
    }

    // Filter by creation date
    if (createdAfter) {
      where.createdAt = { gte: createdAfter }
    }

    const [users, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        include: {
          profile: true,
          _count: {
            select: {
              posts: { where: { published: true } },
              comments: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.user.count({ where }),
    ])

    return {
      users,
      pagination: {
        total,
        pages: Math.ceil(total / limit),
        page,
        limit,
      },
    }
  }

  // Batch operations
  async createManyUsers(userData: Prisma.UserCreateManyInput[]) {
    return this.prisma.user.createMany({
      data: userData,
      skipDuplicates: true,
    })
  }

  // Update user với nested relations
  async updateUserWithProfile(
    userId: string,
    userData: Prisma.UserUpdateInput,
    profileData?: Prisma.ProfileUpdateInput,
  ) {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        ...userData,
        ...(profileData && {
          profile: {
            upsert: {
              create: profileData as any,
              update: profileData,
            },
          },
        }),
      },
      include: {
        profile: true,
      },
    })
  }

  // Soft delete implementation
  async softDelete(userId: string) {
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        status: UserStatus.INACTIVE,
        email: `deleted_${Date.now()}_${userId}@deleted.com`,
      },
    })
  }

  // Analytics queries
  async getUserStats(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        _count: {
          select: {
            posts: { where: { published: true } },
            comments: true,
            following: true,
            followedBy: true,
          },
        },
        posts: {
          where: { published: true },
          select: {
            viewCount: true,
            likeCount: true,
            createdAt: true,
          },
        },
      },
    })

    if (!user) return null

    const totalViews = user.posts.reduce((sum, post) => sum + post.viewCount, 0)
    const totalLikes = user.posts.reduce((sum, post) => sum + post.likeCount, 0)

    return {
      ...user,
      stats: {
        totalPosts: user._count.posts,
        totalComments: user._count.comments,
        totalFollowers: user._count.followedBy,
        totalFollowing: user._count.following,
        totalViews,
        totalLikes,
      },
    }
  }
}
```

## 💡 Các cách sử dụng thông dụng

### 1. CRUD Operations với Type Safety

```typescript
// src/users/users.service.ts
import { Injectable, NotFoundException, ConflictException } from '@nestjs/common'
import { UsersRepository } from './users.repository'
import { CreateUserDto, UpdateUserDto } from './dto'
import { User } from '@prisma/client'

@Injectable()
export class UsersService {
  constructor(private usersRepository: UsersRepository) {}

  async createUser(createUserDto: CreateUserDto): Promise<User> {
    // Check if user already exists
    const existingUser = await this.usersRepository.findByEmail(createUserDto.email)
    if (existingUser) {
      throw new ConflictException('User with this email already exists')
    }

    // Hash password (assume bcrypt is configured)
    const hashedPassword = await bcrypt.hash(createUserDto.password, 10)

    return this.usersRepository.create({
      ...createUserDto,
      password: hashedPassword,
    })
  }

  async getUserById(id: string): Promise<User> {
    const user = await this.usersRepository.findById(id)
    if (!user) {
      throw new NotFoundException('User not found')
    }
    return user
  }

  async updateUser(id: string, updateUserDto: UpdateUserDto): Promise<User> {
    await this.getUserById(id) // Ensure user exists

    return this.usersRepository.update(id, updateUserDto)
  }

  async deleteUser(id: string): Promise<void> {
    await this.getUserById(id) // Ensure user exists
    await this.usersRepository.softDelete(id)
  }

  async getUsersWithFilters(filterParams: any) {
    return this.usersRepository.findUsersWithFilters(filterParams)
  }
}
```

**Input/Output Example:**

```bash
# Creating a user
POST /users
Body: {
  "email": "john@example.com",
  "name": "John Doe",
  "username": "johndoe"
}

# Response
{
  "id": "cuid123",
  "email": "john@example.com",
  "name": "John Doe",
  "username": "johndoe",
  "role": "USER",
  "status": "ACTIVE",
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z"
}
```

### 2. Advanced Queries với Relations

```typescript
// src/posts/posts.service.ts
import { Injectable } from '@nestjs/common'
import { PrismaService } from '../shared/services/prisma.service'
import { Prisma } from '@prisma/client'

@Injectable()
export class PostsService {
  constructor(private prisma: PrismaService) {}

  // Get posts với complex relations
  async getPostsWithAuthors(params: {
    published?: boolean
    authorId?: string
    categoryId?: string
    search?: string
    page?: number
    limit?: number
  }) {
    const { published = true, authorId, categoryId, search, page = 1, limit = 10 } = params

    const where: Prisma.PostWhereInput = { published }

    if (authorId) where.authorId = authorId
    if (categoryId) {
      where.categories = { some: { id: categoryId } }
    }
    if (search) {
      where.OR = [
        { title: { contains: search, mode: 'insensitive' } },
        { content: { contains: search, mode: 'insensitive' } },
      ]
    }

    const [posts, total] = await Promise.all([
      this.prisma.post.findMany({
        where,
        include: {
          author: {
            select: {
              id: true,
              name: true,
              username: true,
              avatar: true,
            },
          },
          categories: true,
          tags: true,
          _count: {
            select: {
              comments: { where: { approved: true } },
            },
          },
        },
        orderBy: { publishedAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.post.count({ where }),
    ])

    return { posts, total, page, limit }
  }

  // Full-text search với Prisma
  async searchPosts(query: string, limit: number = 10) {
    return this.prisma.post.findMany({
      where: {
        AND: [
          { published: true },
          {
            OR: [{ title: { search: query } }, { content: { search: query } }],
          },
        ],
      },
      include: {
        author: {
          select: { id: true, name: true, username: true },
        },
        _count: {
          select: { comments: true },
        },
      },
      orderBy: {
        _relevance: {
          fields: ['title', 'content'],
          search: query,
          sort: 'desc',
        },
      },
      take: limit,
    })
  }

  // Aggregate operations
  async getPostStatistics() {
    const stats = await this.prisma.post.aggregate({
      _count: {
        id: true,
      },
      _avg: {
        viewCount: true,
        likeCount: true,
      },
      _sum: {
        viewCount: true,
        likeCount: true,
      },
      where: {
        published: true,
      },
    })

    const topAuthors = await this.prisma.user.findMany({
      select: {
        id: true,
        name: true,
        username: true,
        _count: {
          select: {
            posts: { where: { published: true } },
          },
        },
      },
      orderBy: {
        posts: {
          _count: 'desc',
        },
      },
      take: 10,
    })

    return { stats, topAuthors }
  }
}
```

### 3. Transaction Management

```typescript
// src/shared/services/transaction.service.ts
import { Injectable } from '@nestjs/common'
import { PrismaService } from './prisma.service'
import { Prisma } from '@prisma/client'

@Injectable()
export class TransactionService {
  constructor(private prisma: PrismaService) {}

  // Interactive transaction example
  async transferUserData(fromUserId: string, toUserId: string) {
    return this.prisma.$transaction(async (tx) => {
      // Check if both users exist
      const [fromUser, toUser] = await Promise.all([
        tx.user.findUnique({ where: { id: fromUserId } }),
        tx.user.findUnique({ where: { id: toUserId } }),
      ])

      if (!fromUser || !toUser) {
        throw new Error('One or both users not found')
      }

      // Transfer posts
      await tx.post.updateMany({
        where: { authorId: fromUserId },
        data: { authorId: toUserId },
      })

      // Transfer comments
      await tx.comment.updateMany({
        where: { authorId: fromUserId },
        data: { authorId: toUserId },
      })

      // Update user status
      await tx.user.update({
        where: { id: fromUserId },
        data: { status: 'INACTIVE' },
      })

      // Log the transfer
      return tx.user.update({
        where: { id: toUserId },
        data: {
          metadata: {
            lastDataTransfer: {
              fromUserId,
              transferredAt: new Date(),
            },
          },
        },
      })
    })
  }

  // Batch operations trong transaction
  async createPostWithCategoriesAndTags(postData: {
    title: string
    content: string
    authorId: string
    categoryNames: string[]
    tagNames: string[]
  }) {
    return this.prisma.$transaction(async (tx) => {
      // Create or find categories
      const categories = await Promise.all(
        postData.categoryNames.map((name) =>
          tx.category.upsert({
            where: { name },
            create: { name, slug: this.generateSlug(name) },
            update: {},
          }),
        ),
      )

      // Create or find tags
      const tags = await Promise.all(
        postData.tagNames.map((name) =>
          tx.tag.upsert({
            where: { name },
            create: { name, slug: this.generateSlug(name) },
            update: {},
          }),
        ),
      )

      // Create post với relations
      const post = await tx.post.create({
        data: {
          title: postData.title,
          content: postData.content,
          slug: this.generateSlug(postData.title),
          authorId: postData.authorId,
          categories: {
            connect: categories.map((cat) => ({ id: cat.id })),
          },
          tags: {
            connect: tags.map((tag) => ({ id: tag.id })),
          },
        },
        include: {
          categories: true,
          tags: true,
          author: true,
        },
      })

      return post
    })
  }

  private generateSlug(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '')
  }
}
```

### 4. Raw Queries và Custom Operations

```typescript
// src/analytics/analytics.service.ts
import { Injectable } from '@nestjs/common'
import { PrismaService } from '../shared/services/prisma.service'

@Injectable()
export class AnalyticsService {
  constructor(private prisma: PrismaService) {}

  // Complex analytics query
  async getAdvancedUserAnalytics(dateRange: { from: Date; to: Date }) {
    const query = `
      SELECT 
        DATE_TRUNC('day', u.created_at) as date,
        COUNT(DISTINCT u.id) as new_users,
        COUNT(DISTINCT p.id) as new_posts,
        COUNT(DISTINCT c.id) as new_comments,
        AVG(p.view_count) as avg_post_views
      FROM users u
      LEFT JOIN posts p ON u.id = p.author_id 
        AND p.created_at BETWEEN $1 AND $2
      LEFT JOIN comments c ON u.id = c.author_id 
        AND c.created_at BETWEEN $1 AND $2
      WHERE u.created_at BETWEEN $1 AND $2
      GROUP BY DATE_TRUNC('day', u.created_at)
      ORDER BY date ASC
    `

    return this.prisma.$queryRawUnsafe(query, dateRange.from, dateRange.to)
  }

  // Use Prisma's type-safe raw queries
  async getUserEngagementMetrics(userId: string) {
    return this.prisma.$queryRaw`
      SELECT 
        u.id,
        u.name,
        COUNT(DISTINCT p.id) as total_posts,
        COUNT(DISTINCT c.id) as total_comments,
        COALESCE(SUM(p.view_count), 0) as total_views,
        COALESCE(SUM(p.like_count), 0) as total_likes,
        COALESCE(AVG(p.view_count), 0) as avg_views_per_post
      FROM users u
      LEFT JOIN posts p ON u.id = p.author_id AND p.published = true
      LEFT JOIN comments c ON u.id = c.author_id AND c.approved = true
      WHERE u.id = ${userId}
      GROUP BY u.id, u.name
    `
  }

  // Bulk operations với raw SQL
  async updatePostViewCounts(viewUpdates: Array<{ postId: string; views: number }>) {
    const values = viewUpdates.map(({ postId, views }) => `('${postId}', ${views})`).join(', ')

    return this.prisma.$executeRawUnsafe(`
      UPDATE posts 
      SET view_count = view_count + temp.additional_views,
          updated_at = NOW()
      FROM (VALUES ${values}) AS temp(post_id, additional_views)
      WHERE posts.id = temp.post_id::uuid
    `)
  }

  // Optimized search với full-text search
  async optimizedPostSearch(searchTerm: string, limit: number = 20) {
    return this.prisma.$queryRaw`
      SELECT 
        p.*,
        u.name as author_name,
        u.username as author_username,
        ts_rank(to_tsvector('english', p.title || ' ' || p.content), plainto_tsquery('english', ${searchTerm})) as relevance_score
      FROM posts p
      JOIN users u ON p.author_id = u.id
      WHERE p.published = true
        AND to_tsvector('english', p.title || ' ' || p.content) @@ plainto_tsquery('english', ${searchTerm})
      ORDER BY relevance_score DESC, p.published_at DESC
      LIMIT ${limit}
    `
  }
}
```

## ⚠️ Các vấn đề thường gặp

### 1. N+1 Query Problem

**Problem:** Loading relations separately gây ra nhiều queries

```typescript
// ❌ Problematic: N+1 queries
async getBadUserPosts() {
  const users = await this.prisma.user.findMany()

  // This creates N additional queries!
  const usersWithPosts = await Promise.all(
    users.map(async user => ({
      ...user,
      posts: await this.prisma.post.findMany({
        where: { authorId: user.id }
      })
    }))
  )

  return usersWithPosts
}

// ✅ Solution: Use include hoặc select
async getGoodUserPosts() {
  return this.prisma.user.findMany({
    include: {
      posts: {
        where: { published: true },
        orderBy: { createdAt: 'desc' },
        take: 5,
      },
      _count: {
        select: { posts: true }
      }
    }
  })
}
```

### 2. Missing Database Constraints

**Problem:** Logic constraints không được enforce ở database level

```prisma
// ❌ Problematic: No database constraints
model User {
  id    String @id @default(cuid())
  email String // Missing @unique!
  age   Int    // No validation!
}

// ✅ Solution: Proper constraints
model User {
  id       String @id @default(cuid())
  email    String @unique
  age      Int    @check(age >= 0 AND age <= 150)
  username String @unique

  @@index([email])
  @@index([username])
}
```

### 3. Transaction Deadlocks

**Problem:** Concurrent transactions causing deadlocks

```typescript
// ❌ Problematic: Potential deadlock
async transferPoints(fromUserId: string, toUserId: string, points: number) {
  return this.prisma.$transaction(async (tx) => {
    // Different order of user locking can cause deadlock
    const fromUser = await tx.user.findUnique({ where: { id: fromUserId } })
    const toUser = await tx.user.findUnique({ where: { id: toUserId } })

    await tx.user.update({
      where: { id: fromUserId },
      data: { points: fromUser.points - points }
    })

    await tx.user.update({
      where: { id: toUserId },
      data: { points: toUser.points + points }
    })
  })
}

// ✅ Solution: Consistent ordering và timeout
async transferPointsSafe(fromUserId: string, toUserId: string, points: number) {
  // Always lock users in consistent order (by ID)
  const [firstId, secondId] = [fromUserId, toUserId].sort()

  return this.prisma.$transaction(async (tx) => {
    // Lock users in consistent order
    const users = await tx.user.findMany({
      where: { id: { in: [firstId, secondId] } },
      orderBy: { id: 'asc' }
    })

    const fromUser = users.find(u => u.id === fromUserId)
    const toUser = users.find(u => u.id === toUserId)

    if (fromUser.points < points) {
      throw new Error('Insufficient points')
    }

    await Promise.all([
      tx.user.update({
        where: { id: fromUserId },
        data: { points: { decrement: points } }
      }),
      tx.user.update({
        where: { id: toUserId },
        data: { points: { increment: points } }
      })
    ])
  }, {
    timeout: 5000, // 5 second timeout
  })
}
```

## 🔧 Advanced Patterns

### 1. Custom Prisma Middleware

```typescript
// src/shared/middleware/prisma.middleware.ts
import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from '../services/prisma.service'

@Injectable()
export class PrismaMiddleware {
  private readonly logger = new Logger(PrismaMiddleware.name)

  constructor(private prisma: PrismaService) {
    this.setupMiddleware()
  }

  private setupMiddleware() {
    // Soft delete middleware
    this.prisma.$use(async (params, next) => {
      // Check incoming query type
      if (params.action === 'delete') {
        // Delete queries
        // Change action to an update
        params.action = 'update'
        params.args['data'] = { deletedAt: new Date() }
      }
      if (params.action === 'deleteMany') {
        // Delete many queries
        params.action = 'updateMany'
        if (params.args.data !== undefined) {
          params.args.data['deletedAt'] = new Date()
        } else {
          params.args['data'] = { deletedAt: new Date() }
        }
      }
      return next(params)
    })

    // Query logging middleware
    this.prisma.$use(async (params, next) => {
      const before = Date.now()
      const result = await next(params)
      const after = Date.now()

      this.logger.debug(`Query ${params.model}.${params.action} took ${after - before}ms`)

      return result
    })

    // Auto-update timestamps
    this.prisma.$use(async (params, next) => {
      if (params.action === 'update' || params.action === 'updateMany') {
        if (params.args.data) {
          params.args.data.updatedAt = new Date()
        }
      }
      return next(params)
    })
  }
}
```

### 2. Repository Factory Pattern

```typescript
// src/shared/factories/repository.factory.ts
import { Injectable } from '@nestjs/common'
import { PrismaService } from '../services/prisma.service'

export interface RepositoryConfig<T> {
  model: string
  includes?: any
  defaultOrderBy?: any
  softDelete?: boolean
}

@Injectable()
export class RepositoryFactory {
  constructor(private prisma: PrismaService) {}

  create<T>(config: RepositoryConfig<T>) {
    return {
      findMany: async (params: any = {}) => {
        const model = this.prisma[config.model]
        return model.findMany({
          ...params,
          include: { ...config.includes, ...params.include },
          orderBy: params.orderBy || config.defaultOrderBy,
          where: config.softDelete ? { ...params.where, deletedAt: null } : params.where,
        })
      },

      findUnique: async (params: any) => {
        const model = this.prisma[config.model]
        return model.findUnique({
          ...params,
          include: { ...config.includes, ...params.include },
          where: config.softDelete ? { ...params.where, deletedAt: null } : params.where,
        })
      },

      create: async (params: any) => {
        const model = this.prisma[config.model]
        return model.create({
          ...params,
          include: config.includes,
        })
      },

      update: async (params: any) => {
        const model = this.prisma[config.model]
        return model.update({
          ...params,
          include: config.includes,
        })
      },

      delete: async (params: any) => {
        const model = this.prisma[config.model]
        if (config.softDelete) {
          return model.update({
            where: params.where,
            data: { deletedAt: new Date() },
            include: config.includes,
          })
        }
        return model.delete({
          ...params,
          include: config.includes,
        })
      },
    }
  }
}

// Usage
@Injectable()
export class UsersRepository {
  private repository: ReturnType<RepositoryFactory['create']>

  constructor(repositoryFactory: RepositoryFactory) {
    this.repository = repositoryFactory.create({
      model: 'user',
      includes: { profile: true },
      defaultOrderBy: { createdAt: 'desc' },
      softDelete: true,
    })
  }

  async findByEmail(email: string) {
    return this.repository.findUnique({
      where: { email },
    })
  }
}
```

### 3. Database Seeding Strategy

```typescript
// src/database/seeders/user.seeder.ts
import { Injectable } from '@nestjs/common'
import { PrismaService } from '../shared/services/prisma.service'
import { faker } from '@faker-js/faker'

@Injectable()
export class UserSeeder {
  constructor(private prisma: PrismaService) {}

  async seed(count: number = 100) {
    console.log(`Seeding ${count} users...`)

    // Create admin user
    const adminUser = await this.prisma.user.upsert({
      where: { email: 'admin@example.com' },
      update: {},
      create: {
        email: 'admin@example.com',
        name: 'Admin User',
        username: 'admin',
        password: await bcrypt.hash('admin123', 10),
        role: 'ADMIN',
        profile: {
          create: {
            bio: 'System Administrator',
            website: 'https://example.com',
          },
        },
      },
    })

    // Batch create regular users
    const batchSize = 50
    const batches = Math.ceil(count / batchSize)

    for (let i = 0; i < batches; i++) {
      const users = Array.from({ length: Math.min(batchSize, count - i * batchSize) }, () => ({
        email: faker.internet.email(),
        name: faker.person.fullName(),
        username: faker.internet.userName(),
        password: bcrypt.hashSync('password123', 10),
        role: faker.helpers.arrayElement(['USER', 'MODERATOR']),
        createdAt: faker.date.past({ years: 2 }),
      }))

      await this.prisma.user.createMany({
        data: users,
        skipDuplicates: true,
      })

      console.log(`Seeded batch ${i + 1}/${batches}`)
    }

    console.log('User seeding completed!')
    return { admin: adminUser }
  }
}

// Main seeder
@Injectable()
export class DatabaseSeeder {
  constructor(
    private userSeeder: UserSeeder,
    private postSeeder: PostSeeder,
    private prisma: PrismaService,
  ) {}

  async run() {
    console.log('Starting database seeding...')

    try {
      await this.prisma.$transaction(async (tx) => {
        // Seed in correct order due to foreign key constraints
        await this.userSeeder.seed(100)
        await this.postSeeder.seed(500)

        console.log('Database seeding completed successfully!')
      })
    } catch (error) {
      console.error('Seeding failed:', error)
      throw error
    }
  }
}
```

## 📝 Best Practices

### DO's ✅

1. **Always use type-safe queries**

```typescript
// Good - Type-safe with Prisma
async getUserPosts(userId: string): Promise<Post[]> {
  return this.prisma.post.findMany({
    where: {
      authorId: userId,
      published: true
    },
    include: {
      author: {
        select: { id: true, name: true, username: true }
      }
    },
    orderBy: { createdAt: 'desc' }
  })
}
```

2. **Use database constraints properly**

```prisma
// Good - Comprehensive constraints
model User {
  id       String @id @default(cuid())
  email    String @unique
  username String @unique
  age      Int?   @check(age >= 13 AND age <= 120)

  @@index([email])
  @@index([username])
  @@map("users")
}
```

3. **Implement proper error handling**

```typescript
// Good - Comprehensive error handling
async updateUser(id: string, data: UpdateUserDto): Promise<User> {
  try {
    return await this.prisma.user.update({
      where: { id },
      data,
    })
  } catch (error) {
    if (error.code === 'P2002') {
      throw new ConflictException('Email or username already exists')
    }
    if (error.code === 'P2025') {
      throw new NotFoundException('User not found')
    }
    throw new InternalServerErrorException('Failed to update user')
  }
}
```

4. **Use transactions for related operations**

```typescript
// Good - Atomic operations
async createUserWithProfile(userData: CreateUserDto, profileData: CreateProfileDto) {
  return this.prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: userData,
    })

    const profile = await tx.profile.create({
      data: {
        ...profileData,
        userId: user.id,
      },
    })

    return { user, profile }
  })
}
```

### DON'T's ❌

1. **Đừng ignore database performance**

```typescript
// Bad - No pagination, no limits
async getAllUsers() {
  return this.prisma.user.findMany() // Could return millions!
}

// Good - Always paginate
async getUsers(page: number = 1, limit: number = 20) {
  return this.prisma.user.findMany({
    skip: (page - 1) * limit,
    take: Math.min(limit, 100), // Cap at 100
  })
}
```

2. **Đừng expose sensitive data**

```typescript
// Bad - Exposing password
async getUserByEmail(email: string) {
  return this.prisma.user.findUnique({
    where: { email } // Returns password field!
  })
}

// Good - Select specific fields
async getUserByEmail(email: string) {
  return this.prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      // password excluded
    }
  })
}
```

3. **Đừng miss validation**

```typescript
// Bad - No input validation
async createUser(data: any) {
  return this.prisma.user.create({ data }) // Dangerous!
}

// Good - Proper validation
async createUser(data: CreateUserDto) {
  // Validate input with class-validator
  const validatedData = await validate(data)
  if (validatedData.length > 0) {
    throw new BadRequestException('Invalid input')
  }

  return this.prisma.user.create({ data })
}
```

## 🚨 Common Pitfalls

### 1. Connection Pool Exhaustion

```typescript
// ❌ Pitfall: Not properly managing connections
async badLongRunningOperation() {
  // This could exhaust connection pool
  const promises = Array.from({ length: 1000 }, (_, i) =>
    this.prisma.user.findUnique({ where: { id: i.toString() } })
  )

  return Promise.all(promises) // Too many concurrent connections!
}

// ✅ Solution: Batch processing và connection limits
async goodLongRunningOperation() {
  const batchSize = 10
  const batches = Array.from({ length: 100 }, (_, i) =>
    Array.from({ length: batchSize }, (_, j) => (i * batchSize + j).toString())
  )

  const results = []
  for (const batch of batches) {
    const batchResults = await Promise.all(
      batch.map(id => this.prisma.user.findUnique({ where: { id } }))
    )
    results.push(...batchResults)
  }

  return results
}
```

### 2. Schema Migration Issues

```typescript
// ❌ Pitfall: Unsafe migrations in production
// migration.sql (dangerous!)
/*
  ALTER TABLE users DROP COLUMN old_field; -- Data loss!
  ALTER TABLE users ADD COLUMN new_field VARCHAR(255) NOT NULL; -- Breaks existing data!
*/

// ✅ Solution: Safe migration strategy
/*
  Step 1: Add new column as optional
  ALTER TABLE users ADD COLUMN new_field VARCHAR(255);
  
  Step 2: Populate data
  UPDATE users SET new_field = 'default_value' WHERE new_field IS NULL;
  
  Step 3: Make required (in separate migration)
  ALTER TABLE users ALTER COLUMN new_field SET NOT NULL;
  
  Step 4: Drop old column (in separate migration, after verification)
  ALTER TABLE users DROP COLUMN old_field;
*/
```

### 3. Memory Leaks từ Large Queries

```typescript
// ❌ Pitfall: Loading too much data
async exportAllUsers() {
  // Could load millions of records into memory!
  const users = await this.prisma.user.findMany({
    include: {
      posts: true,
      comments: true,
      profile: true,
    }
  })

  return this.generateCSV(users) // Memory explosion!
}

// ✅ Solution: Streaming approach
async exportUsersStreaming() {
  const batchSize = 1000
  let cursor: string | undefined
  const stream = new PassThrough()

  while (true) {
    const users = await this.prisma.user.findMany({
      take: batchSize,
      ...(cursor && {
        cursor: { id: cursor },
        skip: 1
      }),
      orderBy: { id: 'asc' },
      select: {
        id: true,
        email: true,
        name: true,
        createdAt: true,
      }
    })

    if (users.length === 0) break

    // Stream data chunk by chunk
    stream.write(this.formatUsersAsCSV(users))

    cursor = users[users.length - 1].id
  }

  stream.end()
  return stream
}
```

## 🔗 Integration với Other Components

### 1. Integration với NestJS Guards và Interceptors

```typescript
// src/shared/guards/database-health.guard.ts
import { Injectable, CanActivate, ExecutionContext, ServiceUnavailableException } from '@nestjs/common'
import { PrismaService } from '../services/prisma.service'

@Injectable()
export class DatabaseHealthGuard implements CanActivate {
  constructor(private prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isHealthy = await this.prisma.healthCheck()
    if (!isHealthy) {
      throw new ServiceUnavailableException('Database is not available')
    }
    return true
  }
}

// Usage
@Controller('api')
@UseGuards(DatabaseHealthGuard)
export class ApiController {
  // All routes protected by database health check
}
```

### 2. Integration với Caching

```typescript
// src/shared/decorators/cached-query.decorator.ts
import { SetMetadata } from '@nestjs/common'

export const CachedQuery = (ttl: number = 300) => SetMetadata('cached-query', ttl)

// src/shared/interceptors/prisma-cache.interceptor.ts
import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common'
import { Observable } from 'rxjs'
import { tap } from 'rxjs/operators'
import { Reflector } from '@nestjs/core'
import { CacheService } from '../services/cache.service'

@Injectable()
export class PrismaCacheInterceptor implements NestInterceptor {
  constructor(
    private reflector: Reflector,
    private cacheService: CacheService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const ttl = this.reflector.get<number>('cached-query', context.getHandler())
    if (!ttl) return next.handle()

    const request = context.switchToHttp().getRequest()
    const cacheKey = this.generateCacheKey(request)

    return new Observable((observer) => {
      this.cacheService.get(cacheKey).then((cached) => {
        if (cached) {
          observer.next(cached)
          observer.complete()
          return
        }

        next
          .handle()
          .pipe(
            tap((result) => {
              this.cacheService.set(cacheKey, result, ttl)
            }),
          )
          .subscribe(observer)
      })
    })
  }

  private generateCacheKey(request: any): string {
    return `query:${request.url}:${JSON.stringify(request.query)}`
  }
}

// Usage
@Injectable()
export class UsersService {
  @CachedQuery(600) // Cache for 10 minutes
  async getUsers() {
    return this.prisma.user.findMany()
  }
}
```

### 3. Integration với Queue Systems

```typescript
// src/shared/services/database-queue.service.ts
import { Injectable } from '@nestjs/common'
import { Queue } from 'bull'
import { InjectQueue } from '@nestjs/bull'
import { PrismaService } from './prisma.service'

@Injectable()
export class DatabaseQueueService {
  constructor(
    @InjectQueue('database-operations') private dbQueue: Queue,
    private prisma: PrismaService,
  ) {}

  // Queue heavy database operations
  async queueUserEmailUpdate(userId: string, newEmail: string) {
    await this.dbQueue.add(
      'update-user-email',
      {
        userId,
        newEmail,
      },
      {
        attempts: 3,
        backoff: 'exponential',
      },
    )
  }

  // Process background operations
  async processEmailUpdate(job: any) {
    const { userId, newEmail } = job.data

    return this.prisma.$transaction(async (tx) => {
      // Verify email isn't taken
      const existingUser = await tx.user.findUnique({
        where: { email: newEmail },
      })

      if (existingUser && existingUser.id !== userId) {
        throw new Error('Email already in use')
      }

      // Update user
      await tx.user.update({
        where: { id: userId },
        data: { email: newEmail },
      })

      // Log the change
      await tx.auditLog.create({
        data: {
          action: 'EMAIL_CHANGED',
          userId,
          metadata: { newEmail },
        },
      })
    })
  }
}
```

## 📋 Tóm tắt

### Key Takeaways

1. **Type Safety**: Prisma provides 100% type safety, eliminating runtime database errors
2. **Performance**: Proper indexing và query optimization can improve performance by 10-100x
3. **Migration Safety**: Always use safe migration strategies in production
4. **Transaction Management**: Use transactions for related operations to maintain data consistency

### When to Use Prisma

✅ **Sử dụng cho:**

- TypeScript/JavaScript projects requiring type safety
- Applications with complex data relationships
- Projects needing automated migrations
- Teams wanting improved developer experience
- Applications requiring advanced query capabilities

❌ **Không sử dụng cho:**

- Simple CRUD applications where ORM overhead isn't justified
- Applications requiring maximum performance (use raw SQL)
- Legacy systems with complex existing database schemas
- Projects with very specific database requirements

### Performance Guidelines

```typescript
const PRISMA_BEST_PRACTICES = {
  queryLimits: {
    defaultPageSize: 20,
    maxPageSize: 100,
    batchSize: 1000,
  },
  indexing: {
    addIndexes: ['frequently queried fields', 'foreign keys', 'unique constraints'],
    avoidIndexes: ['rarely queried fields', 'frequently updated fields'],
  },
  relations: {
    useInclude: 'for related data you always need',
    useSelect: 'to limit returned fields',
    avoidNested: 'deep nested includes (>3 levels)',
  },
}
```

### Monitoring Database Performance

```typescript
// Monitor key metrics
const DATABASE_METRICS = {
  queryDuration: 'Track slow queries (>100ms)',
  connectionPoolUsage: 'Monitor connection pool exhaustion',
  errorRates: 'Track P2XXX Prisma errors',
  migrationStatus: 'Monitor migration drift',
  indexUsage: 'Ensure indexes are being used',
}
```

> 💡 **Remember**: Prisma is most effective when combined with proper database design, indexing strategy, và monitoring. Always profile your queries và optimize based on real-world usage patterns.
