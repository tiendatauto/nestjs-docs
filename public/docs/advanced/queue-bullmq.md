# 🚀 Queue & BullMQ trong NestJS

## 🔍 Queue & BullMQ là gì?

Queue là một pattern fundamental trong system architecture để xử lý asynchronous tasks:

- **Vai trò chính**: Decouple heavy operations khỏi main thread và xử lý background tasks
- **Cách hoạt động**: Producer đẩy jobs vào queue → Consumer xử lý jobs từ queue
- **Execution order**: FIFO (First In, First Out) hoặc priority-based
- **Lifecycle**: Job creation → Queue storage → Job processing → Result/Error handling

> 💡 **Tại sao cần Queue?**
> Queue giúp handle high traffic, improve response time, và ensure fault tolerance. Ví dụ: thay vì gửi email trực tiếp (chậm), đẩy vào queue để xử lý background.

**BullMQ** là Redis-based queue library cho Node.js với features:

- Job scheduling và retries
- Job prioritization
- Rate limiting
- Job progress tracking
- Multiple workers support

## 🎯 Cách implement Queue & BullMQ

### Basic Setup

#### 1. Installation & Dependencies

```bash
npm install @nestjs/bull bullmq redis
npm install --save-dev @types/bull
```

#### 2. Redis Configuration

```typescript
// src/shared/config/redis.config.ts
import { registerAs } from '@nestjs/config'

export default registerAs('redis', () => ({
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT, 10) || 6379,
  password: process.env.REDIS_PASSWORD,
  db: parseInt(process.env.REDIS_QUEUE_DB, 10) || 0, // Separate DB for queues
  maxRetriesPerRequest: 3,
  retryDelayOnFailover: 100,
  enableReadyCheck: false,
  maxRetriesPerRequest: null,
}))
```

#### 3. BullMQ Module Setup

```typescript
// src/shared/modules/queue.module.ts
import { Module, Global } from '@nestjs/common'
import { BullModule } from '@nestjs/bull'
import { ConfigModule, ConfigService } from '@nestjs/config'

@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        redis: {
          host: configService.get('redis.host'),
          port: configService.get('redis.port'),
          password: configService.get('redis.password'),
          db: configService.get('redis.db'),
        },
        defaultJobOptions: {
          removeOnComplete: 10, // Keep only 10 completed jobs
          removeOnFail: 5, // Keep only 5 failed jobs
          attempts: 3, // Retry 3 times on failure
          backoff: {
            type: 'exponential',
            delay: 2000, // Start with 2 seconds
          },
        },
      }),
      inject: [ConfigService],
    }),
  ],
  exports: [BullModule],
})
export class QueueModule {}
```

### Basic Queue Implementation

#### 1. Define Queue Names & Job Types

```typescript
// src/shared/constants/queue.constants.ts
export const QUEUE_NAMES = {
  EMAIL: 'email-queue',
  NOTIFICATION: 'notification-queue',
  FILE_PROCESSING: 'file-processing-queue',
  REPORT_GENERATION: 'report-generation-queue',
} as const

export const JOB_TYPES = {
  // Email jobs
  SEND_WELCOME_EMAIL: 'send-welcome-email',
  SEND_PASSWORD_RESET: 'send-password-reset',
  SEND_NEWSLETTER: 'send-newsletter',

  // Notification jobs
  PUSH_NOTIFICATION: 'push-notification',
  SMS_NOTIFICATION: 'sms-notification',

  // File processing jobs
  IMAGE_RESIZE: 'image-resize',
  PDF_GENERATION: 'pdf-generation',

  // Report jobs
  DAILY_REPORT: 'daily-report',
  ANALYTICS_REPORT: 'analytics-report',
} as const

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES]
export type JobType = (typeof JOB_TYPES)[keyof typeof JOB_TYPES]
```

#### 2. Job Data Interfaces

```typescript
// src/shared/types/queue.types.ts
export interface BaseJobData {
  userId?: string
  timestamp: Date
  metadata?: Record<string, any>
}

export interface EmailJobData extends BaseJobData {
  to: string
  subject: string
  template: string
  variables?: Record<string, any>
  attachments?: Array<{
    filename: string
    path: string
  }>
}

export interface NotificationJobData extends BaseJobData {
  title: string
  body: string
  recipients: string[]
  type: 'push' | 'sms' | 'in-app'
  deepLink?: string
}

export interface FileProcessingJobData extends BaseJobData {
  filePath: string
  outputPath: string
  options?: Record<string, any>
}

export interface ReportJobData extends BaseJobData {
  reportType: string
  dateRange: {
    from: Date
    to: Date
  }
  filters?: Record<string, any>
  outputFormat: 'pdf' | 'excel' | 'csv'
}
```

#### 3. Basic Producer Service

```typescript
// src/shared/services/queue-producer.service.ts
import { Injectable, Logger } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bull'
import { Queue, JobOptions } from 'bull'
import { QUEUE_NAMES, JOB_TYPES } from '../constants/queue.constants'
import type { EmailJobData, NotificationJobData, FileProcessingJobData, ReportJobData } from '../types/queue.types'

@Injectable()
export class QueueProducerService {
  private readonly logger = new Logger(QueueProducerService.name)

  constructor(
    @InjectQueue(QUEUE_NAMES.EMAIL) private emailQueue: Queue,
    @InjectQueue(QUEUE_NAMES.NOTIFICATION) private notificationQueue: Queue,
    @InjectQueue(QUEUE_NAMES.FILE_PROCESSING) private fileQueue: Queue,
    @InjectQueue(QUEUE_NAMES.REPORT_GENERATION) private reportQueue: Queue,
  ) {}

  // Email jobs
  async sendWelcomeEmail(data: EmailJobData, options?: JobOptions) {
    const job = await this.emailQueue.add(
      JOB_TYPES.SEND_WELCOME_EMAIL,
      { ...data, timestamp: new Date() },
      {
        priority: 10, // High priority
        delay: 0, // Send immediately
        ...options,
      },
    )

    this.logger.log(`Welcome email job queued: ${job.id} for ${data.to}`)
    return job
  }

  async sendPasswordResetEmail(data: EmailJobData, options?: JobOptions) {
    const job = await this.emailQueue.add(
      JOB_TYPES.SEND_PASSWORD_RESET,
      { ...data, timestamp: new Date() },
      {
        priority: 15, // Higher priority than welcome email
        delay: 0,
        attempts: 5, // More retries for critical emails
        ...options,
      },
    )

    this.logger.log(`Password reset email job queued: ${job.id}`)
    return job
  }

  async scheduleNewsletter(data: EmailJobData, sendAt: Date, options?: JobOptions) {
    const delay = sendAt.getTime() - Date.now()

    if (delay < 0) {
      throw new Error('Cannot schedule newsletter in the past')
    }

    const job = await this.emailQueue.add(
      JOB_TYPES.SEND_NEWSLETTER,
      { ...data, timestamp: new Date() },
      {
        priority: 5, // Lower priority
        delay,
        ...options,
      },
    )

    this.logger.log(`Newsletter scheduled for ${sendAt.toISOString()}: ${job.id}`)
    return job
  }

  // Notification jobs
  async sendPushNotification(data: NotificationJobData, options?: JobOptions) {
    const job = await this.notificationQueue.add(
      JOB_TYPES.PUSH_NOTIFICATION,
      { ...data, timestamp: new Date() },
      {
        priority: 12,
        ...options,
      },
    )

    this.logger.log(`Push notification queued: ${job.id}`)
    return job
  }

  // File processing jobs
  async processImageResize(data: FileProcessingJobData, options?: JobOptions) {
    const job = await this.fileQueue.add(
      JOB_TYPES.IMAGE_RESIZE,
      { ...data, timestamp: new Date() },
      {
        priority: 8,
        ...options,
      },
    )

    this.logger.log(`Image resize job queued: ${job.id}`)
    return job
  }

  // Report generation jobs
  async generateDailyReport(data: ReportJobData, options?: JobOptions) {
    const job = await this.reportQueue.add(
      JOB_TYPES.DAILY_REPORT,
      { ...data, timestamp: new Date() },
      {
        priority: 6,
        ...options,
      },
    )

    this.logger.log(`Daily report generation queued: ${job.id}`)
    return job
  }

  // Utility methods
  async getQueueStats() {
    const stats = {
      email: await this.getQueueInfo(this.emailQueue),
      notification: await this.getQueueInfo(this.notificationQueue),
      fileProcessing: await this.getQueueInfo(this.fileQueue),
      reportGeneration: await this.getQueueInfo(this.reportQueue),
    }

    return stats
  }

  private async getQueueInfo(queue: Queue) {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaiting(),
      queue.getActive(),
      queue.getCompleted(),
      queue.getFailed(),
      queue.getDelayed(),
    ])

    return {
      name: queue.name,
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length,
      delayed: delayed.length,
    }
  }
}
```

**Input/Output Example:**

```typescript
// Usage trong service hoặc controller
export class UserService {
  constructor(private queueProducer: QueueProducerService) {}

  async registerUser(userData: CreateUserDto) {
    // Create user in database
    const user = await this.prisma.user.create({ data: userData })

    // Queue welcome email (non-blocking)
    await this.queueProducer.sendWelcomeEmail({
      to: user.email,
      subject: 'Welcome to our platform!',
      template: 'welcome',
      variables: {
        firstName: user.firstName,
        activationLink: `${process.env.APP_URL}/activate/${user.id}`,
      },
      userId: user.id,
    })

    // Return immediately, email will be sent in background
    return {
      success: true,
      user,
      message: 'User registered successfully. Welcome email will be sent shortly.',
    }
  }
}
```

```bash
# Output in logs:
# [UserService] User created successfully: user-123
# [QueueProducerService] Welcome email job queued: 1 for user@example.com
# Response time: 50ms (instead of 2000ms+ if sending email synchronously)
```

## 💡 Các cách sử dụng thông dụng

### 1. Email Processing Queue

```typescript
// Real-world example: E-commerce order confirmation
export class OrderService {
  constructor(
    private prisma: PrismaService,
    private queueProducer: QueueProducerService,
  ) {}

  async createOrder(orderData: CreateOrderDto, userId: string) {
    // 1. Create order in database (fast operation)
    const order = await this.prisma.order.create({
      data: {
        ...orderData,
        userId,
        status: 'PENDING',
      },
      include: {
        items: true,
        user: true,
      },
    })

    // 2. Queue multiple background tasks
    await Promise.all([
      // Send order confirmation email
      this.queueProducer.sendOrderConfirmation({
        to: order.user.email,
        subject: `Order Confirmation #${order.id}`,
        template: 'order-confirmation',
        variables: {
          orderNumber: order.id,
          items: order.items,
          total: order.total,
          estimatedDelivery: this.calculateDeliveryDate(),
        },
        userId,
      }),

      // Generate invoice PDF
      this.queueProducer.generateInvoice({
        orderId: order.id,
        outputFormat: 'pdf',
        userId,
      }),

      // Update inventory (can be queued for batch processing)
      this.queueProducer.updateInventory({
        items: order.items,
        operation: 'DECREASE',
        userId,
      }),
    ])

    // 3. Return immediately with order details
    return {
      success: true,
      order,
      message: 'Order created successfully. Confirmation email will be sent shortly.',
    }
  }
}
```

### 2. File Processing Queue

```typescript
// Real-world example: User avatar upload và resize
export class FileUploadService {
  constructor(private queueProducer: QueueProducerService) {}

  async uploadUserAvatar(file: Express.Multer.File, userId: string) {
    // 1. Save original file immediately
    const originalPath = await this.saveFile(file, 'avatars/original')

    // 2. Queue image processing tasks
    const resizeJobs = await Promise.all([
      // Create thumbnail (150x150)
      this.queueProducer.processImageResize({
        filePath: originalPath,
        outputPath: `avatars/thumbnails/${userId}_150x150.jpg`,
        options: {
          width: 150,
          height: 150,
          quality: 85,
          format: 'jpeg',
        },
        userId,
      }),

      // Create medium size (400x400)
      this.queueProducer.processImageResize({
        filePath: originalPath,
        outputPath: `avatars/medium/${userId}_400x400.jpg`,
        options: {
          width: 400,
          height: 400,
          quality: 90,
          format: 'jpeg',
        },
        userId,
      }),

      // Create large size (800x800)
      this.queueProducer.processImageResize({
        filePath: originalPath,
        outputPath: `avatars/large/${userId}_800x800.jpg`,
        options: {
          width: 800,
          height: 800,
          quality: 95,
          format: 'jpeg',
        },
        userId,
      }),
    ])

    // 3. Return immediately với job IDs để track progress
    return {
      success: true,
      originalPath,
      processingJobs: resizeJobs.map((job) => job.id),
      message: 'Avatar uploaded. Processing different sizes in background.',
    }
  }
}
```

### 3. Scheduled Reports Queue

```typescript
// Real-world example: Automated daily/weekly reports
export class ReportService {
  constructor(private queueProducer: QueueProducerService) {}

  // Schedule daily reports for all active users
  async scheduleDailyReports() {
    const activeUsers = await this.prisma.user.findMany({
      where: {
        isActive: true,
        preferences: {
          path: ['notifications', 'dailyReport'],
          equals: true,
        },
      },
    })

    const tomorrow = new Date()
    tomorrow.setDate(tomorrow.getDate() + 1)
    tomorrow.setHours(9, 0, 0, 0) // 9 AM tomorrow

    const jobs = await Promise.all(
      activeUsers.map((user) =>
        this.queueProducer.generateDailyReport(
          {
            reportType: 'daily-summary',
            dateRange: {
              from: new Date(),
              to: tomorrow,
            },
            filters: { userId: user.id },
            outputFormat: 'pdf',
            userId: user.id,
          },
          {
            delay: tomorrow.getTime() - Date.now(),
            priority: 5,
          },
        ),
      ),
    )

    return {
      success: true,
      scheduledReports: jobs.length,
      scheduledFor: tomorrow.toISOString(),
    }
  }
}
```

> 💡 **Tip**: Sử dụng queue cho bất kỳ operation nào mất >500ms để execute, như email sending, file processing, external API calls, hoặc complex calculations.

## 🔧 Consumer Implementation và Job Processing

### Basic Consumer Pattern

#### 1. Email Queue Consumer

```typescript
// src/queues/consumers/email.consumer.ts
import { Processor, Process, OnQueueActive, OnQueueCompleted, OnQueueFailed } from '@nestjs/bull'
import { Logger } from '@nestjs/common'
import { Job } from 'bull'
import { QUEUE_NAMES, JOB_TYPES } from '../../shared/constants/queue.constants'
import { EmailJobData } from '../../shared/types/queue.types'
import { EmailService } from '../../shared/services/email.service'

@Processor(QUEUE_NAMES.EMAIL)
export class EmailConsumer {
  private readonly logger = new Logger(EmailConsumer.name)

  constructor(private emailService: EmailService) {}

  @Process(JOB_TYPES.SEND_WELCOME_EMAIL)
  async sendWelcomeEmail(job: Job<EmailJobData>) {
    const { data } = job

    try {
      // Update job progress
      await job.progress(10)
      this.logger.log(`Processing welcome email for: ${data.to}`)

      // Prepare email content
      await job.progress(30)
      const emailContent = await this.emailService.renderTemplate(data.template, data.variables)

      // Send email
      await job.progress(70)
      const result = await this.emailService.sendEmail({
        to: data.to,
        subject: data.subject,
        html: emailContent,
        attachments: data.attachments,
      })

      // Complete job
      await job.progress(100)
      this.logger.log(`Welcome email sent successfully to: ${data.to}`)

      return {
        success: true,
        messageId: result.messageId,
        sentAt: new Date(),
        recipient: data.to,
      }
    } catch (error) {
      this.logger.error(`Failed to send welcome email to ${data.to}:`, error)
      throw error // Will trigger retry mechanism
    }
  }

  @Process(JOB_TYPES.SEND_PASSWORD_RESET)
  async sendPasswordResetEmail(job: Job<EmailJobData>) {
    const { data } = job

    try {
      await job.progress(20)

      // Extra validation for critical emails
      if (!data.variables?.resetToken) {
        throw new Error('Reset token is required for password reset email')
      }

      await job.progress(50)
      const emailContent = await this.emailService.renderTemplate('password-reset', {
        ...data.variables,
        expiresIn: '1 hour',
        supportEmail: process.env.SUPPORT_EMAIL,
      })

      await job.progress(80)
      const result = await this.emailService.sendEmail({
        to: data.to,
        subject: data.subject,
        html: emailContent,
        priority: 'high', // High priority for security emails
      })

      await job.progress(100)
      this.logger.log(`Password reset email sent to: ${data.to}`)

      return {
        success: true,
        messageId: result.messageId,
        sentAt: new Date(),
        expiresAt: new Date(Date.now() + 3600 * 1000), // 1 hour
      }
    } catch (error) {
      this.logger.error(`Failed to send password reset email:`, error)

      // Log security event
      await this.logSecurityEvent({
        event: 'PASSWORD_RESET_EMAIL_FAILED',
        userId: data.userId,
        email: data.to,
        error: error.message,
      })

      throw error
    }
  }

  @Process(JOB_TYPES.SEND_NEWSLETTER)
  async sendNewsletter(job: Job<EmailJobData>) {
    const { data } = job

    try {
      await job.progress(15)

      // Check if user is still subscribed
      const isSubscribed = await this.emailService.checkSubscriptionStatus(data.to)
      if (!isSubscribed) {
        this.logger.log(`User ${data.to} unsubscribed, skipping newsletter`)
        return { success: true, skipped: true, reason: 'unsubscribed' }
      }

      await job.progress(40)
      const emailContent = await this.emailService.renderTemplate(data.template, {
        ...data.variables,
        unsubscribeLink: `${process.env.APP_URL}/unsubscribe?email=${encodeURIComponent(data.to)}`,
      })

      await job.progress(80)
      const result = await this.emailService.sendEmail({
        to: data.to,
        subject: data.subject,
        html: emailContent,
        headers: {
          'List-Unsubscribe': `<${process.env.APP_URL}/unsubscribe?email=${encodeURIComponent(data.to)}>`,
        },
      })

      await job.progress(100)

      // Track newsletter metrics
      await this.emailService.trackNewsletterSent({
        email: data.to,
        newsletterId: data.variables?.newsletterId,
        sentAt: new Date(),
      })

      return {
        success: true,
        messageId: result.messageId,
        sentAt: new Date(),
      }
    } catch (error) {
      this.logger.error(`Failed to send newsletter to ${data.to}:`, error)
      throw error
    }
  }

  // Job lifecycle hooks
  @OnQueueActive()
  onActive(job: Job) {
    this.logger.log(`Processing job ${job.id} of type ${job.name}`)
  }

  @OnQueueCompleted()
  onCompleted(job: Job, result: any) {
    this.logger.log(`Job ${job.id} completed successfully`)
    this.logger.debug('Job result:', result)
  }

  @OnQueueFailed()
  onFailed(job: Job, err: Error) {
    this.logger.error(`Job ${job.id} failed:`, err)

    // Send alert if job failed after all retries
    if (job.attemptsMade >= job.opts.attempts) {
      this.sendFailureAlert(job, err)
    }
  }

  private async logSecurityEvent(event: any) {
    // Implementation for security logging
    this.logger.warn('Security event:', event)
  }

  private async sendFailureAlert(job: Job, error: Error) {
    // Send alert to admins about critical job failures
    this.logger.error(`CRITICAL: Job ${job.id} failed permanently:`, error)
  }
}
```

#### 2. File Processing Consumer

```typescript
// src/queues/consumers/file-processing.consumer.ts
import { Processor, Process } from '@nestjs/bull'
import { Logger } from '@nestjs/common'
import { Job } from 'bull'
import { QUEUE_NAMES, JOB_TYPES } from '../../shared/constants/queue.constants'
import { FileProcessingJobData } from '../../shared/types/queue.types'
import { ImageService } from '../../shared/services/image.service'
import { FileService } from '../../shared/services/file.service'
import * as fs from 'fs/promises'
import * as path from 'path'

@Processor(QUEUE_NAMES.FILE_PROCESSING)
export class FileProcessingConsumer {
  private readonly logger = new Logger(FileProcessingConsumer.name)

  constructor(
    private imageService: ImageService,
    private fileService: FileService,
  ) {}

  @Process(JOB_TYPES.IMAGE_RESIZE)
  async processImageResize(job: Job<FileProcessingJobData>) {
    const { data } = job

    try {
      await job.progress(10)
      this.logger.log(`Starting image resize: ${data.filePath}`)

      // Validate input file exists
      await job.progress(20)
      const fileExists = await this.fileService.fileExists(data.filePath)
      if (!fileExists) {
        throw new Error(`Input file not found: ${data.filePath}`)
      }

      // Get file info
      await job.progress(30)
      const fileInfo = await this.imageService.getImageInfo(data.filePath)
      this.logger.debug(`Original image: ${fileInfo.width}x${fileInfo.height}, ${fileInfo.format}`)

      // Ensure output directory exists
      await job.progress(40)
      const outputDir = path.dirname(data.outputPath)
      await fs.mkdir(outputDir, { recursive: true })

      // Process image
      await job.progress(60)
      const processResult = await this.imageService.resizeImage(data.filePath, data.outputPath, data.options)

      // Verify output
      await job.progress(90)
      const outputExists = await this.fileService.fileExists(data.outputPath)
      if (!outputExists) {
        throw new Error('Image processing completed but output file not found')
      }

      // Get output file info
      const outputInfo = await this.imageService.getImageInfo(data.outputPath)

      await job.progress(100)
      this.logger.log(`Image resize completed: ${data.outputPath}`)

      return {
        success: true,
        inputPath: data.filePath,
        outputPath: data.outputPath,
        originalSize: {
          width: fileInfo.width,
          height: fileInfo.height,
          fileSize: fileInfo.fileSize,
        },
        processedSize: {
          width: outputInfo.width,
          height: outputInfo.height,
          fileSize: outputInfo.fileSize,
        },
        compressionRatio: (fileInfo.fileSize - outputInfo.fileSize) / fileInfo.fileSize,
        processedAt: new Date(),
      }
    } catch (error) {
      this.logger.error(`Image resize failed for ${data.filePath}:`, error)

      // Clean up partial files on failure
      try {
        await fs.unlink(data.outputPath)
      } catch (cleanupError) {
        // Ignore cleanup errors
      }

      throw error
    }
  }

  @Process(JOB_TYPES.PDF_GENERATION)
  async generatePDF(job: Job<FileProcessingJobData>) {
    const { data } = job

    try {
      await job.progress(15)
      this.logger.log(`Starting PDF generation: ${data.outputPath}`)

      // Prepare template data
      await job.progress(30)
      const templateData = await this.prepareTemplateData(data.options)

      // Generate PDF
      await job.progress(70)
      const pdfBuffer = await this.fileService.generatePDF(data.options.template, templateData)

      // Save PDF file
      await job.progress(90)
      await fs.writeFile(data.outputPath, pdfBuffer)

      await job.progress(100)
      this.logger.log(`PDF generated successfully: ${data.outputPath}`)

      return {
        success: true,
        outputPath: data.outputPath,
        fileSize: pdfBuffer.length,
        generatedAt: new Date(),
      }
    } catch (error) {
      this.logger.error(`PDF generation failed:`, error)
      throw error
    }
  }

  private async prepareTemplateData(options: any) {
    // Prepare data for PDF template
    return {
      ...options,
      generatedAt: new Date().toISOString(),
      appName: process.env.APP_NAME,
    }
  }
}
```

### Advanced Consumer Patterns

#### 1. Batch Processing Consumer

```typescript
// src/queues/consumers/batch-processing.consumer.ts
import { Processor, Process } from '@nestjs/bull'
import { Logger } from '@nestjs/common'
import { Job } from 'bull'

@Processor(QUEUE_NAMES.BATCH_PROCESSING)
export class BatchProcessingConsumer {
  private readonly logger = new Logger(BatchProcessingConsumer.name)

  @Process({ name: JOB_TYPES.BATCH_EMAIL, concurrency: 5 })
  async processBatchEmail(job: Job<{ emails: EmailJobData[] }>) {
    const { emails } = job.data
    const totalEmails = emails.length
    let processedCount = 0
    let successCount = 0
    let failureCount = 0

    this.logger.log(`Starting batch email processing: ${totalEmails} emails`)

    for (const emailData of emails) {
      try {
        await this.emailService.sendEmail(emailData)
        successCount++
      } catch (error) {
        this.logger.error(`Failed to send email to ${emailData.to}:`, error)
        failureCount++
      }

      processedCount++
      const progress = Math.round((processedCount / totalEmails) * 100)
      await job.progress(progress)
    }

    return {
      totalEmails,
      successCount,
      failureCount,
      completedAt: new Date(),
    }
  }

  @Process({ name: JOB_TYPES.BULK_USER_UPDATE, concurrency: 3 })
  async processBulkUserUpdate(job: Job<{ userIds: string[]; updateData: any }>) {
    const { userIds, updateData } = job.data
    const batchSize = 100
    let processedCount = 0

    for (let i = 0; i < userIds.length; i += batchSize) {
      const batch = userIds.slice(i, i + batchSize)

      try {
        await this.prisma.user.updateMany({
          where: { id: { in: batch } },
          data: updateData,
        })

        processedCount += batch.length
        const progress = Math.round((processedCount / userIds.length) * 100)
        await job.progress(progress)

        this.logger.log(`Processed batch ${Math.floor(i / batchSize) + 1}: ${batch.length} users`)
      } catch (error) {
        this.logger.error(`Failed to update batch starting at index ${i}:`, error)
        throw error
      }
    }

    return {
      totalUsers: userIds.length,
      processedCount,
      batchesProcessed: Math.ceil(userIds.length / batchSize),
      completedAt: new Date(),
    }
  }
}
```

#### 2. Priority-based Processing

```typescript
// src/queues/consumers/priority.consumer.ts
import { Processor, Process } from '@nestjs/bull'
import { Logger } from '@nestjs/common'
import { Job } from 'bull'

@Processor(QUEUE_NAMES.PRIORITY_PROCESSING)
export class PriorityConsumer {
  private readonly logger = new Logger(PriorityConsumer.name)

  // High priority jobs (1-3 concurrent)
  @Process({ name: JOB_TYPES.CRITICAL_NOTIFICATION, concurrency: 1 })
  async processCriticalNotification(job: Job) {
    // Handle critical notifications immediately
    this.logger.log(`Processing CRITICAL notification: ${job.id}`)
    // Implementation...
  }

  // Medium priority jobs (3-5 concurrent)
  @Process({ name: JOB_TYPES.STANDARD_EMAIL, concurrency: 3 })
  async processStandardEmail(job: Job) {
    this.logger.log(`Processing standard email: ${job.id}`)
    // Implementation...
  }

  // Low priority jobs (5-10 concurrent)
  @Process({ name: JOB_TYPES.NEWSLETTER, concurrency: 5 })
  async processNewsletter(job: Job) {
    this.logger.log(`Processing newsletter: ${job.id}`)
    // Implementation...
  }
}
```

**Input/Output Example:**

```typescript
// Example: Processing image resize job
// Input job data:
{
  filePath: '/uploads/original/avatar_user123.jpg',
  outputPath: '/uploads/thumbnails/avatar_user123_150x150.jpg',
  options: {
    width: 150,
    height: 150,
    quality: 85,
    format: 'jpeg'
  },
  userId: 'user123'
}

// Output result:
{
  success: true,
  inputPath: '/uploads/original/avatar_user123.jpg',
  outputPath: '/uploads/thumbnails/avatar_user123_150x150.jpg',
  originalSize: {
    width: 1200,
    height: 1200,
    fileSize: 456789
  },
  processedSize: {
    width: 150,
    height: 150,
    fileSize: 8932
  },
  compressionRatio: 0.98,
  processedAt: '2025-08-31T10:30:45.123Z'
}
```

### Job Progress Tracking

````typescript
// src/shared/services/job-tracking.service.ts
import { Injectable } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bull'
import { Queue } from 'bull'

@Injectable()
export class JobTrackingService {
  constructor(
    @InjectQueue(QUEUE_NAMES.EMAIL) private emailQueue: Queue,
    @InjectQueue(QUEUE_NAMES.FILE_PROCESSING) private fileQueue: Queue,
  ) {}

  async getJobStatus(jobId: string, queueName: string) {
    const queue = this.getQueueByName(queueName)
    const job = await queue.getJob(jobId)

    if (!job) {
      return { error: 'Job not found' }
    }

    const state = await job.getState()
    const progress = job.progress()
    const logs = job.log || []

    return {
      id: job.id,
      name: job.name,
      state,
      progress,
      data: job.data,
      opts: job.opts,
      createdAt: new Date(job.timestamp),
      processedOn: job.processedOn ? new Date(job.processedOn) : null,
      finishedOn: job.finishedOn ? new Date(job.finishedOn) : null,
      attemptsMade: job.attemptsMade,
      logs,
      result: job.returnvalue,
      error: job.failedReason,
    }
  }

  async cancelJob(jobId: string, queueName: string) {
    const queue = this.getQueueByName(queueName)
    const job = await queue.getJob(jobId)

    if (!job) {
      throw new Error('Job not found')
    }

    const state = await job.getState()

    if (state === 'active') {
      throw new Error('Cannot cancel active job')
    }

    if (['completed', 'failed'].includes(state)) {
      throw new Error('Cannot cancel completed job')
    }

    await job.remove()
    return { success: true, message: 'Job cancelled successfully' }
  }

  private getQueueByName(queueName: string): Queue {
    switch (queueName) {
      case QUEUE_NAMES.EMAIL:
        return this.emailQueue
      case QUEUE_NAMES.FILE_PROCESSING:
        return this.fileQueue
      default:
        throw new Error(`Unknown queue: ${queueName}`)
    }
  }
}

## ⚠️ Error Handling và Rollback Mechanisms

### Advanced Error Handling Patterns

#### 1. Comprehensive Error Classification

```typescript
// src/shared/types/queue-errors.types.ts
export enum ErrorType {
  RETRYABLE = 'RETRYABLE',
  PERMANENT = 'PERMANENT',
  RATE_LIMITED = 'RATE_LIMITED',
  VALIDATION = 'VALIDATION',
  EXTERNAL_SERVICE = 'EXTERNAL_SERVICE',
  RESOURCE_EXHAUSTION = 'RESOURCE_EXHAUSTION',
}

export interface QueueError extends Error {
  type: ErrorType
  retryable: boolean
  retryAfter?: number
  context?: Record<string, any>
}

export class RetryableError extends Error implements QueueError {
  type = ErrorType.RETRYABLE
  retryable = true
  retryAfter?: number
  context?: Record<string, any>

  constructor(message: string, retryAfter?: number, context?: Record<string, any>) {
    super(message)
    this.retryAfter = retryAfter
    this.context = context
  }
}

export class PermanentError extends Error implements QueueError {
  type = ErrorType.PERMANENT
  retryable = false
  context?: Record<string, any>

  constructor(message: string, context?: Record<string, any>) {
    super(message)
    this.context = context
  }
}

export class RateLimitError extends Error implements QueueError {
  type = ErrorType.RATE_LIMITED
  retryable = true
  retryAfter: number
  context?: Record<string, any>

  constructor(message: string, retryAfter: number, context?: Record<string, any>) {
    super(message)
    this.retryAfter = retryAfter
    this.context = context
  }
}
````

#### 2. Smart Error Handler Service

```typescript
// src/shared/services/queue-error-handler.service.ts
import { Injectable, Logger } from '@nestjs/common'
import { Job } from 'bull'
import { QueueError, ErrorType, RetryableError, PermanentError, RateLimitError } from '../types/queue-errors.types'

@Injectable()
export class QueueErrorHandlerService {
  private readonly logger = new Logger(QueueErrorHandlerService.name)

  async handleJobError(job: Job, error: Error): Promise<void> {
    const queueError = this.classifyError(error)

    // Log error với appropriate level
    this.logError(job, queueError)

    // Handle based on error type
    switch (queueError.type) {
      case ErrorType.RETRYABLE:
        await this.handleRetryableError(job, queueError)
        break

      case ErrorType.RATE_LIMITED:
        await this.handleRateLimitError(job, queueError)
        break

      case ErrorType.PERMANENT:
        await this.handlePermanentError(job, queueError)
        break

      case ErrorType.VALIDATION:
        await this.handleValidationError(job, queueError)
        break

      case ErrorType.EXTERNAL_SERVICE:
        await this.handleExternalServiceError(job, queueError)
        break

      default:
        await this.handleUnknownError(job, queueError)
    }
  }

  private classifyError(error: Error): QueueError {
    // Already classified error
    if ('type' in error) {
      return error as QueueError
    }

    const message = error.message.toLowerCase()

    // Rate limiting detection
    if (message.includes('rate limit') || message.includes('too many requests')) {
      const retryAfter = this.extractRetryAfter(error.message) || 60
      return new RateLimitError(error.message, retryAfter)
    }

    // Validation errors
    if (message.includes('validation') || message.includes('invalid')) {
      return new PermanentError(error.message, { originalError: error.name })
    }

    // Network/external service errors
    if (
      message.includes('network') ||
      message.includes('timeout') ||
      message.includes('connection') ||
      message.includes('enotfound')
    ) {
      return new RetryableError(error.message, 30, { category: 'network' })
    }

    // Resource exhaustion
    if (message.includes('memory') || message.includes('disk space') || message.includes('file too large')) {
      return new PermanentError(error.message, { category: 'resource' })
    }

    // Default to retryable with exponential backoff
    return new RetryableError(error.message, undefined, { category: 'unknown' })
  }

  private async handleRetryableError(job: Job, error: QueueError): Promise<void> {
    const maxAttempts = job.opts.attempts || 3

    if (job.attemptsMade < maxAttempts) {
      // Calculate delay for next retry (exponential backoff)
      const baseDelay = job.opts.backoff?.delay || 2000
      const delay = baseDelay * Math.pow(2, job.attemptsMade)

      this.logger.warn(`Job ${job.id} will retry in ${delay}ms (attempt ${job.attemptsMade + 1}/${maxAttempts})`)

      // Update job with retry information
      await job.update({
        ...job.data,
        retryInfo: {
          attempt: job.attemptsMade + 1,
          lastError: error.message,
          nextRetryAt: new Date(Date.now() + delay),
        },
      })
    } else {
      await this.handlePermanentError(job, error)
    }
  }

  private async handleRateLimitError(job: Job, error: RateLimitError): Promise<void> {
    const delayMs = (error.retryAfter || 60) * 1000

    this.logger.warn(`Job ${job.id} rate limited, retrying in ${error.retryAfter}s`)

    // Move job to delayed state
    await job.moveToDelayed(Date.now() + delayMs)
  }

  private async handlePermanentError(job: Job, error: QueueError): Promise<void> {
    this.logger.error(`Job ${job.id} failed permanently: ${error.message}`)

    // Move to dead letter queue
    await this.moveToDeadLetterQueue(job, error)

    // Send alert for critical jobs
    if (this.isCriticalJob(job)) {
      await this.sendCriticalJobFailureAlert(job, error)
    }
  }

  private async handleValidationError(job: Job, error: QueueError): Promise<void> {
    this.logger.error(`Job ${job.id} has validation errors: ${error.message}`)

    // Log validation details for debugging
    await this.logValidationFailure(job, error)

    // Don't retry validation errors
    await this.moveToDeadLetterQueue(job, error)
  }

  private async handleExternalServiceError(job: Job, error: QueueError): Promise<void> {
    // Check if external service is down
    const serviceStatus = await this.checkExternalServiceStatus(job)

    if (serviceStatus.isDown) {
      // Delay all jobs for this service
      const delayMs = serviceStatus.estimatedRecoveryTime || 300000 // 5 minutes
      await job.moveToDelayed(Date.now() + delayMs)

      this.logger.warn(`External service down, delaying job ${job.id} for ${delayMs}ms`)
    } else {
      // Treat as retryable error
      await this.handleRetryableError(job, error)
    }
  }

  private async handleUnknownError(job: Job, error: QueueError): Promise<void> {
    this.logger.error(`Unknown error in job ${job.id}: ${error.message}`)

    // Log full error details for investigation
    await this.logUnknownError(job, error)

    // Treat as retryable with limited attempts
    if (job.attemptsMade < 2) {
      await this.handleRetryableError(job, error)
    } else {
      await this.handlePermanentError(job, error)
    }
  }

  private logError(job: Job, error: QueueError): void {
    const logData = {
      jobId: job.id,
      jobName: job.name,
      queueName: job.queue.name,
      errorType: error.type,
      errorMessage: error.message,
      attemptsMade: job.attemptsMade,
      maxAttempts: job.opts.attempts,
      jobData: job.data,
      context: error.context,
    }

    switch (error.type) {
      case ErrorType.PERMANENT:
      case ErrorType.VALIDATION:
        this.logger.error('Job failed permanently:', logData)
        break
      case ErrorType.RATE_LIMITED:
        this.logger.warn('Job rate limited:', logData)
        break
      default:
        this.logger.warn('Job error (retryable):', logData)
    }
  }

  private extractRetryAfter(message: string): number | null {
    const match = message.match(/retry.*?(\d+)/i)
    return match ? parseInt(match[1]) : null
  }

  private async moveToDeadLetterQueue(job: Job, error: QueueError): Promise<void> {
    // Implementation for moving failed jobs to dead letter queue
    const deadLetterData = {
      originalJob: {
        id: job.id,
        name: job.name,
        data: job.data,
        opts: job.opts,
      },
      failureReason: error.message,
      errorType: error.type,
      failedAt: new Date(),
      attemptsMade: job.attemptsMade,
    }

    // Store in database or separate queue for manual review
    await this.storeDeadLetterJob(deadLetterData)
  }

  private isCriticalJob(job: Job): boolean {
    const criticalJobTypes = [JOB_TYPES.SEND_PASSWORD_RESET, JOB_TYPES.PAYMENT_PROCESSING, JOB_TYPES.SECURITY_ALERT]

    return criticalJobTypes.includes(job.name as any)
  }

  private async sendCriticalJobFailureAlert(job: Job, error: QueueError): Promise<void> {
    // Send immediate alert to admins
    this.logger.error(`CRITICAL JOB FAILURE: ${job.name} (${job.id})`)

    // Implementation for sending alerts (email, Slack, etc.)
  }

  private async checkExternalServiceStatus(job: Job): Promise<{ isDown: boolean; estimatedRecoveryTime?: number }> {
    // Implementation for checking external service status
    // Could use circuit breaker pattern or health check endpoints
    return { isDown: false }
  }

  private async logValidationFailure(job: Job, error: QueueError): Promise<void> {
    // Log detailed validation failure for debugging
    this.logger.debug('Validation failure details:', {
      jobId: job.id,
      data: job.data,
      error: error.message,
      context: error.context,
    })
  }

  private async logUnknownError(job: Job, error: QueueError): Promise<void> {
    // Log unknown error with full stack trace
    this.logger.error('Unknown error details:', {
      jobId: job.id,
      error: error.message,
      stack: error.stack,
      context: error.context,
    })
  }

  private async storeDeadLetterJob(deadLetterData: any): Promise<void> {
    // Store failed job data for manual review
    // Could be database, file system, or separate queue
    this.logger.warn('Job moved to dead letter queue:', deadLetterData)
  }
}
```

### Database Transaction Rollback

#### 1. Transactional Job Processing

```typescript
// src/shared/services/transactional-job.service.ts
import { Injectable, Logger } from '@nestjs/common'
import { PrismaService } from './prisma.service'
import { Job } from 'bull'

@Injectable()
export class TransactionalJobService {
  private readonly logger = new Logger(TransactionalJobService.name)

  constructor(private prisma: PrismaService) {}

  async executeWithRollback<T>(job: Job, operation: (tx: any) => Promise<T>): Promise<T> {
    const jobId = job.id

    return await this.prisma.$transaction(async (tx) => {
      try {
        // Log transaction start
        await job.log(`Transaction started for job ${jobId}`)

        // Execute the operation within transaction
        const result = await operation(tx)

        // Log successful completion
        await job.log(`Transaction completed successfully for job ${jobId}`)

        return result
      } catch (error) {
        // Log rollback
        await job.log(`Transaction failed, rolling back for job ${jobId}: ${error.message}`)

        this.logger.error(`Transaction rollback for job ${jobId}:`, error)

        // Transaction will be automatically rolled back when error is thrown
        throw error
      }
    })
  }

  // Example: Order processing với automatic rollback
  async processOrderWithRollback(job: Job<{ orderId: string }>) {
    const { orderId } = job.data

    return await this.executeWithRollback(job, async (tx) => {
      await job.progress(10)

      // Step 1: Update order status
      const order = await tx.order.update({
        where: { id: orderId },
        data: { status: 'PROCESSING' },
        include: { items: true },
      })

      await job.progress(30)

      // Step 2: Reserve inventory
      for (const item of order.items) {
        const product = await tx.product.findUnique({
          where: { id: item.productId },
        })

        if (product.stock < item.quantity) {
          throw new Error(`Insufficient stock for product ${item.productId}`)
        }

        await tx.product.update({
          where: { id: item.productId },
          data: { stock: { decrement: item.quantity } },
        })
      }

      await job.progress(60)

      // Step 3: Process payment (external service call)
      const paymentResult = await this.processPayment(order)

      if (!paymentResult.success) {
        throw new Error(`Payment failed: ${paymentResult.error}`)
      }

      await job.progress(80)

      // Step 4: Update order với payment info
      const completedOrder = await tx.order.update({
        where: { id: orderId },
        data: {
          status: 'COMPLETED',
          paymentId: paymentResult.paymentId,
          paidAt: new Date(),
        },
      })

      await job.progress(100)

      return completedOrder
    })
  }

  private async processPayment(order: any): Promise<{ success: boolean; paymentId?: string; error?: string }> {
    // Simulate payment processing
    // In real implementation, this would call external payment service
    try {
      // Simulate API call delay
      await new Promise((resolve) => setTimeout(resolve, 1000))

      // Simulate random failures for testing
      if (Math.random() < 0.1) {
        // 10% failure rate
        return { success: false, error: 'Payment gateway timeout' }
      }

      return {
        success: true,
        paymentId: `pay_${Date.now()}`,
      }
    } catch (error) {
      return {
        success: false,
        error: error.message,
      }
    }
  }
}
```

#### 2. Compensating Actions Pattern

```typescript
// src/shared/services/compensation.service.ts
import { Injectable, Logger } from '@nestjs/common'
import { Job } from 'bull'

interface CompensationAction {
  id: string
  description: string
  execute: () => Promise<void>
  rollback: () => Promise<void>
}

@Injectable()
export class CompensationService {
  private readonly logger = new Logger(CompensationService.name)
  private readonly executedActions = new Map<string, CompensationAction[]>()

  async executeWithCompensation<T>(job: Job, actions: CompensationAction[]): Promise<T> {
    const jobId = job.id.toString()
    const executedActions: CompensationAction[] = []

    try {
      // Execute actions one by one
      for (const action of actions) {
        await job.log(`Executing action: ${action.description}`)
        await action.execute()
        executedActions.push(action)

        // Update progress
        const progress = Math.round((executedActions.length / actions.length) * 100)
        await job.progress(progress)
      }

      // Store executed actions for potential future rollback
      this.executedActions.set(jobId, executedActions)

      return { success: true } as T
    } catch (error) {
      await job.log(`Action failed: ${error.message}. Starting compensation...`)

      // Execute compensation actions in reverse order
      await this.executeCompensation(job, executedActions)

      throw error
    }
  }

  private async executeCompensation(job: Job, executedActions: CompensationAction[]): Promise<void> {
    // Execute rollbacks in reverse order
    const actionsToRollback = [...executedActions].reverse()

    for (const action of actionsToRollback) {
      try {
        await job.log(`Rolling back action: ${action.description}`)
        await action.rollback()
      } catch (rollbackError) {
        this.logger.error(`Rollback failed for action ${action.id}:`, rollbackError)
        // Continue with other rollbacks even if one fails
      }
    }
  }

  // Example: User registration với compensation
  async registerUserWithCompensation(job: Job<{ userData: any; preferences: any }>) {
    const { userData, preferences } = job.data

    const actions: CompensationAction[] = [
      {
        id: 'create-user',
        description: 'Create user account',
        execute: async () => {
          userData.createdUser = await this.prisma.user.create({
            data: userData,
          })
        },
        rollback: async () => {
          if (userData.createdUser) {
            await this.prisma.user.delete({
              where: { id: userData.createdUser.id },
            })
          }
        },
      },
      {
        id: 'setup-preferences',
        description: 'Setup user preferences',
        execute: async () => {
          preferences.createdPreferences = await this.prisma.userPreferences.create({
            data: {
              ...preferences,
              userId: userData.createdUser.id,
            },
          })
        },
        rollback: async () => {
          if (preferences.createdPreferences) {
            await this.prisma.userPreferences.delete({
              where: { id: preferences.createdPreferences.id },
            })
          }
        },
      },
      {
        id: 'send-welcome-email',
        description: 'Send welcome email',
        execute: async () => {
          const emailResult = await this.emailService.sendWelcomeEmail({
            to: userData.createdUser.email,
            variables: { name: userData.createdUser.name },
          })
          userData.emailSent = emailResult.messageId
        },
        rollback: async () => {
          // Cannot rollback email, but we can log it
          this.logger.warn(`Cannot rollback welcome email for ${userData.createdUser.email}`)
        },
      },
      {
        id: 'create-default-settings',
        description: 'Create default settings',
        execute: async () => {
          userData.defaultSettings = await this.prisma.userSettings.create({
            data: {
              userId: userData.createdUser.id,
              theme: 'light',
              notifications: true,
            },
          })
        },
        rollback: async () => {
          if (userData.defaultSettings) {
            await this.prisma.userSettings.delete({
              where: { id: userData.defaultSettings.id },
            })
          }
        },
      },
    ]

    return await this.executeWithCompensation(job, actions)
  }

  // Manual rollback for specific job
  async rollbackJob(jobId: string): Promise<void> {
    const executedActions = this.executedActions.get(jobId)

    if (!executedActions) {
      throw new Error(`No executed actions found for job ${jobId}`)
    }

    this.logger.log(`Starting manual rollback for job ${jobId}`)

    const actionsToRollback = [...executedActions].reverse()

    for (const action of actionsToRollback) {
      try {
        this.logger.log(`Rolling back action: ${action.description}`)
        await action.rollback()
      } catch (error) {
        this.logger.error(`Manual rollback failed for action ${action.id}:`, error)
      }
    }

    // Clean up stored actions
    this.executedActions.delete(jobId)

    this.logger.log(`Manual rollback completed for job ${jobId}`)
  }
}
```

**Error Handling Example:**

```typescript
// Example: Email với retry logic và fallback
@Process(JOB_TYPES.SEND_CRITICAL_EMAIL)
async sendCriticalEmail(job: Job<EmailJobData>) {
  try {
    // Primary email service
    return await this.primaryEmailService.send(job.data)
  } catch (primaryError) {
    if (primaryError instanceof RateLimitError) {
      // Wait and retry với primary service
      throw primaryError
    }

    try {
      // Fallback to secondary email service
      job.log('Primary email service failed, trying backup service')
      return await this.backupEmailService.send(job.data)
    } catch (backupError) {
      // Both services failed
      throw new PermanentError(
        `Both email services failed: ${primaryError.message}, ${backupError.message}`,
        { primaryError: primaryError.message, backupError: backupError.message }
      )
    }
  }
}
```

## 🔧 Advanced Patterns và Integration

### 1. Distributed Queue Management

```typescript
// src/shared/services/distributed-queue.service.ts
import { Injectable, Logger } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bull'
import { Queue } from 'bull'
import { Redis } from 'ioredis'

@Injectable()
export class DistributedQueueService {
  private readonly logger = new Logger(DistributedQueueService.name)
  private readonly lockPrefix = 'queue-lock:'
  private readonly lockTimeout = 10000 // 10 seconds

  constructor(
    @InjectQueue(QUEUE_NAMES.DISTRIBUTED) private distributedQueue: Queue,
    private redis: Redis,
  ) {}

  // Distributed lock pattern for unique job processing
  async addUniqueJob(jobType: string, data: any, options: any = {}) {
    const lockKey = `${this.lockPrefix}${jobType}:${this.generateJobKey(data)}`

    try {
      // Acquire distributed lock
      const lockAcquired = await this.acquireLock(lockKey, this.lockTimeout)

      if (!lockAcquired) {
        this.logger.warn(`Job already being processed: ${jobType}`)
        return { success: false, reason: 'duplicate_job' }
      }

      // Check if similar job already exists in queue
      const existingJobs = await this.distributedQueue.getJobs(['waiting', 'active', 'delayed'])
      const duplicateJob = existingJobs.find((job) => job.name === jobType && this.isSimilarJob(job.data, data))

      if (duplicateJob) {
        await this.releaseLock(lockKey)
        return {
          success: false,
          reason: 'duplicate_job',
          existingJobId: duplicateJob.id,
        }
      }

      // Add job to queue
      const job = await this.distributedQueue.add(jobType, data, {
        ...options,
        jobId: this.generateJobKey(data), // Unique job ID
      })

      // Release lock after adding job
      await this.releaseLock(lockKey)

      this.logger.log(`Unique job added: ${job.id}`)
      return { success: true, jobId: job.id }
    } catch (error) {
      await this.releaseLock(lockKey)
      this.logger.error(`Failed to add unique job:`, error)
      throw error
    }
  }

  // Job scheduling với cron-like pattern
  async scheduleRecurringJob(jobType: string, data: any, cronPattern: string, options: any = {}) {
    const jobId = `recurring:${jobType}:${this.generateJobKey(data)}`

    // Remove existing recurring job if exists
    try {
      const existingJob = await this.distributedQueue.getJob(jobId)
      if (existingJob) {
        await existingJob.remove()
      }
    } catch (error) {
      // Ignore if job doesn't exist
    }

    // Add new recurring job
    const job = await this.distributedQueue.add(jobType, data, {
      ...options,
      jobId,
      repeat: { cron: cronPattern },
      removeOnComplete: 5,
      removeOnFail: 3,
    })

    this.logger.log(`Recurring job scheduled: ${job.id} with pattern ${cronPattern}`)
    return job
  }

  // Batch processing với optimized throughput
  async processBatch(jobType: string, items: any[], batchSize: number = 100, options: any = {}) {
    const batches = this.chunkArray(items, batchSize)
    const jobs = []

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i]
      const batchJob = await this.distributedQueue.add(
        `${jobType}:batch`,
        {
          batchIndex: i,
          totalBatches: batches.length,
          items: batch,
        },
        {
          ...options,
          priority: options.priority || 10 - Math.floor(i / 10), // Decrease priority for later batches
        },
      )

      jobs.push(batchJob)
    }

    this.logger.log(`Created ${jobs.length} batch jobs for ${items.length} items`)
    return jobs
  }

  // Priority queue management
  async adjustJobPriority(jobId: string, newPriority: number) {
    const job = await this.distributedQueue.getJob(jobId)

    if (!job) {
      throw new Error(`Job ${jobId} not found`)
    }

    const state = await job.getState()

    if (state !== 'waiting') {
      throw new Error(`Cannot adjust priority of ${state} job`)
    }

    // Remove và re-add với new priority
    const jobData = job.data
    const jobOptions = { ...job.opts, priority: newPriority }

    await job.remove()

    const newJob = await this.distributedQueue.add(job.name, jobData, jobOptions)

    this.logger.log(`Job priority adjusted: ${jobId} -> ${newJob.id} (priority: ${newPriority})`)
    return newJob
  }

  private async acquireLock(key: string, timeout: number): Promise<boolean> {
    const result = await this.redis.set(key, '1', 'PX', timeout, 'NX')
    return result === 'OK'
  }

  private async releaseLock(key: string): Promise<void> {
    await this.redis.del(key)
  }

  private generateJobKey(data: any): string {
    // Generate unique key based on job data
    const keyData = JSON.stringify(data, Object.keys(data).sort())
    return require('crypto').createHash('md5').update(keyData).digest('hex')
  }

  private isSimilarJob(jobData1: any, jobData2: any): boolean {
    return this.generateJobKey(jobData1) === this.generateJobKey(jobData2)
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks = []
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size))
    }
    return chunks
  }
}
```

### 2. Queue Health Monitoring

```typescript
// src/shared/services/queue-health.service.ts
import { Injectable, Logger } from '@nestjs/common'
import { InjectQueue } from '@nestjs/bull'
import { Queue } from 'bull'
import { Cron } from '@nestjs/schedule'

interface QueueHealth {
  name: string
  status: 'healthy' | 'warning' | 'critical'
  metrics: {
    waiting: number
    active: number
    completed: number
    failed: number
    delayed: number
    paused: boolean
  }
  performance: {
    avgProcessingTime: number
    throughput: number // jobs per minute
    errorRate: number // percentage
  }
  alerts: string[]
}

@Injectable()
export class QueueHealthService {
  private readonly logger = new Logger(QueueHealthService.name)
  private healthHistory = new Map<string, QueueHealth[]>()

  constructor(
    @InjectQueue(QUEUE_NAMES.EMAIL) private emailQueue: Queue,
    @InjectQueue(QUEUE_NAMES.FILE_PROCESSING) private fileQueue: Queue,
    @InjectQueue(QUEUE_NAMES.NOTIFICATION) private notificationQueue: Queue,
  ) {}

  @Cron('*/30 * * * * *') // Every 30 seconds
  async checkQueueHealth() {
    const queues = [
      { name: 'email', queue: this.emailQueue },
      { name: 'file-processing', queue: this.fileQueue },
      { name: 'notification', queue: this.notificationQueue },
    ]

    for (const { name, queue } of queues) {
      try {
        const health = await this.assessQueueHealth(name, queue)
        await this.updateHealthHistory(name, health)

        if (health.status === 'critical') {
          await this.handleCriticalQueue(health)
        } else if (health.status === 'warning') {
          await this.handleWarningQueue(health)
        }
      } catch (error) {
        this.logger.error(`Health check failed for queue ${name}:`, error)
      }
    }
  }

  async assessQueueHealth(name: string, queue: Queue): Promise<QueueHealth> {
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaiting(),
      queue.getActive(),
      queue.getCompleted(),
      queue.getFailed(),
      queue.getDelayed(),
    ])

    const metrics = {
      waiting: waiting.length,
      active: active.length,
      completed: completed.length,
      failed: failed.length,
      delayed: delayed.length,
      paused: await queue.isPaused(),
    }

    const performance = await this.calculatePerformanceMetrics(queue, completed, failed)
    const { status, alerts } = this.determineHealthStatus(metrics, performance)

    return {
      name,
      status,
      metrics,
      performance,
      alerts,
    }
  }

  private async calculatePerformanceMetrics(queue: Queue, completed: any[], failed: any[]) {
    const now = Date.now()
    const oneMinuteAgo = now - 60000

    // Calculate average processing time from recent completed jobs
    const recentCompleted = completed.filter((job) => job.finishedOn > oneMinuteAgo)
    const avgProcessingTime =
      recentCompleted.length > 0
        ? recentCompleted.reduce((sum, job) => sum + (job.finishedOn - job.processedOn), 0) / recentCompleted.length
        : 0

    // Calculate throughput (jobs per minute)
    const throughput = recentCompleted.length

    // Calculate error rate
    const recentFailed = failed.filter((job) => job.finishedOn > oneMinuteAgo)
    const totalRecentJobs = recentCompleted.length + recentFailed.length
    const errorRate = totalRecentJobs > 0 ? (recentFailed.length / totalRecentJobs) * 100 : 0

    return {
      avgProcessingTime,
      throughput,
      errorRate,
    }
  }

  private determineHealthStatus(metrics: any, performance: any): { status: QueueHealth['status']; alerts: string[] } {
    const alerts: string[] = []
    let status: QueueHealth['status'] = 'healthy'

    // Check for critical conditions
    if (metrics.paused) {
      alerts.push('Queue is paused')
      status = 'critical'
    }

    if (metrics.waiting > 1000) {
      alerts.push(`High queue backlog: ${metrics.waiting} jobs waiting`)
      status = status === 'critical' ? 'critical' : 'warning'
    }

    if (performance.errorRate > 50) {
      alerts.push(`High error rate: ${performance.errorRate.toFixed(1)}%`)
      status = 'critical'
    } else if (performance.errorRate > 20) {
      alerts.push(`Elevated error rate: ${performance.errorRate.toFixed(1)}%`)
      status = status === 'critical' ? 'critical' : 'warning'
    }

    if (performance.avgProcessingTime > 30000) {
      // 30 seconds
      alerts.push(`Slow processing: ${(performance.avgProcessingTime / 1000).toFixed(1)}s average`)
      status = status === 'critical' ? 'critical' : 'warning'
    }

    if (performance.throughput === 0 && metrics.waiting > 0) {
      alerts.push('No jobs being processed despite queue backlog')
      status = 'critical'
    }

    return { status, alerts }
  }

  private async updateHealthHistory(queueName: string, health: QueueHealth) {
    if (!this.healthHistory.has(queueName)) {
      this.healthHistory.set(queueName, [])
    }

    const history = this.healthHistory.get(queueName)!
    history.push(health)

    // Keep only last 100 health checks (about 50 minutes of history)
    if (history.length > 100) {
      history.shift()
    }
  }

  private async handleCriticalQueue(health: QueueHealth) {
    this.logger.error(`CRITICAL: Queue ${health.name} is in critical state:`, health.alerts)

    // Auto-remediation actions
    if (health.metrics.paused) {
      // Don't auto-resume, might be intentionally paused
      this.logger.warn(`Queue ${health.name} is paused - manual intervention required`)
    }

    if (health.performance.throughput === 0 && health.metrics.waiting > 0) {
      // Try to restart workers or clear stuck jobs
      await this.attemptQueueRecovery(health.name)
    }

    // Send critical alerts
    await this.sendCriticalAlert(health)
  }

  private async handleWarningQueue(health: QueueHealth) {
    this.logger.warn(`WARNING: Queue ${health.name} showing degraded performance:`, health.alerts)

    // Log warning for monitoring
    await this.logWarning(health)
  }

  private async attemptQueueRecovery(queueName: string) {
    this.logger.log(`Attempting automatic recovery for queue: ${queueName}`)

    // Implementation for queue recovery
    // Could include restarting workers, clearing stuck jobs, etc.
  }

  private async sendCriticalAlert(health: QueueHealth) {
    // Send immediate alert to operations team
    this.logger.error(`ALERT: Critical queue issue - ${health.name}`, health)
  }

  private async logWarning(health: QueueHealth) {
    // Log warning for monitoring dashboard
    this.logger.warn(`Queue warning - ${health.name}`, health)
  }

  // Public API for getting current health status
  async getCurrentHealth(): Promise<QueueHealth[]> {
    const queues = [
      { name: 'email', queue: this.emailQueue },
      { name: 'file-processing', queue: this.fileQueue },
      { name: 'notification', queue: this.notificationQueue },
    ]

    const healthChecks = await Promise.all(queues.map(({ name, queue }) => this.assessQueueHealth(name, queue)))

    return healthChecks
  }

  async getHealthHistory(queueName: string, limit: number = 50): Promise<QueueHealth[]> {
    const history = this.healthHistory.get(queueName) || []
    return history.slice(-limit)
  }
}
```

### 3. Queue Dashboard Controller

```typescript
// src/admin/queue-dashboard.controller.ts
import { Controller, Get, Post, Param, Body, Query, UseGuards } from '@nestjs/common'
import { QueueHealthService } from '../shared/services/queue-health.service'
import { QueueProducerService } from '../shared/services/queue-producer.service'
import { JobTrackingService } from '../shared/services/job-tracking.service'
import { AuthGuard } from '../shared/guards/auth.guard'
import { RolesGuard } from '../shared/guards/roles.guard'
import { Roles } from '../shared/decorators/roles.decorator'

@Controller('admin/queues')
@UseGuards(AuthGuard, RolesGuard)
@Roles('admin')
export class QueueDashboardController {
  constructor(
    private queueHealth: QueueHealthService,
    private queueProducer: QueueProducerService,
    private jobTracking: JobTrackingService,
  ) {}

  @Get('health')
  async getQueueHealth() {
    const currentHealth = await this.queueHealth.getCurrentHealth()

    return {
      timestamp: new Date().toISOString(),
      queues: currentHealth,
      overall: this.calculateOverallHealth(currentHealth),
    }
  }

  @Get('health/:queueName/history')
  async getQueueHealthHistory(@Param('queueName') queueName: string, @Query('limit') limit: string = '50') {
    const history = await this.queueHealth.getHealthHistory(queueName, parseInt(limit))

    return {
      queueName,
      history,
      summary: this.summarizeHealthHistory(history),
    }
  }

  @Get('stats')
  async getQueueStats() {
    const stats = await this.queueProducer.getQueueStats()

    return {
      timestamp: new Date().toISOString(),
      queues: stats,
      totals: this.calculateTotals(stats),
    }
  }

  @Get('jobs/:jobId')
  async getJobDetails(@Param('jobId') jobId: string, @Query('queue') queueName: string) {
    const jobStatus = await this.jobTracking.getJobStatus(jobId, queueName)

    return {
      job: jobStatus,
      timeline: this.buildJobTimeline(jobStatus),
    }
  }

  @Post('jobs/:jobId/cancel')
  async cancelJob(@Param('jobId') jobId: string, @Body('queue') queueName: string) {
    const result = await this.jobTracking.cancelJob(jobId, queueName)

    return {
      success: true,
      message: `Job ${jobId} cancelled successfully`,
      result,
    }
  }

  @Post('jobs/:jobId/retry')
  async retryJob(@Param('jobId') jobId: string, @Body() body: { queue: string; priority?: number }) {
    // Implementation for retrying failed jobs
    return {
      success: true,
      message: `Job ${jobId} queued for retry`,
    }
  }

  @Get('failed-jobs')
  async getFailedJobs(@Query('queue') queueName?: string, @Query('limit') limit: string = '20') {
    // Implementation for getting failed jobs
    return {
      failedJobs: [],
      total: 0,
    }
  }

  private calculateOverallHealth(queueHealths: any[]): string {
    const criticalCount = queueHealths.filter((q) => q.status === 'critical').length
    const warningCount = queueHealths.filter((q) => q.status === 'warning').length

    if (criticalCount > 0) return 'critical'
    if (warningCount > 0) return 'warning'
    return 'healthy'
  }

  private summarizeHealthHistory(history: any[]) {
    if (history.length === 0) return null

    const recent = history.slice(-10) // Last 10 checks
    const avgThroughput = recent.reduce((sum, h) => sum + h.performance.throughput, 0) / recent.length
    const avgErrorRate = recent.reduce((sum, h) => sum + h.performance.errorRate, 0) / recent.length

    return {
      avgThroughput: Math.round(avgThroughput),
      avgErrorRate: Math.round(avgErrorRate * 100) / 100,
      trendDirection: this.calculateTrend(recent),
    }
  }

  private calculateTotals(stats: any) {
    const totals = {
      waiting: 0,
      active: 0,
      completed: 0,
      failed: 0,
      delayed: 0,
    }

    Object.values(stats).forEach((queueStats: any) => {
      totals.waiting += queueStats.waiting
      totals.active += queueStats.active
      totals.completed += queueStats.completed
      totals.failed += queueStats.failed
      totals.delayed += queueStats.delayed
    })

    return totals
  }

  private buildJobTimeline(jobStatus: any) {
    const timeline = []

    if (jobStatus.createdAt) {
      timeline.push({
        event: 'Job Created',
        timestamp: jobStatus.createdAt,
        details: 'Job added to queue',
      })
    }

    if (jobStatus.processedOn) {
      timeline.push({
        event: 'Processing Started',
        timestamp: jobStatus.processedOn,
        details: 'Job picked up by worker',
      })
    }

    if (jobStatus.finishedOn) {
      timeline.push({
        event: jobStatus.error ? 'Job Failed' : 'Job Completed',
        timestamp: jobStatus.finishedOn,
        details: jobStatus.error || 'Job completed successfully',
      })
    }

    return timeline
  }

  private calculateTrend(data: any[]): 'improving' | 'degrading' | 'stable' {
    if (data.length < 2) return 'stable'

    const first = data[0].performance.throughput
    const last = data[data.length - 1].performance.throughput

    const change = (last - first) / first

    if (change > 0.1) return 'improving'
    if (change < -0.1) return 'degrading'
    return 'stable'
  }
}
```

**Real-world Integration Example:**

```typescript
// src/orders/order.service.ts - Complete order processing pipeline
export class OrderService {
  constructor(
    private queueProducer: QueueProducerService,
    private transactionalJob: TransactionalJobService,
    private compensation: CompensationService,
  ) {}

  async processOrder(orderId: string) {
    // Step 1: Add main processing job
    const mainJob = await this.queueProducer.processOrder({
      orderId,
      priority: 10,
    })

    // Step 2: Add dependent jobs
    await Promise.all([
      // Send confirmation email (low priority)
      this.queueProducer.sendOrderConfirmation({
        orderId,
        priority: 5,
        delay: 1000, // Wait 1 second for order to be processed
      }),

      // Update inventory (high priority)
      this.queueProducer.updateInventory({
        orderId,
        priority: 15,
      }),

      // Generate invoice (medium priority)
      this.queueProducer.generateInvoice({
        orderId,
        priority: 8,
        delay: 2000, // Wait 2 seconds
      }),
    ])

    return {
      success: true,
      mainJobId: mainJob.id,
      message: 'Order processing started',
    }
  }
}
```

## 📝 Best Practices

### DO's ✅

#### 1. **Proper Job Design**

```typescript
// ✅ Good: Small, focused jobs
@Process(JOB_TYPES.SEND_EMAIL)
async sendEmail(job: Job<EmailJobData>) {
  // Single responsibility: only send email
  return await this.emailService.send(job.data)
}

@Process(JOB_TYPES.PROCESS_IMAGE)
async processImage(job: Job<ImageJobData>) {
  // Single responsibility: only process image
  return await this.imageService.resize(job.data)
}

// ✅ Good: Idempotent jobs
@Process(JOB_TYPES.UPDATE_USER_PREFERENCES)
async updateUserPreferences(job: Job<{ userId: string; preferences: any }>) {
  const { userId, preferences } = job.data

  // Check if already processed
  const existing = await this.prisma.userPreferences.findUnique({
    where: { userId },
  })

  if (existing && this.isSamePreferences(existing, preferences)) {
    return { success: true, message: 'Already up to date' }
  }

  // Safe to process multiple times
  return await this.prisma.userPreferences.upsert({
    where: { userId },
    create: { userId, ...preferences },
    update: preferences,
  })
}
```

#### 2. **Comprehensive Error Handling**

```typescript
// ✅ Good: Proper error classification và handling
@Process(JOB_TYPES.PAYMENT_PROCESSING)
async processPayment(job: Job<PaymentJobData>) {
  try {
    await job.progress(10)

    // Validate input
    if (!job.data.paymentMethodId) {
      throw new PermanentError('Payment method ID is required')
    }

    await job.progress(30)

    // Process payment
    const result = await this.paymentService.charge(job.data)

    await job.progress(100)
    return result

  } catch (error) {
    // Classify error properly
    if (error.code === 'INSUFFICIENT_FUNDS') {
      throw new PermanentError('Insufficient funds', { code: error.code })
    }

    if (error.code === 'NETWORK_ERROR') {
      throw new RetryableError('Network error', 30, { code: error.code })
    }

    if (error.code === 'RATE_LIMITED') {
      throw new RateLimitError('Rate limited', 60, { code: error.code })
    }

    // Unknown error - treat as retryable
    throw new RetryableError(error.message)
  }
}
```

#### 3. **Resource Management**

```typescript
// ✅ Good: Proper resource cleanup
@Process(JOB_TYPES.PROCESS_VIDEO)
async processVideo(job: Job<VideoJobData>) {
  let tempFiles: string[] = []

  try {
    await job.progress(10)

    // Create temporary files
    const inputFile = await this.createTempFile(job.data.videoUrl)
    tempFiles.push(inputFile)

    await job.progress(50)

    // Process video
    const outputFile = await this.videoService.process(inputFile, job.data.options)
    tempFiles.push(outputFile)

    await job.progress(90)

    // Upload result
    const finalUrl = await this.uploadService.upload(outputFile)

    await job.progress(100)
    return { success: true, url: finalUrl }

  } finally {
    // Always cleanup temp files
    await this.cleanupTempFiles(tempFiles)
  }
}

private async cleanupTempFiles(files: string[]): Promise<void> {
  await Promise.all(
    files.map(async (file) => {
      try {
        await fs.unlink(file)
      } catch (error) {
        this.logger.warn(`Failed to cleanup temp file ${file}:`, error)
      }
    })
  )
}
```

#### 4. **Progress Tracking và Monitoring**

```typescript
// ✅ Good: Detailed progress tracking
@Process(JOB_TYPES.BULK_IMPORT)
async bulkImport(job: Job<{ items: any[] }>) {
  const { items } = job.data
  const total = items.length
  let processed = 0
  let successful = 0
  let failed = 0

  await job.log(`Starting bulk import of ${total} items`)

  for (const [index, item] of items.entries()) {
    try {
      await this.importService.importItem(item)
      successful++
    } catch (error) {
      failed++
      await job.log(`Failed to import item ${index}: ${error.message}`)
    }

    processed++

    // Update progress every 10 items or at end
    if (processed % 10 === 0 || processed === total) {
      const progress = Math.round((processed / total) * 100)
      await job.progress(progress)
      await job.log(`Progress: ${processed}/${total} (${successful} successful, ${failed} failed)`)
    }
  }

  return {
    total,
    successful,
    failed,
    successRate: (successful / total) * 100,
  }
}
```

#### 5. **Queue Configuration Best Practices**

```typescript
// ✅ Good: Environment-specific configuration
export const getQueueConfig = () => ({
  redis: {
    host: process.env.REDIS_HOST,
    port: parseInt(process.env.REDIS_PORT || '6379'),
    password: process.env.REDIS_PASSWORD,
    db: parseInt(process.env.REDIS_QUEUE_DB || '0'),
    // Connection pooling
    maxRetriesPerRequest: 3,
    retryDelayOnFailover: 100,
    enableReadyCheck: false,
    lazyConnect: true,
  },
  defaultJobOptions: {
    removeOnComplete: process.env.NODE_ENV === 'production' ? 100 : 10,
    removeOnFail: process.env.NODE_ENV === 'production' ? 50 : 5,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    // Job timeout
    timeout: 5 * 60 * 1000, // 5 minutes
  },
  settings: {
    stalledInterval: 30 * 1000, // 30 seconds
    maxStalledCount: 1,
  },
})
```

### DON'T's ❌

#### 1. **Avoid Large Job Payloads**

```typescript
// ❌ Bad: Large job payload
await this.queue.add('process-data', {
  massiveDataArray: [...Array(10000).keys()], // Large array in job data
  largeJsonObject: { /* massive object */ },
})

// ✅ Good: Store data externally, pass reference
const dataId = await this.dataStore.store(massiveDataArray)
await this.queue.add('process-data', {
  dataId, // Only reference
  itemCount: massiveDataArray.length,
})

@Process('process-data')
async processData(job: Job<{ dataId: string; itemCount: number }>) {
  const data = await this.dataStore.retrieve(job.data.dataId)
  // Process data...
  await this.dataStore.cleanup(job.data.dataId) // Cleanup after processing
}
```

#### 2. **Avoid Blocking Operations**

```typescript
// ❌ Bad: Synchronous blocking operation
@Process(JOB_TYPES.GENERATE_REPORT)
async generateReport(job: Job) {
  // Blocking CPU-intensive operation
  const result = this.heavyComputationSync(job.data) // Blocks event loop
  return result
}

// ✅ Good: Break down into smaller chunks
@Process(JOB_TYPES.GENERATE_REPORT)
async generateReport(job: Job<{ chunks: any[] }>) {
  const results = []

  for (const [index, chunk] of job.data.chunks.entries()) {
    // Process chunk
    const chunkResult = await this.processChunk(chunk)
    results.push(chunkResult)

    // Update progress
    const progress = Math.round(((index + 1) / job.data.chunks.length) * 100)
    await job.progress(progress)

    // Yield control occasionally
    if (index % 10 === 0) {
      await new Promise(resolve => setImmediate(resolve))
    }
  }

  return this.combineResults(results)
}
```

#### 3. **Avoid Ignoring Job States**

```typescript
// ❌ Bad: Not handling job states properly
@Process(JOB_TYPES.SEND_NOTIFICATION)
async sendNotification(job: Job<NotificationJobData>) {
  // Not checking if user is still active
  await this.notificationService.send(job.data)
}

// ✅ Good: Validate job data và state
@Process(JOB_TYPES.SEND_NOTIFICATION)
async sendNotification(job: Job<NotificationJobData>) {
  const { userId, message } = job.data

  // Check if user still exists và is active
  const user = await this.prisma.user.findUnique({
    where: { id: userId },
    select: { isActive: true, notificationPreferences: true },
  })

  if (!user) {
    await job.log(`User ${userId} not found, skipping notification`)
    return { success: true, skipped: true, reason: 'user_not_found' }
  }

  if (!user.isActive) {
    await job.log(`User ${userId} is inactive, skipping notification`)
    return { success: true, skipped: true, reason: 'user_inactive' }
  }

  if (!user.notificationPreferences?.enabled) {
    await job.log(`User ${userId} has notifications disabled`)
    return { success: true, skipped: true, reason: 'notifications_disabled' }
  }

  // Proceed with sending notification
  return await this.notificationService.send(job.data)
}
```

## 🚨 Common Pitfalls

### 1. **Memory Leaks từ Job Data**

```typescript
// ❌ Pitfall: Storing large objects in job data
class ProblematicService {
  private cache = new Map() // Growing indefinitely

  @Process('cache-data')
  async cacheData(job: Job) {
    // Never cleaning up cache
    this.cache.set(job.id, job.data) // Memory leak!
  }
}

// ✅ Solution: Proper cache management
class FixedService {
  private cache = new LRUCache({ max: 1000, ttl: 1000 * 60 * 10 }) // TTL cache

  @Process('cache-data')
  async cacheData(job: Job) {
    this.cache.set(job.id, job.data) // Automatically expires
  }

  @OnQueueCompleted()
  onCompleted(job: Job) {
    // Explicit cleanup
    this.cache.delete(job.id)
  }
}
```

### 2. **Deadlocks trong Database Transactions**

```typescript
// ❌ Pitfall: Multiple jobs updating same records
@Process('update-user-stats')
async updateUserStats(job: Job<{ userId: string }>) {
  // Multiple jobs for same user can cause deadlock
  await this.prisma.user.update({
    where: { id: job.data.userId },
    data: { lastActivity: new Date() },
  })
}

// ✅ Solution: Job deduplication và proper locking
@Process('update-user-stats')
async updateUserStats(job: Job<{ userId: string }>) {
  const lockKey = `user-update:${job.data.userId}`

  const lockAcquired = await this.acquireLock(lockKey, 10000)
  if (!lockAcquired) {
    throw new RetryableError('Could not acquire lock', 5)
  }

  try {
    await this.prisma.user.update({
      where: { id: job.data.userId },
      data: { lastActivity: new Date() },
    })
  } finally {
    await this.releaseLock(lockKey)
  }
}
```

### 3. **Infinite Job Loops**

```typescript
// ❌ Pitfall: Job creating itself indefinitely
@Process('recursive-job')
async recursiveJob(job: Job<{ count: number }>) {
  const { count } = job.data

  // Process current job
  await this.doSomeWork()

  // Creating infinite loop!
  await this.queue.add('recursive-job', { count: count + 1 })
}

// ✅ Solution: Proper termination conditions
@Process('recursive-job')
async recursiveJob(job: Job<{ count: number; maxCount: number }>) {
  const { count, maxCount } = job.data

  await this.doSomeWork()

  // Proper termination condition
  if (count < maxCount) {
    await this.queue.add('recursive-job', {
      count: count + 1,
      maxCount
    }, {
      delay: 1000, // Add delay to prevent overwhelming
    })
  }
}
```

## 📋 Tóm tắt

### Key Takeaways

1. **Queue Architecture**: BullMQ provides robust job processing với Redis backing
2. **Error Classification**: Proper error handling crucial for reliability
3. **Resource Management**: Always cleanup resources và monitor memory usage
4. **Transaction Safety**: Use proper rollback mechanisms for data consistency
5. **Performance Monitoring**: Implement health checks và alerting

### When to Use Queue/BullMQ

✅ **Sử dụng cho:**

- **Background Processing**: Email sending, file processing, report generation
- **High Traffic Handling**: Decouple expensive operations from request cycle
- **Scheduled Tasks**: Cron-like jobs, recurring operations
- **Fault Tolerance**: Retry failed operations, handle external service outages
- **Load Distribution**: Distribute work across multiple workers

❌ **Không dùng cho:**

- **Real-time Operations**: Use WebSockets or Server-Sent Events instead
- **Simple Synchronous Tasks**: Direct function calls more appropriate
- **Immediate Results Required**: Queue adds latency
- **Single-threaded Processing**: When order must be strictly maintained

### Performance Guidelines

```typescript
const PERFORMANCE_GUIDELINES = {
  jobSize: {
    small: '< 1KB', // Optimal
    medium: '1KB - 10KB', // Acceptable
    large: '> 10KB', // Avoid - use external storage
  },
  concurrency: {
    cpuBound: 'Number of CPU cores',
    ioBound: '2-4x CPU cores',
    network: '10-20x CPU cores',
  },
  retryStrategy: {
    attempts: 3,
    backoff: 'exponential',
    maxDelay: '5 minutes',
  },
  monitoring: {
    healthCheck: 'Every 30 seconds',
    alertThreshold: '> 1000 waiting jobs',
    errorRateAlert: '> 20% error rate',
  },
}
```

### Integration Checklist

✅ **Setup Checklist:**

- [ ] Redis instance configured và accessible
- [ ] Queue modules registered in app module
- [ ] Error handling service implemented
- [ ] Health monitoring setup
- [ ] Dead letter queue configured
- [ ] Admin dashboard for queue management
- [ ] Logging và alerting configured
- [ ] Resource cleanup strategies in place

> 💡 **Remember**: Effective queue management requires balancing between throughput, reliability, và resource usage. Always monitor queue health và implement proper error handling from day one.

---

**🎉 Documentation hoàn thành!** Tài liệu này cung cấp comprehensive guide cho Queue & BullMQ implementation từ basic đến advanced patterns, bao gồm error handling, rollback mechanisms, và best practices cho production environment.
