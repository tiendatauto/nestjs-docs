# 📊 Database Indexing & Partial Index trong NestJS

## 🔍 Database Indexing là gì?

Database Indexing là cấu trúc dữ liệu được tối ưu hóa để tăng tốc độ truy vấn database:

- **Vai trò chính**: Tăng tốc độ SELECT, WHERE, JOIN, ORDER BY operations
- **Cách hoạt động**: Tạo "đường tắt" để tìm dữ liệu thay vì scan toàn bộ table
- **Execution order**: Query → Index Lookup → Direct Row Access → Return Results
- **Lifecycle**: Index creation → Maintenance during INSERT/UPDATE/DELETE → Query optimization

> 💡 **Tại sao cần Indexing?**
> Indexing có thể cải thiện query performance từ O(n) xuống O(log n), giảm query time từ seconds xuống milliseconds.

**Partial Index** là index chỉ được tạo cho một subset của rows dựa trên điều kiện WHERE, giúp tiết kiệm storage và tăng hiệu suất.

## 🎯 Cách implement Database Indexing

### Basic Implementation với Prisma

#### 1. Schema Definition với Basic Indexes

```prisma
// prisma/schema.prisma
model User {
  id        String   @id @default(cuid())
  email     String   @unique // Automatic unique index
  username  String   @unique
  firstName String
  lastName  String
  isActive  Boolean  @default(true)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  posts     Post[]
  orders    Order[]

  // Composite index cho search
  @@index([firstName, lastName])
  // Index cho filtering
  @@index([isActive])
  // Index cho pagination/sorting
  @@index([createdAt])
}

model Post {
  id          String    @id @default(cuid())
  title       String
  content     String?
  published   Boolean   @default(false)
  publishedAt DateTime?
  authorId    String
  categoryId  String
  viewCount   Int       @default(0)
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  author   User     @relation(fields: [authorId], references: [id])
  category Category @relation(fields: [categoryId], references: [id])
  tags     PostTag[]

  // Compound index cho queries thường dùng
  @@index([authorId, published])
  @@index([categoryId, published])
  @@index([published, publishedAt])
  // Index cho sorting
  @@index([viewCount])
}

model Order {
  id          String      @id @default(cuid())
  userId      String
  status      OrderStatus @default(PENDING)
  total       Decimal
  currency    String      @default("USD")
  createdAt   DateTime    @default(now())
  updatedAt   DateTime    @updatedAt
  completedAt DateTime?

  user  User        @relation(fields: [userId], references: [id])
  items OrderItem[]

  // Index cho user orders
  @@index([userId])
  // Index cho status queries
  @@index([status])
  // Composite index cho reporting
  @@index([status, createdAt])
  @@index([userId, status])
}

enum OrderStatus {
  PENDING
  PROCESSING
  SHIPPED
  DELIVERED
  CANCELLED
}
```

#### 2. Advanced Indexing với Raw SQL

```typescript
// src/shared/services/database-index.service.ts
import { Injectable, OnModuleInit } from '@nestjs/common'
import { PrismaService } from './prisma.service'

@Injectable()
export class DatabaseIndexService implements OnModuleInit {
  constructor(private prisma: PrismaService) {}

  async onModuleInit() {
    if (process.env.NODE_ENV === 'development') {
      await this.createAdvancedIndexes()
    }
  }

  private async createAdvancedIndexes() {
    try {
      // Partial index cho active users only
      await this.prisma.$executeRaw`
        CREATE INDEX IF NOT EXISTS idx_users_active_email 
        ON "User"(email) 
        WHERE "isActive" = true
      `

      // Partial index cho published posts
      await this.prisma.$executeRaw`
        CREATE INDEX IF NOT EXISTS idx_posts_published_title 
        ON "Post"(title) 
        WHERE published = true
      `

      // Composite partial index
      await this.prisma.$executeRaw`
        CREATE INDEX IF NOT EXISTS idx_posts_category_published_date 
        ON "Post"("categoryId", "publishedAt") 
        WHERE published = true AND "publishedAt" IS NOT NULL
      `

      // Function-based index cho case-insensitive search
      await this.prisma.$executeRaw`
        CREATE INDEX IF NOT EXISTS idx_users_email_lower 
        ON "User"(LOWER(email))
      `

      // Partial index cho recent orders
      await this.prisma.$executeRaw`
        CREATE INDEX IF NOT EXISTS idx_orders_recent_status 
        ON "Order"("userId", status) 
        WHERE "createdAt" >= NOW() - INTERVAL '30 days'
      `

      console.log('Advanced indexes created successfully')
    } catch (error) {
      console.error('Error creating advanced indexes:', error)
    }
  }

  // Drop indexes khi cần
  async dropAdvancedIndexes() {
    const indexes = [
      'idx_users_active_email',
      'idx_posts_published_title',
      'idx_posts_category_published_date',
      'idx_users_email_lower',
      'idx_orders_recent_status',
    ]

    for (const index of indexes) {
      try {
        await this.prisma.$executeRaw`DROP INDEX IF EXISTS ${index}`
      } catch (error) {
        console.error(`Error dropping index ${index}:`, error)
      }
    }
  }
}
```

### Advanced Implementation

#### 1. Dynamic Index Management

```typescript
// src/shared/services/dynamic-index.service.ts
import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'

interface IndexDefinition {
  name: string
  table: string
  columns: string[]
  condition?: string
  unique?: boolean
  method?: 'btree' | 'hash' | 'gin' | 'gist'
}

@Injectable()
export class DynamicIndexService {
  private readonly logger = new Logger(DynamicIndexService.name)

  constructor(
    private prisma: PrismaService,
    private configService: ConfigService,
  ) {}

  // Tự động tạo indexes based on query patterns
  async createOptimalIndexes() {
    const indexDefinitions: IndexDefinition[] = [
      {
        name: 'idx_users_search_active',
        table: 'User',
        columns: ['firstName', 'lastName'],
        condition: '"isActive" = true',
        method: 'btree',
      },
      {
        name: 'idx_posts_full_text',
        table: 'Post',
        columns: ['title', 'content'],
        condition: 'published = true',
        method: 'gin',
      },
      {
        name: 'idx_orders_user_recent',
        table: 'Order',
        columns: ['userId', 'createdAt'],
        condition: '"createdAt" >= NOW() - INTERVAL \'90 days\'',
        method: 'btree',
      },
    ]

    for (const indexDef of indexDefinitions) {
      await this.createIndex(indexDef)
    }
  }

  private async createIndex(indexDef: IndexDefinition): Promise<void> {
    try {
      const columnsStr = indexDef.columns.map((col) => `"${col}"`).join(', ')
      const methodStr = indexDef.method ? `USING ${indexDef.method}` : ''
      const uniqueStr = indexDef.unique ? 'UNIQUE' : ''
      const conditionStr = indexDef.condition ? `WHERE ${indexDef.condition}` : ''

      const sql = `
        CREATE ${uniqueStr} INDEX IF NOT EXISTS ${indexDef.name} 
        ON "${indexDef.table}" ${methodStr} (${columnsStr}) 
        ${conditionStr}
      `

      await this.prisma.$executeRawUnsafe(sql)
      this.logger.log(`Index created: ${indexDef.name}`)
    } catch (error) {
      this.logger.error(`Failed to create index ${indexDef.name}:`, error)
    }
  }

  // Analyze query performance
  async analyzeQuery(query: string): Promise<any> {
    try {
      const explanation = await this.prisma.$queryRawUnsafe(`EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query}`)
      return explanation
    } catch (error) {
      this.logger.error('Query analysis failed:', error)
      return null
    }
  }

  // Monitor index usage
  async getIndexUsageStats(): Promise<any[]> {
    return this.prisma.$queryRaw`
      SELECT 
        schemaname,
        tablename,
        indexname,
        idx_tup_read,
        idx_tup_fetch,
        idx_scan
      FROM pg_stat_user_indexes 
      ORDER BY idx_scan DESC
    `
  }

  // Find unused indexes
  async findUnusedIndexes(): Promise<any[]> {
    return this.prisma.$queryRaw`
      SELECT 
        schemaname,
        tablename,
        indexname,
        idx_scan,
        pg_size_pretty(pg_relation_size(indexrelid)) as size
      FROM pg_stat_user_indexes 
      WHERE idx_scan = 0
      AND indexname NOT LIKE '%_pkey'
      ORDER BY pg_relation_size(indexrelid) DESC
    `
  }
}
```

## 💡 Các cách sử dụng thông dụng

### 1. Optimizing Search Queries

```typescript
// src/users/users.service.ts
import { Injectable } from '@nestjs/common'

interface UserSearchFilters {
  query?: string
  isActive?: boolean
  createdAfter?: Date
  limit?: number
  offset?: number
}

@Injectable()
export class UsersService {
  constructor(private prisma: PrismaService) {}

  // Optimized search với composite index
  async searchUsers(filters: UserSearchFilters) {
    const { query, isActive = true, createdAfter, limit = 20, offset = 0 } = filters

    return this.prisma.user.findMany({
      where: {
        // Sử dụng partial index: idx_users_active_email
        isActive,
        // Full-text search với index
        OR: query
          ? [
              {
                firstName: {
                  contains: query,
                  mode: 'insensitive',
                },
              },
              {
                lastName: {
                  contains: query,
                  mode: 'insensitive',
                },
              },
              {
                email: {
                  contains: query,
                  mode: 'insensitive',
                },
              },
            ]
          : undefined,
        // Range query với index
        createdAt: createdAfter
          ? {
              gte: createdAfter,
            }
          : undefined,
      },
      // Sử dụng index cho sorting
      orderBy: {
        createdAt: 'desc',
      },
      take: limit,
      skip: offset,
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        createdAt: true,
      },
    })
  }

  // Case-insensitive email lookup với function-based index
  async findByEmailIgnoreCase(email: string) {
    // Sử dụng raw query để leverage function-based index
    return this.prisma.$queryRaw`
      SELECT id, email, "firstName", "lastName" 
      FROM "User" 
      WHERE LOWER(email) = LOWER(${email})
      AND "isActive" = true
      LIMIT 1
    `
  }
}
```

**Performance Comparison:**

```typescript
// Without index - Full table scan
// Query time: ~500ms for 100K users
await this.prisma.user.findMany({
  where: {
    firstName: { contains: 'John' },
  },
})

// With composite index [firstName, lastName] + partial index
// Query time: ~5ms for same dataset
await this.prisma.user.findMany({
  where: {
    isActive: true, // Uses partial index
    firstName: { contains: 'John' }, // Uses composite index
  },
})
```

### 2. E-commerce Product Search

```typescript
// src/products/products.service.ts
interface ProductFilters {
  categoryId?: string
  priceMin?: number
  priceMax?: number
  inStock?: boolean
  featured?: boolean
  search?: string
  sortBy?: 'price' | 'popularity' | 'newest'
  sortOrder?: 'asc' | 'desc'
}

@Injectable()
export class ProductsService {
  constructor(private prisma: PrismaService) {}

  async searchProducts(filters: ProductFilters, pagination: PaginationDto) {
    const {
      categoryId,
      priceMin,
      priceMax,
      inStock = true,
      featured,
      search,
      sortBy = 'newest',
      sortOrder = 'desc',
    } = filters

    // Build optimized query sử dụng indexes
    const whereClause = {
      // Sử dụng composite index [categoryId, isActive]
      ...(categoryId && { categoryId }),
      isActive: true,

      // Range query với index
      ...((priceMin !== undefined || priceMax !== undefined) && {
        price: {
          ...(priceMin !== undefined && { gte: priceMin }),
          ...(priceMax !== undefined && { lte: priceMax }),
        },
      }),

      // Boolean index
      ...(inStock && { stock: { gt: 0 } }),
      ...(featured !== undefined && { featured }),

      // Full-text search
      ...(search && {
        OR: [
          { name: { contains: search, mode: 'insensitive' } },
          { description: { contains: search, mode: 'insensitive' } },
        ],
      }),
    }

    // Optimized sorting với indexes
    const orderBy = this.buildOrderBy(sortBy, sortOrder)

    const [products, total] = await Promise.all([
      this.prisma.product.findMany({
        where: whereClause,
        orderBy,
        take: pagination.limit,
        skip: pagination.offset,
        include: {
          category: {
            select: { id: true, name: true },
          },
          _count: {
            select: { reviews: true },
          },
        },
      }),
      this.prisma.product.count({ where: whereClause }),
    ])

    return {
      data: products,
      meta: {
        total,
        page: Math.floor(pagination.offset / pagination.limit) + 1,
        limit: pagination.limit,
        totalPages: Math.ceil(total / pagination.limit),
      },
    }
  }

  private buildOrderBy(sortBy: string, sortOrder: 'asc' | 'desc') {
    switch (sortBy) {
      case 'price':
        return { price: sortOrder }
      case 'popularity':
        return { viewCount: sortOrder } // Requires index on viewCount
      case 'newest':
      default:
        return { createdAt: sortOrder } // Uses index on createdAt
    }
  }

  // Optimized related products query
  async getRelatedProducts(productId: string, limit: number = 6) {
    const product = await this.prisma.product.findUnique({
      where: { id: productId },
      select: { categoryId: true },
    })

    if (!product) return []

    return this.prisma.product.findMany({
      where: {
        categoryId: product.categoryId,
        id: { not: productId },
        isActive: true,
        stock: { gt: 0 },
      },
      orderBy: {
        viewCount: 'desc', // Uses index for popularity
      },
      take: limit,
      select: {
        id: true,
        name: true,
        price: true,
        image: true,
        slug: true,
      },
    })
  }
}
```

### 3. Analytics & Reporting với Indexes

```typescript
// src/analytics/analytics.service.ts
@Injectable()
export class AnalyticsService {
  constructor(private prisma: PrismaService) {}

  // Sales report với time-based partial index
  async getSalesReport(startDate: Date, endDate: Date) {
    // Sử dụng composite index [status, createdAt]
    return this.prisma.order.groupBy({
      by: ['status'],
      where: {
        createdAt: {
          gte: startDate,
          lte: endDate,
        },
        status: {
          in: ['DELIVERED', 'PROCESSING', 'SHIPPED'],
        },
      },
      _sum: {
        total: true,
      },
      _count: {
        id: true,
      },
    })
  }

  // Top customers với optimized query
  async getTopCustomers(limit: number = 10) {
    // Sử dụng raw query với indexes để optimize performance
    return this.prisma.$queryRaw`
      SELECT 
        u.id,
        u."firstName",
        u."lastName",
        u.email,
        COUNT(o.id) as order_count,
        SUM(o.total) as total_spent
      FROM "User" u
      INNER JOIN "Order" o ON u.id = o."userId"
      WHERE o.status = 'DELIVERED'
        AND o."createdAt" >= NOW() - INTERVAL '1 year'
      GROUP BY u.id, u."firstName", u."lastName", u.email
      ORDER BY total_spent DESC
      LIMIT ${limit}
    `
  }

  // Product performance analysis
  async getProductPerformance(categoryId?: string) {
    const whereClause = {
      ...(categoryId && { categoryId }),
      isActive: true,
    }

    return this.prisma.product.findMany({
      where: whereClause,
      select: {
        id: true,
        name: true,
        viewCount: true,
        _count: {
          select: {
            orderItems: true,
            reviews: true,
          },
        },
      },
      orderBy: [{ viewCount: 'desc' }, { createdAt: 'desc' }],
      take: 50,
    })
  }
}
```

### 4. Advanced Index Monitoring

```typescript
// src/shared/services/index-monitor.service.ts
@Injectable()
export class IndexMonitorService {
  private readonly logger = new Logger(IndexMonitorService.name)

  constructor(private prisma: PrismaService) {}

  // Monitor slow queries
  async getSlowQueries(limit: number = 10): Promise<any[]> {
    return this.prisma.$queryRaw`
      SELECT 
        query,
        calls,
        total_time,
        mean_time,
        rows
      FROM pg_stat_statements 
      ORDER BY mean_time DESC 
      LIMIT ${limit}
    `
  }

  // Index effectiveness analysis
  async analyzeIndexEffectiveness(): Promise<any> {
    const indexStats = await this.prisma.$queryRaw`
      SELECT 
        schemaname,
        tablename,
        indexname,
        idx_scan,
        idx_tup_read,
        idx_tup_fetch,
        pg_size_pretty(pg_relation_size(indexrelid)) as size
      FROM pg_stat_user_indexes 
      ORDER BY idx_scan DESC
    `

    const unusedIndexes = await this.prisma.$queryRaw`
      SELECT 
        schemaname,
        tablename,
        indexname,
        pg_size_pretty(pg_relation_size(indexrelid)) as size
      FROM pg_stat_user_indexes 
      WHERE idx_scan = 0
      AND indexname NOT LIKE '%_pkey'
      AND indexname NOT LIKE '%_unique'
    `

    return {
      activeIndexes: indexStats,
      unusedIndexes,
      recommendations: this.generateRecommendations(indexStats, unusedIndexes),
    }
  }

  private generateRecommendations(activeIndexes: any[], unusedIndexes: any[]): string[] {
    const recommendations: string[] = []

    // Low usage indexes
    const lowUsageIndexes = activeIndexes.filter((idx) => idx.idx_scan < 100)
    if (lowUsageIndexes.length > 0) {
      recommendations.push(`Consider reviewing ${lowUsageIndexes.length} indexes with low usage (< 100 scans)`)
    }

    // Unused indexes
    if (unusedIndexes.length > 0) {
      recommendations.push(`Drop ${unusedIndexes.length} unused indexes to save storage space`)
    }

    // Large indexes with low usage
    const largeLowUsage = activeIndexes.filter((idx) => idx.idx_scan < 1000 && idx.size && idx.size.includes('MB'))
    if (largeLowUsage.length > 0) {
      recommendations.push(`Review ${largeLowUsage.length} large indexes with low usage for potential optimization`)
    }

    return recommendations
  }

  // Auto-optimize indexes based on query patterns
  @Cron('0 2 * * 0') // Weekly at 2 AM on Sunday
  async autoOptimizeIndexes(): Promise<void> {
    this.logger.log('Starting automatic index optimization...')

    try {
      const analysis = await this.analyzeIndexEffectiveness()

      // Log recommendations
      analysis.recommendations.forEach((rec) => {
        this.logger.warn(`Index Recommendation: ${rec}`)
      })

      // Auto-drop truly unused indexes (be careful with this in production!)
      if (process.env.AUTO_DROP_UNUSED_INDEXES === 'true') {
        for (const unusedIndex of analysis.unusedIndexes.slice(0, 5)) {
          // Limit to 5 at a time
          await this.prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS "${unusedIndex.indexname}"`)
          this.logger.log(`Dropped unused index: ${unusedIndex.indexname}`)
        }
      }
    } catch (error) {
      this.logger.error('Index optimization failed:', error)
    }
  }
}
```

## ⚠️ Các vấn đề thường gặp

### 1. Over-Indexing Problem

**Problem:** Tạo quá nhiều indexes không cần thiết làm chậm INSERT/UPDATE

```sql
-- ❌ Problematic: Too many redundant indexes
CREATE INDEX idx_users_email ON "User"(email);
CREATE INDEX idx_users_email_active ON "User"(email, "isActive");
CREATE INDEX idx_users_email_first_name ON "User"(email, "firstName");
-- Email column is redundantly indexed!

-- ✅ Solution: Use composite indexes strategically
CREATE INDEX idx_users_email_active_name ON "User"(email, "isActive", "firstName");
-- One composite index can serve multiple query patterns
```

```typescript
// ❌ Bad: Creating index for every possible query
@@index([email])
@@index([email, isActive])
@@index([email, firstName])
@@index([email, lastName])
@@index([email, isActive, firstName])

// ✅ Good: Strategic composite indexes
@@index([email, isActive, firstName, lastName]) // Covers most queries
@@index([isActive, createdAt]) // For filtering + sorting
```

### 2. Wrong Index Column Order

**Problem:** Column order trong composite index rất quan trọng

```typescript
// ❌ Wrong order - Index not used effectively
@@index([isActive, userId, createdAt]) // isActive có low selectivity

// Query: WHERE userId = '123' AND isActive = true
// Index không được sử dụng hiệu quả vì userId không ở đầu

// ✅ Correct order - High selectivity columns first
@@index([userId, isActive, createdAt]) // userId có high selectivity

// Query patterns supported:
// WHERE userId = '123'
// WHERE userId = '123' AND isActive = true
// WHERE userId = '123' AND isActive = true AND createdAt > '2024-01-01'
```

### 3. Ineffective Partial Indexes

**Problem:** Partial index conditions không match với query patterns

```sql
-- ❌ Problematic: Condition too restrictive
CREATE INDEX idx_orders_recent
ON "Order"("userId")
WHERE "createdAt" >= '2024-01-01'; -- Hard-coded date!

-- Query sẽ không sử dụng index nếu filter khác ngày
SELECT * FROM "Order"
WHERE "userId" = '123'
AND "createdAt" >= '2024-06-01'; -- Different date, index not used

-- ✅ Better: Use relative conditions
CREATE INDEX idx_orders_recent
ON "Order"("userId", "createdAt")
WHERE "createdAt" >= NOW() - INTERVAL '90 days';

-- ✅ Or create function-based partial index
CREATE INDEX idx_orders_recent_dynamic
ON "Order"("userId", "createdAt")
WHERE "createdAt" >= date_trunc('month', NOW() - INTERVAL '3 months');
```

## 🔧 Advanced Patterns

### 1. Multi-Column Partial Indexes

```typescript
// Complex partial indexing strategy
interface AdvancedIndexConfig {
  name: string
  table: string
  columns: string[]
  condition: string
  description: string
}

@Injectable()
export class AdvancedIndexingService {
  private readonly advancedIndexes: AdvancedIndexConfig[] = [
    {
      name: 'idx_posts_published_recent',
      table: 'Post',
      columns: ['categoryId', 'publishedAt', 'viewCount'],
      condition: 'published = true AND "publishedAt" >= NOW() - INTERVAL \'30 days\'',
      description: 'Optimize recent published posts queries',
    },
    {
      name: 'idx_orders_high_value_recent',
      table: 'Order',
      columns: ['userId', 'status', 'total'],
      condition: 'total >= 100 AND "createdAt" >= NOW() - INTERVAL \'1 year\'',
      description: 'Track high-value customer orders',
    },
    {
      name: 'idx_users_premium_active',
      table: 'User',
      columns: ['email', 'createdAt'],
      condition: '"isActive" = true AND "subscriptionTier" = \'PREMIUM\'',
      description: 'Quick access to premium active users',
    },
  ]

  async createAdvancedPartialIndexes(): Promise<void> {
    for (const config of this.advancedIndexes) {
      await this.createPartialIndex(config)
    }
  }

  private async createPartialIndex(config: AdvancedIndexConfig): Promise<void> {
    const columns = config.columns.map((col) => `"${col}"`).join(', ')

    const sql = `
      CREATE INDEX IF NOT EXISTS ${config.name}
      ON "${config.table}" (${columns})
      WHERE ${config.condition}
    `

    try {
      await this.prisma.$executeRawUnsafe(sql)
      console.log(`✅ Created partial index: ${config.name} - ${config.description}`)
    } catch (error) {
      console.error(`❌ Failed to create ${config.name}:`, error)
    }
  }
}
```

### 2. Expression-Based Indexes

```typescript
// Function-based và expression indexes
@Injectable()
export class ExpressionIndexService {
  async createExpressionIndexes(): Promise<void> {
    const expressionIndexes = [
      // Case-insensitive search
      {
        name: 'idx_users_email_lower',
        sql: `CREATE INDEX IF NOT EXISTS idx_users_email_lower 
              ON "User"(LOWER(email))
              WHERE "isActive" = true`,
      },

      // Full name search
      {
        name: 'idx_users_full_name',
        sql: `CREATE INDEX IF NOT EXISTS idx_users_full_name 
              ON "User"(("firstName" || ' ' || "lastName"))
              WHERE "isActive" = true`,
      },

      // Date part indexing
      {
        name: 'idx_orders_year_month',
        sql: `CREATE INDEX IF NOT EXISTS idx_orders_year_month 
              ON "Order"(EXTRACT(YEAR FROM "createdAt"), EXTRACT(MONTH FROM "createdAt"))
              WHERE status IN ('DELIVERED', 'SHIPPED')`,
      },

      // JSON field indexing (if using JSON columns)
      {
        name: 'idx_users_preferences_gin',
        sql: `CREATE INDEX IF NOT EXISTS idx_users_preferences_gin 
              ON "User" USING gin(preferences)
              WHERE preferences IS NOT NULL`,
      },
    ]

    for (const index of expressionIndexes) {
      try {
        await this.prisma.$executeRawUnsafe(index.sql)
        console.log(`✅ Created expression index: ${index.name}`)
      } catch (error) {
        console.error(`❌ Failed to create ${index.name}:`, error)
      }
    }
  }

  // Query functions that leverage expression indexes
  async searchUsersByFullName(fullName: string): Promise<any[]> {
    // Leverages idx_users_full_name expression index
    return this.prisma.$queryRaw`
      SELECT id, "firstName", "lastName", email
      FROM "User"
      WHERE ("firstName" || ' ' || "lastName") ILIKE ${'%' + fullName + '%'}
      AND "isActive" = true
      ORDER BY "createdAt" DESC
      LIMIT 20
    `
  }

  async searchUsersByEmailIgnoreCase(emailPattern: string): Promise<any[]> {
    // Leverages idx_users_email_lower expression index
    return this.prisma.$queryRaw`
      SELECT id, email, "firstName", "lastName"
      FROM "User"
      WHERE LOWER(email) LIKE LOWER(${emailPattern + '%'})
      AND "isActive" = true
      LIMIT 10
    `
  }

  async getOrdersByYearMonth(year: number, month: number): Promise<any[]> {
    // Leverages idx_orders_year_month expression index
    return this.prisma.$queryRaw`
      SELECT 
        id,
        "userId",
        total,
        status,
        "createdAt"
      FROM "Order"
      WHERE EXTRACT(YEAR FROM "createdAt") = ${year}
      AND EXTRACT(MONTH FROM "createdAt") = ${month}
      AND status IN ('DELIVERED', 'SHIPPED')
      ORDER BY "createdAt" DESC
    `
  }
}
```

### 3. Conditional Index Management

```typescript
// Dynamic index creation based on application metrics
@Injectable()
export class ConditionalIndexService {
  constructor(
    private prisma: PrismaService,
    private metricsService: MetricsService,
  ) {}

  @Cron('0 3 * * *') // Daily at 3 AM
  async evaluateAndCreateConditionalIndexes(): Promise<void> {
    const queryMetrics = await this.metricsService.getQueryMetrics()

    // Analyze slow queries
    const slowQueries = queryMetrics.filter((q) => q.avgTime > 1000) // > 1 second

    for (const query of slowQueries) {
      await this.createIndexForSlowQuery(query)
    }

    // Analyze table scan patterns
    const tableScanMetrics = await this.getTableScanMetrics()

    for (const metric of tableScanMetrics) {
      if (metric.seqScan > metric.idxScan * 10) {
        // 10x more seq scans than index scans
        await this.suggestIndexForTable(metric.tableName)
      }
    }
  }

  private async createIndexForSlowQuery(queryMetric: any): Promise<void> {
    const indexSuggestion = this.analyzeQueryForIndexing(queryMetric.query)

    if (indexSuggestion) {
      const indexName = `idx_auto_${Date.now()}`

      try {
        await this.prisma.$executeRawUnsafe(`
          CREATE INDEX CONCURRENTLY IF NOT EXISTS ${indexName}
          ON "${indexSuggestion.table}" (${indexSuggestion.columns.join(', ')})
          ${indexSuggestion.condition ? `WHERE ${indexSuggestion.condition}` : ''}
        `)

        console.log(`✅ Auto-created index ${indexName} for slow query optimization`)

        // Schedule evaluation of index effectiveness
        setTimeout(
          () => {
            this.evaluateAutoCreatedIndex(indexName)
          },
          24 * 60 * 60 * 1000,
        ) // Check after 24 hours
      } catch (error) {
        console.error(`❌ Failed to auto-create index:`, error)
      }
    }
  }

  private async evaluateAutoCreatedIndex(indexName: string): Promise<void> {
    const usage = await this.prisma.$queryRaw`
      SELECT idx_scan, idx_tup_read, idx_tup_fetch
      FROM pg_stat_user_indexes 
      WHERE indexname = ${indexName}
    `

    if (usage && usage[0]?.idx_scan < 10) {
      // Less than 10 scans in 24 hours
      console.warn(`⚠️ Auto-created index ${indexName} has low usage, consider dropping`)

      // Auto-drop if zero usage (be careful in production!)
      if (process.env.AUTO_DROP_INEFFECTIVE_INDEXES === 'true' && usage[0]?.idx_scan === 0) {
        await this.prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS ${indexName}`)
        console.log(`🗑️ Auto-dropped ineffective index ${indexName}`)
      }
    }
  }

  private analyzeQueryForIndexing(query: string): any {
    // Simple pattern matching for index suggestions
    // In production, you'd want more sophisticated query analysis

    const whereMatch = query.match(/WHERE\s+(.+?)(?:\s+ORDER|\s+GROUP|\s+LIMIT|$)/i)
    if (!whereMatch) return null

    const tableMatch = query.match(/FROM\s+"?(\w+)"?/i)
    if (!tableMatch) return null

    const tableName = tableMatch[1]
    const whereClause = whereMatch[1]

    // Extract column references
    const columnMatches = whereClause.match(/"?(\w+)"?\s*[=<>]/g)
    if (!columnMatches) return null

    const columns = columnMatches.map((match) => match.replace(/[=<>]/g, '').replace(/"/g, '').trim())

    return {
      table: tableName,
      columns,
      condition: this.extractPartialIndexCondition(whereClause),
    }
  }

  private extractPartialIndexCondition(whereClause: string): string | null {
    // Look for common patterns that benefit from partial indexes
    if (whereClause.includes('isActive = true')) {
      return '"isActive" = true'
    }
    if (whereClause.includes('published = true')) {
      return 'published = true'
    }
    if (whereClause.includes('deletedAt IS NULL')) {
      return '"deletedAt" IS NULL'
    }

    return null
  }

  private async getTableScanMetrics(): Promise<any[]> {
    return this.prisma.$queryRaw`
      SELECT 
        schemaname,
        tablename,
        seq_scan,
        seq_tup_read,
        idx_scan,
        idx_tup_fetch
      FROM pg_stat_user_tables
      WHERE seq_scan > 1000 -- Tables with significant sequential scans
      ORDER BY seq_scan DESC
    `
  }
}
```

## 📝 Best Practices

### DO's ✅

1. **Create indexes based on actual query patterns**

```typescript
// Good - Analyze queries first, then create indexes
const commonQueries = [
  'SELECT * FROM "User" WHERE email = ? AND isActive = true',
  'SELECT * FROM "Post" WHERE authorId = ? AND published = true ORDER BY createdAt DESC',
  'SELECT * FROM "Order" WHERE userId = ? AND status IN (?, ?) ORDER BY createdAt DESC'
];

// Create indexes that support these patterns
@@index([email, isActive])
@@index([authorId, published, createdAt])
@@index([userId, status, createdAt])
```

2. **Use partial indexes cho filtered queries**

```sql
-- Good - Partial indexes for common filters
CREATE INDEX idx_posts_published
ON "Post"(categoryId, createdAt)
WHERE published = true AND deletedAt IS NULL;

CREATE INDEX idx_users_active
ON "User"(email, createdAt)
WHERE isActive = true;
```

3. **Order columns by selectivity trong composite indexes**

```typescript
// Good - High selectivity columns first
@@index([userId, status, createdAt]) // userId is highly selective
@@index([email, isActive]) // email is more selective than isActive

// Bad - Low selectivity first
@@index([isActive, userId]) // isActive has only 2 values (true/false)
```

4. **Monitor index usage regularly**

```typescript
// Good - Regular monitoring
@Cron('0 6 * * 1') // Weekly Monday 6 AM
async weeklyIndexReport() {
  const unusedIndexes = await this.findUnusedIndexes();
  const slowQueries = await this.getSlowQueries();

  // Send report to development team
  await this.sendIndexReport({ unusedIndexes, slowQueries });
}
```

### DON'T's ❌

1. **Đừng tạo index cho mọi column**

```typescript
// Bad - Over-indexing
@@index([id])        // Primary key already indexed
@@index([createdAt]) // Every timestamp doesn't need index
@@index([isActive])  // Low selectivity boolean
@@index([notes])     // Large text fields

// Good - Strategic indexing
@@index([userId, status]) // Composite for common query pattern
@@index([email]) where isActive = true // Partial index
```

2. **Đừng ignore index maintenance cost**

```typescript
// Bad - Too many indexes slow down writes
model Post {
  // 10+ indexes = slow INSERT/UPDATE operations
  @@index([authorId])
  @@index([categoryId])
  @@index([published])
  @@index([createdAt])
  @@index([updatedAt])
  @@index([viewCount])
  @@index([authorId, published])
  @@index([categoryId, published])
  @@index([published, createdAt])
  @@index([authorId, createdAt])
}

// Good - Consolidated strategic indexes
model Post {
  @@index([authorId, published, createdAt]) // Covers multiple query patterns
  @@index([categoryId, published, viewCount]) // For category + sorting
}
```

3. **Đừng sử dụng function-based indexes cho simple equality**

```sql
-- Bad - Unnecessary complexity
CREATE INDEX idx_users_upper_email ON "User"(UPPER(email));
-- Then query: WHERE UPPER(email) = UPPER(?)

-- Good - Simple case-insensitive comparison
CREATE INDEX idx_users_email ON "User"(email);
-- Then query: WHERE email ILIKE ?
```

## 🚨 Common Pitfalls

### 1. Index Bloat

```typescript
// ❌ Pitfall: Indexes become bloated over time
// No maintenance → degraded performance

// ✅ Solution: Regular index maintenance
@Injectable()
export class IndexMaintenanceService {
  @Cron('0 2 * * 0') // Weekly maintenance
  async performIndexMaintenance(): Promise<void> {
    // Reindex heavily used indexes
    const heavyUsageIndexes = await this.getHeavyUsageIndexes()

    for (const index of heavyUsageIndexes) {
      await this.prisma.$executeRawUnsafe(`REINDEX INDEX CONCURRENTLY ${index.name}`)
    }

    // Update table statistics
    await this.prisma.$executeRaw`ANALYZE`

    console.log('Index maintenance completed')
  }

  private async getHeavyUsageIndexes(): Promise<any[]> {
    return this.prisma.$queryRaw`
      SELECT indexname as name
      FROM pg_stat_user_indexes 
      WHERE idx_scan > 10000 -- Heavy usage threshold
      ORDER BY idx_scan DESC
    `
  }
}
```

### 2. Covering Index Misuse

```typescript
// ❌ Pitfall: Trying to create "covering indexes" for everything
@@index([userId, status, total, createdAt, updatedAt, notes]) // Too wide!

// ✅ Solution: Targeted covering indexes
@@index([userId, status, createdAt]) // Include only necessary columns

// Use SELECT specific columns instead of SELECT *
async getUserOrders(userId: string) {
  return this.prisma.order.findMany({
    where: { userId },
    select: { // Only select what you need
      id: true,
      status: true,
      total: true,
      createdAt: true
    }
  });
}
```

### 3. Development vs Production Index Strategy

```typescript
// ❌ Pitfall: Same indexing strategy for all environments

// ✅ Solution: Environment-specific index strategy
@Injectable()
export class EnvironmentIndexService {
  constructor() {}

  async setupEnvironmentSpecificIndexes(): Promise<void> {
    if (process.env.NODE_ENV === 'development') {
      // Minimal indexes for faster schema changes
      await this.createDevelopmentIndexes()
    } else if (process.env.NODE_ENV === 'staging') {
      // Production-like indexes for testing
      await this.createStagingIndexes()
    } else if (process.env.NODE_ENV === 'production') {
      // Full optimization indexes
      await this.createProductionIndexes()
    }
  }

  private async createDevelopmentIndexes(): Promise<void> {
    // Only essential indexes
    const essentialIndexes = [
      'CREATE INDEX IF NOT EXISTS idx_dev_users_email ON "User"(email)',
      'CREATE INDEX IF NOT EXISTS idx_dev_posts_author ON "Post"("authorId")',
    ]

    for (const sql of essentialIndexes) {
      await this.prisma.$executeRawUnsafe(sql)
    }
  }

  private async createProductionIndexes(): Promise<void> {
    // Full optimization suite
    await this.createAdvancedPartialIndexes()
    await this.createExpressionIndexes()
    await this.createCoveringIndexes()
  }
}
```

## 🔗 Integration với Other Components

### 1. Integration với Query Optimization

```typescript
// src/shared/interceptors/query-optimization.interceptor.ts
@Injectable()
export class QueryOptimizationInterceptor implements NestInterceptor {
  constructor(
    private indexService: DynamicIndexService,
    private metricsService: MetricsService,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
    const request = context.switchToHttp().getRequest()
    const startTime = Date.now()

    return next.handle().pipe(
      tap(async () => {
        const duration = Date.now() - startTime

        // Log slow requests for index analysis
        if (duration > 1000) {
          // > 1 second
          await this.metricsService.logSlowQuery({
            url: request.url,
            method: request.method,
            duration,
            query: request.query,
            params: request.params,
          })

          // Suggest index improvements
          const suggestion = await this.indexService.analyzeEndpointForIndexing(request.url, request.query)

          if (suggestion) {
            console.warn(`🐌 Slow query detected: ${request.url} (${duration}ms)`)
            console.warn(`💡 Index suggestion: ${suggestion}`)
          }
        }
      }),
    )
  }
}
```

### 2. Integration với Database Migration

```typescript
// src/shared/migrations/index-migration.service.ts
@Injectable()
export class IndexMigrationService {
  private readonly migrations = [
    {
      version: '2024_01_15_create_basic_indexes',
      up: async () => {
        await this.createBasicIndexes()
      },
      down: async () => {
        await this.dropBasicIndexes()
      },
    },
    {
      version: '2024_02_01_create_partial_indexes',
      up: async () => {
        await this.createPartialIndexes()
      },
      down: async () => {
        await this.dropPartialIndexes()
      },
    },
  ]

  async runMigrations(): Promise<void> {
    for (const migration of this.migrations) {
      const applied = await this.isMigrationApplied(migration.version)

      if (!applied) {
        console.log(`Running migration: ${migration.version}`)
        await migration.up()
        await this.markMigrationAsApplied(migration.version)
      }
    }
  }

  private async createBasicIndexes(): Promise<void> {
    const indexes = [
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_email_active ON "User"(email) WHERE "isActive" = true',
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_posts_author_published ON "Post"("authorId", published)',
      'CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_orders_user_status ON "Order"("userId", status)',
    ]

    for (const sql of indexes) {
      await this.prisma.$executeRawUnsafe(sql)
    }
  }

  private async isMigrationApplied(version: string): Promise<boolean> {
    const result = await this.prisma.$queryRaw`
      SELECT 1 FROM index_migrations WHERE version = ${version}
    `
    return Array.isArray(result) && result.length > 0
  }

  private async markMigrationAsApplied(version: string): Promise<void> {
    await this.prisma.$executeRaw`
      INSERT INTO index_migrations (version, applied_at) 
      VALUES (${version}, NOW())
    `
  }
}
```

### 3. Integration với Performance Monitoring

```typescript
// src/shared/services/performance-monitor.service.ts
@Injectable()
export class PerformanceMonitorService {
  constructor(
    private indexMonitorService: IndexMonitorService,
    private notificationService: NotificationService,
  ) {}

  @Cron('*/15 * * * *') // Every 15 minutes
  async monitorDatabasePerformance(): Promise<void> {
    const metrics = await this.collectPerformanceMetrics()

    // Check for performance issues
    const issues = this.analyzePerformanceMetrics(metrics)

    if (issues.length > 0) {
      await this.handlePerformanceIssues(issues)
    }
  }

  private async collectPerformanceMetrics(): Promise<any> {
    const [slowQueries, indexUsage, tableScanRatio, cacheHitRatio] = await Promise.all([
      this.indexMonitorService.getSlowQueries(5),
      this.indexMonitorService.getIndexUsageStats(),
      this.getTableScanRatio(),
      this.getCacheHitRatio(),
    ])

    return {
      slowQueries,
      indexUsage,
      tableScanRatio,
      cacheHitRatio,
      timestamp: new Date(),
    }
  }

  private analyzePerformanceMetrics(metrics: any): string[] {
    const issues: string[] = []

    // Check slow queries
    if (metrics.slowQueries.length > 0) {
      issues.push(`${metrics.slowQueries.length} slow queries detected`)
    }

    // Check table scan ratio
    if (metrics.tableScanRatio > 0.1) {
      // >10% sequential scans
      issues.push(`High table scan ratio: ${(metrics.tableScanRatio * 100).toFixed(1)}%`)
    }

    // Check cache hit ratio
    if (metrics.cacheHitRatio < 0.95) {
      // <95% cache hits
      issues.push(`Low cache hit ratio: ${(metrics.cacheHitRatio * 100).toFixed(1)}%`)
    }

    // Check for unused indexes
    const unusedIndexes = metrics.indexUsage.filter((idx) => idx.idx_scan === 0)
    if (unusedIndexes.length > 5) {
      issues.push(`${unusedIndexes.length} unused indexes consuming storage`)
    }

    return issues
  }

  private async handlePerformanceIssues(issues: string[]): Promise<void> {
    const criticalIssues = issues.filter((issue) => issue.includes('slow queries') || issue.includes('cache hit ratio'))

    if (criticalIssues.length > 0) {
      // Send alert to development team
      await this.notificationService.sendAlert({
        title: 'Database Performance Alert',
        message: `Critical database performance issues detected:\n${criticalIssues.join('\n')}`,
        severity: 'high',
      })

      // Auto-suggest index improvements
      const indexSuggestions = await this.generateIndexSuggestions()
      if (indexSuggestions.length > 0) {
        await this.notificationService.sendNotification({
          title: 'Index Optimization Suggestions',
          message: indexSuggestions.join('\n'),
          type: 'improvement',
        })
      }
    }
  }

  private async generateIndexSuggestions(): Promise<string[]> {
    // Analyze current performance bottlenecks and suggest indexes
    const suggestions: string[] = []

    const slowQueries = await this.indexMonitorService.getSlowQueries(10)

    for (const query of slowQueries) {
      const suggestion = this.analyzQueryForIndex(query.query)
      if (suggestion) {
        suggestions.push(suggestion)
      }
    }

    return suggestions.slice(0, 5) // Top 5 suggestions
  }
}
```

## 📋 Tóm tắt

### Key Takeaways

1. **Performance Impact**: Proper indexing có thể cải thiện query performance từ O(n) xuống O(log n)
2. **Strategic Approach**: Tạo indexes dựa trên actual query patterns, không phải assumptions
3. **Partial Indexes**: Sử dụng cho filtered queries để tiết kiệm storage và tăng performance
4. **Monitoring**: Regular monitoring index usage để optimize và cleanup

### When to Use Indexing

✅ **Sử dụng indexes cho:**

- WHERE clause columns với high selectivity
- JOIN columns (foreign keys)
- ORDER BY columns cho sorting
- Frequently queried combinations (composite indexes)
- Filtered queries (partial indexes)

❌ **Tránh indexing:**

- Columns với low selectivity (boolean với equal distribution)
- Large text fields (trừ khi cần full-text search)
- Tables với heavy write operations và ít read
- Temporary hoặc staging tables

### Index Types & Use Cases

```typescript
const INDEX_TYPES = {
  // Basic indexes
  single: 'CREATE INDEX ON table(column)', // Single column
  composite: 'CREATE INDEX ON table(col1, col2)', // Multiple columns
  unique: 'CREATE UNIQUE INDEX ON table(column)', // Uniqueness constraint

  // Advanced indexes
  partial: 'CREATE INDEX ON table(column) WHERE condition', // Filtered subset
  expression: 'CREATE INDEX ON table(LOWER(column))', // Function-based
  covering: 'CREATE INDEX ON table(col1) INCLUDE (col2, col3)', // Include extra columns

  // Specialized indexes
  gin: 'CREATE INDEX USING gin ON table(jsonb_column)', // JSONB, arrays, full-text
  gist: 'CREATE INDEX USING gist ON table(geometry_column)', // Geometric data
  hash: 'CREATE INDEX USING hash ON table(column)', // Equality only
}
```

### Performance Guidelines

```typescript
const PERFORMANCE_THRESHOLDS = {
  queryTime: {
    excellent: 10, // < 10ms
    good: 100, // < 100ms
    acceptable: 1000, // < 1 second
    slow: 5000, // < 5 seconds
    critical: 10000, // > 10 seconds - needs immediate attention
  },

  indexEfficiency: {
    highUsage: 10000, // > 10K scans = very useful
    mediumUsage: 1000, // > 1K scans = useful
    lowUsage: 100, // > 100 scans = questionable
    unused: 0, // 0 scans = consider dropping
  },

  tableScanRatio: {
    excellent: 0.05, // < 5% sequential scans
    good: 0.1, // < 10% sequential scans
    problematic: 0.2, // > 20% sequential scans
    critical: 0.5, // > 50% sequential scans
  },
}
```

### Index Maintenance Schedule

```typescript
// Recommended maintenance schedule
const MAINTENANCE_SCHEDULE = {
  daily: ['Monitor slow queries', 'Check index usage stats', 'Alert on performance degradation'],

  weekly: ['Analyze index effectiveness', 'Review query patterns', 'Generate optimization reports'],

  monthly: ['REINDEX heavily used indexes', 'ANALYZE table statistics', 'Review and drop unused indexes'],

  quarterly: [
    'Complete index strategy review',
    'Database performance audit',
    'Plan index optimizations for next quarter',
  ],
}
```

> 💡 **Remember**: Indexing là art và science - requires understanding của data patterns, query workload, và performance requirements. Always measure before và after index changes để validate improvements.
