# 🚀 Redis Caching trong NestJS

## 🔍 Redis Caching là gì?

Redis Caching là kỹ thuật lưu trữ dữ liệu tạm thời trong memory để tăng tốc độ truy cập dữ liệu:

- **Vai trò chính**: Giảm thiểu database queries và cải thiện response time
- **Cách hoạt động**: Store frequently accessed data trong Redis memory
- **Execution order**: Request → Check Cache → Cache Hit/Miss → Return Data/Fetch from DB
- **Lifecycle**: Cache creation → TTL countdown → Expiration → Cache eviction

> 💡 **Tại sao cần Redis Caching?**
> Caching có thể giảm response time từ 500ms xuống còn 5ms (100x faster) và giảm tải database lên đến 90%.

## 🎯 Cách implement Redis Caching

### Basic Implementation

#### 1. Setup Redis Cache Module

```typescript
// src/app.module.ts
import { Module } from '@nestjs/common'
import { CacheModule } from '@nestjs/cache-manager'
import { redisStore } from 'cache-manager-redis-store'

@Module({
  imports: [
    CacheModule.register({
      isGlobal: true,
      store: redisStore,
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT) || 6379,
      password: process.env.REDIS_PASSWORD,
      ttl: 300, // 5 minutes default TTL
      max: 1000, // Maximum number of items in cache
    }),
  ],
})
export class AppModule {}
```

#### 2. Basic Cache Service

```typescript
// src/shared/services/cache.service.ts
import { Injectable, Inject } from '@nestjs/common'
import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { Cache } from 'cache-manager'

@Injectable()
export class CacheService {
  constructor(@Inject(CACHE_MANAGER) private cacheManager: Cache) {}

  // Get data from cache
  async get<T>(key: string): Promise<T | undefined> {
    return await this.cacheManager.get<T>(key)
  }

  // Set data to cache with TTL
  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    await this.cacheManager.set(key, value, ttl)
  }

  // Delete from cache
  async del(key: string): Promise<void> {
    await this.cacheManager.del(key)
  }

  // Reset entire cache
  async reset(): Promise<void> {
    await this.cacheManager.reset()
  }

  // Wrap function with caching logic
  async wrap<T>(key: string, fn: () => Promise<T>, ttl?: number): Promise<T> {
    return await this.cacheManager.wrap(key, fn, ttl)
  }
}
```

### Advanced Implementation

#### 1. Custom Cache Configuration

```typescript
// src/shared/config/cache.config.ts
import { registerAs } from '@nestjs/config'

export default registerAs('cache', () => ({
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: parseInt(process.env.REDIS_PORT, 10) || 6379,
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_CACHE_DB, 10) || 1, // Separate DB for cache
  },
  ttl: {
    default: 300, // 5 minutes
    short: 60, // 1 minute
    medium: 900, // 15 minutes
    long: 3600, // 1 hour
    day: 86400, // 24 hours
  },
  maxItems: 10000,
  compression: process.env.NODE_ENV === 'production',
}))
```

#### 2. Enhanced Cache Service

```typescript
// src/shared/services/enhanced-cache.service.ts
import { Injectable, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { CacheService } from './cache.service'
import { createHash } from 'crypto'

@Injectable()
export class EnhancedCacheService {
  private readonly logger = new Logger(EnhancedCacheService.name)

  constructor(
    private cacheService: CacheService,
    private configService: ConfigService,
  ) {}

  // Generate consistent cache key with namespace
  generateKey(namespace: string, identifier: string | object): string {
    const baseKey = typeof identifier === 'string' ? identifier : this.hashObject(identifier)

    return `${namespace}:${baseKey}`
  }

  // Cache with automatic key generation
  async cacheFunction<T>(
    namespace: string,
    identifier: string | object,
    fn: () => Promise<T>,
    ttl?: number,
  ): Promise<T> {
    const key = this.generateKey(namespace, identifier)

    try {
      return await this.cacheService.wrap(key, fn, ttl)
    } catch (error) {
      this.logger.error(`Cache operation failed for key: ${key}`, error)
      // Fallback to direct function execution
      return await fn()
    }
  }

  // Multi-level caching (L1: Memory, L2: Redis)
  private memoryCache = new Map<string, { data: any; expires: number }>()

  async getWithMemoryFallback<T>(key: string): Promise<T | undefined> {
    // Check L1 cache (memory)
    const memCached = this.memoryCache.get(key)
    if (memCached && memCached.expires > Date.now()) {
      this.logger.debug(`Memory cache hit: ${key}`)
      return memCached.data
    }

    // Check L2 cache (Redis)
    const redisCached = await this.cacheService.get<T>(key)
    if (redisCached) {
      this.logger.debug(`Redis cache hit: ${key}`)
      // Update L1 cache
      this.memoryCache.set(key, {
        data: redisCached,
        expires: Date.now() + 60000, // 1 minute in memory
      })
      return redisCached
    }

    return undefined
  }

  // Batch operations
  async mget<T>(keys: string[]): Promise<(T | undefined)[]> {
    const promises = keys.map((key) => this.cacheService.get<T>(key))
    return Promise.all(promises)
  }

  async mset(keyValuePairs: Array<{ key: string; value: any; ttl?: number }>): Promise<void> {
    const promises = keyValuePairs.map(({ key, value, ttl }) => this.cacheService.set(key, value, ttl))
    await Promise.all(promises)
  }

  // Cache invalidation by pattern
  async invalidatePattern(pattern: string): Promise<void> {
    // Note: This is a simplified version
    // In production, you'd use Redis SCAN with pattern matching
    this.logger.warn(`Pattern invalidation not implemented: ${pattern}`)
  }

  private hashObject(obj: object): string {
    return createHash('md5').update(JSON.stringify(obj)).digest('hex')
  }
}
```

## 💡 Các cách sử dụng thông dụng

### 1. Controller Level Caching

```typescript
// src/products/products.controller.ts
import { Controller, Get, Param, UseInterceptors } from '@nestjs/common'
import { CacheInterceptor, CacheKey, CacheTTL } from '@nestjs/cache-manager'

@Controller('products')
export class ProductsController {
  constructor(
    private productsService: ProductsService,
    private cacheService: EnhancedCacheService,
  ) {}

  // Automatic caching với interceptor
  @Get()
  @UseInterceptors(CacheInterceptor)
  @CacheKey('all-products')
  @CacheTTL(300) // 5 minutes
  async findAll() {
    this.logger.log('Fetching all products from database')
    return this.productsService.findAll()
  }

  // Manual caching với enhanced service
  @Get(':id')
  async findOne(@Param('id') id: string) {
    return this.cacheService.cacheFunction(
      'product',
      id,
      () => this.productsService.findById(id),
      900, // 15 minutes
    )
  }

  // Complex query caching
  @Get('category/:categoryId')
  async findByCategory(
    @Param('categoryId') categoryId: string,
    @Query('sort') sort?: string,
    @Query('limit') limit?: number,
  ) {
    const cacheKey = this.cacheService.generateKey('products-by-category', {
      categoryId,
      sort,
      limit,
    })

    return this.cacheService.cacheFunction(
      'products-by-category',
      { categoryId, sort, limit },
      () => this.productsService.findByCategory(categoryId, { sort, limit }),
      600, // 10 minutes
    )
  }
}
```

**Input/Output Example:**

```bash
# First request - Cache MISS
GET /products/123
→ Database query: SELECT * FROM products WHERE id = 123
→ Response: { id: 123, name: "iPhone", price: 999 }
→ Cached with key "product:123" for 15 minutes

# Second request within 15 minutes - Cache HIT
GET /products/123
→ No database query
→ Response: { id: 123, name: "iPhone", price: 999 } (from cache)
→ Response time: 5ms vs 150ms
```

### 2. Service Level Caching

```typescript
// src/products/products.service.ts
import { Injectable, Logger } from '@nestjs/common'
import { EnhancedCacheService } from '../shared/services/enhanced-cache.service'

@Injectable()
export class ProductsService {
  private readonly logger = new Logger(ProductsService.name)

  constructor(
    private prisma: PrismaService,
    private cacheService: EnhancedCacheService,
  ) {}

  // Cache single entity
  async findById(id: string): Promise<Product> {
    return this.cacheService.cacheFunction(
      'product',
      id,
      async () => {
        this.logger.log(`Fetching product ${id} from database`)
        const product = await this.prisma.product.findUnique({
          where: { id },
          include: { category: true, reviews: true },
        })

        if (!product) {
          throw new NotFoundException(`Product ${id} not found`)
        }

        return product
      },
      3600, // 1 hour
    )
  }

  // Cache collection with filtering
  async findMany(filters: ProductFilters): Promise<Product[]> {
    return this.cacheService.cacheFunction(
      'products-filtered',
      filters,
      async () => {
        this.logger.log('Fetching filtered products from database')
        return this.prisma.product.findMany({
          where: this.buildWhereClause(filters),
          include: { category: true },
          orderBy: { createdAt: 'desc' },
          take: filters.limit || 50,
          skip: filters.offset || 0,
        })
      },
      600, // 10 minutes
    )
  }

  // Cache expensive computations
  async getProductStats(productId: string): Promise<ProductStats> {
    return this.cacheService.cacheFunction(
      'product-stats',
      productId,
      async () => {
        this.logger.log(`Computing stats for product ${productId}`)

        const [reviewCount, avgRating, totalSales] = await Promise.all([
          this.prisma.review.count({ where: { productId } }),
          this.prisma.review.aggregate({
            where: { productId },
            _avg: { rating: true },
          }),
          this.prisma.order.aggregate({
            where: { items: { some: { productId } } },
            _sum: { total: true },
          }),
        ])

        return {
          reviewCount,
          averageRating: avgRating._avg.rating || 0,
          totalSales: totalSales._sum.total || 0,
        }
      },
      1800, // 30 minutes
    )
  }

  // Update with cache invalidation
  async updateProduct(id: string, data: UpdateProductDto): Promise<Product> {
    // Update database
    const product = await this.prisma.product.update({
      where: { id },
      data,
      include: { category: true },
    })

    // Invalidate related caches
    await this.invalidateProductCaches(id)

    // Update cache with new data
    const cacheKey = this.cacheService.generateKey('product', id)
    await this.cacheService.set(cacheKey, product, 3600)

    this.logger.log(`Product ${id} updated and cache refreshed`)
    return product
  }

  private async invalidateProductCaches(productId: string): Promise<void> {
    const keysToInvalidate = [
      this.cacheService.generateKey('product', productId),
      this.cacheService.generateKey('product-stats', productId),
      'all-products', // Global product list
    ]

    await Promise.all(keysToInvalidate.map((key) => this.cacheService.del(key)))
  }
}
```

### 3. Repository Pattern với Caching

```typescript
// src/shared/repositories/cached-base.repository.ts
import { Injectable } from '@nestjs/common'
import { EnhancedCacheService } from '../services/enhanced-cache.service'

@Injectable()
export abstract class CachedBaseRepository<T> {
  protected abstract entityName: string
  protected defaultTTL = 3600 // 1 hour

  constructor(protected cacheService: EnhancedCacheService) {}

  // Find with automatic caching
  async findById(id: string): Promise<T | null> {
    return this.cacheService.cacheFunction(this.entityName, id, () => this.fetchById(id), this.defaultTTL)
  }

  // Find many with caching
  async findMany(query: any): Promise<T[]> {
    return this.cacheService.cacheFunction(
      `${this.entityName}-query`,
      query,
      () => this.fetchMany(query),
      this.defaultTTL / 2, // Shorter TTL for queries
    )
  }

  // Update with cache invalidation
  async update(id: string, data: Partial<T>): Promise<T> {
    const result = await this.performUpdate(id, data)

    // Invalidate cache
    await this.cacheService.del(this.cacheService.generateKey(this.entityName, id))

    return result
  }

  // Batch operations
  async findByIds(ids: string[]): Promise<(T | null)[]> {
    const cacheKeys = ids.map((id) => this.cacheService.generateKey(this.entityName, id))

    const cached = await this.cacheService.mget<T>(cacheKeys)
    const missingIndices: number[] = []
    const missingIds: string[] = []

    // Identify cache misses
    cached.forEach((item, index) => {
      if (!item) {
        missingIndices.push(index)
        missingIds.push(ids[index])
      }
    })

    // Fetch missing items
    if (missingIds.length > 0) {
      const fetchedItems = await this.fetchByIds(missingIds)

      // Update cache for missing items
      const cacheUpdates = fetchedItems.map((item, index) => ({
        key: this.cacheService.generateKey(this.entityName, missingIds[index]),
        value: item,
        ttl: this.defaultTTL,
      }))

      await this.cacheService.mset(cacheUpdates)

      // Merge with cached results
      fetchedItems.forEach((item, index) => {
        cached[missingIndices[index]] = item
      })
    }

    return cached
  }

  // Abstract methods to be implemented by subclasses
  protected abstract fetchById(id: string): Promise<T | null>
  protected abstract fetchMany(query: any): Promise<T[]>
  protected abstract fetchByIds(ids: string[]): Promise<T[]>
  protected abstract performUpdate(id: string, data: Partial<T>): Promise<T>
}
```

### 4. Query Result Caching

```typescript
// src/analytics/analytics.service.ts
import { Injectable } from '@nestjs/common'
import { EnhancedCacheService } from '../shared/services/enhanced-cache.service'

@Injectable()
export class AnalyticsService {
  constructor(
    private prisma: PrismaService,
    private cacheService: EnhancedCacheService,
  ) {}

  // Daily report caching
  async getDailyReport(date: string): Promise<DailyReport> {
    return this.cacheService.cacheFunction(
      'daily-report',
      date,
      async () => {
        console.log(`Generating daily report for ${date}`)

        const startDate = new Date(`${date}T00:00:00.000Z`)
        const endDate = new Date(`${date}T23:59:59.999Z`)

        const [orders, revenue, newUsers, pageViews] = await Promise.all([
          this.prisma.order.count({
            where: { createdAt: { gte: startDate, lte: endDate } },
          }),
          this.prisma.order.aggregate({
            where: { createdAt: { gte: startDate, lte: endDate } },
            _sum: { total: true },
          }),
          this.prisma.user.count({
            where: { createdAt: { gte: startDate, lte: endDate } },
          }),
          this.getPageViews(startDate, endDate),
        ])

        return {
          date,
          totalOrders: orders,
          totalRevenue: revenue._sum.total || 0,
          newUsers,
          pageViews,
          generatedAt: new Date(),
        }
      },
      24 * 60 * 60, // Cache for 24 hours
    )
  }

  // Real-time dashboard với short-term caching
  async getDashboardData(): Promise<DashboardData> {
    return this.cacheService.cacheFunction(
      'dashboard',
      'current',
      async () => {
        console.log('Generating dashboard data')

        const now = new Date()
        const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())

        const [todayOrders, onlineUsers, pendingOrders, lowStockProducts] = await Promise.all([
          this.prisma.order.count({
            where: { createdAt: { gte: todayStart } },
          }),
          this.getOnlineUsersCount(),
          this.prisma.order.count({
            where: { status: 'PENDING' },
          }),
          this.prisma.product.count({
            where: { stock: { lte: 10 } },
          }),
        ])

        return {
          todayOrders,
          onlineUsers,
          pendingOrders,
          lowStockProducts,
          lastUpdated: now,
        }
      },
      60, // Cache for 1 minute only
    )
  }

  // Top products với medium-term caching
  async getTopProducts(limit: number = 10): Promise<Product[]> {
    return this.cacheService.cacheFunction(
      'top-products',
      { limit },
      async () => {
        console.log(`Fetching top ${limit} products`)

        return this.prisma.product.findMany({
          include: {
            _count: { select: { orderItems: true } },
            category: true,
          },
          orderBy: { orderItems: { _count: 'desc' } },
          take: limit,
        })
      },
      15 * 60, // Cache for 15 minutes
    )
  }
}
```

## ⚠️ Các vấn đề thường gặp

### 1. Cache Stampede Problem

**Problem:** Nhiều requests cùng lúc gọi expensive operation khi cache expired

```typescript
// ❌ Problematic: Multiple concurrent expensive operations
async getExpensiveData(id: string) {
  const cached = await this.cacheService.get(`expensive:${id}`);
  if (cached) return cached;

  // Multiple requests sẽ cùng execute expensive operation
  const data = await this.expensiveOperation(id);
  await this.cacheService.set(`expensive:${id}`, data, 3600);
  return data;
}

// ✅ Solution: Use distributed locking hoặc semaphore
import { Semaphore } from 'async-mutex';

class CacheService {
  private operationSemaphores = new Map<string, Semaphore>();

  async getExpensiveDataSafe(id: string) {
    const cacheKey = `expensive:${id}`;
    const cached = await this.cacheService.get(cacheKey);
    if (cached) return cached;

    // Ensure only one operation per key
    if (!this.operationSemaphores.has(cacheKey)) {
      this.operationSemaphores.set(cacheKey, new Semaphore(1));
    }

    const semaphore = this.operationSemaphores.get(cacheKey);

    return semaphore.runExclusive(async () => {
      // Double-check after acquiring lock
      const rechecked = await this.cacheService.get(cacheKey);
      if (rechecked) return rechecked;

      const data = await this.expensiveOperation(id);
      await this.cacheService.set(cacheKey, data, 3600);
      return data;
    });
  }
}
```

### 2. Cache Consistency Issues

**Problem:** Stale data sau khi update database

```typescript
// ❌ Problematic: Update database nhưng không invalidate cache
async updateUser(id: string, data: UpdateUserDto) {
  const user = await this.prisma.user.update({ where: { id }, data });
  // Cache vẫn chứa old data!
  return user;
}

// ✅ Solution: Cache invalidation strategy
async updateUser(id: string, data: UpdateUserDto) {
  const user = await this.prisma.user.update({ where: { id }, data });

  // Strategy 1: Invalidate cache
  await this.cacheService.del(`user:${id}`);

  // Strategy 2: Update cache with new data
  await this.cacheService.set(`user:${id}`, user, 3600);

  // Strategy 3: Invalidate related caches
  await this.invalidateUserRelatedCaches(id);

  return user;
}

private async invalidateUserRelatedCaches(userId: string) {
  const keysToInvalidate = [
    `user:${userId}`,
    `user-profile:${userId}`,
    `user-orders:${userId}`,
    'all-users', // Global cache
  ];

  await Promise.all(
    keysToInvalidate.map(key => this.cacheService.del(key))
  );
}
```

### 3. Memory Leak từ Cache

**Problem:** Cache grows indefinitely without proper cleanup

```typescript
// ❌ Problematic: No TTL và unlimited cache growth
await this.cacheService.set('user-session', sessionData) // No TTL!

// ✅ Solution: Always set appropriate TTL
await this.cacheService.set('user-session', sessionData, 24 * 60 * 60) // 24 hours

// ✅ Better: Implement cache cleanup strategy
@Injectable()
export class CacheCleanupService {
  constructor(private cacheService: CacheService) {}

  @Cron('0 */6 * * *') // Every 6 hours
  async cleanupExpiredSessions() {
    // Implementation depends on your Redis setup
    // This is a conceptual example
    const sessionKeys = await this.findKeysByPattern('session:*')

    for (const key of sessionKeys) {
      const ttl = await this.cacheService.getTTL(key)
      if (ttl === -1) {
        // No expiration
        await this.cacheService.del(key)
      }
    }
  }

  @Cron('0 2 * * *') // Daily at 2 AM
  async cleanupOldCacheEntries() {
    // Clean up temp caches older than 1 day
    const tempKeys = await this.findKeysByPattern('temp:*')
    // Implementation...
  }
}
```

## 🔧 Advanced Patterns

### 1. Write-Through Cache Pattern

```typescript
// src/shared/services/write-through-cache.service.ts
import { Injectable } from '@nestjs/common'

@Injectable()
export class WriteThroughCacheService {
  constructor(
    private cacheService: CacheService,
    private prisma: PrismaService,
  ) {}

  // Write-through: Update cả database và cache simultaneously
  async updateUserProfile(userId: string, data: UpdateProfileDto): Promise<User> {
    const cacheKey = `user:${userId}`

    // Start transaction
    return this.prisma.$transaction(async (tx) => {
      // 1. Update database
      const updatedUser = await tx.user.update({
        where: { id: userId },
        data,
        include: { profile: true },
      })

      // 2. Update cache (write-through)
      await this.cacheService.set(cacheKey, updatedUser, 3600)

      // 3. Log for debugging
      console.log(`Write-through completed for user ${userId}`)

      return updatedUser
    })
  }

  // Write-behind: Update cache immediately, database async
  async updateUserPreferences(userId: string, preferences: any): Promise<void> {
    const cacheKey = `user-preferences:${userId}`

    // 1. Update cache immediately
    await this.cacheService.set(cacheKey, preferences, 3600)

    // 2. Schedule database update (async)
    setImmediate(async () => {
      try {
        await this.prisma.user.update({
          where: { id: userId },
          data: { preferences },
        })
        console.log(`Write-behind completed for user ${userId}`)
      } catch (error) {
        console.error(`Write-behind failed for user ${userId}:`, error)
        // Optionally remove from cache on failure
        await this.cacheService.del(cacheKey)
      }
    })
  }
}
```

### 2. Cache Warming Strategy

```typescript
// src/shared/services/cache-warming.service.ts
import { Injectable, OnModuleInit } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'

@Injectable()
export class CacheWarmingService implements OnModuleInit {
  constructor(
    private cacheService: EnhancedCacheService,
    private productsService: ProductsService,
    private usersService: UsersService,
  ) {}

  // Warm cache on application startup
  async onModuleInit() {
    if (process.env.NODE_ENV === 'production') {
      await this.warmEssentialCaches()
    }
  }

  // Scheduled cache warming
  @Cron('0 */4 * * *') // Every 4 hours
  async warmPopularData() {
    console.log('Starting scheduled cache warming...')
    await Promise.all([this.warmPopularProducts(), this.warmFrequentQueries(), this.warmDashboardData()])
    console.log('Cache warming completed')
  }

  private async warmEssentialCaches(): Promise<void> {
    try {
      // Warm most accessed data
      await Promise.all([this.warmPopularProducts(), this.warmCategoriesList(), this.warmAppSettings()])

      console.log('Essential caches warmed successfully')
    } catch (error) {
      console.error('Cache warming failed:', error)
    }
  }

  private async warmPopularProducts(): Promise<void> {
    // Get top 50 products by views/sales
    const popularProducts = await this.productsService.getPopular(50)

    const warmingPromises = popularProducts.map((product) =>
      this.cacheService.cacheFunction(
        'product',
        product.id,
        () => Promise.resolve(product),
        7200, // 2 hours
      ),
    )

    await Promise.all(warmingPromises)
    console.log(`Warmed ${popularProducts.length} popular products`)
  }

  private async warmFrequentQueries(): Promise<void> {
    const frequentQueries = [
      { category: 'electronics', sort: 'popular' },
      { category: 'clothing', sort: 'newest' },
      { priceRange: '0-100', sort: 'price' },
    ]

    const promises = frequentQueries.map((query) =>
      this.cacheService.cacheFunction(
        'products-filtered',
        query,
        () => this.productsService.findMany(query),
        1800, // 30 minutes
      ),
    )

    await Promise.all(promises)
    console.log('Frequent queries warmed')
  }

  private async warmDashboardData(): Promise<void> {
    // Pre-calculate dashboard metrics
    await this.cacheService.cacheFunction(
      'dashboard',
      'current',
      () => this.calculateDashboardMetrics(),
      300, // 5 minutes
    )
  }
}
```

### 3. Multi-Level Caching

```typescript
// src/shared/services/multi-level-cache.service.ts
import { Injectable } from '@nestjs/common'
import { LRUCache } from 'lru-cache'

@Injectable()
export class MultiLevelCacheService {
  // L1: In-memory LRU cache (fastest)
  private l1Cache = new LRUCache<string, any>({
    max: 1000, // Max 1000 items
    ttl: 5 * 60 * 1000, // 5 minutes
  })

  constructor(
    // L2: Redis cache (fast)
    private cacheService: CacheService,
    // L3: Database (slowest)
    private prisma: PrismaService,
  ) {}

  async get<T>(key: string, fetcher?: () => Promise<T>): Promise<T | null> {
    // L1 Check
    if (this.l1Cache.has(key)) {
      console.log(`L1 Cache hit: ${key}`)
      return this.l1Cache.get(key)
    }

    // L2 Check
    const l2Result = await this.cacheService.get<T>(key)
    if (l2Result) {
      console.log(`L2 Cache hit: ${key}`)
      // Promote to L1
      this.l1Cache.set(key, l2Result)
      return l2Result
    }

    // L3 Check (only if fetcher provided)
    if (fetcher) {
      console.log(`Cache miss, fetching: ${key}`)
      const result = await fetcher()

      if (result) {
        // Store in all levels
        this.l1Cache.set(key, result)
        await this.cacheService.set(key, result, 3600) // 1 hour in L2
      }

      return result
    }

    return null
  }

  async set<T>(key: string, value: T, l2TTL: number = 3600): Promise<void> {
    // Set in both levels
    this.l1Cache.set(key, value)
    await this.cacheService.set(key, value, l2TTL)
  }

  async invalidate(key: string): Promise<void> {
    // Remove from all levels
    this.l1Cache.delete(key)
    await this.cacheService.del(key)
  }

  // Get with automatic multi-level handling
  async getUser(userId: string): Promise<User | null> {
    return this.get(`user:${userId}`, async () => {
      return this.prisma.user.findUnique({
        where: { id: userId },
        include: { profile: true },
      })
    })
  }
}
```

## 📝 Best Practices

### DO's ✅

1. **Always set appropriate TTL**

```typescript
// Good - Different TTLs for different data types
await this.cacheService.set('user:session', sessionData, 24 * 60 * 60) // 24h
await this.cacheService.set('product:popular', products, 15 * 60) // 15min
await this.cacheService.set('config:app', settings, 7 * 24 * 60 * 60) // 7 days
```

2. **Use cache namespacing**

```typescript
// Good - Clear namespacing
const CacheKeys = {
  user: (id: string) => `user:${id}`,
  userSessions: (id: string) => `user:sessions:${id}`,
  productsByCategory: (categoryId: string) => `products:category:${categoryId}`,
  dailyStats: (date: string) => `stats:daily:${date}`,
}
```

3. **Implement proper cache invalidation**

```typescript
// Good - Coordinated invalidation
async updateProduct(id: string, data: UpdateProductDto) {
  const product = await this.prisma.product.update({ where: { id }, data });

  // Invalidate all related caches
  await Promise.all([
    this.cacheService.del(`product:${id}`),
    this.cacheService.del(`products:category:${product.categoryId}`),
    this.cacheService.del('products:popular'),
    this.cacheService.del('products:featured')
  ]);

  return product;
}
```

4. **Handle cache failures gracefully**

```typescript
// Good - Fallback mechanism
async getProductWithFallback(id: string): Promise<Product> {
  try {
    return await this.cacheService.getOrSet(
      `product:${id}`,
      () => this.prisma.product.findUnique({ where: { id } }),
      3600
    );
  } catch (cacheError) {
    console.error('Cache error:', cacheError);
    // Fallback to direct database query
    return this.prisma.product.findUnique({ where: { id } });
  }
}
```

### DON'T's ❌

1. **Đừng cache everything**

```typescript
// Bad - Caching rarely accessed data
await this.cacheService.set('user:last_login_ip', ipAddress, 86400)

// Good - Only cache frequently accessed data
if (this.isFrequentlyAccessed(data)) {
  await this.cacheService.set(key, data, ttl)
}
```

2. **Đừng store sensitive data without encryption**

```typescript
// Bad - Plain sensitive data
await this.cacheService.set('user:password', password)

// Good - Encrypted or hashed data only
const hashedPassword = await bcrypt.hash(password, 10)
await this.cacheService.set('user:password_hash', hashedPassword, 3600)
```

3. **Đừng ignore cache size limits**

```typescript
// Bad - No size consideration
await this.cacheService.set('large_dataset', massiveArray)

// Good - Check size before caching
const dataSize = JSON.stringify(data).length
const maxSize = 1024 * 1024 // 1MB

if (dataSize < maxSize) {
  await this.cacheService.set(key, data, ttl)
} else {
  console.warn(`Data too large for cache: ${dataSize} bytes`)
}
```

## 🚨 Common Pitfalls

### 1. Cache Key Collisions

```typescript
// ❌ Pitfall: Ambiguous cache keys
await this.cacheService.set('user_1_profile', profileData) // user_1 or user_11?

// ✅ Solution: Use delimiters và consistent naming
await this.cacheService.set('user:1:profile', profileData)
```

### 2. Thundering Herd Problem

```typescript
// ❌ Pitfall: All caches expire simultaneously
const ttl = 3600 // Same TTL for all
await this.cacheService.set(`product:${id}`, data, ttl)

// ✅ Solution: Add jitter to TTL
const baseTTL = 3600
const jitter = Math.random() * 600 // ±5 minutes
const ttl = baseTTL + jitter
await this.cacheService.set(`product:${id}`, data, ttl)
```

### 3. Stale Data Propagation

```typescript
// ❌ Pitfall: Cascading stale data
async getUserWithOrders(userId: string) {
  const user = await this.cacheService.get(`user:${userId}`);
  const orders = await this.cacheService.get(`orders:user:${userId}`);
  return { user, orders }; // Orders might be stale!
}

// ✅ Solution: Coordinate cache expiration
async getUserWithOrders(userId: string) {
  return this.cacheService.cacheFunction(
    'user-with-orders',
    userId,
    async () => {
      const user = await this.prisma.user.findUnique({ where: { id: userId } });
      const orders = await this.prisma.order.findMany({ where: { userId } });
      return { user, orders };
    },
    1800 // Single TTL for consistent data
  );
}
```

## 🔗 Integration với Other Components

### 1. Integration với Authentication

```typescript
// src/auth/auth.service.ts
import { Injectable } from '@nestjs/common'
import { JwtService } from '@nestjs/jwt'

@Injectable()
export class AuthService {
  constructor(
    private jwtService: JwtService,
    private cacheService: EnhancedCacheService,
    private usersService: UsersService,
  ) {}

  // Cache user sessions
  async createSession(userId: string): Promise<{ accessToken: string; refreshToken: string }> {
    const payload = { sub: userId }
    const accessToken = this.jwtService.sign(payload, { expiresIn: '15m' })
    const refreshToken = this.jwtService.sign(payload, { expiresIn: '7d' })

    // Cache refresh token
    await this.cacheService.set(
      `refresh_token:${refreshToken}`,
      { userId, issuedAt: new Date() },
      7 * 24 * 60 * 60, // 7 days
    )

    // Cache user session info
    await this.cacheService.set(
      `user_session:${userId}`,
      { accessToken, lastActivity: new Date() },
      15 * 60, // 15 minutes
    )

    return { accessToken, refreshToken }
  }

  // Validate token với cache
  async validateToken(token: string): Promise<any> {
    const cacheKey = `token_validation:${token}`

    return this.cacheService.cacheFunction(
      'token-validation',
      token,
      async () => {
        try {
          const payload = this.jwtService.verify(token)

          // Verify user still exists và active
          const user = await this.usersService.findById(payload.sub)
          if (!user || !user.isActive) {
            return null
          }

          return { userId: user.id, email: user.email }
        } catch (error) {
          return null
        }
      },
      5 * 60, // 5 minutes - Short cache for security
    )
  }

  // Logout với cache cleanup
  async logout(userId: string, refreshToken: string): Promise<void> {
    await Promise.all([
      this.cacheService.del(`refresh_token:${refreshToken}`),
      this.cacheService.del(`user_session:${userId}`),
      this.cacheService.del(`token_validation:${refreshToken}`),
    ])
  }
}
```

### 2. Integration với Rate Limiting

```typescript
// src/shared/guards/cached-rate-limit.guard.ts
import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common'

@Injectable()
export class CachedRateLimitGuard implements CanActivate {
  constructor(private cacheService: EnhancedCacheService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest()
    const clientId = this.getClientId(request)

    // Sliding window rate limiting
    const windowSize = 60 // 1 minute
    const maxRequests = 100
    const now = Date.now()
    const windowStart = now - windowSize * 1000

    const requestKey = `rate_limit:${clientId}`

    // Get current request timestamps
    const requests = (await this.cacheService.get<number[]>(requestKey)) || []

    // Filter requests within current window
    const recentRequests = requests.filter((timestamp) => timestamp > windowStart)

    if (recentRequests.length >= maxRequests) {
      return false // Rate limit exceeded
    }

    // Add current request và update cache
    recentRequests.push(now)
    await this.cacheService.set(requestKey, recentRequests, windowSize)

    return true
  }

  private getClientId(request: any): string {
    // Use user ID if authenticated, otherwise IP address
    return request.user?.id || request.ip
  }
}
```

### 3. Integration với Database Queries

```typescript
// src/shared/decorators/cached-query.decorator.ts
import { SetMetadata } from '@nestjs/common'

export interface CachedQueryOptions {
  key?: string
  ttl?: number
  tags?: string[]
}

export const CachedQuery = (options: CachedQueryOptions = {}) => SetMetadata('cachedQuery', options)

// src/shared/interceptors/query-cache.interceptor.ts
import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Observable } from 'rxjs'
import { tap } from 'rxjs/operators'

@Injectable()
export class QueryCacheInterceptor implements NestInterceptor {
  constructor(
    private reflector: Reflector,
    private cacheService: EnhancedCacheService,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
    const cachedQueryOptions = this.reflector.get<CachedQueryOptions>('cachedQuery', context.getHandler())

    if (!cachedQueryOptions) {
      return next.handle()
    }

    const request = context.switchToHttp().getRequest()
    const cacheKey = this.generateCacheKey(request, cachedQueryOptions)

    // Try to get from cache
    const cached = await this.cacheService.get(cacheKey)
    if (cached) {
      return new Observable((observer) => {
        observer.next(cached)
        observer.complete()
      })
    }

    // Execute query và cache result
    return next.handle().pipe(
      tap(async (result) => {
        if (result && result.length !== 0) {
          // Don't cache empty results
          await this.cacheService.set(cacheKey, result, cachedQueryOptions.ttl || 3600)

          // Tag caching for group invalidation
          if (cachedQueryOptions.tags) {
            await this.tagCache(cacheKey, cachedQueryOptions.tags)
          }
        }
      }),
    )
  }

  private generateCacheKey(request: any, options: CachedQueryOptions): string {
    if (options.key) {
      return options.key
    }

    const { method, url, params, query, body } = request
    const keyComponents = [method, url]

    if (Object.keys(params).length > 0) {
      keyComponents.push(`params:${JSON.stringify(params)}`)
    }

    if (Object.keys(query).length > 0) {
      keyComponents.push(`query:${JSON.stringify(query)}`)
    }

    return keyComponents.join(':')
  }

  private async tagCache(cacheKey: string, tags: string[]): Promise<void> {
    // Implementation for tag-based cache invalidation
    for (const tag of tags) {
      const tagKey = `cache_tag:${tag}`
      const taggedKeys = (await this.cacheService.get<string[]>(tagKey)) || []
      taggedKeys.push(cacheKey)
      await this.cacheService.set(tagKey, taggedKeys, 24 * 60 * 60) // 24 hours
    }
  }
}

// Usage example
@Controller('products')
export class ProductsController {
  @Get()
  @CachedQuery({
    ttl: 600,
    tags: ['products', 'catalog'],
  })
  async findAll(@Query() filters: ProductFilters) {
    return this.productsService.findAll(filters)
  }

  @Get(':id')
  @CachedQuery({
    key: 'single-product',
    ttl: 1800,
  })
  async findOne(@Param('id') id: string) {
    return this.productsService.findById(id)
  }
}
```

## 📋 Tóm tắt

### Key Takeaways

1. **Performance Impact**: Redis caching có thể giảm response time từ 500ms xuống 5ms
2. **Memory Management**: Always set TTL và monitor memory usage
3. **Cache Strategy**: Choose appropriate pattern (Cache-aside, Write-through, Write-behind)
4. **Invalidation**: Implement proper cache invalidation để tránh stale data

### When to Use Redis Caching

✅ **Sử dụng cho:**

- Frequently accessed database queries
- Expensive computations (reports, analytics)
- API responses with high traffic
- Session data và user preferences
- Static content (configurations, lookup tables)

❌ **Không cache:**

- Highly dynamic data changes frequently
- Sensitive data without encryption
- Very large objects (>1MB)
- One-time use data

### Cache TTL Guidelines

```typescript
const TTL_GUIDELINES = {
  // Very dynamic data
  realtime: 30, // 30 seconds
  dashboard: 60, // 1 minute

  // Normal dynamic data
  userSessions: 15 * 60, // 15 minutes
  searchResults: 10 * 60, // 10 minutes

  // Semi-static data
  productCatalog: 60 * 60, // 1 hour
  userProfiles: 2 * 60 * 60, // 2 hours

  // Static data
  configurations: 24 * 60 * 60, // 24 hours
  referenceData: 7 * 24 * 60 * 60, // 7 days
}
```

### Performance Monitoring

```typescript
// Monitor cache performance
@Injectable()
export class CacheMetricsService {
  private hits = 0
  private misses = 0

  recordHit(): void {
    this.hits++
  }
  recordMiss(): void {
    this.misses++
  }

  getHitRatio(): number {
    const total = this.hits + this.misses
    return total > 0 ? this.hits / total : 0
  }

  @Cron('*/5 * * * *') // Every 5 minutes
  logMetrics(): void {
    const hitRatio = this.getHitRatio()
    console.log(`Cache hit ratio: ${(hitRatio * 100).toFixed(2)}%`)

    if (hitRatio < 0.7) {
      // Less than 70% hit ratio
      console.warn('Low cache hit ratio detected')
    }
  }
}
```

> 💡 **Remember**: Effective caching strategy requires balancing between performance gains và data consistency. Always measure cache performance và adjust TTL values based on actual usage patterns.
