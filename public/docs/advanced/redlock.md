# 🔴 Redlock - Distributed Locking trong NestJS

## 📖 Giới thiệu

**Redlock** là một distributed locking algorithm được thiết kế để hoạt động với Redis cluster. Nó giải quyết vấn đề exclusive access trong môi trường distributed system, nơi mà multiple instances của application cần coordinate access đến shared resources.

### 🎯 Nguyên lý hoạt động

```
Timeline: Redlock Distributed Lock Flow

Instance A: |---Acquire Lock(3/5 nodes)---Critical Section---Release Lock---|
Instance B:   |---Try Lock(1/5 nodes)---FAIL❌---Wait---Try Again---|
Instance C:     |---Try Lock(0/5 nodes)---FAIL❌---Wait---|

Redlock requires majority consensus (N/2 + 1) để acquire lock
```

### 🔧 Key Features

- **Distributed Consensus**: Yêu cầu majority của Redis nodes đồng ý
- **Fault Tolerance**: Hoạt động kể cả khi một số Redis nodes fail
- **Time-based Expiration**: Tự động release lock sau TTL
- **Race Condition Prevention**: Atomic operations với Redis

---

## 🚀 Setup & Installation

### 1. Dependencies Installation

```bash
# Install required packages
npm install ioredis redlock
npm install --save-dev @types/ioredis

# Optional: For advanced monitoring
npm install @nestjs/terminus
```

### 2. Redis Configuration

```typescript
// src/config/redis.config.ts
import { ConfigService } from '@nestjs/config'
import { Redis, RedisOptions } from 'ioredis'

export interface RedisClusterConfig {
  nodes: Array<{
    host: string
    port: number
  }>
  options: RedisOptions
}

export const getRedisClusterConfig = (configService: ConfigService): RedisClusterConfig => {
  return {
    nodes: [
      { host: configService.get('REDIS_NODE_1_HOST', 'localhost'), port: 6379 },
      { host: configService.get('REDIS_NODE_2_HOST', 'localhost'), port: 6380 },
      { host: configService.get('REDIS_NODE_3_HOST', 'localhost'), port: 6381 },
      { host: configService.get('REDIS_NODE_4_HOST', 'localhost'), port: 6382 },
      { host: configService.get('REDIS_NODE_5_HOST', 'localhost'), port: 6383 },
    ],
    options: {
      password: configService.get('REDIS_PASSWORD'),
      connectTimeout: 10000,
      commandTimeout: 5000,
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
      lazyConnect: true,
      keepAlive: 30000,
    },
  }
}

// Single Redis instance config (for development)
export const getSingleRedisConfig = (configService: ConfigService): RedisOptions => {
  return {
    host: configService.get('REDIS_HOST', 'localhost'),
    port: configService.get('REDIS_PORT', 6379),
    password: configService.get('REDIS_PASSWORD'),
    db: configService.get('REDIS_DB', 0),
    connectTimeout: 10000,
    commandTimeout: 5000,
    retryDelayOnFailover: 100,
    maxRetriesPerRequest: 3,
    lazyConnect: true,
  }
}
```

### 3. Redlock Module Setup

```typescript
// src/redlock/redlock.module.ts
import { Module, Global } from '@nestjs/common'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { RedlockService } from './redlock.service'
import { RedisConnectionService } from './redis-connection.service'

@Global()
@Module({
  imports: [ConfigModule],
  providers: [
    RedisConnectionService,
    RedlockService,
    {
      provide: 'REDIS_CLUSTER_CONFIG',
      useFactory: (configService: ConfigService) => {
        return getRedisClusterConfig(configService)
      },
      inject: [ConfigService],
    },
  ],
  exports: [RedlockService],
})
export class RedlockModule {}
```

---

## 🔧 Core Implementation

### 1. Redis Connection Service

```typescript
// src/redlock/redis-connection.service.ts
import { Injectable, OnModuleInit, OnModuleDestroy, Logger } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import Redis from 'ioredis'
import { getRedisClusterConfig, getSingleRedisConfig } from '../config/redis.config'

@Injectable()
export class RedisConnectionService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(RedisConnectionService.name)
  private redisInstances: Redis[] = []
  private isClusterMode: boolean

  constructor(private configService: ConfigService) {
    this.isClusterMode = this.configService.get('REDIS_CLUSTER_MODE', 'false') === 'true'
  }

  async onModuleInit() {
    await this.initializeConnections()
  }

  async onModuleDestroy() {
    await this.closeConnections()
  }

  private async initializeConnections() {
    try {
      if (this.isClusterMode) {
        await this.initializeCluster()
      } else {
        await this.initializeSingleInstance()
      }

      this.logger.log(`Initialized ${this.redisInstances.length} Redis connections`)
    } catch (error) {
      this.logger.error('Failed to initialize Redis connections:', error.stack)
      throw error
    }
  }

  private async initializeCluster() {
    const config = getRedisClusterConfig(this.configService)

    // Create separate connection for each node
    for (const node of config.nodes) {
      const redis = new Redis({
        host: node.host,
        port: node.port,
        ...config.options,
      })

      // Test connection
      await redis.ping()
      this.redisInstances.push(redis)

      this.logger.log(`Connected to Redis node: ${node.host}:${node.port}`)
    }
  }

  private async initializeSingleInstance() {
    // For development: simulate cluster with single instance
    const config = getSingleRedisConfig(this.configService)
    const nodeCount = this.configService.get('REDIS_SIMULATED_NODES', 3)

    for (let i = 0; i < nodeCount; i++) {
      const redis = new Redis({
        ...config,
        db: config.db + i, // Use different databases to simulate nodes
      })

      await redis.ping()
      this.redisInstances.push(redis)

      this.logger.log(`Connected to Redis DB ${config.db + i} (simulated node ${i + 1})`)
    }
  }

  getRedisInstances(): Redis[] {
    return this.redisInstances
  }

  getNodeCount(): number {
    return this.redisInstances.length
  }

  getMajorityCount(): number {
    return Math.floor(this.redisInstances.length / 2) + 1
  }

  private async closeConnections() {
    await Promise.all(
      this.redisInstances.map(async (redis, index) => {
        try {
          await redis.disconnect()
          this.logger.log(`Disconnected from Redis node ${index + 1}`)
        } catch (error) {
          this.logger.error(`Error disconnecting from Redis node ${index + 1}:`, error)
        }
      }),
    )

    this.redisInstances = []
  }
}
```

### 2. Core Redlock Service

```typescript
// src/redlock/redlock.service.ts
import { Injectable, Logger } from '@nestjs/common'
import Redis from 'ioredis'
import { RedisConnectionService } from './redis-connection.service'

export interface RedlockOptions {
  ttl: number // Time to live in milliseconds
  retryCount: number // Number of retry attempts
  retryDelay: number // Delay between retries in milliseconds
  retryJitter: number // Jitter range for retry delay
  clockDriftFactor: number // Clock drift compensation factor
}

export interface LockResult {
  success: boolean
  lockId?: string
  ttl?: number
  acquiredAt?: Date
  expiresAt?: Date
  nodesAcquired?: number
  totalNodes?: number
}

export interface Lock {
  resource: string
  lockId: string
  ttl: number
  acquiredAt: Date
  expiresAt: Date
  nodesAcquired: number
  totalNodes: number
}

@Injectable()
export class RedlockService {
  private readonly logger = new Logger(RedlockService.name)
  private readonly activeLocks = new Map<string, Lock>()

  // Lua script cho atomic acquire operation
  private readonly acquireLuaScript = `
    if redis.call("GET", KEYS[1]) == false then
      redis.call("SET", KEYS[1], ARGV[1], "PX", ARGV[2])
      return 1
    else
      return 0
    end
  `

  // Lua script cho atomic release operation
  private readonly releaseLuaScript = `
    if redis.call("GET", KEYS[1]) == ARGV[1] then
      return redis.call("DEL", KEYS[1])
    else
      return 0
    end
  `

  constructor(private redisConnectionService: RedisConnectionService) {}

  // ✅ Acquire distributed lock
  async acquireLock(resource: string, options: Partial<RedlockOptions> = {}): Promise<LockResult> {
    const lockOptions: RedlockOptions = {
      ttl: 10000, // 10 seconds default
      retryCount: 3, // 3 retry attempts
      retryDelay: 200, // 200ms base delay
      retryJitter: 100, // ±100ms jitter
      clockDriftFactor: 0.01, // 1% clock drift compensation
      ...options,
    }

    let attempts = 0

    while (attempts <= lockOptions.retryCount) {
      attempts++

      try {
        const result = await this.attemptAcquire(resource, lockOptions, attempts)

        if (result.success) {
          return result
        }

        // Don't retry after last attempt
        if (attempts > lockOptions.retryCount) {
          break
        }

        // Wait before retry với jitter
        const delay = this.calculateRetryDelay(lockOptions, attempts)
        await this.sleep(delay)
      } catch (error) {
        this.logger.error(`Lock acquisition attempt ${attempts} failed for ${resource}:`, error)

        if (attempts > lockOptions.retryCount) {
          throw error
        }
      }
    }

    return {
      success: false,
      nodesAcquired: 0,
      totalNodes: this.redisConnectionService.getNodeCount(),
    }
  }

  private async attemptAcquire(resource: string, options: RedlockOptions, attemptNumber: number): Promise<LockResult> {
    const lockId = this.generateLockId()
    const redisInstances = this.redisConnectionService.getRedisInstances()
    const startTime = Date.now()

    // Try to acquire lock from all Redis instances
    const acquisitionPromises = redisInstances.map(async (redis, index) => {
      try {
        const result = (await redis.eval(this.acquireLuaScript, 1, resource, lockId, options.ttl.toString())) as number

        return {
          nodeIndex: index,
          success: result === 1,
          redis,
        }
      } catch (error) {
        this.logger.warn(`Failed to acquire lock from node ${index + 1}:`, error.message)
        return {
          nodeIndex: index,
          success: false,
          redis,
        }
      }
    })

    const acquisitionResults = await Promise.all(acquisitionPromises)
    const successfulAcquisitions = acquisitionResults.filter((result) => result.success)
    const elapsedTime = Date.now() - startTime

    // Check if we have majority consensus
    const majorityCount = this.redisConnectionService.getMajorityCount()
    const hasQuorum = successfulAcquisitions.length >= majorityCount

    // Calculate remaining TTL accounting for clock drift
    const clockDrift = Math.round(options.clockDriftFactor * options.ttl) + 2
    const remainingTtl = options.ttl - elapsedTime - clockDrift

    if (hasQuorum && remainingTtl > 0) {
      // Successfully acquired lock
      const lock: Lock = {
        resource,
        lockId,
        ttl: remainingTtl,
        acquiredAt: new Date(startTime),
        expiresAt: new Date(startTime + remainingTtl),
        nodesAcquired: successfulAcquisitions.length,
        totalNodes: redisInstances.length,
      }

      this.activeLocks.set(lockId, lock)

      this.logger.debug(`Lock acquired for ${resource}`, {
        lockId,
        nodesAcquired: successfulAcquisitions.length,
        totalNodes: redisInstances.length,
        remainingTtl,
        attemptNumber,
      })

      return {
        success: true,
        lockId,
        ttl: remainingTtl,
        acquiredAt: lock.acquiredAt,
        expiresAt: lock.expiresAt,
        nodesAcquired: successfulAcquisitions.length,
        totalNodes: redisInstances.length,
      }
    } else {
      // Failed to acquire majority - cleanup partial acquisitions
      await this.cleanupPartialAcquisitions(resource, lockId, successfulAcquisitions)

      this.logger.debug(`Lock acquisition failed for ${resource}`, {
        lockId,
        nodesAcquired: successfulAcquisitions.length,
        majorityRequired: majorityCount,
        remainingTtl,
        elapsedTime,
        attemptNumber,
      })

      return {
        success: false,
        nodesAcquired: successfulAcquisitions.length,
        totalNodes: redisInstances.length,
      }
    }
  }

  // ✅ Release distributed lock
  async releaseLock(lockId: string): Promise<boolean> {
    const lock = this.activeLocks.get(lockId)

    if (!lock) {
      this.logger.warn(`Attempted to release unknown lock: ${lockId}`)
      return false
    }

    try {
      const redisInstances = this.redisConnectionService.getRedisInstances()

      // Release from all nodes
      const releasePromises = redisInstances.map(async (redis, index) => {
        try {
          const result = (await redis.eval(this.releaseLuaScript, 1, lock.resource, lockId)) as number

          return {
            nodeIndex: index,
            success: result === 1,
          }
        } catch (error) {
          this.logger.warn(`Failed to release lock from node ${index + 1}:`, error.message)
          return {
            nodeIndex: index,
            success: false,
          }
        }
      })

      const releaseResults = await Promise.all(releasePromises)
      const successfulReleases = releaseResults.filter((result) => result.success)

      // Remove from active locks
      this.activeLocks.delete(lockId)

      this.logger.debug(`Lock released for ${lock.resource}`, {
        lockId,
        nodesReleased: successfulReleases.length,
        totalNodes: redisInstances.length,
      })

      return successfulReleases.length > 0
    } catch (error) {
      this.logger.error(`Error releasing lock ${lockId}:`, error)
      return false
    }
  }

  // ✅ Extend lock TTL
  async extendLock(lockId: string, additionalTtl: number): Promise<boolean> {
    const lock = this.activeLocks.get(lockId)

    if (!lock) {
      this.logger.warn(`Attempted to extend unknown lock: ${lockId}`)
      return false
    }

    // Check if lock is still valid
    if (lock.expiresAt <= new Date()) {
      this.activeLocks.delete(lockId)
      return false
    }

    const extendScript = `
      if redis.call("GET", KEYS[1]) == ARGV[1] then
        return redis.call("PEXPIRE", KEYS[1], ARGV[2])
      else
        return 0
      end
    `

    try {
      const redisInstances = this.redisConnectionService.getRedisInstances()

      const extendPromises = redisInstances.map(async (redis, index) => {
        try {
          const result = (await redis.eval(extendScript, 1, lock.resource, lockId, additionalTtl.toString())) as number

          return {
            nodeIndex: index,
            success: result === 1,
          }
        } catch (error) {
          this.logger.warn(`Failed to extend lock on node ${index + 1}:`, error.message)
          return {
            nodeIndex: index,
            success: false,
          }
        }
      })

      const extendResults = await Promise.all(extendPromises)
      const successfulExtensions = extendResults.filter((result) => result.success)
      const majorityCount = this.redisConnectionService.getMajorityCount()

      if (successfulExtensions.length >= majorityCount) {
        // Update local lock info
        lock.expiresAt = new Date(Date.now() + additionalTtl)
        lock.ttl = additionalTtl

        this.logger.debug(`Lock extended for ${lock.resource}`, {
          lockId,
          additionalTtl,
          newExpiresAt: lock.expiresAt,
          nodesExtended: successfulExtensions.length,
        })

        return true
      }

      return false
    } catch (error) {
      this.logger.error(`Error extending lock ${lockId}:`, error)
      return false
    }
  }

  // ✅ Check if lock is still valid
  isLockValid(lockId: string): boolean {
    const lock = this.activeLocks.get(lockId)

    if (!lock) {
      return false
    }

    if (lock.expiresAt <= new Date()) {
      this.activeLocks.delete(lockId)
      return false
    }

    return true
  }

  // ✅ Get lock information
  getLockInfo(lockId: string): Lock | null {
    return this.activeLocks.get(lockId) || null
  }

  // ✅ Get all active locks
  getActiveLocks(): Lock[] {
    return Array.from(this.activeLocks.values())
  }

  // Helper methods
  private async cleanupPartialAcquisitions(
    resource: string,
    lockId: string,
    successfulAcquisitions: Array<{ nodeIndex: number; redis: Redis }>,
  ): Promise<void> {
    const cleanupPromises = successfulAcquisitions.map(async ({ redis, nodeIndex }) => {
      try {
        await redis.eval(this.releaseLuaScript, 1, resource, lockId)
      } catch (error) {
        this.logger.warn(`Failed to cleanup partial acquisition on node ${nodeIndex + 1}:`, error.message)
      }
    })

    await Promise.allSettled(cleanupPromises)
  }

  private calculateRetryDelay(options: RedlockOptions, attemptNumber: number): number {
    const baseDelay = options.retryDelay * Math.pow(2, attemptNumber - 1) // Exponential backoff
    const jitter = (Math.random() - 0.5) * 2 * options.retryJitter
    return Math.max(0, baseDelay + jitter)
  }

  private generateLockId(): string {
    return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}-${process.pid}`
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
```

---

## 🎯 Service Layer Implementation

### 1. High-Level Redlock Service

```typescript
// src/redlock/distributed-lock.service.ts
import { Injectable, Logger } from '@nestjs/common'
import { RedlockService, RedlockOptions, LockResult } from './redlock.service'

export interface DistributedLockOperation<T> {
  operation: () => Promise<T>
  resource: string
  options?: Partial<RedlockOptions>
  onLockAcquired?: (lockId: string) => void
  onLockFailed?: (resource: string, attempts: number) => void
  onOperationComplete?: (result: T, duration: number) => void
}

export interface LockExecutionResult<T> {
  success: boolean
  result?: T
  error?: Error
  lockAcquired: boolean
  executionTime: number
  lockInfo?: {
    lockId: string
    acquiredAt: Date
    nodesAcquired: number
    totalNodes: number
  }
}

@Injectable()
export class DistributedLockService {
  private readonly logger = new Logger(DistributedLockService.name)

  constructor(private redlockService: RedlockService) {}

  // ✅ Execute operation với distributed lock
  async executeWithLock<T>(operation: DistributedLockOperation<T>): Promise<LockExecutionResult<T>> {
    const startTime = Date.now()
    let lockResult: LockResult | null = null

    try {
      // Acquire distributed lock
      lockResult = await this.redlockService.acquireLock(operation.resource, operation.options)

      if (!lockResult.success) {
        this.logger.warn(`Failed to acquire lock for resource: ${operation.resource}`)

        if (operation.onLockFailed) {
          operation.onLockFailed(operation.resource, operation.options?.retryCount || 3)
        }

        return {
          success: false,
          lockAcquired: false,
          executionTime: Date.now() - startTime,
          error: new Error(`Could not acquire distributed lock for resource: ${operation.resource}`),
        }
      }

      this.logger.debug(`Lock acquired for resource: ${operation.resource}`, {
        lockId: lockResult.lockId,
        nodesAcquired: lockResult.nodesAcquired,
        totalNodes: lockResult.totalNodes,
      })

      if (operation.onLockAcquired) {
        operation.onLockAcquired(lockResult.lockId)
      }

      // Execute critical section
      const operationStartTime = Date.now()
      const result = await operation.operation()
      const operationDuration = Date.now() - operationStartTime

      if (operation.onOperationComplete) {
        operation.onOperationComplete(result, operationDuration)
      }

      return {
        success: true,
        result,
        lockAcquired: true,
        executionTime: Date.now() - startTime,
        lockInfo: {
          lockId: lockResult.lockId,
          acquiredAt: lockResult.acquiredAt,
          nodesAcquired: lockResult.nodesAcquired,
          totalNodes: lockResult.totalNodes,
        },
      }
    } catch (error) {
      this.logger.error(`Operation failed for resource ${operation.resource}:`, error)

      return {
        success: false,
        lockAcquired: lockResult?.success || false,
        executionTime: Date.now() - startTime,
        error,
        lockInfo: lockResult?.success
          ? {
              lockId: lockResult.lockId,
              acquiredAt: lockResult.acquiredAt,
              nodesAcquired: lockResult.nodesAcquired,
              totalNodes: lockResult.totalNodes,
            }
          : undefined,
      }
    } finally {
      // Always release lock
      if (lockResult?.success && lockResult.lockId) {
        try {
          await this.redlockService.releaseLock(lockResult.lockId)
          this.logger.debug(`Lock released for resource: ${operation.resource}`, {
            lockId: lockResult.lockId,
          })
        } catch (releaseError) {
          this.logger.error(`Failed to release lock ${lockResult.lockId}:`, releaseError)
        }
      }
    }
  }

  // ✅ Execute với automatic lock extension
  async executeWithAutoExtend<T>(
    operation: DistributedLockOperation<T>,
    extensionInterval: number = 5000, // Extend every 5 seconds
    extensionAmount: number = 10000, // Extend by 10 seconds
  ): Promise<LockExecutionResult<T>> {
    let lockResult: LockResult | null = null
    let extensionTimer: NodeJS.Timeout | null = null

    try {
      // Acquire lock
      lockResult = await this.redlockService.acquireLock(operation.resource, operation.options)

      if (!lockResult.success) {
        return {
          success: false,
          lockAcquired: false,
          executionTime: 0,
          error: new Error(`Could not acquire distributed lock for resource: ${operation.resource}`),
        }
      }

      // Start automatic extension
      extensionTimer = setInterval(async () => {
        if (lockResult?.lockId) {
          try {
            const extended = await this.redlockService.extendLock(lockResult.lockId, extensionAmount)

            if (extended) {
              this.logger.debug(`Lock extended for resource: ${operation.resource}`, {
                lockId: lockResult.lockId,
                extensionAmount,
              })
            } else {
              this.logger.warn(`Failed to extend lock for resource: ${operation.resource}`)
            }
          } catch (error) {
            this.logger.error(`Error extending lock for ${operation.resource}:`, error)
          }
        }
      }, extensionInterval)

      // Execute operation
      const result = await operation.operation()

      return {
        success: true,
        result,
        lockAcquired: true,
        executionTime: 0, // Will be calculated in finally
        lockInfo: {
          lockId: lockResult.lockId,
          acquiredAt: lockResult.acquiredAt,
          nodesAcquired: lockResult.nodesAcquired,
          totalNodes: lockResult.totalNodes,
        },
      }
    } catch (error) {
      return {
        success: false,
        lockAcquired: lockResult?.success || false,
        executionTime: 0,
        error,
      }
    } finally {
      // Stop extension timer
      if (extensionTimer) {
        clearInterval(extensionTimer)
      }

      // Release lock
      if (lockResult?.success && lockResult.lockId) {
        await this.redlockService.releaseLock(lockResult.lockId)
      }
    }
  }

  // ✅ Batch execution với distributed locks
  async executeBatchWithLocks<T>(
    operations: Array<DistributedLockOperation<T>>,
    concurrencyLimit: number = 5,
  ): Promise<LockExecutionResult<T>[]> {
    const results: LockExecutionResult<T>[] = []

    // Process in batches to control concurrency
    for (let i = 0; i < operations.length; i += concurrencyLimit) {
      const batch = operations.slice(i, i + concurrencyLimit)

      const batchResults = await Promise.all(batch.map((operation) => this.executeWithLock(operation)))

      results.push(...batchResults)
    }

    return results
  }
}
```

### 2. Decorator cho Distributed Locking

```typescript
// src/redlock/decorators/distributed-lock.decorator.ts
import { SetMetadata } from '@nestjs/common'

export interface DistributedLockConfig {
  resource: string | ((args: any[]) => string)
  ttl?: number
  retryCount?: number
  retryDelay?: number
  autoExtend?: boolean
  extensionInterval?: number
  extensionAmount?: number
}

export const DISTRIBUTED_LOCK_METADATA = 'distributed_lock'

export const DistributedLock = (config: DistributedLockConfig): MethodDecorator => {
  return SetMetadata(DISTRIBUTED_LOCK_METADATA, config)
}

// src/redlock/interceptors/distributed-lock.interceptor.ts
import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { Observable, from } from 'rxjs'
import { switchMap } from 'rxjs/operators'
import { DistributedLockService } from '../distributed-lock.service'
import { DISTRIBUTED_LOCK_METADATA, DistributedLockConfig } from '../decorators/distributed-lock.decorator'

@Injectable()
export class DistributedLockInterceptor implements NestInterceptor {
  private readonly logger = new Logger(DistributedLockInterceptor.name)

  constructor(
    private reflector: Reflector,
    private distributedLockService: DistributedLockService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const lockConfig = this.reflector.get<DistributedLockConfig>(DISTRIBUTED_LOCK_METADATA, context.getHandler())

    if (!lockConfig) {
      return next.handle()
    }

    return from(this.executeWithLock(context, next, lockConfig))
  }

  private async executeWithLock(
    context: ExecutionContext,
    next: CallHandler,
    config: DistributedLockConfig,
  ): Promise<any> {
    const args = context.getArgs()
    const resource = typeof config.resource === 'function' ? config.resource(args) : config.resource

    const operation = {
      operation: () => next.handle().toPromise(),
      resource,
      options: {
        ttl: config.ttl || 10000,
        retryCount: config.retryCount || 3,
        retryDelay: config.retryDelay || 200,
      },
    }

    if (config.autoExtend) {
      return this.distributedLockService.executeWithAutoExtend(
        operation,
        config.extensionInterval || 5000,
        config.extensionAmount || 10000,
      )
    } else {
      return this.distributedLockService.executeWithLock(operation)
    }
  }
}

// Usage example
export class ExampleService {
  @DistributedLock({
    resource: (args) => `user-profile-${args[0]}`, // args[0] is userId
    ttl: 30000, // 30 seconds
    retryCount: 5,
  })
  async updateUserProfile(userId: string, updates: any) {
    // This method will be automatically protected by distributed lock
    return await this.performProfileUpdate(userId, updates)
  }

  @DistributedLock({
    resource: 'global-counter',
    ttl: 5000,
    autoExtend: true,
    extensionInterval: 2000,
    extensionAmount: 5000,
  })
  async generateSequentialId(): Promise<number> {
    // Long-running operation với automatic lock extension
    return await this.performSequentialIdGeneration()
  }
}
```

---

## 🛒 Real-world Examples

### 1. Distributed Cron Job Coordination

````typescript
// src/jobs/distributed-cron.service.ts
import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { DistributedLockService } from '../redlock/distributed-lock.service'

@Injectable()
export class DistributedCronService {
  private readonly logger = new Logger(DistributedCronService.name)

  constructor(private distributedLockService: DistributedLockService) {}

  // ✅ Daily report generation - only one instance should run
  @Cron(CronExpression.EVERY_DAY_AT_2AM)
  async generateDailyReport() {
    const result = await this.distributedLockService.executeWithLock({
      resource: 'daily-report-generation',
      operation: async () => {
        this.logger.log('Starting daily report generation...')

        // Simulate long-running report generation
        await this.processUserAnalytics()
        await this.processTransactionAnalytics()
        await this.processSalesAnalytics()
        await this.sendReportNotifications()

        this.logger.log('Daily report generation completed')
        return { status: 'completed', timestamp: new Date() }
      },
      options: {
        ttl: 3600000, // 1 hour TTL
        retryCount: 1, // Don't retry cron jobs
      },
      onLockFailed: (resource) => {
        this.logger.warn(`Daily report already running on another instance: ${resource}`)
      },
      onOperationComplete: (result, duration) => {
        this.logger.log(`Daily report completed in ${duration}ms:`, result)
      },
    })

    if (!result.success && !result.lockAcquired) {
      this.logger.info('Daily report skipped - already running on another instance')
    } else if (!result.success) {
      this.logger.error('Daily report failed:', result.error?.message)
    }
  }

  // ✅ Cleanup expired data - với automatic extension
  @Cron(CronExpression.EVERY_HOUR)
  async cleanupExpiredData() {
    const result = await this.distributedLockService.executeWithAutoExtend({
      resource: 'cleanup-expired-data',
      operation: async () => {
        this.logger.log('Starting expired data cleanup...')

        let totalCleaned = 0

        // Process in batches
        const batchSize = 1000
        let hasMore = true

        while (hasMore) {
          const batch = await this.findExpiredRecords(batchSize)

          if (batch.length === 0) {
            hasMore = false
            break
          }

          await this.deleteExpiredRecords(batch)
          totalCleaned += batch.length

          this.logger.debug(`Cleaned ${batch.length} records, total: ${totalCleaned}`)

          // Brief pause between batches
          await this.sleep(100)
        }

        this.logger.log(`Cleanup completed - ${totalCleaned} records removed`)
        return { recordsCleaned: totalCleaned }
      },
      options: {
        ttl: 600000, // 10 minutes initial TTL
        retryCount: 1,
      },
    },
    30000, // Extend every 30 seconds
    300000 // Extend by 5 minutes each time
    )

    if (!result.success) {
      this.logger.error('Data cleanup failed:', result.error?.message)
    }
  }

  // ✅ Database maintenance tasks
  @Cron('0 3 * * 0') // Every Sunday at 3 AM
  async performDatabaseMaintenance() {
    await this.distributedLockService.executeWithLock({
      resource: 'database-maintenance',
      operation: async () => {
        this.logger.log('Starting database maintenance...')

        // Reindex tables
        await this.reindexTables([
          'users', 'orders', 'products', 'transactions'
        ])

        // Update statistics
        await this.updateTableStatistics()

        // Vacuum analyze
        await this.vacuumAnalyze()

        // Archive old logs
        await this.archiveOldLogs()

        this.logger.log('Database maintenance completed')
        return { status: 'completed' }
      },
      options: {
        ttl: 7200000, // 2 hours TTL
        retryCount: 0, // Don't retry maintenance
      },
    })
  }

  private async processUserAnalytics(): Promise<void> {
    await this.sleep(5000) // Simulate processing
  }

  private async processTransactionAnalytics(): Promise<void> {
    await this.sleep(3000)
  }

  private async processSalesAnalytics(): Promise<void> {
    await this.sleep(4000)
  }

  private async sendReportNotifications(): Promise<void> {
    await this.sleep(2000)
  }

  private async findExpiredRecords(limit: number): Promise<any[]> {
    // Simulate finding expired records
    await this.sleep(100)
    return Math.random() > 0.8 ? [] : new Array(Math.floor(Math.random() * limit))
  }

  private async deleteExpiredRecords(records: any[]): Promise<void> {
    await this.sleep(50)
  }

  private async reindexTables(tables: string[]): Promise<void> {
    for (const table of tables) {
      this.logger.debug(`Reindexing table: ${table}`)
      await this.sleep(30000) // Simulate reindexing
    }
  }

  private async updateTableStatistics(): Promise<void> {
    await this.sleep(10000)
  }

  private async vacuumAnalyze(): Promise<void> {
    await this.sleep(60000)
  }

  private async archiveOldLogs(): Promise<void> {
    await this.sleep(15000)
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

### 2. Distributed Cache Management

```typescript
// src/cache/distributed-cache.service.ts
import { Injectable, Logger } from '@nestjs/common'
import { DistributedLockService } from '../redlock/distributed-lock.service'

export interface CacheEntry<T> {
  value: T
  expiresAt: Date
  version: number
}

export interface CacheWriteOptions {
  ttl?: number
  lockTtl?: number
  retryCount?: number
}

@Injectable()
export class DistributedCacheService {
  private readonly logger = new Logger(DistributedCacheService.name)
  private readonly cache = new Map<string, CacheEntry<any>>()

  constructor(private distributedLockService: DistributedLockService) {}

  // ✅ Cache-aside pattern với distributed locking
  async get<T>(
    key: string,
    loader: () => Promise<T>,
    options: CacheWriteOptions = {}
  ): Promise<T> {

    // Check local cache first
    const cached = this.cache.get(key)

    if (cached && cached.expiresAt > new Date()) {
      this.logger.debug(`Cache hit for key: ${key}`)
      return cached.value
    }

    // Cache miss - load với distributed lock để prevent thundering herd
    const result = await this.distributedLockService.executeWithLock({
      resource: `cache-load:${key}`,
      operation: async () => {
        // Double-check cache after acquiring lock
        const recentCached = this.cache.get(key)
        if (recentCached && recentCached.expiresAt > new Date()) {
          return recentCached.value
        }

        this.logger.debug(`Loading data for cache key: ${key}`)
        const data = await loader()

        // Store in cache
        const ttl = options.ttl || 300000 // 5 minutes default
        const entry: CacheEntry<T> = {
          value: data,
          expiresAt: new Date(Date.now() + ttl),
          version: 1,
        }

        this.cache.set(key, entry)
        this.logger.debug(`Data cached for key: ${key}`, { ttl })

        return data
      },
      options: {
        ttl: options.lockTtl || 30000, // 30 seconds lock TTL
        retryCount: options.retryCount || 3,
      },
    })

    if (!result.success) {
      throw new Error(`Failed to load data for cache key: ${key}`)
    }

    return result.result
  }

  // ✅ Write-through cache với distributed coordination
  async set<T>(
    key: string,
    value: T,
    writer: (value: T) => Promise<void>,
    options: CacheWriteOptions = {}
  ): Promise<void> {

    await this.distributedLockService.executeWithLock({
      resource: `cache-write:${key}`,
      operation: async () => {
        // Write to persistent storage first
        this.logger.debug(`Writing data for key: ${key}`)
        await writer(value)

        // Update cache
        const ttl = options.ttl || 300000
        const existingEntry = this.cache.get(key)
        const entry: CacheEntry<T> = {
          value,
          expiresAt: new Date(Date.now() + ttl),
          version: (existingEntry?.version || 0) + 1,
        }

        this.cache.set(key, entry)
        this.logger.debug(`Cache updated for key: ${key}`)
      },
      options: {
        ttl: options.lockTtl || 30000,
        retryCount: options.retryCount || 3,
      },
    })
  }

  // ✅ Cache invalidation với distributed coordination
  async invalidate(key: string, remover?: () => Promise<void>): Promise<void> {
    await this.distributedLockService.executeWithLock({
      resource: `cache-invalidate:${key}`,
      operation: async () => {
        if (remover) {
          await remover()
        }

        this.cache.delete(key)
        this.logger.debug(`Cache invalidated for key: ${key}`)
      },
      options: {
        ttl: 10000, // Short lock for invalidation
        retryCount: 2,
      },
    })
  }

  // ✅ Batch cache warming
  async warmCache(
    entries: Array<{
      key: string
      loader: () => Promise<any>
      ttl?: number
    }>
  ): Promise<void> {

    const warmingTasks = entries.map(entry => ({
      resource: `cache-warm:${entry.key}`,
      operation: async () => {
        const data = await entry.loader()
        const ttl = entry.ttl || 300000

        this.cache.set(entry.key, {
          value: data,
          expiresAt: new Date(Date.now() + ttl),
          version: 1,
        })

        return { key: entry.key, warmed: true }
      },
      options: {
        ttl: 60000, // 1 minute for warming
        retryCount: 1,
      },
    }))

    const results = await this.distributedLockService.executeBatchWithLocks(
      warmingTasks,
      5 // Limit concurrency
    )

    const successful = results.filter(r => r.success).length
    this.logger.log(`Cache warming completed: ${successful}/${entries.length} entries`)
  }
}

---

## 📊 Monitoring & Health Checks

### 1. Redlock Health Monitor

```typescript
// src/redlock/health/redlock-health.service.ts
import { Injectable, Logger } from '@nestjs/common'
import { HealthIndicator, HealthIndicatorResult, HealthCheckError } from '@nestjs/terminus'
import { RedisConnectionService } from '../redis-connection.service'
import { RedlockService } from '../redlock.service'

@Injectable()
export class RedlockHealthIndicator extends HealthIndicator {
  private readonly logger = new Logger(RedlockHealthIndicator.name)

  constructor(
    private redisConnectionService: RedisConnectionService,
    private redlockService: RedlockService
  ) {
    super()
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    try {
      const healthData = await this.checkRedlockHealth()

      if (healthData.healthy) {
        return this.getStatus(key, true, healthData)
      } else {
        throw new HealthCheckError('Redlock health check failed', healthData)
      }

    } catch (error) {
      throw new HealthCheckError('Redlock health check failed', {
        error: error.message,
        healthy: false,
      })
    }
  }

  private async checkRedlockHealth() {
    const redisInstances = this.redisConnectionService.getRedisInstances()
    const totalNodes = redisInstances.length
    const majorityCount = this.redisConnectionService.getMajorityCount()

    // Test basic connectivity
    const connectivityResults = await Promise.allSettled(
      redisInstances.map(async (redis, index) => {
        try {
          const pong = await redis.ping()
          const info = await redis.info('memory')
          return {
            nodeIndex: index,
            connected: pong === 'PONG',
            memory: this.parseMemoryInfo(info),
          }
        } catch (error) {
          return {
            nodeIndex: index,
            connected: false,
            error: error.message,
          }
        }
      })
    )

    const connectedNodes = connectivityResults
      .map(result => result.status === 'fulfilled' ? result.value : null)
      .filter(node => node?.connected)

    // Test lock acquisition
    const lockTestResult = await this.testLockAcquisition()

    const healthy = connectedNodes.length >= majorityCount && lockTestResult.success

    return {
      healthy,
      totalNodes,
      connectedNodes: connectedNodes.length,
      majorityRequired: majorityCount,
      lockTest: lockTestResult,
      nodes: connectivityResults.map(result =>
        result.status === 'fulfilled' ? result.value : { error: result.reason.message }
      ),
      activeLocks: this.redlockService.getActiveLocks().length,
    }
  }

  private async testLockAcquisition() {
    try {
      const testResource = `health-check-${Date.now()}`

      const result = await this.redlockService.acquireLock(testResource, {
        ttl: 5000,
        retryCount: 1,
      })

      if (result.success) {
        await this.redlockService.releaseLock(result.lockId)
        return {
          success: true,
          nodesAcquired: result.nodesAcquired,
          totalNodes: result.totalNodes,
        }
      } else {
        return {
          success: false,
          error: 'Failed to acquire test lock',
        }
      }

    } catch (error) {
      return {
        success: false,
        error: error.message,
      }
    }
  }

  private parseMemoryInfo(info: string) {
    const lines = info.split('\r\n')
    const memoryData = {}

    lines.forEach(line => {
      if (line.startsWith('used_memory_human:')) {
        memoryData['used'] = line.split(':')[1]
      }
      if (line.startsWith('used_memory_peak_human:')) {
        memoryData['peak'] = line.split(':')[1]
      }
    })

    return memoryData
  }
}

// src/redlock/monitoring/redlock-metrics.service.ts
import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'

export interface LockMetrics {
  resource: string
  acquisitions: number
  failures: number
  totalWaitTime: number
  averageHoldTime: number
  successRate: number
  timestamp: Date
}

@Injectable()
export class RedlockMetricsService {
  private readonly logger = new Logger(RedlockMetricsService.name)
  private metrics = new Map<string, LockMetrics>()
  private lockTimings = new Map<string, { acquiredAt: number, resource: string }>()

  // Record lock acquisition attempt
  recordLockAttempt(resource: string, success: boolean, waitTime: number) {
    const key = this.getMetricKey(resource)
    const existing = this.metrics.get(key) || this.createEmptyMetrics(resource)

    existing.acquisitions++
    if (!success) {
      existing.failures++
    }
    existing.totalWaitTime += waitTime
    existing.successRate = (existing.acquisitions - existing.failures) / existing.acquisitions

    this.metrics.set(key, existing)
  }

  // Record lock acquired
  recordLockAcquired(lockId: string, resource: string) {
    this.lockTimings.set(lockId, {
      acquiredAt: Date.now(),
      resource,
    })
  }

  // Record lock released
  recordLockReleased(lockId: string) {
    const timing = this.lockTimings.get(lockId)
    if (!timing) return

    const holdTime = Date.now() - timing.acquiredAt
    const key = this.getMetricKey(timing.resource)
    const existing = this.metrics.get(key)

    if (existing) {
      const totalHoldTime = existing.averageHoldTime * (existing.acquisitions - existing.failures)
      existing.averageHoldTime = (totalHoldTime + holdTime) / (existing.acquisitions - existing.failures)
      this.metrics.set(key, existing)
    }

    this.lockTimings.delete(lockId)
  }

  // Get metrics for resource
  getMetrics(resource: string): LockMetrics | null {
    return this.metrics.get(this.getMetricKey(resource)) || null
  }

  // Get all metrics
  getAllMetrics(): LockMetrics[] {
    return Array.from(this.metrics.values())
  }

  // Report metrics every 5 minutes
  @Cron('*/5 * * * *')
  async reportMetrics() {
    const allMetrics = this.getAllMetrics()

    if (allMetrics.length === 0) return

    // Find problematic resources
    const problemResources = allMetrics.filter(metric =>
      metric.successRate < 0.9 || metric.averageHoldTime > 30000
    )

    if (problemResources.length > 0) {
      this.logger.warn('Detected problematic lock resources:', {
        resources: problemResources.map(metric => ({
          resource: metric.resource,
          successRate: `${(metric.successRate * 100).toFixed(1)}%`,
          averageHoldTime: `${metric.averageHoldTime}ms`,
          failures: metric.failures,
        })),
      })
    }

    // Log summary
    const summary = {
      totalResources: allMetrics.length,
      totalAcquisitions: allMetrics.reduce((sum, m) => sum + m.acquisitions, 0),
      totalFailures: allMetrics.reduce((sum, m) => sum + m.failures, 0),
      averageSuccessRate: allMetrics.reduce((sum, m) => sum + m.successRate, 0) / allMetrics.length,
      activeLocks: this.lockTimings.size,
    }

    this.logger.log('Redlock metrics summary:', summary)
  }

  private getMetricKey(resource: string): string {
    const now = new Date()
    const hourKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}`
    return `${resource}:${hourKey}`
  }

  private createEmptyMetrics(resource: string): LockMetrics {
    return {
      resource,
      acquisitions: 0,
      failures: 0,
      totalWaitTime: 0,
      averageHoldTime: 0,
      successRate: 0,
      timestamp: new Date(),
    }
  }
}
````

---

## ⚠️ Common Pitfalls & Best Practices

### ❌ Common Mistakes

**1. Inadequate TTL Management**

```typescript
// ❌ TTL too short for operation
await redlockService.acquireLock('long-operation', {
  ttl: 5000, // 5 seconds - TOO SHORT!
})
await performLongRunningOperation() // Takes 30 seconds

// ✅ Proper TTL estimation
await redlockService.acquireLock('long-operation', {
  ttl: 60000, // 1 minute - adequate buffer
})
// OR use auto-extension
await distributedLockService.executeWithAutoExtend(operation, 10000, 30000)
```

**2. Not Handling Network Partitions**

```typescript
// ❌ No fallback for lock acquisition failure
const result = await redlockService.acquireLock('critical-resource')
// Assumes lock was acquired
await performCriticalOperation()

// ✅ Proper error handling
const result = await redlockService.acquireLock('critical-resource')
if (!result.success) {
  // Implement fallback strategy
  throw new Error('Could not acquire distributed lock')
}
await performCriticalOperation()
```

**3. Lock Resource Naming Conflicts**

```typescript
// ❌ Generic resource names
await redlockService.acquireLock('user-update') // Which user?
await redlockService.acquireLock('process-data') // Which data?

// ✅ Specific resource names
await redlockService.acquireLock(`user-update:${userId}`)
await redlockService.acquireLock(`order-processing:${orderId}`)
```

### ✅ Best Practices

**1. Choose Appropriate Lock Granularity**

```typescript
// ✅ Fine-grained locking
async updateUserProfile(userId: string, updates: any) {
  return await distributedLockService.executeWithLock({
    resource: `user-profile:${userId}`, // Per-user lock
    operation: () => this.performUpdate(userId, updates),
  })
}

// ✅ Coarse-grained when necessary
async generateGlobalReport() {
  return await distributedLockService.executeWithLock({
    resource: 'global-report-generation', // Global lock
    operation: () => this.performReportGeneration(),
    options: { ttl: 3600000 }, // 1 hour
  })
}
```

**2. Implement Proper Monitoring**

```typescript
// ✅ Monitor lock performance
@Injectable()
export class MonitoredRedlockService {
  constructor(
    private distributedLockService: DistributedLockService,
    private metricsService: RedlockMetricsService,
  ) {}

  async executeWithMonitoring<T>(operation: DistributedLockOperation<T>) {
    const startTime = Date.now()

    const result = await this.distributedLockService.executeWithLock({
      ...operation,
      onLockAcquired: (lockId) => {
        this.metricsService.recordLockAcquired(lockId, operation.resource)
      },
      onLockFailed: (resource, attempts) => {
        this.metricsService.recordLockAttempt(resource, false, Date.now() - startTime)
      },
    })

    if (result.lockInfo?.lockId) {
      this.metricsService.recordLockReleased(result.lockInfo.lockId)
    }

    return result
  }
}
```

**3. Handle Redis Node Failures Gracefully**

```typescript
// ✅ Implement circuit breaker for Redis failures
@Injectable()
export class ResilientRedlockService {
  private circuitBreaker = new Map<string, { failures: number; lastFailure: Date }>()

  async acquireLockWithCircuitBreaker(resource: string, options: RedlockOptions) {
    const circuitState = this.circuitBreaker.get(resource)

    // Check if circuit is open
    if (circuitState && circuitState.failures > 5) {
      const timeSinceLastFailure = Date.now() - circuitState.lastFailure.getTime()
      if (timeSinceLastFailure < 60000) {
        // 1 minute cooldown
        throw new Error(`Circuit breaker open for resource: ${resource}`)
      }
    }

    try {
      const result = await this.redlockService.acquireLock(resource, options)

      if (result.success) {
        // Reset circuit on success
        this.circuitBreaker.delete(resource)
      }

      return result
    } catch (error) {
      // Record failure
      const existing = circuitState || { failures: 0, lastFailure: new Date() }
      existing.failures++
      existing.lastFailure = new Date()
      this.circuitBreaker.set(resource, existing)

      throw error
    }
  }
}
```

---

## 📋 Summary

### 🎯 Key Takeaways

1. **Distributed Consensus**: Redlock requires majority của Redis nodes để ensure consistency
2. **Fault Tolerance**: Có thể hoạt động kể cả khi một số nodes fail
3. **TTL Management**: Critical cho preventing indefinite locks
4. **Network Partition Handling**: Implement proper fallback strategies
5. **Monitoring Essential**: Track lock performance và failures

### 🚀 When to Use Redlock

**✅ Ideal for:**

- Distributed cron job coordination
- Cache warming/invalidation
- File processing queues
- Global resource management
- Multi-instance deployment coordination
- Preventing duplicate operations across instances

**❌ Avoid for:**

- Single-instance applications
- High-frequency operations (< 100ms)
- Operations requiring strict ACID compliance
- When network latency is high/unstable

### 🔄 Architecture Considerations

| Scenario            | Redis Setup             | Lock Strategy     |
| ------------------- | ----------------------- | ----------------- |
| Development         | Single Redis            | Simulated cluster |
| Production          | 3-5 Redis nodes         | Full Redlock      |
| High Availability   | 5+ Redis nodes          | Extended TTL      |
| Low Latency         | Co-located Redis        | Short TTL         |
| Global Distribution | Regional Redis clusters | Regional locks    |

### 🛡️ Reliability Guidelines

1. **Minimum 3 Redis Nodes**: Để có meaningful majority
2. **Odd Number of Nodes**: Prevent split-brain scenarios
3. **Clock Synchronization**: Use NTP để ensure time consistency
4. **Network Monitoring**: Monitor Redis connectivity
5. **Graceful Degradation**: Implement fallback strategies

---

**🔴 Với Redlock, bạn có thể implement distributed locking reliable và scalable cho multi-instance NestJS applications!**
