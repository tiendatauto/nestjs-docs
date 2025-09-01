# 🏃‍♂️ Race Condition trong NestJS

## 🔍 Race Condition là gì?

Race Condition là tình huống xảy ra khi multiple processes hoặc threads truy cập và modify shared data cùng lúc, dẫn đến kết quả không mong muốn. Trong NestJS applications, race conditions thường xảy ra trong concurrent HTTP requests, database operations, và shared resource access.

### 🎯 Vai trò trong Ecosystem

- **Data Integrity**: Đảm bảo consistency của data trong concurrent environments
- **Business Logic Protection**: Prevent invalid state transitions
- **Resource Management**: Avoid conflicts khi access shared resources
- **Transaction Safety**: Maintain ACID properties trong database operations
- **API Reliability**: Ensure predictable behavior under high load

### ⚡ Execution Order & Lifecycle

```typescript
Request A starts → Read shared data → Process data → Write result
Request B starts → Read shared data → Process data → Write result (overwrites A!)
```

**Race Condition Lifecycle:**

```
1. Multiple Operations Start Simultaneously
2. Concurrent Access to Shared Resource
3. Inconsistent State Modification
4. Data Corruption or Invalid Business State
5. Application Errors or Silent Data Loss
```

---

## 🎯 Cách hiểu và phát hiện Race Condition

### 1. 🔬 Identifying Race Conditions

```typescript
// Ví dụ Race Condition trong e-commerce
@Injectable()
export class ProductService {
  constructor(
    @InjectRepository(Product)
    private productRepository: Repository<Product>,
  ) {}

  // ❌ RACE CONDITION: Multiple users có thể mua cùng lúc
  async purchaseProduct(productId: string, quantity: number) {
    // Request A và B đều read cùng lúc
    const product = await this.productRepository.findOne({
      where: { id: productId },
    })

    // Cả hai thấy inventory = 5
    console.log(`Available inventory: ${product.inventory}`)

    if (product.inventory < quantity) {
      throw new Error('Insufficient inventory')
    }

    // Cả hai đều think có đủ hàng
    // Request A: 5 - 3 = 2
    // Request B: 5 - 4 = 1 (should be -1!)
    product.inventory -= quantity

    // Cả hai save cùng lúc - data corruption!
    await this.productRepository.save(product)

    return { success: true, remainingInventory: product.inventory }
  }
}
```

**Input/Output Example:**

```
Concurrent Requests:
- Request A: purchaseProduct('prod-1', 3) at 10:00:00.100
- Request B: purchaseProduct('prod-1', 4) at 10:00:00.105

Expected Behavior:
- Initial inventory: 5
- After Request A: inventory = 2
- Request B should fail (insufficient inventory)

Actual Behavior (Race Condition):
- Both requests read inventory = 5
- Request A saves inventory = 2
- Request B saves inventory = 1 (overwrites A's result)
- Result: Sold 7 items but only had 5! 🚨
```

### 2. 🎪 Simulating Race Conditions

```typescript
// race-condition-demo.service.ts
@Injectable()
export class RaceConditionDemoService {
  private sharedCounter = 0
  private logger = new Logger(RaceConditionDemoService.name)

  // Giả lập race condition với shared counter
  async demonstrateRaceCondition() {
    this.sharedCounter = 0
    const promises = []

    // Tạo 10 concurrent operations
    for (let i = 0; i < 10; i++) {
      promises.push(this.incrementCounter(i))
    }

    await Promise.all(promises)

    this.logger.log(`Expected counter: 10, Actual counter: ${this.sharedCounter}`)
    return {
      expected: 10,
      actual: this.sharedCounter,
      hasRaceCondition: this.sharedCounter !== 10,
    }
  }

  private async incrementCounter(operationId: number) {
    // Simulate reading shared data
    const currentValue = this.sharedCounter
    this.logger.debug(`Operation ${operationId}: Read value ${currentValue}`)

    // Simulate processing time
    await new Promise((resolve) => setTimeout(resolve, Math.random() * 10))

    // Simulate writing back (race condition occurs here)
    this.sharedCounter = currentValue + 1
    this.logger.debug(`Operation ${operationId}: Wrote value ${this.sharedCounter}`)
  }

  // Giả lập race condition trong database
  async demonstrateDatabaseRaceCondition() {
    const userId = 'user-123'
    const promises = []

    // Multiple concurrent balance updates
    for (let i = 0; i < 5; i++) {
      promises.push(this.updateUserBalance(userId, 100, i))
    }

    const results = await Promise.allSettled(promises)

    return {
      operations: results.length,
      successful: results.filter((r) => r.status === 'fulfilled').length,
      failed: results.filter((r) => r.status === 'rejected').length,
    }
  }

  private async updateUserBalance(userId: string, amount: number, opId: number) {
    try {
      // Race condition simulation
      const user = await this.userRepository.findOne({ where: { id: userId } })

      this.logger.debug(`Op ${opId}: Current balance ${user.balance}`)

      // Simulate processing delay
      await new Promise((resolve) => setTimeout(resolve, Math.random() * 50))

      user.balance += amount
      await this.userRepository.save(user)

      this.logger.debug(`Op ${opId}: New balance ${user.balance}`)
    } catch (error) {
      this.logger.error(`Op ${opId} failed:`, error.message)
      throw error
    }
  }
}
```

---

## 💡 Cách giải quyết Race Conditions

### 1. 🔒 Database-Level Solutions

#### A. Pessimistic Locking

```typescript
@Injectable()
export class SafeProductService {
  constructor(
    @InjectRepository(Product)
    private productRepository: Repository<Product>,
    private dataSource: DataSource,
  ) {}

  // ✅ SOLUTION: Pessimistic locking
  async purchaseProductSafe(productId: string, quantity: number) {
    return await this.dataSource.transaction(async (manager) => {
      // Lock row để prevent concurrent access
      const product = await manager.findOne(Product, {
        where: { id: productId },
        lock: { mode: 'pessimistic_write' },
      })

      if (!product) {
        throw new Error('Product not found')
      }

      if (product.inventory < quantity) {
        throw new Error('Insufficient inventory')
      }

      // Safe to modify - no other transaction can access this row
      product.inventory -= quantity
      await manager.save(product)

      return {
        success: true,
        remainingInventory: product.inventory,
        productId,
      }
    })
  }

  // Advanced pessimistic locking với timeout
  async purchaseProductWithTimeout(productId: string, quantity: number) {
    return await this.dataSource.transaction(async (manager) => {
      try {
        // Set lock timeout để avoid deadlocks
        await manager.query('SET innodb_lock_wait_timeout = 5')

        const product = await manager.findOne(Product, {
          where: { id: productId },
          lock: { mode: 'pessimistic_write' },
        })

        if (product.inventory < quantity) {
          throw new Error('Insufficient inventory')
        }

        product.inventory -= quantity
        const savedProduct = await manager.save(product)

        return {
          success: true,
          productId: savedProduct.id,
          remainingInventory: savedProduct.inventory,
          timestamp: new Date(),
        }
      } catch (error) {
        if (error.code === 'ER_LOCK_WAIT_TIMEOUT') {
          throw new Error('Product is currently being processed by another user')
        }
        throw error
      }
    })
  }
}
```

#### B. Optimistic Locking

```typescript
@Injectable()
export class OptimisticProductService {
  private readonly logger = new Logger(OptimisticProductService.name)

  constructor(
    @InjectRepository(Product)
    private productRepository: Repository<Product>,
  ) {}

  // ✅ SOLUTION: Optimistic locking với retry mechanism
  async purchaseProductOptimistic(productId: string, quantity: number, maxRetries = 3) {
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        const product = await this.productRepository.findOne({
          where: { id: productId },
        })

        if (!product) {
          throw new Error('Product not found')
        }

        if (product.inventory < quantity) {
          throw new Error('Insufficient inventory')
        }

        // Update với version check
        const originalVersion = product.version
        product.inventory -= quantity

        const result = await this.productRepository.save(product)

        this.logger.log(`Purchase successful on attempt ${attempt + 1}`)
        return {
          success: true,
          remainingInventory: result.inventory,
          attempts: attempt + 1,
        }
      } catch (error) {
        if (error instanceof OptimisticLockVersionMismatchError) {
          this.logger.warn(`Optimistic lock conflict, attempt ${attempt + 1}`)

          if (attempt === maxRetries - 1) {
            throw new Error('Unable to complete purchase due to high concurrency')
          }

          // Exponential backoff
          await new Promise((resolve) => setTimeout(resolve, Math.pow(2, attempt) * 100))
          continue
        }
        throw error
      }
    }
  }
}
```

### 2. 🔄 Application-Level Solutions

#### A. Semaphores và Mutexes

```typescript
@Injectable()
export class SemaphoreService {
  private semaphores = new Map<string, Semaphore>()
  private readonly logger = new Logger(SemaphoreService.name)

  // Create semaphore for resource
  createSemaphore(resource: string, maxConcurrent: number) {
    this.semaphores.set(resource, new Semaphore(maxConcurrent))
  }

  // Execute with semaphore protection
  async executeWithSemaphore<T>(resource: string, operation: () => Promise<T>): Promise<T> {
    const semaphore = this.semaphores.get(resource)
    if (!semaphore) {
      throw new Error(`Semaphore for resource '${resource}' not found`)
    }

    const startTime = Date.now()
    await semaphore.acquire()

    try {
      this.logger.debug(`Acquired semaphore for ${resource}`)
      const result = await operation()

      const duration = Date.now() - startTime
      this.logger.debug(`Operation completed in ${duration}ms`)

      return result
    } finally {
      semaphore.release()
      this.logger.debug(`Released semaphore for ${resource}`)
    }
  }
}

// Simple Semaphore implementation
class Semaphore {
  private permits: number
  private waitQueue: Array<() => void> = []

  constructor(permits: number) {
    this.permits = permits
  }

  async acquire(): Promise<void> {
    return new Promise<void>((resolve) => {
      if (this.permits > 0) {
        this.permits--
        resolve()
      } else {
        this.waitQueue.push(resolve)
      }
    })
  }

  release(): void {
    this.permits++
    if (this.waitQueue.length > 0) {
      const resolve = this.waitQueue.shift()!
      this.permits--
      resolve()
    }
  }
}
```

#### B. Redis-based Distributed Locks

```typescript
@Injectable()
export class DistributedLockService {
  private readonly logger = new Logger(DistributedLockService.name)

  constructor(@InjectRedis() private redis: Redis) {}

  // Acquire distributed lock
  async acquireLock(resource: string, ttl: number = 30000, timeout: number = 5000): Promise<string | null> {
    const lockKey = `lock:${resource}`
    const lockValue = `${Date.now()}-${Math.random()}`
    const endTime = Date.now() + timeout

    while (Date.now() < endTime) {
      const result = await this.redis.set(lockKey, lockValue, 'PX', ttl, 'NX')

      if (result === 'OK') {
        this.logger.debug(`Acquired lock for ${resource}`)
        return lockValue
      }

      // Wait before retry
      await new Promise((resolve) => setTimeout(resolve, 50))
    }

    return null
  }

  // Release distributed lock
  async releaseLock(resource: string, lockValue: string): Promise<boolean> {
    const lockKey = `lock:${resource}`

    // Use Lua script để ensure atomicity
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `

    const result = await this.redis.eval(script, 1, lockKey, lockValue)

    if (result === 1) {
      this.logger.debug(`Released lock for ${resource}`)
      return true
    }

    return false
  }

  // Execute with distributed lock
  async executeWithLock<T>(
    resource: string,
    operation: () => Promise<T>,
    options: { ttl?: number; timeout?: number } = {},
  ): Promise<T> {
    const { ttl = 30000, timeout = 5000 } = options

    const lockValue = await this.acquireLock(resource, ttl, timeout)
    if (!lockValue) {
      throw new Error(`Failed to acquire lock for resource: ${resource}`)
    }

    try {
      return await operation()
    } finally {
      await this.releaseLock(resource, lockValue)
    }
  }
}
```

---

## ⚠️ Các vấn đề thường gặp

### 1. 🚨 Lost Updates

**Vấn đề:**

```typescript
// ❌ BAD: Lost update problem
async updateUserProfile(userId: string, updates: Partial<User>) {
  const user = await this.userRepository.findOne({ where: { id: userId } })

  // Multiple requests có thể modify different fields
  Object.assign(user, updates)

  // Last write wins - previous updates lost!
  await this.userRepository.save(user)
}
```

**Giải pháp:**

```typescript
// ✅ GOOD: Field-level updates
async updateUserProfileSafe(userId: string, updates: Partial<User>) {
  const updateQuery = this.userRepository
    .createQueryBuilder()
    .update(User)
    .set(updates)
    .where('id = :id', { id: userId })

  // Atomic field updates
  const result = await updateQuery.execute()

  if (result.affected === 0) {
    throw new Error('User not found or no changes made')
  }

  return await this.userRepository.findOne({ where: { id: userId } })
}
```

### 2. 💰 Double Spending Problem

**Vấn đề:**

```typescript
// ❌ BAD: Double spending vulnerability
async processPayment(userId: string, amount: number) {
  const user = await this.userRepository.findOne({ where: { id: userId } })

  if (user.balance < amount) {
    throw new Error('Insufficient funds')
  }

  // Race condition: Multiple payments can pass the check
  user.balance -= amount
  await this.userRepository.save(user)

  // Process payment...
}
```

**Giải pháp:**

```typescript
// ✅ GOOD: Atomic balance check and update
async processPaymentSafe(userId: string, amount: number) {
  const result = await this.userRepository
    .createQueryBuilder()
    .update(User)
    .set({ balance: () => 'balance - :amount' })
    .where('id = :userId AND balance >= :amount')
    .setParameters({ userId, amount })
    .execute()

  if (result.affected === 0) {
    throw new Error('Insufficient funds or user not found')
  }

  // Payment processing...
  return { success: true, deducted: amount }
}
```

### 3. 🔄 Counter Synchronization

**Vấn đề:**

```typescript
// ❌ BAD: Counter race condition
async incrementViewCount(postId: string) {
  const post = await this.postRepository.findOne({ where: { id: postId } })
  post.viewCount += 1
  await this.postRepository.save(post)
}
```

**Giải pháp:**

```typescript
// ✅ GOOD: Atomic increment
async incrementViewCountSafe(postId: string) {
  await this.postRepository.increment(
    { id: postId },
    'viewCount',
    1
  )
}

// Advanced: Batch counter updates
@Injectable()
export class CounterService {
  private pendingUpdates = new Map<string, number>()

  async incrementCounter(entityId: string, field: string, value = 1) {
    const key = `${entityId}:${field}`
    const current = this.pendingUpdates.get(key) || 0
    this.pendingUpdates.set(key, current + value)
  }

  @Cron('*/10 * * * * *') // Every 10 seconds
  async flushCounters() {
    const updates = Array.from(this.pendingUpdates.entries())
    this.pendingUpdates.clear()

    for (const [key, value] of updates) {
      const [entityId, field] = key.split(':')

      try {
        await this.postRepository.increment(
          { id: entityId },
          field,
          value
        )
      } catch (error) {
        this.logger.error(`Failed to update counter ${key}:`, error)
        // Re-queue on failure
        const current = this.pendingUpdates.get(key) || 0
        this.pendingUpdates.set(key, current + value)
      }
    }
  }
}
```

---

## 🔧 Advanced Patterns

### 1. 🎭 Event Sourcing Pattern

```typescript
// Event sourcing để avoid race conditions
@Injectable()
export class EventSourcingService {
  constructor(
    @InjectRepository(EventStore)
    private eventStore: Repository<EventStore>,
    @InjectRepository(AccountSnapshot)
    private snapshotRepository: Repository<AccountSnapshot>,
  ) {}

  async processAccountTransaction(accountId: string, transactionType: 'credit' | 'debit', amount: number) {
    const event = {
      aggregateId: accountId,
      eventType: transactionType,
      eventData: { amount, timestamp: new Date() },
      version: await this.getNextVersion(accountId),
    }

    // Append event atomically
    try {
      await this.eventStore.save(event)
    } catch (error) {
      if (error.code === 'ER_DUP_ENTRY') {
        throw new Error('Concurrent modification detected')
      }
      throw error
    }

    // Update read model asynchronously
    await this.updateAccountSnapshot(accountId)
  }

  private async getNextVersion(accountId: string): Promise<number> {
    const lastEvent = await this.eventStore.findOne({
      where: { aggregateId: accountId },
      order: { version: 'DESC' },
    })

    return (lastEvent?.version || 0) + 1
  }

  private async updateAccountSnapshot(accountId: string) {
    const events = await this.eventStore.find({
      where: { aggregateId: accountId },
      order: { version: 'ASC' },
    })

    let balance = 0
    for (const event of events) {
      if (event.eventType === 'credit') {
        balance += event.eventData.amount
      } else if (event.eventType === 'debit') {
        balance -= event.eventData.amount
      }
    }

    await this.snapshotRepository.save({
      accountId,
      balance,
      lastEventVersion: events[events.length - 1]?.version || 0,
      updatedAt: new Date(),
    })
  }
}
```

### 2. 🔄 CQRS Pattern

```typescript
// CQRS để separate reads và writes
@Injectable()
export class ProductCommandService {
  constructor(
    @InjectRepository(Product)
    private productRepository: Repository<Product>,
    private eventBus: EventBus,
  ) {}

  // Command side - handles writes
  async updateInventory(productId: string, change: number) {
    return await this.productRepository.manager.transaction(async (manager) => {
      const product = await manager.findOne(Product, {
        where: { id: productId },
        lock: { mode: 'pessimistic_write' },
      })

      if (!product) {
        throw new Error('Product not found')
      }

      const newInventory = product.inventory + change
      if (newInventory < 0) {
        throw new Error('Insufficient inventory')
      }

      product.inventory = newInventory
      await manager.save(product)

      // Emit event for read model updates
      this.eventBus.publish(new InventoryUpdatedEvent(productId, product.inventory, change))

      return product
    })
  }
}

@Injectable()
export class ProductQueryService {
  constructor(
    @InjectRepository(ProductReadModel)
    private readModelRepository: Repository<ProductReadModel>,
  ) {}

  // Query side - optimized for reads
  async getProductInventory(productId: string) {
    return await this.readModelRepository.findOne({
      where: { id: productId },
    })
  }

  @EventsHandler(InventoryUpdatedEvent)
  async handleInventoryUpdate(event: InventoryUpdatedEvent) {
    // Update read model asynchronously
    await this.readModelRepository.update(
      { id: event.productId },
      {
        inventory: event.newInventory,
        lastUpdated: new Date(),
      },
    )
  }
}
```

### 3. 🌊 Saga Pattern

```typescript
// Saga pattern for distributed transactions
@Injectable()
export class OrderSagaService {
  private readonly logger = new Logger(OrderSagaService.name)

  constructor(
    private paymentService: PaymentService,
    private inventoryService: InventoryService,
    private shippingService: ShippingService,
    private eventBus: EventBus,
  ) {}

  async processOrder(orderData: CreateOrderDto) {
    const sagaId = `saga-${Date.now()}-${Math.random()}`
    const compensations: Array<() => Promise<void>> = []

    try {
      // Step 1: Reserve inventory
      this.logger.log(`${sagaId}: Reserving inventory`)
      await this.inventoryService.reserveItems(orderData.items)
      compensations.push(() => this.inventoryService.releaseReservation(orderData.items))

      // Step 2: Process payment
      this.logger.log(`${sagaId}: Processing payment`)
      const paymentResult = await this.paymentService.processPayment(orderData.customerId, orderData.totalAmount)
      compensations.push(() => this.paymentService.refundPayment(paymentResult.transactionId))

      // Step 3: Create shipping
      this.logger.log(`${sagaId}: Creating shipping`)
      const shippingResult = await this.shippingService.createShipment(orderData)
      compensations.push(() => this.shippingService.cancelShipment(shippingResult.shipmentId))

      // Success - commit all changes
      await this.inventoryService.commitReservation(orderData.items)

      this.logger.log(`${sagaId}: Order processed successfully`)
      return {
        success: true,
        orderId: orderData.id,
        paymentId: paymentResult.transactionId,
        shipmentId: shippingResult.shipmentId,
      }
    } catch (error) {
      this.logger.error(`${sagaId}: Saga failed, executing compensations`)

      // Execute compensations in reverse order
      for (const compensation of compensations.reverse()) {
        try {
          await compensation()
        } catch (compensationError) {
          this.logger.error('Compensation failed:', compensationError)
        }
      }

      throw error
    }
  }
}
```

---

## 📝 Best Practices

### ✅ DO's

1. **Use Database Constraints**

```typescript
// ✅ GOOD: Database-level constraints
@Entity()
export class Account {
  @Column({ type: 'decimal', precision: 10, scale: 2 })
  @Check('balance >= 0') // Prevent negative balance
  balance: number

  @Column()
  @Index({ unique: true }) // Prevent duplicate emails
  email: string

  @VersionColumn() // Enable optimistic locking
  version: number
}
```

2. **Implement Idempotency**

```typescript
// ✅ GOOD: Idempotent operations
async processPayment(paymentId: string, amount: number) {
  // Check if already processed
  const existingPayment = await this.paymentRepository.findOne({
    where: { id: paymentId }
  })

  if (existingPayment) {
    return existingPayment // Idempotent response
  }

  // Process payment...
  return await this.createPayment(paymentId, amount)
}
```

3. **Use Atomic Operations**

```typescript
// ✅ GOOD: Atomic database operations
async transferFunds(fromId: string, toId: string, amount: number) {
  await this.dataSource.transaction(async manager => {
    // Both updates trong cùng transaction
    await manager.decrement(Account, { id: fromId }, 'balance', amount)
    await manager.increment(Account, { id: toId }, 'balance', amount)
  })
}
```

### ❌ DON'Ts

1. **Don't Read-Modify-Write Without Protection**

```typescript
// ❌ BAD
async updateCounter() {
  const counter = await this.getCounter()
  counter.value += 1
  await this.saveCounter(counter)
}

// ✅ GOOD
async updateCounter() {
  await this.counterRepository.increment({}, 'value', 1)
}
```

2. **Don't Assume Sequential Execution**

```typescript
// ❌ BAD: Assuming order
async processItems(items: Item[]) {
  for (const item of items) {
    await this.processItem(item) // Not guaranteed to be sequential!
  }
}

// ✅ GOOD: Explicit sequential processing
async processItems(items: Item[]) {
  for (const item of items) {
    await this.processItemWithLock(item)
  }
}
```

---

## 🚨 Common Pitfalls

### 1. 🔒 Lock Escalation

```typescript
// ❌ Avoid: Locking too broadly
async updateUserData(userId: string, updates: any) {
  // This locks the entire user table!
  await this.dataSource.transaction(async manager => {
    await manager.query('LOCK TABLES users WRITE')
    // Update logic...
  })
}

// ✅ Better: Row-level locking
async updateUserData(userId: string, updates: any) {
  await this.dataSource.transaction(async manager => {
    const user = await manager.findOne(User, {
      where: { id: userId },
      lock: { mode: 'pessimistic_write' }
    })
    // Update logic...
  })
}
```

### 2. 💀 Deadlock Prevention

```typescript
// ✅ Deadlock prevention strategies
@Injectable()
export class DeadlockSafeService {
  async transferFunds(fromId: string, toId: string, amount: number) {
    // Always lock accounts in consistent order để prevent deadlocks
    const [firstId, secondId] = [fromId, toId].sort()

    await this.dataSource.transaction(async (manager) => {
      const firstAccount = await manager.findOne(Account, {
        where: { id: firstId },
        lock: { mode: 'pessimistic_write' },
      })

      const secondAccount = await manager.findOne(Account, {
        where: { id: secondId },
        lock: { mode: 'pessimistic_write' },
      })

      // Perform transfer logic...
    })
  }
}
```

### 3. 🕰️ Long-Running Transactions

```typescript
// ❌ Avoid: Long transactions
async longRunningProcess() {
  await this.dataSource.transaction(async manager => {
    // This holds locks for too long!
    await this.processLargeDataset()
    await this.generateReports()
    await this.sendEmails()
  })
}

// ✅ Better: Break into smaller transactions
async longRunningProcess() {
  const batchSize = 100
  let offset = 0

  while (true) {
    const processed = await this.dataSource.transaction(async manager => {
      return await this.processBatch(manager, offset, batchSize)
    })

    if (processed === 0) break
    offset += batchSize
  }
}
```

---

## 📋 Tóm tắt

### 🎯 Key Takeaways

1. **Race Conditions Are Inevitable**: Trong concurrent systems, race conditions sẽ xảy ra
2. **Multiple Protection Levels**: Database, application, và distributed level protections
3. **Choose Right Strategy**: Pessimistic vs Optimistic vs Distributed locks
4. **Atomic Operations**: Use database features cho atomic updates
5. **Test Concurrency**: Always test với high concurrency scenarios

### 🚀 When to Apply Race Condition Protection

**✅ Critical for:**

- Financial transactions và payments
- Inventory management
- User registration và authentication
- Counter updates và statistics
- Resource allocation
- Data consistency requirements

**❌ Less Important for:**

- Read-only operations
- Cache updates (eventual consistency OK)
- Logging và analytics
- Non-critical UI state
- Temporary data

### 🏗️ Protection Strategy Selection

| Scenario               | Protection Strategy   | Rationale                   |
| ---------------------- | --------------------- | --------------------------- |
| **High Contention**    | Pessimistic Locking   | Avoid retry storms          |
| **Low Contention**     | Optimistic Locking    | Better performance          |
| **Distributed System** | Redis/Redlock         | Cross-instance coordination |
| **Financial Data**     | Database Transactions | ACID compliance             |
| **Counters**           | Atomic Operations     | Simple và efficient         |
| **Complex Workflows**  | Saga Pattern          | Compensating actions        |

**⚡ Với proper race condition handling, bạn có thể build robust và reliable NestJS applications!**
