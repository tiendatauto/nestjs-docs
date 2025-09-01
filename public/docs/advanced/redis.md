# 🔴 Redis trong NestJS

## 🔍 Redis là gì?

Redis (Remote Dictionary Server) là một in-memory data structure store mã nguồn mở, được sử dụng như một database, cache, và message broker. Trong ecosystem NestJS:

- **Vai trò chính**: Cung cấp caching layer hiệu suất cao, session storage, và queue management
- **Cách hoạt động**: Lưu trữ dữ liệu trong RAM để truy cập nhanh chóng
- **Lifecycle**: Khởi tạo khi app start → Kết nối persistent → Xử lý requests → Cleanup khi shutdown

> 💡 **Tại sao Redis quan trọng?**
> Redis có thể cải thiện performance ứng dụng lên đến 100x so với database thông thường cho các operations đọc dữ liệu.

## 🎯 Cách implement Redis

### Basic Implementation

#### 1. Cài đặt dependencies

```bash
npm install redis
npm install @nestjs/cache-manager cache-manager
npm install cache-manager-redis-store
```

#### 2. Configuration trong app.module.ts

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
      ttl: 60 * 60, // 1 hour default TTL
    }),
  ],
})
export class AppModule {}
```

#### 3. Basic Redis Service

```typescript
// src/shared/services/redis.service.ts
import { Injectable, Inject } from '@nestjs/common'
import { CACHE_MANAGER } from '@nestjs/cache-manager'
import { Cache } from 'cache-manager'

@Injectable()
export class RedisService {
  constructor(@Inject(CACHE_MANAGER) private cacheManager: Cache) {}

  // Basic get/set operations
  async get<T>(key: string): Promise<T | null> {
    return await this.cacheManager.get<T>(key)
  }

  async set(key: string, value: any, ttl?: number): Promise<void> {
    await this.cacheManager.set(key, value, ttl)
  }

  async del(key: string): Promise<void> {
    await this.cacheManager.del(key)
  }

  // Advanced operations
  async getOrSet<T>(key: string, factory: () => Promise<T>, ttl: number = 3600): Promise<T> {
    let value = await this.get<T>(key)

    if (value === null) {
      value = await factory()
      await this.set(key, value, ttl)
    }

    return value
  }
}
```

### Advanced Implementation

#### 1. Redis Configuration với Environment

```typescript
// src/shared/config/redis.config.ts
import { registerAs } from '@nestjs/config'

export default registerAs('redis', () => ({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT, 10) || 6379,
  password: process.env.REDIS_PASSWORD,
  db: parseInt(process.env.REDIS_DB, 10) || 0,
  retryDelayOnFailover: 100,
  enableReadyCheck: false,
  maxRetriesPerRequest: null,
  lazyConnect: true,
  // Connection pool settings
  family: 4,
  keepAlive: true,
  connectTimeout: 10000,
  lazyConnect: true,
}))
```

#### 2. Custom Redis Module

```typescript
// src/shared/redis/redis.module.ts
import { Module, Global } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { CacheModule } from '@nestjs/cache-manager'
import { redisStore } from 'cache-manager-redis-store'
import { RedisService } from './redis.service'

@Global()
@Module({
  imports: [
    CacheModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        store: redisStore,
        ...configService.get('redis'),
        ttl: 60 * 60, // 1 hour
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [RedisService],
  exports: [RedisService, CacheModule],
})
export class RedisModule {}
```

## 💡 Các cách sử dụng thông dụng

### 1. Caching API Responses

```typescript
// src/users/users.controller.ts
import { Controller, Get, Param, UseInterceptors } from '@nestjs/common'
import { CacheInterceptor, CacheKey, CacheTTL } from '@nestjs/cache-manager'

@Controller('users')
@UseInterceptors(CacheInterceptor)
export class UsersController {
  constructor(private usersService: UsersService) {}

  @Get()
  @CacheKey('all-users') // Custom cache key
  @CacheTTL(300) // 5 minutes TTL
  async findAll() {
    console.log('Fetching from database...') // Chỉ chạy khi cache miss
    return this.usersService.findAll()
  }

  @Get(':id')
  async findOne(@Param('id') id: string) {
    const cacheKey = `user:${id}`

    return this.redisService.getOrSet(
      cacheKey,
      () => this.usersService.findOne(id),
      600, // 10 minutes
    )
  }
}
```

**Input/Output Example:**

```bash
# First request - Cache MISS
GET /users/123
→ Database query executed
→ Response: { id: 123, name: "John", email: "john@example.com" }
→ Cached with key "user:123"

# Second request - Cache HIT
GET /users/123
→ No database query
→ Response: { id: 123, name: "John", email: "john@example.com" } (from cache)
```

### 2. Session Management

```typescript
// src/auth/session.service.ts
import { Injectable } from '@nestjs/common'
import { RedisService } from '../shared/services/redis.service'

@Injectable()
export class SessionService {
  constructor(private redisService: RedisService) {}

  async createSession(userId: string, sessionData: any): Promise<string> {
    const sessionId = this.generateSessionId()
    const sessionKey = `session:${sessionId}`

    await this.redisService.set(
      sessionKey,
      { userId, ...sessionData, createdAt: new Date() },
      24 * 60 * 60, // 24 hours
    )

    return sessionId
  }

  async getSession(sessionId: string): Promise<any> {
    const sessionKey = `session:${sessionId}`
    return this.redisService.get(sessionKey)
  }

  async destroySession(sessionId: string): Promise<void> {
    const sessionKey = `session:${sessionId}`
    await this.redisService.del(sessionKey)
  }

  private generateSessionId(): string {
    return Math.random().toString(36).substring(2) + Date.now().toString(36)
  }
}
```

### 3. Rate Limiting

```typescript
// src/shared/guards/rate-limit.guard.ts
import { Injectable, CanActivate, ExecutionContext } from '@nestjs/common'
import { RedisService } from '../services/redis.service'

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(private redisService: RedisService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest()
    const ip = request.ip
    const key = `rate_limit:${ip}`

    const current = (await this.redisService.get<number>(key)) || 0
    const limit = 100 // 100 requests per hour

    if (current >= limit) {
      return false
    }

    await this.redisService.set(key, current + 1, 3600) // 1 hour TTL
    return true
  }
}
```

**Usage:**

```typescript
@Controller('api')
@UseGuards(RateLimitGuard)
export class ApiController {
  // Routes được bảo vệ bởi rate limiting
}
```

### 4. Pub/Sub Pattern

```typescript
// src/shared/services/pubsub.service.ts
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common'
import Redis from 'ioredis'

@Injectable()
export class PubSubService implements OnModuleInit, OnModuleDestroy {
  private publisher: Redis
  private subscriber: Redis

  async onModuleInit() {
    this.publisher = new Redis(process.env.REDIS_URL)
    this.subscriber = new Redis(process.env.REDIS_URL)
  }

  async publish(channel: string, message: any): Promise<void> {
    await this.publisher.publish(channel, JSON.stringify(message))
  }

  async subscribe(channel: string, callback: (message: any) => void): Promise<void> {
    await this.subscriber.subscribe(channel)

    this.subscriber.on('message', (receivedChannel, message) => {
      if (receivedChannel === channel) {
        callback(JSON.parse(message))
      }
    })
  }

  async onModuleDestroy() {
    await this.publisher.quit()
    await this.subscriber.quit()
  }
}
```

**Example Usage:**

```typescript
// Publisher
await this.pubSubService.publish('user-updates', {
  userId: 123,
  action: 'profile-updated',
  timestamp: new Date(),
})

// Subscriber
await this.pubSubService.subscribe('user-updates', (message) => {
  console.log('User update received:', message)
  // Process the update...
})
```

## ⚠️ Các vấn đề thường gặp

### 1. Connection Issues

**Problem:** Redis connection timeout hoặc connection refused

```typescript
// ❌ Sai: Không handle connection errors
const redis = new Redis('redis://localhost:6379')

// ✅ Đúng: Handle connection errors properly
const redis = new Redis('redis://localhost:6379', {
  retryDelayOnFailover: 100,
  enableReadyCheck: false,
  maxRetriesPerRequest: 3,
  lazyConnect: true,
})

redis.on('error', (error) => {
  console.error('Redis connection error:', error)
})

redis.on('connect', () => {
  console.log('Redis connected successfully')
})
```

### 2. Memory Leaks

**Problem:** Cache không expire và gây memory leak

```typescript
// ❌ Sai: Không set TTL
await this.redisService.set('user:123', userData) // Lưu forever

// ✅ Đúng: Always set appropriate TTL
await this.redisService.set('user:123', userData, 3600) // 1 hour

// ✅ Hoặc sử dụng default TTL trong config
await this.cacheManager.set('user:123', userData) // Sử dụng default TTL
```

### 3. Serialization Issues

**Problem:** Lưu trữ objects phức tạp

```typescript
// ❌ Sai: Circular references hoặc functions
const complexObject = {
  user: userData,
  callback: () => console.log('test'), // Function không serialize được
  circular: null,
}
complexObject.circular = complexObject // Circular reference

// ✅ Đúng: Clean objects only
const cleanObject = {
  id: userData.id,
  name: userData.name,
  email: userData.email,
  lastLogin: userData.lastLogin.toISOString(), // Convert Date to string
}
```

## 🔧 Advanced Patterns

### 1. Cache-Aside Pattern

```typescript
// src/shared/decorators/cacheable.decorator.ts
import { SetMetadata } from '@nestjs/common'

export const CACHEABLE_KEY = 'cacheable'
export const Cacheable = (options: { key?: string; ttl?: number }) => SetMetadata(CACHEABLE_KEY, options)

// src/shared/interceptors/cache-aside.interceptor.ts
import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Observable } from 'rxjs'
import { tap } from 'rxjs/operators'

@Injectable()
export class CacheAsideInterceptor implements NestInterceptor {
  constructor(
    private reflector: Reflector,
    private redisService: RedisService,
  ) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
    const cacheOptions = this.reflector.get(CACHEABLE_KEY, context.getHandler())

    if (!cacheOptions) {
      return next.handle()
    }

    const request = context.switchToHttp().getRequest()
    const cacheKey = this.generateCacheKey(request, cacheOptions.key)

    // Try to get from cache
    const cachedResult = await this.redisService.get(cacheKey)
    if (cachedResult) {
      return new Observable((observer) => {
        observer.next(cachedResult)
        observer.complete()
      })
    }

    // If not in cache, execute method and cache result
    return next.handle().pipe(
      tap(async (result) => {
        await this.redisService.set(cacheKey, result, cacheOptions.ttl || 3600)
      }),
    )
  }

  private generateCacheKey(request: any, customKey?: string): string {
    if (customKey) return customKey

    const { method, url, body, params, query } = request
    return `${method}:${url}:${JSON.stringify({ params, query, body })}`
  }
}
```

**Usage:**

```typescript
@Get(':id')
@Cacheable({ key: 'user', ttl: 600 })
async findUser(@Param('id') id: string) {
  return this.userService.findById(id);
}
```

### 2. Distributed Lock Pattern

```typescript
// src/shared/services/distributed-lock.service.ts
import { Injectable } from '@nestjs/common'
import { RedisService } from './redis.service'

@Injectable()
export class DistributedLockService {
  constructor(private redisService: RedisService) {}

  async acquireLock(lockKey: string, timeout: number = 10000, identifier?: string): Promise<string | null> {
    const lockId = identifier || Math.random().toString(36)
    const end = Date.now() + timeout

    while (Date.now() < end) {
      const result = await this.redisService.set(
        `lock:${lockKey}`,
        lockId,
        10, // 10 seconds default lock duration
      )

      if (result === 'OK') {
        return lockId
      }

      await this.sleep(1) // Wait 1ms before retry
    }

    return null
  }

  async releaseLock(lockKey: string, identifier: string): Promise<boolean> {
    const currentLock = await this.redisService.get(`lock:${lockKey}`)

    if (currentLock === identifier) {
      await this.redisService.del(`lock:${lockKey}`)
      return true
    }

    return false
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
```

**Usage Example:**

```typescript
async processPayment(paymentId: string) {
  const lockId = await this.lockService.acquireLock(`payment:${paymentId}`);

  if (!lockId) {
    throw new Error('Could not acquire lock for payment processing');
  }

  try {
    // Process payment logic here
    const result = await this.paymentProcessor.process(paymentId);
    return result;
  } finally {
    await this.lockService.releaseLock(`payment:${paymentId}`, lockId);
  }
}
```

### 3. Cache Invalidation Strategy

```typescript
// src/shared/services/cache-invalidation.service.ts
import { Injectable } from '@nestjs/common'
import { RedisService } from './redis.service'

@Injectable()
export class CacheInvalidationService {
  constructor(private redisService: RedisService) {}

  // Tag-based invalidation
  async tagCache(key: string, tags: string[]): Promise<void> {
    for (const tag of tags) {
      const tagKey = `tag:${tag}`
      const taggedKeys = (await this.redisService.get<string[]>(tagKey)) || []
      taggedKeys.push(key)
      await this.redisService.set(tagKey, taggedKeys)
    }
  }

  async invalidateByTag(tag: string): Promise<void> {
    const tagKey = `tag:${tag}`
    const taggedKeys = (await this.redisService.get<string[]>(tagKey)) || []

    // Delete all keys with this tag
    for (const key of taggedKeys) {
      await this.redisService.del(key)
    }

    // Delete the tag itself
    await this.redisService.del(tagKey)
  }

  // Pattern-based invalidation
  async invalidatePattern(pattern: string): Promise<void> {
    // Note: This requires Redis with SCAN support
    // Implementation would use SCAN to find matching keys
    console.log(`Invalidating pattern: ${pattern}`)
    // Implementation details...
  }
}
```

## 📝 Best Practices

### DO's ✅

1. **Always set TTL cho cache entries**

```typescript
// Good
await this.redisService.set('user:123', userData, 3600)
```

2. **Sử dụng namespacing cho keys**

```typescript
// Good
const keys = {
  user: (id: string) => `user:${id}`,
  session: (sessionId: string) => `session:${sessionId}`,
  rateLimit: (ip: string) => `rate_limit:${ip}`,
}
```

3. **Handle connection errors gracefully**

```typescript
// Good
redis.on('error', (error) => {
  logger.error('Redis error:', error)
  // Fallback to database or return cached response
})
```

4. **Sử dụng connection pooling**

```typescript
// Good
const redis = new Redis({
  family: 4,
  keepAlive: true,
  lazyConnect: true,
  retryDelayOnFailover: 100,
})
```

### DON'T's ❌

1. **Đừng store sensitive data without encryption**

```typescript
// Bad
await this.redisService.set('user:password', plainPassword)

// Good
const encryptedPassword = encrypt(plainPassword)
await this.redisService.set('user:encrypted_password', encryptedPassword, 3600)
```

2. **Đừng cache everything**

```typescript
// Bad - Caching data hiếm khi dùng
await this.redisService.set('rarely_used_data', data, 86400)

// Good - Chỉ cache frequently accessed data
if (accessFrequency > threshold) {
  await this.redisService.set('frequently_used_data', data, 3600)
}
```

3. **Đừng ignore memory usage**

```typescript
// Bad - Không limit cache size
await this.redisService.set('large_dataset', hugDataArray)

// Good - Implement size limits
const maxCacheSize = 1000000 // 1MB
if (JSON.stringify(data).length < maxCacheSize) {
  await this.redisService.set('data', data, 3600)
}
```

## 🚨 Common Pitfalls

### 1. Memory Management

```typescript
// ❌ Pitfall: Cache bloat
// Storing too much data without proper cleanup

// ✅ Solution: Implement proper cleanup strategy
export class CacheCleanupService {
  @Cron('0 0 * * *') // Daily cleanup
  async cleanupExpiredKeys() {
    // Implement cleanup logic
    const keysToCheck = await this.redisService.keys('temp:*')

    for (const key of keysToCheck) {
      const ttl = await this.redisService.ttl(key)
      if (ttl === -1) {
        // No expiration set
        await this.redisService.del(key)
      }
    }
  }
}
```

### 2. Security Considerations

```typescript
// ❌ Pitfall: Storing sensitive data
await this.redisService.set('user:token', jwtToken)

// ✅ Solution: Hash sensitive keys
import { createHash } from 'crypto'

const hashKey = (key: string): string => {
  return createHash('sha256').update(key).digest('hex')
}

await this.redisService.set(`user:token:${hashKey(jwtToken)}`, { userId, expiresAt }, 3600)
```

### 3. Race Conditions

```typescript
// ❌ Pitfall: Race condition in counter
async incrementCounter(key: string): Promise<number> {
  const current = await this.redisService.get<number>(key) || 0;
  const newValue = current + 1;
  await this.redisService.set(key, newValue);
  return newValue;
}

// ✅ Solution: Use atomic operations
async incrementCounter(key: string): Promise<number> {
  // Redis INCR is atomic
  return await this.redisService.incr(key);
}
```

## 🔗 Integration với Other Components

### 1. Integration với Database (Cache-Through Pattern)

```typescript
// src/users/users.service.ts
import { Injectable } from '@nestjs/common'
import { RedisService } from '../shared/services/redis.service'
import { PrismaService } from '../shared/services/prisma.service'

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private redisService: RedisService,
  ) {}

  async findById(id: string): Promise<User> {
    const cacheKey = `user:${id}`

    // Try cache first
    let user = await this.redisService.get<User>(cacheKey)

    if (!user) {
      // Cache miss - fetch from database
      user = await this.prisma.user.findUnique({ where: { id } })

      if (user) {
        // Cache the result
        await this.redisService.set(cacheKey, user, 3600)
      }
    }

    return user
  }

  async updateUser(id: string, data: UpdateUserDto): Promise<User> {
    // Update database
    const updatedUser = await this.prisma.user.update({
      where: { id },
      data,
    })

    // Invalidate cache
    const cacheKey = `user:${id}`
    await this.redisService.del(cacheKey)

    // Optionally, update cache with new data
    await this.redisService.set(cacheKey, updatedUser, 3600)

    return updatedUser
  }
}
```

### 2. Integration với WebSocket

```typescript
// src/shared/services/websocket-redis.service.ts
import { Injectable } from '@nestjs/common'
import { PubSubService } from './pubsub.service'

@Injectable()
export class WebSocketRedisService {
  constructor(private pubSubService: PubSubService) {}

  async broadcastToRoom(room: string, event: string, data: any): Promise<void> {
    await this.pubSubService.publish(`room:${room}`, {
      event,
      data,
      timestamp: new Date().toISOString(),
    })
  }

  async subscribeToRoom(room: string, callback: (event: string, data: any) => void): Promise<void> {
    await this.pubSubService.subscribe(`room:${room}`, (message) => {
      callback(message.event, message.data)
    })
  }
}
```

### 3. Integration với Queue System

```typescript
// src/shared/services/queue-redis.service.ts
import { Injectable } from '@nestjs/common'
import { Queue } from 'bull'
import { InjectQueue } from '@nestjs/bull'

@Injectable()
export class QueueRedisService {
  constructor(
    @InjectQueue('email') private emailQueue: Queue,
    private redisService: RedisService,
  ) {}

  async addEmailJob(emailData: any, priority: number = 0): Promise<void> {
    // Store job metadata in Redis for tracking
    const jobId = `email_job_${Date.now()}`

    await this.redisService.set(
      `job:${jobId}`,
      { status: 'pending', createdAt: new Date() },
      24 * 60 * 60, // 24 hours
    )

    // Add job to queue
    await this.emailQueue.add('send-email', emailData, {
      priority,
      jobId,
      attempts: 3,
      backoff: 'exponential',
    })
  }

  async getJobStatus(jobId: string): Promise<any> {
    return this.redisService.get(`job:${jobId}`)
  }
}
```

## 📋 Tóm tắt

### Key Takeaways

1. **Performance**: Redis có thể cải thiện response time lên đến 100x
2. **Scalability**: Horizontal scaling thông qua Redis Cluster
3. **Flexibility**: Hỗ trợ nhiều data structures (strings, hashes, lists, sets, sorted sets)
4. **Reliability**: Built-in persistence và replication options

### When to Use Redis

✅ **Sử dụng khi:**

- Cần caching layer cho frequently accessed data
- Implement session management
- Rate limiting và throttling
- Real-time analytics và counters
- Message queuing và pub/sub
- Distributed locking

❌ **Không nên sử dụng khi:**

- Primary data storage cho critical data
- Complex queries và joins
- ACID transactions requirements
- Large binary data storage

### Performance Tips

```typescript
// 🔥 Hot tip: Pipeline multiple operations
const pipeline = redis.pipeline()
pipeline.set('key1', 'value1')
pipeline.set('key2', 'value2')
pipeline.expire('key1', 3600)
await pipeline.exec()

// 🔥 Hot tip: Use appropriate data structures
// For counters
await redis.incr('page_views')

// For sets
await redis.sadd('user_tags', 'developer', 'javascript', 'nodejs')

// For sorted sets (leaderboards)
await redis.zadd('leaderboard', 100, 'user1', 95, 'user2')
```

> 💡 **Remember**: Redis là một công cụ mạnh mẽ nhưng cần được sử dụng đúng cách. Always monitor memory usage, set appropriate TTLs, và implement proper error handling để đảm bảo application stability.
