# 🔓 Optimistic Lock trong NestJS

## 📖 Giới thiệu

**Optimistic Lock** là một concurrency control mechanism hoạt động dựa trên giả định rằng conflicts giữa các transactions ít xảy ra. Thay vì lock data ngay từ đầu như Pessimistic Lock, Optimistic Lock cho phép multiple transactions đọc và modify data simultaneously, chỉ check conflicts khi commit.

### 🎯 Nguyên lý hoạt động

```
Timeline: Optimistic Lock Flow

T1: |---Read(v1)---Modify---Check(v1)---Commit✓---|
T2:   |---Read(v1)---Modify---Check(v1)---Fail❌|
T3:     |---Read(v1)---Modify---Check(v1)---Fail❌|

T1 wins, T2 & T3 must retry with new version
```

---

## 🏗️ Database Schema Setup

### 1. Entity với Version Field

```typescript
// src/entities/account.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, VersionColumn } from 'typeorm'

@Entity('accounts')
export class Account {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('varchar', { length: 100 })
  accountNumber: string

  @Column('varchar', { length: 255 })
  ownerName: string

  @Column('decimal', { precision: 15, scale: 2, default: 0 })
  balance: number

  @Column('boolean', { default: true })
  isActive: boolean

  // ✅ Version column for optimistic locking
  @VersionColumn()
  version: number

  @Column('timestamp', { default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date

  @Column('timestamp', { default: () => 'CURRENT_TIMESTAMP' })
  updatedAt: Date
}
```

### 2. Alternative: Custom Version Implementation

```typescript
// src/entities/product.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, BeforeUpdate } from 'typeorm'

@Entity('products')
export class Product {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('varchar', { length: 255 })
  name: string

  @Column('text', { nullable: true })
  description: string

  @Column('decimal', { precision: 10, scale: 2 })
  price: number

  @Column('integer', { default: 0 })
  stockQuantity: number

  // ✅ Manual version control
  @Column('integer', { default: 1 })
  version: number

  // ✅ Alternative: timestamp-based versioning
  @Column('timestamp', { default: () => 'CURRENT_TIMESTAMP' })
  lastModified: Date

  @BeforeUpdate()
  updateVersion() {
    this.version++
    this.lastModified = new Date()
  }
}
```

### 3. Hibernate-style Optimistic Lock

```typescript
// src/entities/order.entity.ts
import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm'

@Entity('orders')
export class Order {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('varchar', { length: 50 })
  orderNumber: string

  @Column('decimal', { precision: 12, scale: 2 })
  totalAmount: number

  @Column('enum', {
    enum: ['PENDING', 'PROCESSING', 'SHIPPED', 'DELIVERED', 'CANCELLED'],
    default: 'PENDING',
  })
  status: string

  // ✅ Optimistic lock with custom field name
  @Column('bigint', { default: 0 })
  lockVersion: number

  @Column('timestamp', { default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date

  // ✅ Method to increment version manually
  incrementVersion(): void {
    this.lockVersion++
  }
}
```

---

## 🔧 Repository Implementation

### 1. Basic Optimistic Repository

```typescript
// src/repositories/account.repository.ts
import { Injectable } from '@nestjs/common'
import { Repository, DataSource, OptimisticLockVersionMismatchError } from 'typeorm'
import { Account } from '../entities/account.entity'

@Injectable()
export class AccountRepository {
  private repository: Repository<Account>

  constructor(private dataSource: DataSource) {
    this.repository = this.dataSource.getRepository(Account)
  }

  // ✅ Find with version for optimistic lock
  async findByIdWithVersion(id: string): Promise<Account | null> {
    return await this.repository.findOne({
      where: { id },
      // Version is automatically included with @VersionColumn
    })
  }

  // ✅ Update with optimistic lock check
  async updateWithOptimisticLock(id: string, updates: Partial<Account>, expectedVersion: number): Promise<Account> {
    const result = await this.repository
      .createQueryBuilder()
      .update(Account)
      .set(updates)
      .where('id = :id AND version = :version', {
        id,
        version: expectedVersion,
      })
      .execute()

    if (result.affected === 0) {
      throw new OptimisticLockVersionMismatchError(
        Account,
        expectedVersion,
        expectedVersion + 1, // Assumed current version
      )
    }

    // Return updated entity
    return await this.findByIdWithVersion(id)
  }

  // ✅ Batch update with optimistic lock
  async updateMultipleWithOptimisticLock(
    updates: Array<{
      id: string
      data: Partial<Account>
      expectedVersion: number
    }>,
  ): Promise<Account[]> {
    const results: Account[] = []

    for (const update of updates) {
      try {
        const result = await this.updateWithOptimisticLock(update.id, update.data, update.expectedVersion)
        results.push(result)
      } catch (error) {
        if (error instanceof OptimisticLockVersionMismatchError) {
          throw new Error(
            `Optimistic lock failed for account ${update.id}. ` + `Expected version: ${update.expectedVersion}`,
          )
        }
        throw error
      }
    }

    return results
  }

  // ✅ Conditional update with version check
  async conditionalUpdate(
    id: string,
    condition: (account: Account) => boolean,
    updates: Partial<Account>,
  ): Promise<Account | null> {
    // Get current version
    const account = await this.findByIdWithVersion(id)
    if (!account) {
      return null
    }

    // Check business condition
    if (!condition(account)) {
      throw new Error('Business condition not met for update')
    }

    // Attempt optimistic update
    return await this.updateWithOptimisticLock(id, updates, account.version)
  }
}
```

### 2. Advanced Repository với Retry Logic

```typescript
// src/repositories/product.repository.ts
import { Injectable, ConflictException } from '@nestjs/common'
import { Repository, DataSource } from 'typeorm'
import { Product } from '../entities/product.entity'

export interface OptimisticUpdateResult<T> {
  success: boolean
  data?: T
  attempts: number
  finalError?: Error
}

@Injectable()
export class ProductRepository {
  private repository: Repository<Product>

  constructor(private dataSource: DataSource) {
    this.repository = this.dataSource.getRepository(Product)
  }

  // ✅ Update with automatic retry on version conflicts
  async updateWithRetry(
    id: string,
    updateFn: (product: Product) => Partial<Product>,
    maxRetries: number = 3,
  ): Promise<OptimisticUpdateResult<Product>> {
    let attempts = 0
    let lastError: Error

    while (attempts < maxRetries) {
      attempts++

      try {
        // Get fresh copy with current version
        const product = await this.repository.findOne({ where: { id } })
        if (!product) {
          throw new Error(`Product ${id} not found`)
        }

        // Apply updates
        const updates = updateFn(product)

        // Attempt optimistic update
        const result = await this.repository
          .createQueryBuilder()
          .update(Product)
          .set({
            ...updates,
            version: product.version + 1, // Increment version
            lastModified: new Date(),
          })
          .where('id = :id AND version = :version', {
            id,
            version: product.version,
          })
          .execute()

        if (result.affected === 0) {
          throw new ConflictException(`Optimistic lock conflict for product ${id}`)
        }

        // Success - return updated product
        const updatedProduct = await this.repository.findOne({ where: { id } })
        return {
          success: true,
          data: updatedProduct,
          attempts,
        }
      } catch (error) {
        lastError = error

        if (attempts >= maxRetries) {
          break
        }

        // Wait before retry (exponential backoff)
        const waitTime = Math.pow(2, attempts - 1) * 100 // 100ms, 200ms, 400ms
        await this.sleep(waitTime)
      }
    }

    return {
      success: false,
      attempts,
      finalError: lastError,
    }
  }

  // ✅ Bulk update with optimistic locking
  async bulkUpdateWithOptimisticLock(
    updates: Array<{
      id: string
      updateFn: (product: Product) => Partial<Product>
    }>,
  ): Promise<{
    successful: Product[]
    failed: Array<{ id: string; error: string }>
  }> {
    const successful: Product[] = []
    const failed: Array<{ id: string; error: string }> = []

    // Process updates in parallel with limited concurrency
    const concurrencyLimit = 5

    for (let i = 0; i < updates.length; i += concurrencyLimit) {
      const batch = updates.slice(i, i + concurrencyLimit)

      const batchResults = await Promise.allSettled(
        batch.map(async (update) => {
          const result = await this.updateWithRetry(
            update.id,
            update.updateFn,
            3, // max 3 retries per item
          )

          if (result.success) {
            return { id: update.id, product: result.data }
          } else {
            throw new Error(result.finalError?.message || 'Update failed')
          }
        }),
      )

      // Process batch results
      batchResults.forEach((result, index) => {
        const updateItem = batch[index]

        if (result.status === 'fulfilled') {
          successful.push(result.value.product)
        } else {
          failed.push({
            id: updateItem.id,
            error: result.reason.message,
          })
        }
      })
    }

    return { successful, failed }
  }

  // ✅ Stock management với optimistic locking
  async decreaseStock(productId: string, quantity: number): Promise<Product> {
    const result = await this.updateWithRetry(
      productId,
      (product) => {
        if (product.stockQuantity < quantity) {
          throw new Error(`Insufficient stock. Available: ${product.stockQuantity}, ` + `Requested: ${quantity}`)
        }

        return {
          stockQuantity: product.stockQuantity - quantity,
        }
      },
      5, // Higher retry count for stock operations
    )

    if (!result.success) {
      throw new ConflictException(`Failed to decrease stock for product ${productId}: ` + result.finalError?.message)
    }

    return result.data
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
```

---

## 🔄 Service Layer Implementation

### 1. Banking Service với Optimistic Lock

```typescript
// src/services/banking.service.ts
import { Injectable, ConflictException, BadRequestException } from '@nestjs/common'
import { DataSource } from 'typeorm'
import { AccountRepository } from '../repositories/account.repository'
import { Account } from '../entities/account.entity'

export interface TransferRequest {
  fromAccountId: string
  toAccountId: string
  amount: number
  description?: string
}

export interface TransferResult {
  transactionId: string
  fromAccount: Account
  toAccount: Account
  attempts: number
  timestamp: Date
}

@Injectable()
export class BankingService {
  constructor(
    private accountRepository: AccountRepository,
    private dataSource: DataSource,
  ) {}

  // ✅ Money transfer với optimistic locking
  async transferMoney(request: TransferRequest): Promise<TransferResult> {
    const { fromAccountId, toAccountId, amount, description } = request

    // Validation
    if (amount <= 0) {
      throw new BadRequestException('Transfer amount must be positive')
    }

    if (fromAccountId === toAccountId) {
      throw new BadRequestException('Cannot transfer to same account')
    }

    const maxRetries = 5
    let attempts = 0

    while (attempts < maxRetries) {
      attempts++

      try {
        return await this.attemptTransfer(request, attempts)
      } catch (error) {
        if (error instanceof ConflictException && attempts < maxRetries) {
          // Exponential backoff with jitter
          const baseDelay = Math.pow(2, attempts - 1) * 100
          const jitter = Math.random() * 50
          await this.sleep(baseDelay + jitter)
          continue
        }

        throw error
      }
    }

    throw new ConflictException(`Transfer failed after ${maxRetries} attempts due to concurrent modifications`)
  }

  private async attemptTransfer(request: TransferRequest, attemptNumber: number): Promise<TransferResult> {
    const { fromAccountId, toAccountId, amount } = request

    // Get accounts with current versions
    const [fromAccount, toAccount] = await Promise.all([
      this.accountRepository.findByIdWithVersion(fromAccountId),
      this.accountRepository.findByIdWithVersion(toAccountId),
    ])

    // Validate accounts exist
    if (!fromAccount) {
      throw new BadRequestException(`Source account ${fromAccountId} not found`)
    }
    if (!toAccount) {
      throw new BadRequestException(`Destination account ${toAccountId} not found`)
    }

    // Validate account states
    if (!fromAccount.isActive) {
      throw new BadRequestException('Source account is inactive')
    }
    if (!toAccount.isActive) {
      throw new BadRequestException('Destination account is inactive')
    }

    // Check sufficient balance
    if (fromAccount.balance < amount) {
      throw new BadRequestException(`Insufficient balance. Available: ${fromAccount.balance}, Required: ${amount}`)
    }

    // Perform optimistic updates
    // Always update accounts in consistent order (by ID) to prevent deadlocks
    const sortedUpdates = [
      {
        account: fromAccount,
        newBalance: Number(fromAccount.balance) - Number(amount),
      },
      {
        account: toAccount,
        newBalance: Number(toAccount.balance) + Number(amount),
      },
    ].sort((a, b) => a.account.id.localeCompare(b.account.id))

    try {
      const updatedAccounts = await Promise.all(
        sortedUpdates.map(async ({ account, newBalance }) => {
          return await this.accountRepository.updateWithOptimisticLock(
            account.id,
            {
              balance: newBalance,
              updatedAt: new Date(),
            },
            account.version,
          )
        }),
      )

      // Find updated accounts
      const updatedFromAccount = updatedAccounts.find((acc) => acc.id === fromAccountId)
      const updatedToAccount = updatedAccounts.find((acc) => acc.id === toAccountId)

      return {
        transactionId: this.generateTransactionId(),
        fromAccount: updatedFromAccount,
        toAccount: updatedToAccount,
        attempts: attemptNumber,
        timestamp: new Date(),
      }
    } catch (error) {
      throw new ConflictException(`Optimistic lock conflict during transfer (attempt ${attemptNumber})`)
    }
  }

  // ✅ Batch money transfer
  async batchTransfer(transfers: TransferRequest[]): Promise<{
    successful: TransferResult[]
    failed: Array<{ request: TransferRequest; error: string }>
  }> {
    const successful: TransferResult[] = []
    const failed: Array<{ request: TransferRequest; error: string }> = []

    // Process transfers with limited concurrency
    const concurrencyLimit = 3

    for (let i = 0; i < transfers.length; i += concurrencyLimit) {
      const batch = transfers.slice(i, i + concurrencyLimit)

      const results = await Promise.allSettled(batch.map((transfer) => this.transferMoney(transfer)))

      results.forEach((result, index) => {
        const transfer = batch[index]

        if (result.status === 'fulfilled') {
          successful.push(result.value)
        } else {
          failed.push({
            request: transfer,
            error: result.reason.message,
          })
        }
      })
    }

    return { successful, failed }
  }

  // ✅ Account balance update với optimistic lock
  async updateBalance(accountId: string, newBalance: number, reason: string = 'Manual adjustment'): Promise<Account> {
    if (newBalance < 0) {
      throw new BadRequestException('Account balance cannot be negative')
    }

    return await this.accountRepository.conditionalUpdate(
      accountId,
      (account) => account.isActive, // Only update active accounts
      {
        balance: newBalance,
        updatedAt: new Date(),
      },
    )
  }

  private generateTransactionId(): string {
    return `TXN_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}
```

---

## 🛒 Real-world Examples

### 1. E-commerce Order Processing

````typescript
// src/entities/order-item.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, ManyToOne, VersionColumn } from 'typeorm'
import { Order } from './order.entity'
import { Product } from './product.entity'

@Entity('order_items')
export class OrderItem {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @ManyToOne(() => Order, order => order.items)
  order: Order

  @Column('uuid')
  orderId: string

  @ManyToOne(() => Product)
  product: Product

  @Column('uuid')
  productId: string

  @Column('integer')
  quantity: number

  @Column('decimal', { precision: 10, scale: 2 })
  unitPrice: number

  @Column('decimal', { precision: 12, scale: 2 })
  totalPrice: number

  @VersionColumn()
  version: number
}

// src/services/order.service.ts
import { Injectable, ConflictException, BadRequestException } from '@nestjs/common'
import { DataSource } from 'typeorm'
import { Order } from '../entities/order.entity'
import { OrderItem } from '../entities/order-item.entity'
import { ProductRepository } from '../repositories/product.repository'

export interface CreateOrderRequest {
  customerId: string
  items: Array<{
    productId: string
    quantity: number
  }>
  shippingAddress: string
  paymentMethod: string
}

@Injectable()
export class OrderService {
  constructor(
    private dataSource: DataSource,
    private productRepository: ProductRepository
  ) {}

  // ✅ Create order với stock reservation
  async createOrder(request: CreateOrderRequest): Promise<Order> {
    const maxRetries = 5
    let attempts = 0

    while (attempts < maxRetries) {
      attempts++

      try {
        return await this.attemptCreateOrder(request, attempts)

      } catch (error) {
        if (error instanceof ConflictException && attempts < maxRetries) {
          // Random backoff để avoid thundering herd
          const delay = Math.random() * 200 + 100
          await this.sleep(delay)
          continue
        }
        throw error
      }
    }

    throw new ConflictException(
      `Order creation failed after ${maxRetries} attempts due to stock conflicts`
    )
  }

  private async attemptCreateOrder(
    request: CreateOrderRequest,
    attemptNumber: number
  ): Promise<Order> {

    return await this.dataSource.transaction(async (manager) => {
      // 1. Validate và reserve stock cho all products
      const reservedProducts = []
      let totalAmount = 0

      for (const item of request.items) {
        // Get current product version
        const product = await this.productRepository.findByIdWithVersion(item.productId)

        if (!product) {
          throw new BadRequestException(`Product ${item.productId} not found`)
        }

        if (product.stockQuantity < item.quantity) {
          throw new BadRequestException(
            `Insufficient stock for ${product.name}. ` +
            `Available: ${product.stockQuantity}, Requested: ${item.quantity}`
          )
        }

        // Reserve stock với optimistic lock
        const updatedProduct = await manager
          .createQueryBuilder()
          .update(Product)
          .set({
            stockQuantity: product.stockQuantity - item.quantity,
            version: product.version + 1,
            lastModified: new Date(),
          })
          .where('id = :id AND version = :version', {
            id: product.id,
            version: product.version,
          })
          .execute()

        if (updatedProduct.affected === 0) {
          throw new ConflictException(
            `Stock conflict for product ${product.name} (attempt ${attemptNumber})`
          )
        }

        reservedProducts.push({
          product,
          quantity: item.quantity,
          unitPrice: product.price,
          totalPrice: product.price * item.quantity,
        })

        totalAmount += product.price * item.quantity
      }

      // 2. Create order
      const order = manager.create(Order, {
        customerId: request.customerId,
        orderNumber: this.generateOrderNumber(),
        totalAmount,
        status: 'PENDING',
        shippingAddress: request.shippingAddress,
        paymentMethod: request.paymentMethod,
      })

      const savedOrder = await manager.save(order)

      // 3. Create order items
      for (const reserved of reservedProducts) {
        const orderItem = manager.create(OrderItem, {
          orderId: savedOrder.id,
          productId: reserved.product.id,
          quantity: reserved.quantity,
          unitPrice: reserved.unitPrice,
          totalPrice: reserved.totalPrice,
        })

        await manager.save(orderItem)
      }

      return savedOrder
    })
  }

  // ✅ Cancel order và restore stock
  async cancelOrder(orderId: string): Promise<Order> {
    const maxRetries = 3
    let attempts = 0

    while (attempts < maxRetries) {
      attempts++

      try {
        return await this.attemptCancelOrder(orderId, attempts)

      } catch (error) {
        if (error instanceof ConflictException && attempts < maxRetries) {
          await this.sleep(100 * attempts)
          continue
        }
        throw error
      }
    }

    throw new ConflictException(
      `Order cancellation failed after ${maxRetries} attempts`
    )
  }

  private async attemptCancelOrder(orderId: string, attemptNumber: number): Promise<Order> {
    return await this.dataSource.transaction(async (manager) => {
      // Get order with items
      const order = await manager.findOne(Order, {
        where: { id: orderId },
        relations: ['items', 'items.product'],
      })

      if (!order) {
        throw new BadRequestException(`Order ${orderId} not found`)
      }

      if (order.status !== 'PENDING') {
        throw new BadRequestException(
          `Cannot cancel order with status: ${order.status}`
        )
      }

      // Restore stock cho all items
      for (const item of order.items) {
        const product = await this.productRepository.findByIdWithVersion(item.productId)

        if (!product) {
          console.warn(`Product ${item.productId} not found during cancellation`)
          continue
        }

        // Restore stock với optimistic lock
        const result = await manager
          .createQueryBuilder()
          .update(Product)
          .set({
            stockQuantity: product.stockQuantity + item.quantity,
            version: product.version + 1,
            lastModified: new Date(),
          })
          .where('id = :id AND version = :version', {
            id: product.id,
            version: product.version,
          })
          .execute()

        if (result.affected === 0) {
          throw new ConflictException(
            `Stock restoration conflict for product ${product.name} ` +
            `(attempt ${attemptNumber})`
          )
        }
      }

      // Update order status
      order.status = 'CANCELLED'
      return await manager.save(order)
    })
  }

  private generateOrderNumber(): string {
    return `ORD${Date.now()}${Math.random().toString(36).substr(2, 6).toUpperCase()}`
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

### 2. Inventory Management System

```typescript
// src/entities/inventory-transaction.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, VersionColumn } from 'typeorm'

@Entity('inventory_transactions')
export class InventoryTransaction {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  productId: string

  @Column('enum', {
    enum: ['IN', 'OUT', 'ADJUSTMENT', 'TRANSFER'],
  })
  type: 'IN' | 'OUT' | 'ADJUSTMENT' | 'TRANSFER'

  @Column('integer')
  quantity: number

  @Column('integer')
  previousStock: number

  @Column('integer')
  newStock: number

  @Column('varchar', { length: 255, nullable: true })
  reason: string

  @Column('varchar', { length: 100, nullable: true })
  referenceNumber: string

  @Column('uuid', { nullable: true })
  userId: string

  @VersionColumn()
  version: number

  @Column('timestamp', { default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date
}

// src/services/inventory.service.ts
import { Injectable, ConflictException, BadRequestException } from '@nestjs/common'
import { DataSource } from 'typeorm'
import { Product } from '../entities/product.entity'
import { InventoryTransaction } from '../entities/inventory-transaction.entity'
import { ProductRepository } from '../repositories/product.repository'

export interface StockMovement {
  productId: string
  quantity: number
  type: 'IN' | 'OUT' | 'ADJUSTMENT' | 'TRANSFER'
  reason?: string
  referenceNumber?: string
  userId?: string
}

@Injectable()
export class InventoryService {
  constructor(
    private dataSource: DataSource,
    private productRepository: ProductRepository
  ) {}

  // ✅ Batch stock movement với optimistic locking
  async processBatchStockMovement(
    movements: StockMovement[]
  ): Promise<{
    successful: InventoryTransaction[]
    failed: Array<{ movement: StockMovement, error: string }>
  }> {
    const successful: InventoryTransaction[] = []
    const failed: Array<{ movement: StockMovement, error: string }> = []

    // Group movements by productId để batch process
    const groupedMovements = new Map<string, StockMovement[]>()

    movements.forEach(movement => {
      const existing = groupedMovements.get(movement.productId) || []
      existing.push(movement)
      groupedMovements.set(movement.productId, existing)
    })

    // Process each product's movements
    for (const [productId, productMovements] of groupedMovements) {
      try {
        const transactions = await this.processProductMovements(productId, productMovements)
        successful.push(...transactions)

      } catch (error) {
        productMovements.forEach(movement => {
          failed.push({
            movement,
            error: error.message,
          })
        })
      }
    }

    return { successful, failed }
  }

  private async processProductMovements(
    productId: string,
    movements: StockMovement[]
  ): Promise<InventoryTransaction[]> {
    const maxRetries = 5
    let attempts = 0

    while (attempts < maxRetries) {
      attempts++

      try {
        return await this.attemptProductMovements(productId, movements, attempts)

      } catch (error) {
        if (error instanceof ConflictException && attempts < maxRetries) {
          await this.sleep(Math.random() * 100 + 50)
          continue
        }
        throw error
      }
    }

    throw new ConflictException(
      `Stock movements failed for product ${productId} after ${maxRetries} attempts`
    )
  }

  private async attemptProductMovements(
    productId: string,
    movements: StockMovement[],
    attemptNumber: number
  ): Promise<InventoryTransaction[]> {

    return await this.dataSource.transaction(async (manager) => {
      // Get current product state
      const product = await this.productRepository.findByIdWithVersion(productId)

      if (!product) {
        throw new BadRequestException(`Product ${productId} not found`)
      }

      let currentStock = product.stockQuantity
      const transactions: InventoryTransaction[] = []

      // Calculate final stock và validate
      for (const movement of movements) {
        const newStock = this.calculateNewStock(currentStock, movement)

        if (newStock < 0) {
          throw new BadRequestException(
            `Insufficient stock for ${product.name}. ` +
            `Current: ${currentStock}, Required: ${Math.abs(movement.quantity)}`
          )
        }

        // Create transaction record
        const transaction = manager.create(InventoryTransaction, {
          productId,
          type: movement.type,
          quantity: movement.quantity,
          previousStock: currentStock,
          newStock,
          reason: movement.reason,
          referenceNumber: movement.referenceNumber,
          userId: movement.userId,
        })

        transactions.push(transaction)
        currentStock = newStock
      }

      // Update product stock với optimistic lock
      const result = await manager
        .createQueryBuilder()
        .update(Product)
        .set({
          stockQuantity: currentStock,
          version: product.version + 1,
          lastModified: new Date(),
        })
        .where('id = :id AND version = :version', {
          id: productId,
          version: product.version,
        })
        .execute()

      if (result.affected === 0) {
        throw new ConflictException(
          `Stock update conflict for product ${product.name} ` +
          `(attempt ${attemptNumber})`
        )
      }

      // Save all transactions
      const savedTransactions = await manager.save(transactions)
      return savedTransactions
    })
  }

  private calculateNewStock(currentStock: number, movement: StockMovement): number {
    switch (movement.type) {
      case 'IN':
        return currentStock + Math.abs(movement.quantity)
      case 'OUT':
        return currentStock - Math.abs(movement.quantity)
      case 'ADJUSTMENT':
        return movement.quantity // Absolute value
      case 'TRANSFER':
        return movement.quantity > 0
          ? currentStock + movement.quantity
          : currentStock + movement.quantity // movement.quantity is already negative
      default:
        throw new Error(`Unknown movement type: ${movement.type}`)
    }
  }

  private generateTransferReference(): string {
    return `TXF${Date.now()}${Math.random().toString(36).substr(2, 6).toUpperCase()}`
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

### 3. User Profile Management

```typescript
// src/entities/user-profile.entity.ts
import { Entity, PrimaryGeneratedColumn, Column, VersionColumn } from 'typeorm'

@Entity('user_profiles')
export class UserProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string

  @Column('uuid')
  userId: string

  @Column('varchar', { length: 100 })
  displayName: string

  @Column('varchar', { length: 255, nullable: true })
  bio: string

  @Column('varchar', { length: 255, nullable: true })
  avatarUrl: string

  @Column('json', { nullable: true })
  preferences: Record<string, any>

  @Column('json', { nullable: true })
  socialLinks: {
    twitter?: string
    linkedin?: string
    github?: string
  }

  @Column('integer', { default: 0 })
  profileViews: number

  @Column('integer', { default: 0 })
  followersCount: number

  @Column('integer', { default: 0 })
  followingCount: number

  @VersionColumn()
  version: number

  @Column('timestamp', { default: () => 'CURRENT_TIMESTAMP' })
  createdAt: Date

  @Column('timestamp', { default: () => 'CURRENT_TIMESTAMP' })
  updatedAt: Date
}

// src/services/user-profile.service.ts
import { Injectable, ConflictException, BadRequestException } from '@nestjs/common'
import { DataSource } from 'typeorm'
import { UserProfile } from '../entities/user-profile.entity'

export interface ProfileUpdateRequest {
  displayName?: string
  bio?: string
  avatarUrl?: string
  preferences?: Record<string, any>
  socialLinks?: Record<string, string>
}

@Injectable()
export class UserProfileService {
  constructor(private dataSource: DataSource) {}

  // ✅ Update profile với optimistic locking
  async updateProfile(
    userId: string,
    updates: ProfileUpdateRequest
  ): Promise<UserProfile> {
    const maxRetries = 3
    let attempts = 0

    while (attempts < maxRetries) {
      attempts++

      try {
        return await this.attemptProfileUpdate(userId, updates, attempts)

      } catch (error) {
        if (error instanceof ConflictException && attempts < maxRetries) {
          await this.sleep(50 * attempts)
          continue
        }
        throw error
      }
    }

    throw new ConflictException(
      `Profile update failed after ${maxRetries} attempts`
    )
  }

  private async attemptProfileUpdate(
    userId: string,
    updates: ProfileUpdateRequest,
    attemptNumber: number
  ): Promise<UserProfile> {

    return await this.dataSource.transaction(async (manager) => {
      // Get current profile
      const profile = await manager.findOne(UserProfile, {
        where: { userId }
      })

      if (!profile) {
        throw new BadRequestException(`Profile for user ${userId} not found`)
      }

      // Validate updates
      if (updates.displayName && updates.displayName.length > 100) {
        throw new BadRequestException('Display name too long')
      }

      if (updates.bio && updates.bio.length > 255) {
        throw new BadRequestException('Bio too long')
      }

      // Merge preferences safely
      const newPreferences = updates.preferences
        ? { ...profile.preferences, ...updates.preferences }
        : profile.preferences

      // Update với optimistic lock
      const result = await manager
        .createQueryBuilder()
        .update(UserProfile)
        .set({
          ...updates,
          preferences: newPreferences,
          updatedAt: new Date(),
        })
        .where('userId = :userId AND version = :version', {
          userId,
          version: profile.version,
        })
        .execute()

      if (result.affected === 0) {
        throw new ConflictException(
          `Profile update conflict (attempt ${attemptNumber})`
        )
      }

      // Return updated profile
      return await manager.findOne(UserProfile, { where: { userId } })
    })
  }

  // ✅ Increment counters với optimistic locking
  async incrementProfileViews(userId: string): Promise<UserProfile> {
    return await this.incrementCounter(userId, 'profileViews', 1)
  }

  async incrementFollowersCount(userId: string, delta: number = 1): Promise<UserProfile> {
    return await this.incrementCounter(userId, 'followersCount', delta)
  }

  async incrementFollowingCount(userId: string, delta: number = 1): Promise<UserProfile> {
    return await this.incrementCounter(userId, 'followingCount', delta)
  }

  private async incrementCounter(
    userId: string,
    field: 'profileViews' | 'followersCount' | 'followingCount',
    delta: number
  ): Promise<UserProfile> {
    const maxRetries = 5
    let attempts = 0

    while (attempts < maxRetries) {
      attempts++

      try {
        return await this.dataSource.transaction(async (manager) => {
          const profile = await manager.findOne(UserProfile, {
            where: { userId }
          })

          if (!profile) {
            throw new BadRequestException(`Profile for user ${userId} not found`)
          }

          const newValue = profile[field] + delta

          if (newValue < 0) {
            throw new BadRequestException(`${field} cannot be negative`)
          }

          const result = await manager
            .createQueryBuilder()
            .update(UserProfile)
            .set({
              [field]: newValue,
              updatedAt: new Date(),
            })
            .where('userId = :userId AND version = :version', {
              userId,
              version: profile.version,
            })
            .execute()

          if (result.affected === 0) {
            throw new ConflictException(
              `Counter update conflict for ${field} (attempt ${attempts})`
            )
          }

          return await manager.findOne(UserProfile, { where: { userId } })
        })

      } catch (error) {
        if (error instanceof ConflictException && attempts < maxRetries) {
          await this.sleep(Math.random() * 50 + 25)
          continue
        }
        throw error
      }
    }

    throw new ConflictException(
      `Counter increment failed for ${field} after ${maxRetries} attempts`
    )
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}
````

---

## 🔧 Advanced Patterns & Error Handling

### 1. Circuit Breaker Pattern for Optimistic Lock

````typescript
// src/patterns/circuit-breaker.ts
export enum CircuitState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN'
}

export interface CircuitBreakerConfig {
  failureThreshold: number
  recoveryTimeout: number
  monitoringPeriod: number
  halfOpenMaxCalls: number
}

export class CircuitBreaker {
  private state: CircuitState = CircuitState.CLOSED
  private failureCount = 0
  private lastFailureTime?: Date
  private successCount = 0

  constructor(private config: CircuitBreakerConfig) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === CircuitState.OPEN) {
      if (this.shouldAttemptReset()) {
        this.state = CircuitState.HALF_OPEN
        this.successCount = 0
      } else {
        throw new Error('Circuit breaker is OPEN')
      }
    }

    try {
      const result = await operation()
      this.onSuccess()
      return result

    } catch (error) {
      this.onFailure()
      throw error
    }
  }

  private onSuccess(): void {
    this.failureCount = 0

    if (this.state === CircuitState.HALF_OPEN) {
      this.successCount++

      if (this.successCount >= this.config.halfOpenMaxCalls) {
        this.state = CircuitState.CLOSED
      }
    }
  }

  private onFailure(): void {
    this.failureCount++
    this.lastFailureTime = new Date()

    if (this.failureCount >= this.config.failureThreshold) {
      this.state = CircuitState.OPEN
    }
  }

  private shouldAttemptReset(): boolean {
    if (!this.lastFailureTime) return false

    const timeSinceLastFailure = Date.now() - this.lastFailureTime.getTime()
    return timeSinceLastFailure >= this.config.recoveryTimeout
  }

  getState(): CircuitState {
    return this.state
  }

  getMetrics() {
    return {
      state: this.state,
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
    }
  }
}

// src/services/resilient-banking.service.ts
import { Injectable, Logger } from '@nestjs/common'
import { BankingService, TransferRequest } from './banking.service'
import { CircuitBreaker, CircuitBreakerConfig } from '../patterns/circuit-breaker'

@Injectable()
export class ResilientBankingService {
  private readonly logger = new Logger(ResilientBankingService.name)
  private circuitBreaker: CircuitBreaker

  constructor(private bankingService: BankingService) {
    const config: CircuitBreakerConfig = {
      failureThreshold: 5,        // Open after 5 failures
      recoveryTimeout: 60000,     // Try recovery after 1 minute
      monitoringPeriod: 300000,   // 5 minute monitoring window
      halfOpenMaxCalls: 3,        // Allow 3 calls in half-open state
    }

    this.circuitBreaker = new CircuitBreaker(config)
  }

  // ✅ Transfer với circuit breaker protection
  async transferMoney(request: TransferRequest) {
    try {
      return await this.circuitBreaker.execute(async () => {
        return await this.bankingService.transferMoney(request)
      })

    } catch (error) {
      this.logger.error(`Transfer failed through circuit breaker`, {
        request,
        error: error.message,
        circuitState: this.circuitBreaker.getState(),
      })

      // Return fallback response
      if (this.circuitBreaker.getState() === 'OPEN') {
        throw new Error(
          'Banking service temporarily unavailable. Please try again later.'
        )
      }

      throw error
    }
  }

  // ✅ Get circuit breaker health
  getHealthMetrics() {
    return {
      circuitBreaker: this.circuitBreaker.getMetrics(),
      timestamp: new Date(),
    }
  }
}

### 2. Advanced Retry Strategy với Exponential Backoff

```typescript
// src/patterns/retry-strategy.ts
export interface RetryConfig {
  maxAttempts: number
  baseDelay: number
  maxDelay: number
  backoffMultiplier: number
  jitterRange: number
  retryableErrors: Array<new (...args: any[]) => Error>
}

export class ExponentialBackoffRetry {
  constructor(private config: RetryConfig) {}

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    let lastError: Error

    for (let attempt = 1; attempt <= this.config.maxAttempts; attempt++) {
      try {
        return await operation()

      } catch (error) {
        lastError = error

        // Check if error is retryable
        if (!this.isRetryableError(error)) {
          throw error
        }

        // Don't delay after last attempt
        if (attempt === this.config.maxAttempts) {
          break
        }

        // Calculate delay với exponential backoff và jitter
        const delay = this.calculateDelay(attempt)
        await this.sleep(delay)
      }
    }

    throw lastError
  }

  private isRetryableError(error: Error): boolean {
    return this.config.retryableErrors.some(
      ErrorClass => error instanceof ErrorClass
    )
  }

  private calculateDelay(attempt: number): number {
    // Exponential backoff: baseDelay * (backoffMultiplier ^ (attempt - 1))
    const exponentialDelay = this.config.baseDelay *
      Math.pow(this.config.backoffMultiplier, attempt - 1)

    // Cap at maxDelay
    const cappedDelay = Math.min(exponentialDelay, this.config.maxDelay)

    // Add jitter to prevent thundering herd
    const jitter = (Math.random() - 0.5) * 2 * this.config.jitterRange
    const finalDelay = cappedDelay + jitter

    return Math.max(0, finalDelay)
  }

  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms))
  }
}

---

## 📊 Performance & Monitoring

### 1. Conflict Rate Monitoring

```typescript
// src/monitoring/optimistic-lock-monitor.service.ts
import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'

export interface ConflictMetrics {
  entityType: string
  totalAttempts: number
  conflictCount: number
  conflictRate: number
  averageRetries: number
  maxRetries: number
  timestamp: Date
}

@Injectable()
export class OptimisticLockMonitorService {
  private readonly logger = new Logger(OptimisticLockMonitorService.name)
  private metrics = new Map<string, ConflictMetrics>()

  // Track conflict attempt
  recordAttempt(entityType: string, attemptNumber: number, success: boolean) {
    const key = this.getMetricKey(entityType)
    const existing = this.metrics.get(key) || this.createEmptyMetrics(entityType)

    existing.totalAttempts++

    if (!success) {
      existing.conflictCount++
    }

    if (attemptNumber > existing.maxRetries) {
      existing.maxRetries = attemptNumber
    }

    existing.conflictRate = existing.conflictCount / existing.totalAttempts
    existing.averageRetries = existing.totalAttempts > 0
      ? existing.conflictCount / existing.totalAttempts
      : 0

    this.metrics.set(key, existing)
  }

  // Get metrics for entity type
  getMetrics(entityType: string): ConflictMetrics | null {
    return this.metrics.get(this.getMetricKey(entityType)) || null
  }

  // Get all metrics
  getAllMetrics(): ConflictMetrics[] {
    return Array.from(this.metrics.values())
  }

  // Report high conflict rates every 5 minutes
  @Cron('*/5 * * * *')
  async reportHighConflictRates() {
    const highConflictEntities = Array.from(this.metrics.values())
      .filter(metric => metric.conflictRate > 0.1) // More than 10% conflict rate
      .sort((a, b) => b.conflictRate - a.conflictRate)

    if (highConflictEntities.length > 0) {
      this.logger.warn(`High optimistic lock conflict rates detected:`, {
        entities: highConflictEntities.map(entity => ({
          type: entity.entityType,
          conflictRate: `${(entity.conflictRate * 100).toFixed(2)}%`,
          totalAttempts: entity.totalAttempts,
          conflicts: entity.conflictCount,
        })),
      })
    }
  }

  // Reset metrics (call this periodically)
  resetMetrics() {
    this.metrics.clear()
  }

  private getMetricKey(entityType: string): string {
    const now = new Date()
    const hourKey = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}-${now.getHours()}`
    return `${entityType}:${hourKey}`
  }

  private createEmptyMetrics(entityType: string): ConflictMetrics {
    return {
      entityType,
      totalAttempts: 0,
      conflictCount: 0,
      conflictRate: 0,
      averageRetries: 0,
      maxRetries: 0,
      timestamp: new Date(),
    }
  }
}
````

---

## ⚠️ Common Pitfalls & Best Practices

### ❌ Common Mistakes

**1. Ignoring Conflict Resolution**

```typescript
// ❌ No retry logic
async updateProduct(id: string, updates: any) {
  const product = await this.repository.findOne({ where: { id } })

  // Direct update without handling conflicts
  await this.repository.update(
    { id, version: product.version },
    { ...updates, version: product.version + 1 }
  )
  // Will fail on first conflict!
}

// ✅ Proper conflict handling
async updateProduct(id: string, updates: any) {
  const maxRetries = 3
  let attempts = 0

  while (attempts < maxRetries) {
    attempts++
    try {
      const product = await this.repository.findOne({ where: { id } })
      const result = await this.repository.update(
        { id, version: product.version },
        { ...updates, version: product.version + 1 }
      )

      if (result.affected === 0) {
        throw new ConflictException('Optimistic lock conflict')
      }

      return await this.repository.findOne({ where: { id } })

    } catch (error) {
      if (error instanceof ConflictException && attempts < maxRetries) {
        await this.sleep(50 * attempts) // Exponential backoff
        continue
      }
      throw error
    }
  }
}
```

**2. Version Field Mismanagement**

```typescript
// ❌ Manual version increment
entity.version++ // Don't do this manually

// ❌ Forgetting version in updates
await this.repository.update(id, { name: 'New Name' }) // Missing version check

// ✅ Let TypeORM handle version
@VersionColumn()
version: number // TypeORM auto-increments

// ✅ Always include version in WHERE clause
await this.repository.update(
  { id, version: currentVersion },
  { name: 'New Name' } // TypeORM handles version increment
)
```

### ✅ Best Practices

**1. Choose Right Concurrency Strategy**

```typescript
// ✅ High-read, low-write scenarios
// Use optimistic locking for user profiles, product catalogs
async updateUserProfile(userId: string, updates: ProfileUpdate) {
  // Users rarely update profiles simultaneously
  return await this.optimisticUpdate(userId, updates)
}

// ✅ High-contention scenarios
// Consider pessimistic locking for critical resources
async updateInventory(productId: string, stockChange: number) {
  if (Math.abs(stockChange) > 100) {
    // Large stock changes - use pessimistic lock
    return await this.pessimisticUpdate(productId, stockChange)
  } else {
    // Small changes - optimistic is fine
    return await this.optimisticUpdate(productId, stockChange)
  }
}
```

**2. Implement Proper Monitoring**

```typescript
// ✅ Track conflict rates
@Injectable()
export class OptimisticLockService {
  constructor(private monitorService: OptimisticLockMonitorService) {}

  async updateWithMonitoring<T>(entityType: string, updateFn: () => Promise<T>): Promise<T> {
    let attempts = 0
    const maxRetries = 3

    while (attempts < maxRetries) {
      attempts++
      try {
        const result = await updateFn()
        this.monitorService.recordAttempt(entityType, attempts, true)
        return result
      } catch (error) {
        this.monitorService.recordAttempt(entityType, attempts, false)

        if (attempts === maxRetries) {
          throw error
        }

        await this.sleep(50 * attempts)
      }
    }
  }
}
```

---

## 📋 Summary

### 🎯 Key Takeaways

1. **High Concurrency Performance**: Optimistic locks excel in high-read, low-conflict scenarios
2. **Automatic Conflict Detection**: Version columns provide built-in conflict detection
3. **Retry Strategy Essential**: Always implement exponential backoff với jitter
4. **Monitor Conflict Rates**: Track performance và adjust strategy based on metrics
5. **Smart Conflict Resolution**: Implement business-logic-aware conflict resolution

### 🚀 When to Use Optimistic Lock

**✅ Ideal for:**

- User profile updates
- Product catalog management
- Content management systems
- E-commerce shopping carts
- Comment và rating systems
- Financial reporting (read-heavy)

**❌ Avoid for:**

- High-contention resources (bank account balances)
- Real-time inventory systems
- Ticket booking systems
- Sequential ID generation
- Critical financial transactions

### 🔄 Decision Matrix

| Scenario             | Optimistic Lock     | Pessimistic Lock  |
| -------------------- | ------------------- | ----------------- |
| Conflict Rate < 5%   | ✅ Recommended      | ❌ Overkill       |
| Conflict Rate 5-20%  | ⚠️ Monitor closely  | ✅ Consider       |
| Conflict Rate > 20%  | ❌ Too many retries | ✅ Recommended    |
| Read-heavy workload  | ✅ Excellent        | ❌ Blocks readers |
| Write-heavy workload | ❌ Many conflicts   | ✅ Better control |

---

**🔓 Với Optimistic Lock, bạn có thể đạt được performance cao trong các scenarios với low conflict rate while maintaining data consistency!**

```

Tôi đã tạo phần đầu của Optimistic Lock documentation. Bạn có muốn tôi tiếp tục với phần tiếp theo không? Tôi sẽ chia thành các giai đoạn:

**Đã hoàn thành:**
- ✅ Giới thiệu và nguyên lý
- ✅ Database schema setup
- ✅ Repository implementation
- ✅ Service layer implementation

**Các giai đoạn tiếp theo:**
1. Real-world examples (E-commerce, Inventory, etc.)
2. Advanced patterns và error handling
3. Performance optimization và monitoring
4. Best practices và common pitfalls

Bạn muốn tôi tiếp tục với giai đoạn nào tiếp theo?
```
