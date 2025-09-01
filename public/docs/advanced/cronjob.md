# 🕒 Cronjob trong NestJS

## 🔍 Cronjob là gì?

Cronjob trong NestJS là scheduled tasks được execute tự động theo thời gian định sẵn. Nó cho phép developers implement background processes như data cleanup, reports generation, email notifications, và các automation tasks khác.

### 🎯 Vai trò trong Ecosystem

- **Background Processing**: Execute tasks không cần user interaction
- **Data Maintenance**: Cleanup expired data, refresh caches
- **Monitoring & Analytics**: Generate reports, collect metrics
- **System Health**: Health checks, backup operations
- **Business Logic**: Send scheduled emails, process payments

### ⚡ Execution Order & Lifecycle

```typescript
Application Startup → Module Initialization → Scheduler Service Registration →
Cron Jobs Scheduling → Runtime Execution → Application Shutdown → Jobs Cleanup
```

---

## 🎯 Cách implement Cronjob

### 1. 📦 Installation & Setup

```bash
npm install --save @nestjs/schedule
npm install --save-dev @types/cron
```

```typescript
// app.module.ts
import { Module } from '@nestjs/common'
import { ScheduleModule } from '@nestjs/schedule'
import { TasksService } from './tasks/tasks.service'

@Module({
  imports: [
    ScheduleModule.forRoot(), // Enable scheduler
  ],
  providers: [TasksService],
})
export class AppModule {}
```

### 2. 🔧 Basic Implementation

```typescript
// tasks/tasks.service.ts
import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression, Interval, Timeout } from '@nestjs/schedule'

@Injectable()
export class TasksService {
  private readonly logger = new Logger(TasksService.name)

  // Chạy mỗi 30 giây
  @Cron('30 * * * * *')
  handleCron() {
    this.logger.debug('Called every 30 seconds')
  }

  // Chạy mỗi phút
  @Cron(CronExpression.EVERY_MINUTE)
  handleEveryMinute() {
    this.logger.debug('Called every minute')
  }

  // Chạy mỗi 10 giây
  @Interval(10000)
  handleInterval() {
    this.logger.debug('Called every 10 seconds')
  }

  // Chạy sau 5 giây khi app start
  @Timeout(5000)
  handleTimeout() {
    this.logger.debug('Called after 5 seconds')
  }
}
```

### 3. 🚀 Advanced Configuration

```typescript
// tasks/advanced-tasks.service.ts
import { Injectable, Logger } from '@nestjs/common'
import { Cron, SchedulerRegistry } from '@nestjs/schedule'
import { CronJob } from 'cron'

@Injectable()
export class AdvancedTasksService {
  private readonly logger = new Logger(AdvancedTasksService.name)

  constructor(private schedulerRegistry: SchedulerRegistry) {}

  // Cron với timezone
  @Cron('0 0 * * *', {
    name: 'daily-report',
    timeZone: 'Asia/Ho_Chi_Minh',
  })
  async generateDailyReport() {
    this.logger.log('Generating daily report at midnight Vietnam time')
    // Implementation here
  }

  // Dynamic cron job
  addDynamicJob(name: string, cronTime: string, callback: () => void) {
    const job = new CronJob(cronTime, callback)

    this.schedulerRegistry.addCronJob(name, job)
    job.start()

    this.logger.warn(`Job ${name} added and started!`)
  }

  // Remove dynamic job
  deleteCron(name: string) {
    this.schedulerRegistry.deleteCronJob(name)
    this.logger.warn(`Job ${name} deleted!`)
  }

  // Get all jobs
  getCrons() {
    const jobs = this.schedulerRegistry.getCronJobs()
    jobs.forEach((value, key) => {
      let next
      try {
        next = value.nextDates().toJSDate()
      } catch (e) {
        next = 'error: next fire date is in the past!'
      }
      this.logger.log(`Job: ${key} -> next: ${next}`)
    })
  }
}
```

---

## 💡 Các cách sử dụng thông dụng

### 1. 🗑️ Data Cleanup Service

```typescript
// services/cleanup.service.ts
import { Injectable, Logger } from '@nestjs/common'
import { Cron, CronExpression } from '@nestjs/schedule'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository, LessThan } from 'typeorm'
import { RefreshToken } from '../entities/refresh-token.entity'
import { User } from '../entities/user.entity'

@Injectable()
export class CleanupService {
  private readonly logger = new Logger(CleanupService.name)

  constructor(
    @InjectRepository(RefreshToken)
    private refreshTokenRepository: Repository<RefreshToken>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}

  // Xóa refresh token hết hạn mỗi ngày lúc 2:00 AM
  @Cron('0 2 * * *', {
    name: 'cleanup-expired-tokens',
    timeZone: 'Asia/Ho_Chi_Minh',
  })
  async cleanupExpiredTokens() {
    const startTime = Date.now()
    this.logger.log('Starting cleanup of expired refresh tokens')

    try {
      const expiredTokens = await this.refreshTokenRepository.delete({
        expiresAt: LessThan(new Date()),
      })

      const duration = Date.now() - startTime
      this.logger.log(`Cleanup completed: ${expiredTokens.affected} tokens removed in ${duration}ms`)

      return {
        success: true,
        tokensRemoved: expiredTokens.affected,
        duration,
      }
    } catch (error) {
      this.logger.error('Failed to cleanup expired tokens', error.stack)
      throw error
    }
  }

  // Xóa user chưa verify sau 7 ngày
  @Cron('0 3 * * 0', {
    // Chủ nhật lúc 3:00 AM
    name: 'cleanup-unverified-users',
  })
  async cleanupUnverifiedUsers() {
    this.logger.log('Starting cleanup of unverified users')

    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)

    try {
      const result = await this.userRepository.delete({
        isEmailVerified: false,
        createdAt: LessThan(sevenDaysAgo),
      })

      this.logger.log(`Removed ${result.affected} unverified users`)
      return result.affected
    } catch (error) {
      this.logger.error('Failed to cleanup unverified users', error.stack)
      throw error
    }
  }
}
```

**Input/Output Example:**

```
Input: Scheduled execution at 2:00 AM daily
Output:
[TasksService] Starting cleanup of expired refresh tokens
[TasksService] Cleanup completed: 45 tokens removed in 234ms
```

### 2. 📊 Analytics & Reports

```typescript
// services/analytics.service.ts
import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository, Between } from 'typeorm'
import { Order } from '../entities/order.entity'
import { EmailService } from './email.service'

@Injectable()
export class AnalyticsService {
  private readonly logger = new Logger(AnalyticsService.name)

  constructor(
    @InjectRepository(Order)
    private orderRepository: Repository<Order>,
    private emailService: EmailService,
  ) {}

  // Báo cáo hàng ngày lúc 6:00 AM
  @Cron('0 6 * * *', {
    name: 'daily-sales-report',
  })
  async generateDailySalesReport() {
    this.logger.log('Generating daily sales report')

    const yesterday = new Date()
    yesterday.setDate(yesterday.getDate() - 1)
    yesterday.setHours(0, 0, 0, 0)

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    try {
      const orders = await this.orderRepository.find({
        where: {
          createdAt: Between(yesterday, today),
          status: 'completed',
        },
        relations: ['items', 'customer'],
      })

      const report = this.calculateSalesMetrics(orders)
      await this.sendReportToManagement(report)

      this.logger.log(`Daily report generated: ${orders.length} orders processed`)
      return report
    } catch (error) {
      this.logger.error('Failed to generate daily sales report', error.stack)
      throw error
    }
  }

  private calculateSalesMetrics(orders: Order[]) {
    const totalRevenue = orders.reduce((sum, order) => sum + order.totalAmount, 0)
    const averageOrderValue = totalRevenue / orders.length || 0

    return {
      date: new Date().toISOString().split('T')[0],
      totalOrders: orders.length,
      totalRevenue,
      averageOrderValue: Math.round(averageOrderValue * 100) / 100,
      topProducts: this.getTopProducts(orders),
    }
  }

  private async sendReportToManagement(report: any) {
    await this.emailService.sendEmail({
      to: ['manager@company.com', 'ceo@company.com'],
      subject: `Daily Sales Report - ${report.date}`,
      template: 'daily-sales-report',
      context: { report },
    })
  }
}
```

### 3. 💌 Email Notifications

```typescript
// services/notification.service.ts
import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository, LessThan } from 'typeorm'
import { User } from '../entities/user.entity'
import { EmailService } from './email.service'

@Injectable()
export class NotificationService {
  private readonly logger = new Logger(NotificationService.name)

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private emailService: EmailService,
  ) {}

  // Gửi email nhắc nhở mỗi thứ 2 lúc 9:00 AM
  @Cron('0 9 * * 1', {
    name: 'weekly-reminder',
  })
  async sendWeeklyReminder() {
    this.logger.log('Sending weekly reminders')

    const lastWeek = new Date()
    lastWeek.setDate(lastWeek.getDate() - 7)

    try {
      const inactiveUsers = await this.userRepository.find({
        where: {
          lastLoginAt: LessThan(lastWeek),
          isEmailVerified: true,
        },
      })

      let emailsSent = 0
      for (const user of inactiveUsers) {
        try {
          await this.emailService.sendEmail({
            to: user.email,
            subject: 'We miss you! Come back for exciting updates',
            template: 'weekly-reminder',
            context: { user },
          })
          emailsSent++
        } catch (error) {
          this.logger.warn(`Failed to send email to ${user.email}`)
        }
      }

      this.logger.log(`Weekly reminders sent: ${emailsSent}/${inactiveUsers.length}`)
      return { sent: emailsSent, total: inactiveUsers.length }
    } catch (error) {
      this.logger.error('Failed to send weekly reminders', error.stack)
      throw error
    }
  }

  // Gửi thông báo sinh nhật
  @Cron('0 10 * * *', {
    name: 'birthday-greetings',
  })
  async sendBirthdayGreetings() {
    const today = new Date()
    const todayString = `${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`

    try {
      const birthdayUsers = await this.userRepository
        .createQueryBuilder('user')
        .where("DATE_FORMAT(user.birthDate, '%m-%d') = :today", { today: todayString })
        .getMany()

      for (const user of birthdayUsers) {
        await this.emailService.sendEmail({
          to: user.email,
          subject: '🎉 Happy Birthday!',
          template: 'birthday-greeting',
          context: { user },
        })
      }

      this.logger.log(`Birthday greetings sent to ${birthdayUsers.length} users`)
      return birthdayUsers.length
    } catch (error) {
      this.logger.error('Failed to send birthday greetings', error.stack)
      throw error
    }
  }
}
```

---

## ⚠️ Các vấn đề thường gặp

### 1. 🚨 Memory Leaks

**Vấn đề:**

```typescript
// ❌ BAD: Tạo timer mà không cleanup
@Injectable()
export class ProblematicService {
  private timers = []

  @Cron('*/5 * * * * *')
  problematicMethod() {
    // Tạo timer mới mỗi lần chạy
    const timer = setInterval(() => {
      console.log('This will leak!')
    }, 1000)

    this.timers.push(timer) // Memory leak!
  }
}
```

**Giải pháp:**

```typescript
// ✅ GOOD: Proper cleanup
@Injectable()
export class ProperService implements OnModuleDestroy {
  private timers = new Set<NodeJS.Timeout>()

  @Cron('*/5 * * * * *')
  properMethod() {
    // Clear existing timers first
    this.clearTimers()

    const timer = setTimeout(() => {
      console.log('This is safe!')
      this.timers.delete(timer)
    }, 1000)

    this.timers.add(timer)
  }

  onModuleDestroy() {
    this.clearTimers()
  }

  private clearTimers() {
    this.timers.forEach((timer) => clearTimeout(timer))
    this.timers.clear()
  }
}
```

### 2. 🔒 Race Conditions

**Vấn đề:**

```typescript
// ❌ BAD: Có thể chạy song song
@Injectable()
export class RaceConditionService {
  @Cron('*/30 * * * * *')
  async longRunningTask() {
    // Task này mất 45 giây để complete
    // Nhưng cron chạy mỗi 30 giây
    await this.processLargeDataset() // 45 seconds
  }
}
```

**Giải pháp:**

```typescript
// ✅ GOOD: Prevent overlapping execution
@Injectable()
export class SafeService {
  private isRunning = false

  @Cron('*/30 * * * * *')
  async safeTask() {
    if (this.isRunning) {
      this.logger.warn('Previous task still running, skipping...')
      return
    }

    this.isRunning = true
    try {
      await this.processLargeDataset()
    } finally {
      this.isRunning = false
    }
  }
}
```

### 3. 💥 Error Handling

**Vấn đề:**

```typescript
// ❌ BAD: Không handle errors
@Injectable()
export class UnhandledErrorService {
  @Cron('0 * * * *')
  async riskyTask() {
    // Nếu có lỗi, cron sẽ stop hoạt động
    await this.dangerousOperation()
  }
}
```

**Giải pháp:**

```typescript
// ✅ GOOD: Comprehensive error handling
@Injectable()
export class RobustService {
  private readonly logger = new Logger(RobustService.name)
  private errorCount = 0
  private readonly maxErrors = 5

  @Cron('0 * * * *')
  async robustTask() {
    try {
      await this.dangerousOperation()
      this.errorCount = 0 // Reset on success
    } catch (error) {
      this.errorCount++
      this.logger.error(`Task failed (${this.errorCount}/${this.maxErrors})`, error.stack)

      if (this.errorCount >= this.maxErrors) {
        this.logger.error('Too many failures, disabling task')
        // Có thể disable cron job hoặc alert admin
        await this.notifyAdmin(error)
      }
    }
  }

  private async notifyAdmin(error: Error) {
    // Send notification to admin
  }
}
```

---

## 🔧 Advanced Patterns

### 1. 🎛️ Dynamic Job Management

```typescript
// services/job-manager.service.ts
import { Injectable, Logger } from '@nestjs/common'
import { SchedulerRegistry } from '@nestjs/schedule'
import { CronJob } from 'cron'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { ScheduledJob } from '../entities/scheduled-job.entity'

@Injectable()
export class JobManagerService {
  private readonly logger = new Logger(JobManagerService.name)

  constructor(
    private schedulerRegistry: SchedulerRegistry,
    @InjectRepository(ScheduledJob)
    private jobRepository: Repository<ScheduledJob>,
  ) {}

  async createJob(jobData: CreateJobDto) {
    const { name, cronExpression, description, isActive } = jobData

    // Save to database
    const job = await this.jobRepository.save({
      name,
      cronExpression,
      description,
      isActive,
      nextRun: this.calculateNextRun(cronExpression),
    })

    if (isActive) {
      this.scheduleJob(job)
    }

    return job
  }

  private scheduleJob(jobConfig: ScheduledJob) {
    const job = new CronJob(
      jobConfig.cronExpression,
      async () => {
        await this.executeJob(jobConfig)
      },
      null,
      true,
      'Asia/Ho_Chi_Minh',
    )

    this.schedulerRegistry.addCronJob(jobConfig.name, job)
    this.logger.log(`Job '${jobConfig.name}' scheduled with pattern: ${jobConfig.cronExpression}`)
  }

  private async executeJob(jobConfig: ScheduledJob) {
    const startTime = Date.now()
    this.logger.log(`Executing job: ${jobConfig.name}`)

    try {
      // Execute job logic based on job type
      await this.runJobLogic(jobConfig)

      // Update last run info
      await this.jobRepository.update(jobConfig.id, {
        lastRun: new Date(),
        lastDuration: Date.now() - startTime,
        status: 'success',
        nextRun: this.calculateNextRun(jobConfig.cronExpression),
      })
    } catch (error) {
      this.logger.error(`Job '${jobConfig.name}' failed:`, error.stack)

      await this.jobRepository.update(jobConfig.id, {
        lastRun: new Date(),
        lastDuration: Date.now() - startTime,
        status: 'failed',
        errorMessage: error.message,
        nextRun: this.calculateNextRun(jobConfig.cronExpression),
      })
    }
  }

  async enableJob(jobName: string) {
    const job = await this.jobRepository.findOne({ where: { name: jobName } })
    if (!job) throw new Error('Job not found')

    job.isActive = true
    await this.jobRepository.save(job)

    this.scheduleJob(job)
    this.logger.log(`Job '${jobName}' enabled`)
  }

  async disableJob(jobName: string) {
    try {
      this.schedulerRegistry.deleteCronJob(jobName)
      await this.jobRepository.update({ name: jobName }, { isActive: false })
      this.logger.log(`Job '${jobName}' disabled`)
    } catch (error) {
      this.logger.warn(`Job '${jobName}' was not running`)
    }
  }

  async getJobStatus() {
    const jobs = await this.jobRepository.find()
    const scheduledJobs = this.schedulerRegistry.getCronJobs()

    return jobs.map((job) => ({
      ...job,
      isScheduled: scheduledJobs.has(job.name),
      nextExecution: scheduledJobs.get(job.name)?.nextDates()?.toJSDate(),
    }))
  }
}
```

### 2. 🏃‍♂️ Distributed Cron Jobs

```typescript
// services/distributed-cron.service.ts
import { Injectable, Logger } from '@nestjs/common'
import { Cron } from '@nestjs/schedule'
import { InjectRedis } from '@liaoliaots/nestjs-redis'
import Redis from 'ioredis'

@Injectable()
export class DistributedCronService {
  private readonly logger = new Logger(DistributedCronService.name)
  private readonly instanceId = `${process.env.HOSTNAME || 'unknown'}-${Date.now()}`

  constructor(@InjectRedis() private redis: Redis) {}

  @Cron('*/5 * * * *') // Every 5 minutes
  async distributedTask() {
    const lockKey = 'cron:distributed-task'
    const lockTTL = 300 // 5 minutes in seconds

    const acquired = await this.acquireDistributedLock(lockKey, lockTTL)

    if (!acquired) {
      this.logger.debug('Another instance is already running this task')
      return
    }

    try {
      this.logger.log('Executing distributed task on instance:', this.instanceId)
      await this.performDistributedWork()
    } finally {
      await this.releaseDistributedLock(lockKey)
    }
  }

  private async acquireDistributedLock(key: string, ttl: number): Promise<boolean> {
    const result = await this.redis.set(
      key,
      this.instanceId,
      'EX',
      ttl,
      'NX', // Only set if not exists
    )

    return result === 'OK'
  }

  private async releaseDistributedLock(key: string): Promise<void> {
    // Use Lua script to ensure we only delete our own lock
    const script = `
      if redis.call("get", KEYS[1]) == ARGV[1] then
        return redis.call("del", KEYS[1])
      else
        return 0
      end
    `

    await this.redis.eval(script, 1, key, this.instanceId)
  }

  private async performDistributedWork() {
    // Your distributed work logic here
    await new Promise((resolve) => setTimeout(resolve, 1000))
    this.logger.log('Distributed work completed')
  }
}
```

---

## 📝 Best Practices

### ✅ DO's

1. **Use Proper Error Handling**

```typescript
@Cron('0 * * * *')
async taskWithErrorHandling() {
  try {
    await this.doWork()
  } catch (error) {
    this.logger.error('Task failed', error.stack)
    // Don't throw - let cron continue
  }
}
```

2. **Implement Idempotency**

```typescript
@Cron('0 2 * * *')
async idempotentTask() {
  // Check if already processed today
  const today = new Date().toISOString().split('T')[0]
  const processed = await this.redis.get(`task:processed:${today}`)

  if (processed) {
    this.logger.log('Task already processed today')
    return
  }

  await this.performTask()
  await this.redis.set(`task:processed:${today}`, '1', 'EX', 86400)
}
```

3. **Monitor Job Performance**

```typescript
@Cron('*/10 * * * *')
async monitoredTask() {
  const startTime = Date.now()

  try {
    await this.performTask()
    const duration = Date.now() - startTime

    // Log metrics
    this.logger.log(`Task completed in ${duration}ms`)

    // Alert if too slow
    if (duration > 30000) {
      await this.alertSlowTask(duration)
    }

  } catch (error) {
    this.logger.error('Task failed', error.stack)
    await this.alertTaskFailure(error)
  }
}
```

### ❌ DON'Ts

1. **Don't Block the Event Loop**

```typescript
// ❌ BAD
@Cron('* * * * *')
blockingTask() {
  // Synchronous heavy computation
  for (let i = 0; i < 1000000; i++) {
    // This blocks the event loop
  }
}

// ✅ GOOD
@Cron('* * * * *')
async nonBlockingTask() {
  for (let i = 0; i < 1000000; i++) {
    if (i % 10000 === 0) {
      await new Promise(resolve => setImmediate(resolve))
    }
  }
}
```

2. **Don't Ignore Timezone Issues**

```typescript
// ❌ BAD
@Cron('0 0 * * *') // Unclear timezone
generateReport() {
  // When does this run?
}

// ✅ GOOD
@Cron('0 0 * * *', {
  timeZone: 'Asia/Ho_Chi_Minh'
})
generateReport() {
  // Clear timing expectations
}
```

---

## 🚨 Common Pitfalls

### 1. 🔒 Security Considerations

```typescript
// ✅ Secure cron jobs
@Injectable()
export class SecureCronService {
  constructor(private configService: ConfigService) {}

  @Cron('0 1 * * *')
  async secureDataExport() {
    // Validate environment
    if (this.configService.get('NODE_ENV') !== 'production') {
      this.logger.warn('Skipping data export in non-production environment')
      return
    }

    // Use secure credentials
    const apiKey = this.configService.get('SECURE_API_KEY')
    if (!apiKey) {
      throw new Error('API key not configured')
    }

    // Implement rate limiting
    await this.checkRateLimit()

    // Perform secure operation
    await this.performSecureExport(apiKey)
  }

  private async checkRateLimit() {
    // Implement rate limiting logic
  }
}
```

### 2. 🧠 Memory Management

```typescript
// ✅ Proper memory management
@Injectable()
export class MemoryEfficientService {
  @Cron('0 */6 * * *') // Every 6 hours
  async processLargeDataset() {
    const batchSize = 1000
    let offset = 0
    let processedCount = 0

    while (true) {
      // Process in batches to avoid memory issues
      const batch = await this.dataRepository.find({
        skip: offset,
        take: batchSize,
      })

      if (batch.length === 0) break

      await this.processBatch(batch)

      processedCount += batch.length
      offset += batchSize

      // Force garbage collection periodically
      if (processedCount % 10000 === 0) {
        if (global.gc) {
          global.gc()
        }
        this.logger.log(`Processed ${processedCount} records`)
      }
    }

    this.logger.log(`Total processed: ${processedCount} records`)
  }
}
```

---

## 📋 Tóm tắt

### 🎯 Key Takeaways

1. **Scheduled Automation**: Cronjobs enable automatic execution of background tasks
2. **Flexible Timing**: Support for cron expressions, intervals, and timeouts
3. **Error Resilience**: Implement proper error handling to prevent job failures
4. **Resource Management**: Monitor memory usage and prevent blocking operations
5. **Distributed Coordination**: Use Redis locks for multi-instance deployments

### 🚀 When to Use Cronjobs

**✅ Ideal for:**

- Data cleanup and maintenance tasks
- Scheduled reports and analytics
- Email notifications and reminders
- System health checks and monitoring
- Background data processing
- Cache warming and invalidation

**❌ Avoid for:**

- Real-time operations
- User-triggered actions
- High-frequency tasks (< 1 second intervals)
- Operations requiring immediate feedback
- Tasks that need complex orchestration

### 🏗️ Architecture Integration

```typescript
// Complete cron module setup
@Module({
  imports: [ScheduleModule.forRoot(), TypeOrmModule.forFeature([RefreshToken, User, Order]), RedisModule],
  providers: [CleanupService, AnalyticsService, NotificationService, JobManagerService, DistributedCronService],
  exports: [JobManagerService],
})
export class CronModule {}
```

**🔥 Với Cronjobs, bạn có thể implement robust background processing system cho NestJS applications!**
