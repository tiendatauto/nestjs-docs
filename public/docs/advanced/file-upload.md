# 📤 File Upload (Local, Cloudinary, AWS S3) trong NestJS

## 🔍 File Upload là gì?

File Upload là tính năng cho phép users tải lên files (images, documents, videos) lên server hoặc cloud storage:

- **Vai trò chính**: Xử lý việc upload, validate, transform và lưu trữ files từ client
- **Cách hoạt động**: Client gửi file qua HTTP request → Server validate → Process → Store → Return metadata
- **Execution order**: Request parsing → File validation → Processing/Transform → Storage → Database record → Response
- **Lifecycle**: Upload → Validation → Transformation → Storage → Cleanup temporary files

> 💡 **Tại sao cần File Upload Strategy?**
> Proper file handling giúp tối ưu storage costs, improve performance, ensure security và provide better user experience.

## 🎯 Cách implement File Upload

### Basic Implementation với Multer

#### 1. Setup File Upload Module

```typescript
// src/app.module.ts
import { Module } from '@nestjs/common'
import { MulterModule } from '@nestjs/platform-express'
import { ConfigModule, ConfigService } from '@nestjs/config'
import { diskStorage } from 'multer'
import { v4 as uuidv4 } from 'uuid'
import { extname } from 'path'

@Module({
  imports: [
    MulterModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        storage: diskStorage({
          destination: './uploads',
          filename: (req, file, callback) => {
            const uniqueName = `${uuidv4()}${extname(file.originalname)}`
            callback(null, uniqueName)
          },
        }),
        limits: {
          fileSize: 5 * 1024 * 1024, // 5MB
        },
        fileFilter: (req, file, callback) => {
          const allowedTypes = /jpeg|jpg|png|gif|pdf|doc|docx/
          const extName = allowedTypes.test(extname(file.originalname).toLowerCase())
          const mimeType = allowedTypes.test(file.mimetype)

          if (mimeType && extName) {
            return callback(null, true)
          } else {
            callback(new Error('Invalid file type'), false)
          }
        },
      }),
      inject: [ConfigService],
    }),
  ],
})
export class AppModule {}
```

#### 2. Basic Upload Controller

```typescript
// src/upload/upload.controller.ts
import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  UploadedFiles,
  Body,
  BadRequestException,
} from '@nestjs/common'
import { FileInterceptor, FilesInterceptor, FileFieldsInterceptor } from '@nestjs/platform-express'
import { ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger'

@ApiTags('Upload')
@Controller('upload')
export class UploadController {
  constructor(private uploadService: UploadService) {}

  // Single file upload
  @Post('single')
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Single file upload',
    type: 'multipart/form-data',
    schema: {
      type: 'object',
      properties: {
        file: {
          type: 'string',
          format: 'binary',
        },
      },
    },
  })
  async uploadSingle(@UploadedFile() file: Express.Multer.File) {
    if (!file) {
      throw new BadRequestException('No file uploaded')
    }

    const result = await this.uploadService.processUpload(file)

    return {
      message: 'File uploaded successfully',
      data: result,
    }
  }

  // Multiple files upload
  @Post('multiple')
  @UseInterceptors(FilesInterceptor('files', 10)) // Max 10 files
  @ApiConsumes('multipart/form-data')
  async uploadMultiple(@UploadedFiles() files: Express.Multer.File[]) {
    if (!files || files.length === 0) {
      throw new BadRequestException('No files uploaded')
    }

    const results = await Promise.all(files.map((file) => this.uploadService.processUpload(file)))

    return {
      message: `${files.length} files uploaded successfully`,
      data: results,
    }
  }

  // Mixed fields upload (avatar + gallery)
  @Post('mixed')
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'avatar', maxCount: 1 },
      { name: 'gallery', maxCount: 5 },
    ]),
  )
  @ApiConsumes('multipart/form-data')
  async uploadMixed(
    @UploadedFiles() files: { avatar?: Express.Multer.File[]; gallery?: Express.Multer.File[] },
    @Body() body: any,
  ) {
    const results: any = {}

    if (files.avatar) {
      results.avatar = await this.uploadService.processUpload(files.avatar[0], 'avatar')
    }

    if (files.gallery) {
      results.gallery = await Promise.all(
        files.gallery.map((file) => this.uploadService.processUpload(file, 'gallery')),
      )
    }

    return {
      message: 'Files uploaded successfully',
      data: results,
      metadata: body,
    }
  }
}
```

### Advanced Implementation với Multiple Providers

#### 1. Storage Strategy Pattern

```typescript
// src/upload/interfaces/storage.interface.ts
export interface StorageProvider {
  upload(file: Express.Multer.File, options?: any): Promise<UploadResult>
  delete(url: string): Promise<boolean>
  getUrl(path: string): string
}

export interface UploadResult {
  url: string
  publicId?: string
  size: number
  format: string
  originalName: string
  provider: string
}

// src/upload/config/upload.config.ts
import { registerAs } from '@nestjs/config'

export default registerAs('upload', () => ({
  local: {
    uploadPath: process.env.UPLOAD_PATH || './uploads',
    baseUrl: process.env.BASE_URL || 'http://localhost:3000',
  },
  cloudinary: {
    cloudName: process.env.CLOUDINARY_CLOUD_NAME,
    apiKey: process.env.CLOUDINARY_API_KEY,
    apiSecret: process.env.CLOUDINARY_API_SECRET,
  },
  aws: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
    region: process.env.AWS_REGION || 'us-east-1',
    bucket: process.env.AWS_S3_BUCKET,
  },
  defaultProvider: process.env.UPLOAD_PROVIDER || 'local', // local, cloudinary, s3
  maxFileSize: parseInt(process.env.MAX_FILE_SIZE) || 5 * 1024 * 1024, // 5MB
  allowedTypes: ['image/jpeg', 'image/png', 'image/gif', 'application/pdf'],
}))
```

#### 2. Local Storage Provider

```typescript
// src/upload/providers/local-storage.provider.ts
import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { StorageProvider, UploadResult } from '../interfaces/storage.interface'
import { promises as fs } from 'fs'
import { join, extname } from 'path'
import { v4 as uuidv4 } from 'uuid'

@Injectable()
export class LocalStorageProvider implements StorageProvider {
  private uploadPath: string
  private baseUrl: string

  constructor(private configService: ConfigService) {
    this.uploadPath = this.configService.get('upload.local.uploadPath')
    this.baseUrl = this.configService.get('upload.local.baseUrl')
    this.ensureUploadDirectory()
  }

  async upload(file: Express.Multer.File, options?: any): Promise<UploadResult> {
    const fileName = `${uuidv4()}${extname(file.originalname)}`
    const filePath = join(this.uploadPath, fileName)

    // Save file to local storage
    await fs.writeFile(filePath, file.buffer)

    return {
      url: `${this.baseUrl}/uploads/${fileName}`,
      size: file.size,
      format: extname(file.originalname).slice(1),
      originalName: file.originalname,
      provider: 'local',
    }
  }

  async delete(url: string): Promise<boolean> {
    try {
      const fileName = url.split('/').pop()
      const filePath = join(this.uploadPath, fileName)
      await fs.unlink(filePath)
      return true
    } catch (error) {
      console.error('Error deleting file:', error)
      return false
    }
  }

  getUrl(path: string): string {
    return `${this.baseUrl}/uploads/${path}`
  }

  private async ensureUploadDirectory(): Promise<void> {
    try {
      await fs.access(this.uploadPath)
    } catch {
      await fs.mkdir(this.uploadPath, { recursive: true })
    }
  }
}
```

#### 3. Cloudinary Provider

```typescript
// src/upload/providers/cloudinary.provider.ts
import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { StorageProvider, UploadResult } from '../interfaces/storage.interface'
import { v2 as cloudinary } from 'cloudinary'

@Injectable()
export class CloudinaryProvider implements StorageProvider {
  constructor(private configService: ConfigService) {
    cloudinary.config({
      cloud_name: this.configService.get('upload.cloudinary.cloudName'),
      api_key: this.configService.get('upload.cloudinary.apiKey'),
      api_secret: this.configService.get('upload.cloudinary.apiSecret'),
    })
  }

  async upload(file: Express.Multer.File, options?: any): Promise<UploadResult> {
    return new Promise((resolve, reject) => {
      const uploadOptions = {
        resource_type: 'auto',
        folder: options?.folder || 'uploads',
        transformation: options?.transformation || [{ quality: 'auto' }, { fetch_format: 'auto' }],
        ...options,
      }

      cloudinary.uploader
        .upload_stream(uploadOptions, (error, result) => {
          if (error) {
            reject(error)
          } else {
            resolve({
              url: result.secure_url,
              publicId: result.public_id,
              size: result.bytes,
              format: result.format,
              originalName: file.originalname,
              provider: 'cloudinary',
            })
          }
        })
        .end(file.buffer)
    })
  }

  async delete(publicId: string): Promise<boolean> {
    try {
      const result = await cloudinary.uploader.destroy(publicId)
      return result.result === 'ok'
    } catch (error) {
      console.error('Error deleting from Cloudinary:', error)
      return false
    }
  }

  getUrl(publicId: string, transformation?: any): string {
    return cloudinary.url(publicId, {
      ...transformation,
      secure: true,
    })
  }

  // Advanced Cloudinary features
  async generateThumbnails(publicId: string): Promise<string[]> {
    const sizes = [
      { width: 150, height: 150, crop: 'thumb' },
      { width: 300, height: 300, crop: 'fill' },
      { width: 800, height: 600, crop: 'fit' },
    ]

    return sizes.map((size) => cloudinary.url(publicId, { ...size, secure: true }))
  }

  async optimizeImage(publicId: string, options: any = {}): Promise<string> {
    return cloudinary.url(publicId, {
      quality: 'auto',
      fetch_format: 'auto',
      ...options,
      secure: true,
    })
  }
}
```

#### 4. AWS S3 Provider

```typescript
// src/upload/providers/s3.provider.ts
import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { StorageProvider, UploadResult } from '../interfaces/storage.interface'
import { S3Client, PutObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3'
import { v4 as uuidv4 } from 'uuid'
import { extname } from 'path'

@Injectable()
export class S3Provider implements StorageProvider {
  private s3Client: S3Client
  private bucketName: string

  constructor(private configService: ConfigService) {
    this.s3Client = new S3Client({
      region: this.configService.get('upload.aws.region'),
      credentials: {
        accessKeyId: this.configService.get('upload.aws.accessKeyId'),
        secretAccessKey: this.configService.get('upload.aws.secretAccessKey'),
      },
    })
    this.bucketName = this.configService.get('upload.aws.bucket')
  }

  async upload(file: Express.Multer.File, options?: any): Promise<UploadResult> {
    const key = `${options?.folder || 'uploads'}/${uuidv4()}${extname(file.originalname)}`

    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
      Body: file.buffer,
      ContentType: file.mimetype,
      Metadata: {
        originalName: file.originalname,
        uploadedAt: new Date().toISOString(),
      },
      ...options?.s3Options,
    })

    try {
      await this.s3Client.send(command)

      return {
        url: `https://${this.bucketName}.s3.amazonaws.com/${key}`,
        publicId: key,
        size: file.size,
        format: extname(file.originalname).slice(1),
        originalName: file.originalname,
        provider: 's3',
      }
    } catch (error) {
      throw new Error(`S3 upload failed: ${error.message}`)
    }
  }

  async delete(key: string): Promise<boolean> {
    try {
      const command = new DeleteObjectCommand({
        Bucket: this.bucketName,
        Key: key,
      })

      await this.s3Client.send(command)
      return true
    } catch (error) {
      console.error('Error deleting from S3:', error)
      return false
    }
  }

  getUrl(key: string): string {
    return `https://${this.bucketName}.s3.amazonaws.com/${key}`
  }

  // Generate presigned URLs for direct upload
  async generatePresignedUrl(key: string, expiresIn: number = 3600): Promise<string> {
    const { getSignedUrl } = await import('@aws-sdk/s3-request-presigner')

    const command = new PutObjectCommand({
      Bucket: this.bucketName,
      Key: key,
    })

    return getSignedUrl(this.s3Client, command, { expiresIn })
  }
}
```

## 💡 Các cách sử dụng thông dụng

### 1. Dynamic Upload Service

```typescript
// src/upload/upload.service.ts
import { Injectable, BadRequestException } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { StorageProvider } from './interfaces/storage.interface'
import { LocalStorageProvider } from './providers/local-storage.provider'
import { CloudinaryProvider } from './providers/cloudinary.provider'
import { S3Provider } from './providers/s3.provider'
import { PrismaService } from '../shared/services/prisma.service'

@Injectable()
export class UploadService {
  private providers: Map<string, StorageProvider> = new Map()

  constructor(
    private configService: ConfigService,
    private prisma: PrismaService,
    private localProvider: LocalStorageProvider,
    private cloudinaryProvider: CloudinaryProvider,
    private s3Provider: S3Provider,
  ) {
    this.providers.set('local', this.localProvider)
    this.providers.set('cloudinary', this.cloudinaryProvider)
    this.providers.set('s3', this.s3Provider)
  }

  async processUpload(file: Express.Multer.File, type: string = 'general', provider?: string) {
    // Validate file
    this.validateFile(file)

    // Get provider
    const storageProvider = this.getProvider(provider)

    // Process based on file type
    const processedFile = await this.preprocessFile(file, type)

    // Upload to storage
    const uploadResult = await storageProvider.upload(processedFile, {
      folder: this.getFolderByType(type),
      transformation: this.getTransformationByType(type),
    })

    // Save to database
    const fileRecord = await this.saveFileRecord(uploadResult, type)

    return {
      ...uploadResult,
      id: fileRecord.id,
      type,
    }
  }

  private validateFile(file: Express.Multer.File): void {
    const maxSize = this.configService.get('upload.maxFileSize')
    const allowedTypes = this.configService.get('upload.allowedTypes')

    if (file.size > maxSize) {
      throw new BadRequestException(`File size exceeds ${maxSize / 1024 / 1024}MB limit`)
    }

    if (!allowedTypes.includes(file.mimetype)) {
      throw new BadRequestException(`File type ${file.mimetype} not allowed`)
    }
  }

  private getProvider(provider?: string): StorageProvider {
    const providerName = provider || this.configService.get('upload.defaultProvider')
    const storageProvider = this.providers.get(providerName)

    if (!storageProvider) {
      throw new BadRequestException(`Storage provider ${providerName} not found`)
    }

    return storageProvider
  }

  private async preprocessFile(file: Express.Multer.File, type: string): Promise<Express.Multer.File> {
    // Image processing for different types
    if (file.mimetype.startsWith('image/')) {
      return this.processImage(file, type)
    }

    return file
  }

  private async processImage(file: Express.Multer.File, type: string): Promise<Express.Multer.File> {
    const sharp = require('sharp')

    let processed = sharp(file.buffer)

    switch (type) {
      case 'avatar':
        processed = processed.resize(300, 300, {
          fit: 'cover',
          position: 'center',
        })
        break
      case 'gallery':
        processed = processed.resize(1200, 800, {
          fit: 'inside',
          withoutEnlargement: true,
        })
        break
      case 'thumbnail':
        processed = processed.resize(150, 150, { fit: 'cover' })
        break
    }

    const processedBuffer = await processed.jpeg({ quality: 85 }).toBuffer()

    return {
      ...file,
      buffer: processedBuffer,
      size: processedBuffer.length,
    }
  }

  private getFolderByType(type: string): string {
    const folders = {
      avatar: 'avatars',
      gallery: 'gallery',
      documents: 'documents',
      general: 'uploads',
    }

    return folders[type] || folders.general
  }

  private getTransformationByType(type: string): any {
    const transformations = {
      avatar: [{ width: 300, height: 300, crop: 'fill' }, { quality: 'auto' }],
      gallery: [{ width: 1200, height: 800, crop: 'fit' }, { quality: 'auto' }],
      thumbnail: [{ width: 150, height: 150, crop: 'thumb' }, { quality: 'auto' }],
    }

    return transformations[type]
  }

  private async saveFileRecord(uploadResult: any, type: string) {
    return this.prisma.file.create({
      data: {
        originalName: uploadResult.originalName,
        url: uploadResult.url,
        publicId: uploadResult.publicId,
        size: uploadResult.size,
        format: uploadResult.format,
        provider: uploadResult.provider,
        type,
        createdAt: new Date(),
      },
    })
  }

  // Bulk upload processing
  async processBulkUpload(files: Express.Multer.File[], type: string = 'general') {
    const uploadPromises = files.map((file) =>
      this.processUpload(file, type).catch((error) => ({
        error: error.message,
        file: file.originalname,
      })),
    )

    const results = await Promise.all(uploadPromises)

    const successful = results.filter((result) => !result.error)
    const failed = results.filter((result) => result.error)

    return {
      successful,
      failed,
      total: files.length,
      successCount: successful.length,
      failureCount: failed.length,
    }
  }

  // Delete file
  async deleteFile(fileId: string): Promise<boolean> {
    const fileRecord = await this.prisma.file.findUnique({
      where: { id: fileId },
    })

    if (!fileRecord) {
      throw new BadRequestException('File not found')
    }

    const provider = this.getProvider(fileRecord.provider)
    const deleted = await provider.delete(fileRecord.publicId || fileRecord.url)

    if (deleted) {
      await this.prisma.file.delete({
        where: { id: fileId },
      })
    }

    return deleted
  }
}
```

### 2. Profile Picture Upload với Variants

```typescript
// src/users/dto/upload-avatar.dto.ts
import { ApiProperty } from '@nestjs/swagger'

export class UploadAvatarDto {
  @ApiProperty({ type: 'string', format: 'binary' })
  avatar: any
}

// src/users/users.controller.ts
import { Controller, Post, UseInterceptors, UploadedFile, Param } from '@nestjs/common'
import { FileInterceptor } from '@nestjs/platform-express'

@Controller('users')
export class UsersController {
  constructor(
    private usersService: UsersService,
    private uploadService: UploadService,
  ) {}

  @Post(':id/avatar')
  @UseInterceptors(FileInterceptor('avatar'))
  async uploadAvatar(@Param('id') userId: string, @UploadedFile() file: Express.Multer.File) {
    // Upload original avatar
    const avatarResult = await this.uploadService.processUpload(file, 'avatar')

    // Generate thumbnails if using Cloudinary
    let thumbnails = []
    if (avatarResult.provider === 'cloudinary') {
      thumbnails = await this.uploadService.cloudinaryProvider.generateThumbnails(avatarResult.publicId)
    }

    // Update user profile
    const updatedUser = await this.usersService.updateAvatar(userId, {
      avatarUrl: avatarResult.url,
      avatarPublicId: avatarResult.publicId,
      thumbnails,
    })

    return {
      message: 'Avatar uploaded successfully',
      data: {
        user: updatedUser,
        upload: avatarResult,
        thumbnails,
      },
    }
  }
}
```

**Input/Output Example:**

```bash
# Upload Avatar Request
POST /users/123/avatar
Content-Type: multipart/form-data
→ File: avatar.jpg (2MB)

# Response
{
  "message": "Avatar uploaded successfully",
  "data": {
    "user": {
      "id": "123",
      "name": "John Doe",
      "avatarUrl": "https://res.cloudinary.com/demo/image/upload/v1234567/avatars/abc123.jpg"
    },
    "upload": {
      "url": "https://res.cloudinary.com/demo/image/upload/v1234567/avatars/abc123.jpg",
      "publicId": "avatars/abc123",
      "size": 2048000,
      "format": "jpg",
      "provider": "cloudinary"
    },
    "thumbnails": [
      "https://res.cloudinary.com/demo/image/upload/w_150,h_150,c_thumb/avatars/abc123.jpg",
      "https://res.cloudinary.com/demo/image/upload/w_300,h_300,c_fill/avatars/abc123.jpg"
    ]
  }
}
```

### 3. Document Upload với Virus Scanning

```typescript
// src/upload/services/security.service.ts
import { Injectable } from '@nestjs/common'
import { createHash } from 'crypto'

@Injectable()
export class SecurityService {
  // File hash for duplicate detection
  generateFileHash(buffer: Buffer): string {
    return createHash('sha256').update(buffer).digest('hex')
  }

  // Basic malware detection (simple patterns)
  async scanFile(file: Express.Multer.File): Promise<boolean> {
    // Check file signatures (magic numbers)
    const dangerousSignatures = [
      Buffer.from([0x4d, 0x5a]), // PE executable
      Buffer.from([0x50, 0x4b]), // ZIP (could contain malware)
    ]

    const fileHeader = file.buffer.slice(0, 10)

    for (const signature of dangerousSignatures) {
      if (fileHeader.includes(signature)) {
        return false // Suspicious file
      }
    }

    // Check for embedded scripts in images
    if (file.mimetype.startsWith('image/')) {
      const content = file.buffer.toString('ascii', 0, Math.min(1000, file.buffer.length))
      const scriptPatterns = [/<script/i, /javascript:/i, /vbscript:/i, /onload=/i]

      if (scriptPatterns.some((pattern) => pattern.test(content))) {
        return false
      }
    }

    return true // File appears safe
  }

  // Integrate with external antivirus service
  async scanWithClamAV(file: Express.Multer.File): Promise<boolean> {
    // This would integrate with ClamAV or similar service
    // For demo purposes, return true
    return true
  }
}

// Enhanced upload service with security
@Injectable()
export class SecureUploadService extends UploadService {
  constructor(
    configService: ConfigService,
    prisma: PrismaService,
    localProvider: LocalStorageProvider,
    cloudinaryProvider: CloudinaryProvider,
    s3Provider: S3Provider,
    private securityService: SecurityService,
  ) {
    super(configService, prisma, localProvider, cloudinaryProvider, s3Provider)
  }

  async processSecureUpload(file: Express.Multer.File, type: string = 'document') {
    // Security scanning
    const isSafe = await this.securityService.scanFile(file)
    if (!isSafe) {
      throw new BadRequestException('File failed security scan')
    }

    // Generate file hash for duplicate detection
    const fileHash = this.securityService.generateFileHash(file.buffer)

    // Check if file already exists
    const existingFile = await this.prisma.file.findFirst({
      where: { hash: fileHash },
    })

    if (existingFile) {
      return {
        ...existingFile,
        message: 'File already exists',
        isDuplicate: true,
      }
    }

    // Process upload normally
    const result = await this.processUpload(file, type)

    // Update record with hash
    await this.prisma.file.update({
      where: { id: result.id },
      data: { hash: fileHash },
    })

    return {
      ...result,
      isDuplicate: false,
    }
  }
}
```

### 4. Progress Tracking cho Large Files

```typescript
// src/upload/upload-progress.service.ts
import { Injectable } from '@nestjs/common'
import { EventEmitter2 } from '@nestjs/event-emitter'

@Injectable()
export class UploadProgressService {
  private uploads = new Map<string, UploadProgress>()

  constructor(private eventEmitter: EventEmitter2) {}

  startUpload(uploadId: string, totalSize: number): void {
    this.uploads.set(uploadId, {
      uploadId,
      totalSize,
      uploadedSize: 0,
      progress: 0,
      status: 'uploading',
      startTime: Date.now(),
    })

    this.emitProgress(uploadId)
  }

  updateProgress(uploadId: string, uploadedSize: number): void {
    const upload = this.uploads.get(uploadId)
    if (!upload) return

    upload.uploadedSize = uploadedSize
    upload.progress = Math.round((uploadedSize / upload.totalSize) * 100)

    this.emitProgress(uploadId)
  }

  completeUpload(uploadId: string, result: any): void {
    const upload = this.uploads.get(uploadId)
    if (!upload) return

    upload.status = 'completed'
    upload.progress = 100
    upload.result = result
    upload.endTime = Date.now()

    this.emitProgress(uploadId)

    // Cleanup after 5 minutes
    setTimeout(
      () => {
        this.uploads.delete(uploadId)
      },
      5 * 60 * 1000,
    )
  }

  failUpload(uploadId: string, error: string): void {
    const upload = this.uploads.get(uploadId)
    if (!upload) return

    upload.status = 'failed'
    upload.error = error
    upload.endTime = Date.now()

    this.emitProgress(uploadId)
  }

  getProgress(uploadId: string): UploadProgress | undefined {
    return this.uploads.get(uploadId)
  }

  private emitProgress(uploadId: string): void {
    const upload = this.uploads.get(uploadId)
    if (upload) {
      this.eventEmitter.emit('upload.progress', upload)
    }
  }
}

interface UploadProgress {
  uploadId: string
  totalSize: number
  uploadedSize: number
  progress: number
  status: 'uploading' | 'completed' | 'failed'
  startTime: number
  endTime?: number
  result?: any
  error?: string
}

// WebSocket Gateway for real-time progress
@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class UploadGateway {
  @WebSocketServer()
  server: Server

  constructor(private uploadProgressService: UploadProgressService) {}

  @OnEvent('upload.progress')
  handleUploadProgress(progress: UploadProgress) {
    this.server.to(`upload:${progress.uploadId}`).emit('uploadProgress', progress)
  }

  @SubscribeMessage('joinUpload')
  handleJoinUpload(client: Socket, uploadId: string) {
    client.join(`upload:${uploadId}`)

    // Send current progress if exists
    const progress = this.uploadProgressService.getProgress(uploadId)
    if (progress) {
      client.emit('uploadProgress', progress)
    }
  }
}
```

## ⚠️ Các vấn đề thường gặp

### 1. Memory Issues với Large Files

**Problem:** Large files consume too much memory during processing

```typescript
// ❌ Problematic: Loading entire file into memory
async processLargeFile(file: Express.Multer.File) {
  const processedBuffer = await sharp(file.buffer)
    .resize(1920, 1080)
    .toBuffer(); // Memory intensive for large files

  return processedBuffer;
}

// ✅ Solution: Stream processing
import { createReadStream, createWriteStream } from 'fs';
import { pipeline } from 'stream/promises';

async processLargeFileStream(filePath: string, outputPath: string) {
  const readStream = createReadStream(filePath);
  const writeStream = createWriteStream(outputPath);
  const transform = sharp().resize(1920, 1080);

  await pipeline(readStream, transform, writeStream);

  // Clean up temp file
  await fs.unlink(filePath);
}
```

### 2. File Upload Race Conditions

**Problem:** Concurrent uploads với same filename conflict

```typescript
// ❌ Problematic: Simple filename generation
const fileName = `${Date.now()}-${file.originalname}`;

// ✅ Solution: Atomic filename generation with collision handling
import { v4 as uuidv4 } from 'uuid';

async generateUniqueFileName(originalName: string): Promise<string> {
  const ext = extname(originalName);
  const baseName = `${uuidv4()}${ext}`;

  // Check if file exists (for local storage)
  let fileName = baseName;
  let counter = 1;

  while (await this.fileExists(fileName)) {
    const nameWithoutExt = baseName.replace(ext, '');
    fileName = `${nameWithoutExt}-${counter}${ext}`;
    counter++;
  }

  return fileName;
}

private async fileExists(fileName: string): Promise<boolean> {
  try {
    await fs.access(join(this.uploadPath, fileName));
    return true;
  } catch {
    return false;
  }
}
```

### 3. Incomplete Upload Cleanup

**Problem:** Temporary files not cleaned up sau failed uploads

```typescript
// ❌ Problematic: No cleanup on failure
async uploadFile(file: Express.Multer.File) {
  const tempPath = await this.saveTempFile(file);
  const result = await this.processAndUpload(tempPath); // Might fail
  return result; // Temp file still exists if processing fails
}

// ✅ Solution: Proper cleanup with try-finally
async uploadFileWithCleanup(file: Express.Multer.File) {
  let tempPath: string | null = null;

  try {
    tempPath = await this.saveTempFile(file);
    const result = await this.processAndUpload(tempPath);
    return result;
  } catch (error) {
    console.error('Upload failed:', error);
    throw error;
  } finally {
    // Always cleanup temp file
    if (tempPath) {
      try {
        await fs.unlink(tempPath);
      } catch (cleanupError) {
        console.error('Cleanup failed:', cleanupError);
      }
    }
  }
}

// Scheduled cleanup for orphaned files
@Cron('0 2 * * *') // Daily at 2 AM
async cleanupOrphanedFiles() {
  const tempDir = './temp';
  const maxAge = 24 * 60 * 60 * 1000; // 24 hours

  try {
    const files = await fs.readdir(tempDir);

    for (const file of files) {
      const filePath = join(tempDir, file);
      const stats = await fs.stat(filePath);

      if (Date.now() - stats.mtime.getTime() > maxAge) {
        await fs.unlink(filePath);
        console.log(`Cleaned up orphaned file: ${file}`);
      }
    }
  } catch (error) {
    console.error('Cleanup failed:', error);
  }
}
```

## 🔧 Advanced Patterns

### 1. Multi-Step Upload với Resume Capability

```typescript
// src/upload/chunked-upload.service.ts
@Injectable()
export class ChunkedUploadService {
  private uploadSessions = new Map<string, UploadSession>()

  async initializeUpload(fileName: string, totalSize: number, chunkSize: number = 1024 * 1024) {
    const sessionId = uuidv4()
    const totalChunks = Math.ceil(totalSize / chunkSize)

    const session: UploadSession = {
      sessionId,
      fileName,
      totalSize,
      chunkSize,
      totalChunks,
      uploadedChunks: new Set(),
      chunks: new Map(),
      createdAt: Date.now(),
    }

    this.uploadSessions.set(sessionId, session)

    return {
      sessionId,
      totalChunks,
      chunkSize,
    }
  }

  async uploadChunk(sessionId: string, chunkIndex: number, chunkData: Buffer) {
    const session = this.uploadSessions.get(sessionId)
    if (!session) {
      throw new BadRequestException('Upload session not found')
    }

    // Validate chunk
    if (chunkIndex >= session.totalChunks) {
      throw new BadRequestException('Invalid chunk index')
    }

    // Store chunk
    session.chunks.set(chunkIndex, chunkData)
    session.uploadedChunks.add(chunkIndex)

    const progress = (session.uploadedChunks.size / session.totalChunks) * 100

    // Check if upload is complete
    if (session.uploadedChunks.size === session.totalChunks) {
      return this.finalizeUpload(sessionId)
    }

    return {
      sessionId,
      progress,
      uploadedChunks: session.uploadedChunks.size,
      totalChunks: session.totalChunks,
    }
  }

  private async finalizeUpload(sessionId: string) {
    const session = this.uploadSessions.get(sessionId)
    if (!session) {
      throw new BadRequestException('Upload session not found')
    }

    // Reconstruct file from chunks
    const chunks: Buffer[] = []
    for (let i = 0; i < session.totalChunks; i++) {
      const chunk = session.chunks.get(i)
      if (!chunk) {
        throw new BadRequestException(`Missing chunk ${i}`)
      }
      chunks.push(chunk)
    }

    const completeFile = Buffer.concat(chunks)

    // Create multer-like file object
    const file: Express.Multer.File = {
      fieldname: 'file',
      originalname: session.fileName,
      encoding: '7bit',
      mimetype: 'application/octet-stream', // Will be detected
      size: completeFile.length,
      buffer: completeFile,
      destination: '',
      filename: '',
      path: '',
      stream: null,
    }

    // Upload using standard service
    const result = await this.uploadService.processUpload(file)

    // Cleanup session
    this.uploadSessions.delete(sessionId)

    return {
      ...result,
      message: 'Upload completed successfully',
    }
  }

  async getUploadStatus(sessionId: string) {
    const session = this.uploadSessions.get(sessionId)
    if (!session) {
      throw new BadRequestException('Upload session not found')
    }

    const progress = (session.uploadedChunks.size / session.totalChunks) * 100

    return {
      sessionId,
      progress,
      uploadedChunks: Array.from(session.uploadedChunks),
      totalChunks: session.totalChunks,
      fileName: session.fileName,
    }
  }
}

interface UploadSession {
  sessionId: string
  fileName: string
  totalSize: number
  chunkSize: number
  totalChunks: number
  uploadedChunks: Set<number>
  chunks: Map<number, Buffer>
  createdAt: number
}
```

### 2. Automatic Image Optimization Pipeline

```typescript
// src/upload/image-pipeline.service.ts
@Injectable()
export class ImagePipelineService {
  constructor(
    private configService: ConfigService,
    private queueService: QueueService,
  ) {}

  async processImagePipeline(file: Express.Multer.File, options: ImageProcessingOptions) {
    const jobId = uuidv4()

    // Add to processing queue
    await this.queueService.add('image-processing', {
      jobId,
      file: file.buffer.toString('base64'),
      originalName: file.originalname,
      options,
    })

    return { jobId, status: 'queued' }
  }

  @Process('image-processing')
  async handleImageProcessing(job: Job) {
    const { jobId, file, originalName, options } = job.data

    try {
      const fileBuffer = Buffer.from(file, 'base64')
      const multerFile: Express.Multer.File = {
        buffer: fileBuffer,
        originalname: originalName,
        mimetype: 'image/jpeg', // Will be detected
        size: fileBuffer.length,
        fieldname: 'file',
        encoding: '7bit',
        destination: '',
        filename: '',
        path: '',
        stream: null,
      }

      // Generate multiple variants
      const variants = await this.generateImageVariants(multerFile, options)

      // Upload all variants
      const uploadPromises = variants.map((variant) => this.uploadService.processUpload(variant.file, variant.type))

      const results = await Promise.all(uploadPromises)

      // Save processing results
      await this.saveProcessingResults(jobId, results)

      return results
    } catch (error) {
      console.error(`Image processing failed for job ${jobId}:`, error)
      throw error
    }
  }

  private async generateImageVariants(file: Express.Multer.File, options: ImageProcessingOptions) {
    const sharp = require('sharp')
    const variants: ImageVariant[] = []

    // Original optimized
    const optimized = await sharp(file.buffer).jpeg({ quality: 85, progressive: true }).toBuffer()

    variants.push({
      type: 'original',
      file: { ...file, buffer: optimized, size: optimized.length },
    })

    // Generate thumbnails
    for (const size of options.thumbnailSizes || []) {
      const thumbnail = await sharp(file.buffer)
        .resize(size.width, size.height, {
          fit: size.fit || 'cover',
          position: 'center',
        })
        .jpeg({ quality: 80 })
        .toBuffer()

      variants.push({
        type: `thumbnail_${size.width}x${size.height}`,
        file: {
          ...file,
          buffer: thumbnail,
          size: thumbnail.length,
          originalname: `thumb_${size.width}x${size.height}_${file.originalname}`,
        },
      })
    }

    // Generate WebP versions for modern browsers
    if (options.generateWebP) {
      const webp = await sharp(file.buffer).webp({ quality: 85 }).toBuffer()

      variants.push({
        type: 'webp',
        file: {
          ...file,
          buffer: webp,
          size: webp.length,
          originalname: file.originalname.replace(/\.[^/.]+$/, '.webp'),
          mimetype: 'image/webp',
        },
      })
    }

    return variants
  }
}

interface ImageProcessingOptions {
  thumbnailSizes?: Array<{
    width: number
    height: number
    fit?: 'cover' | 'contain' | 'fill' | 'inside' | 'outside'
  }>
  generateWebP?: boolean
  quality?: number
}

interface ImageVariant {
  type: string
  file: Express.Multer.File
}
```

### 3. CDN Integration với Cache Invalidation

```typescript
// src/upload/cdn.service.ts
@Injectable()
export class CDNService {
  constructor(
    private configService: ConfigService,
    private httpService: HttpService,
  ) {}

  async invalidateCache(urls: string[]): Promise<void> {
    const cdnProvider = this.configService.get('cdn.provider')

    switch (cdnProvider) {
      case 'cloudflare':
        await this.invalidateCloudflare(urls)
        break
      case 'aws-cloudfront':
        await this.invalidateCloudFront(urls)
        break
      default:
        console.warn('CDN invalidation not configured')
    }
  }

  private async invalidateCloudflare(urls: string[]): Promise<void> {
    const zoneId = this.configService.get('cdn.cloudflare.zoneId')
    const apiToken = this.configService.get('cdn.cloudflare.apiToken')

    try {
      await this.httpService
        .post(
          `https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`,
          { files: urls },
          {
            headers: {
              Authorization: `Bearer ${apiToken}`,
              'Content-Type': 'application/json',
            },
          },
        )
        .toPromise()

      console.log(`Invalidated ${urls.length} URLs in Cloudflare`)
    } catch (error) {
      console.error('Cloudflare cache invalidation failed:', error)
    }
  }

  async optimizeDelivery(fileUrl: string, options: CDNOptions = {}): Promise<string> {
    const { width, height, quality, format } = options

    // For Cloudflare Images or similar services
    if (this.configService.get('cdn.imageOptimization')) {
      const params = new URLSearchParams()

      if (width) params.append('width', width.toString())
      if (height) params.append('height', height.toString())
      if (quality) params.append('quality', quality.toString())
      if (format) params.append('format', format)

      return `${fileUrl}?${params.toString()}`
    }

    return fileUrl
  }
}

interface CDNOptions {
  width?: number
  height?: number
  quality?: number
  format?: 'auto' | 'webp' | 'jpeg' | 'png'
}
```

## 📝 Best Practices

### DO's ✅

1. **Always validate file types và sizes**

```typescript
// Good - Comprehensive validation
const validateFile = (file: Express.Multer.File) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'application/pdf']
  const maxSize = 5 * 1024 * 1024 // 5MB

  if (!allowedTypes.includes(file.mimetype)) {
    throw new BadRequestException('Invalid file type')
  }

  if (file.size > maxSize) {
    throw new BadRequestException('File too large')
  }

  // Check file signature (magic numbers)
  const signature = file.buffer.slice(0, 4)
  if (!this.validateFileSignature(signature, file.mimetype)) {
    throw new BadRequestException('File signature mismatch')
  }
}
```

2. **Use proper error handling và cleanup**

```typescript
// Good - Proper resource management
async uploadWithCleanup(file: Express.Multer.File) {
  const tempFile = await this.createTempFile(file);

  try {
    const result = await this.processUpload(tempFile);
    return result;
  } catch (error) {
    console.error('Upload failed:', error);
    throw error;
  } finally {
    await this.cleanupTempFile(tempFile);
  }
}
```

3. **Implement file deduplication**

```typescript
// Good - Check for duplicates
async uploadWithDeduplication(file: Express.Multer.File) {
  const fileHash = this.generateFileHash(file.buffer);

  const existing = await this.findByHash(fileHash);
  if (existing) {
    return {
      ...existing,
      isDuplicate: true,
      message: 'File already exists'
    };
  }

  return this.processUpload(file);
}
```

4. **Use streaming cho large files**

```typescript
// Good - Stream processing
async processLargeFile(filePath: string) {
  const readStream = createReadStream(filePath);
  const uploadStream = this.storageProvider.createUploadStream();

  await pipeline(readStream, uploadStream);
}
```

### DON'T's ❌

1. **Đừng store files without virus scanning**

```typescript
// Bad - No security scanning
async uploadFile(file: Express.Multer.File) {
  return this.storageProvider.upload(file); // Potentially dangerous
}

// Good - Always scan files
async uploadFile(file: Express.Multer.File) {
  const isSafe = await this.securityService.scanFile(file);
  if (!isSafe) {
    throw new BadRequestException('File failed security scan');
  }

  return this.storageProvider.upload(file);
}
```

2. **Đừng expose original filenames**

```typescript
// Bad - Predictable filenames
const fileName = file.originalname

// Good - Generate secure filenames
const fileName = `${uuidv4()}${extname(file.originalname)}`
```

3. **Đừng ignore storage quotas**

```typescript
// Bad - No quota checking
async uploadFile(file: Express.Multer.File) {
  return this.storageProvider.upload(file);
}

// Good - Check quotas
async uploadFile(file: Express.Multer.File, userId: string) {
  const userQuota = await this.getUserQuota(userId);
  if (userQuota.used + file.size > userQuota.limit) {
    throw new BadRequestException('Storage quota exceeded');
  }

  const result = await this.storageProvider.upload(file);
  await this.updateQuotaUsage(userId, file.size);

  return result;
}
```

## 🚨 Common Pitfalls

### 1. Path Traversal Attacks

```typescript
// ❌ Pitfall: Using user input in file paths
const fileName = req.body.fileName // Could be "../../../etc/passwd"
const filePath = join('./uploads', fileName)

// ✅ Solution: Sanitize filenames
import { basename } from 'path'

const sanitizeFileName = (fileName: string): string => {
  // Remove path separators và dangerous characters
  return basename(fileName).replace(/[^a-zA-Z0-9.-]/g, '_')
}

const safeFileName = `${uuidv4()}-${sanitizeFileName(file.originalname)}`
```

### 2. File Type Spoofing

```typescript
// ❌ Pitfall: Trusting file extensions
const isImage = file.originalname.endsWith('.jpg') // Can be spoofed

// ✅ Solution: Check actual file content
const validateFileType = (file: Express.Multer.File): boolean => {
  const fileSignatures = {
    'image/jpeg': [[0xff, 0xd8, 0xff]],
    'image/png': [[0x89, 0x50, 0x4e, 0x47]],
    'application/pdf': [[0x25, 0x50, 0x44, 0x46]],
  }

  const signature = Array.from(file.buffer.slice(0, 4))
  const expectedSignatures = fileSignatures[file.mimetype]

  return expectedSignatures?.some((expected) => expected.every((byte, index) => signature[index] === byte)) || false
}
```

### 3. Resource Exhaustion

```typescript
// ❌ Pitfall: No limits on concurrent uploads
app.post('/upload', uploadMiddleware, handler) // Unlimited concurrent uploads

// ✅ Solution: Rate limiting và resource management
import rateLimit from 'express-rate-limit'

const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // Max 10 uploads per window
  message: 'Too many upload attempts',
  standardHeaders: true,
  legacyHeaders: false,
})

// Apply to upload routes
app.use('/upload', uploadLimiter)

// Memory usage monitoring
@Injectable()
export class ResourceMonitorService {
  @Cron('*/30 * * * * *') // Every 30 seconds
  checkMemoryUsage() {
    const usage = process.memoryUsage()
    const usageInMB = usage.heapUsed / 1024 / 1024

    if (usageInMB > 500) {
      // 500MB threshold
      console.warn('High memory usage detected:', usageInMB, 'MB')
      // Implement cleanup or throttling
    }
  }
}
```

## 🔗 Integration với Other Components

### 1. Integration với User Management

```typescript
// src/users/users.service.ts
@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private uploadService: UploadService,
  ) {}

  async updateUserAvatar(userId: string, file: Express.Multer.File) {
    const user = await this.findById(userId)

    // Delete old avatar if exists
    if (user.avatarPublicId) {
      await this.uploadService.deleteFile(user.avatarPublicId)
    }

    // Upload new avatar
    const uploadResult = await this.uploadService.processUpload(file, 'avatar')

    // Update user record
    return this.prisma.user.update({
      where: { id: userId },
      data: {
        avatarUrl: uploadResult.url,
        avatarPublicId: uploadResult.publicId,
      },
    })
  }

  async getUserFiles(userId: string, type?: string) {
    return this.prisma.file.findMany({
      where: {
        uploadedBy: userId,
        ...(type && { type }),
      },
      orderBy: { createdAt: 'desc' },
    })
  }
}
```

### 2. Integration với Content Management

```typescript
// src/content/content.service.ts
@Injectable()
export class ContentService {
  async createPost(createPostDto: CreatePostDto, files: Express.Multer.File[]) {
    // Upload files first
    const uploadResults = await this.uploadService.processBulkUpload(files, 'post-media')

    // Create post with file references
    const post = await this.prisma.post.create({
      data: {
        ...createPostDto,
        media: {
          create: uploadResults.successful.map((result) => ({
            fileId: result.id,
            type: result.type,
            order: uploadResults.successful.indexOf(result),
          })),
        },
      },
      include: { media: true },
    })

    return post
  }

  async deletePost(postId: string) {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      include: { media: true },
    })

    if (!post) {
      throw new NotFoundException('Post not found')
    }

    // Delete associated files
    await Promise.all(post.media.map((media) => this.uploadService.deleteFile(media.fileId)))

    // Delete post
    await this.prisma.post.delete({
      where: { id: postId },
    })

    return { message: 'Post deleted successfully' }
  }
}
```

### 3. Integration với Email Service

```typescript
// src/email/email.service.ts
@Injectable()
export class EmailService {
  constructor(
    private uploadService: UploadService,
    private mailService: MailService,
  ) {}

  async sendEmailWithAttachments(to: string, subject: string, template: string, attachments: Express.Multer.File[]) {
    // Process attachments
    const processedAttachments = await Promise.all(
      attachments.map(async (file) => {
        // Upload to storage for backup
        const uploadResult = await this.uploadService.processUpload(file, 'email-attachment')

        return {
          filename: file.originalname,
          content: file.buffer,
          contentType: file.mimetype,
          backupUrl: uploadResult.url,
        }
      }),
    )

    // Send email
    await this.mailService.sendMail({
      to,
      subject,
      template,
      attachments: processedAttachments,
    })

    return {
      message: 'Email sent successfully',
      attachmentCount: attachments.length,
    }
  }
}
```

## 📋 Tóm tắt

### Key Takeaways

1. **Security First**: Always validate file types, scan for malware, và sanitize filenames
2. **Performance**: Use streaming cho large files và implement proper memory management
3. **Reliability**: Multiple storage providers với fallback strategies
4. **User Experience**: Progress tracking, resume capability, và proper error messages

### When to Use Different Storage Providers

✅ **Local Storage cho:**

- Development và testing
- Small applications với limited traffic
- Internal tools với predictable usage
- When you need full control over file access

✅ **Cloudinary cho:**

- Image-heavy applications
- Need automatic optimization và transformations
- Want built-in CDN delivery
- E-commerce và social media platforms

✅ **AWS S3 cho:**

- Large-scale applications
- Need backup và versioning
- Integration với other AWS services
- Cost-effective cho large volumes

### File Upload Security Checklist

```typescript
const SECURITY_CHECKLIST = {
  fileValidation: [
    'Check file size limits',
    'Validate MIME types',
    'Verify file signatures (magic numbers)',
    'Scan for malware',
    'Check for embedded scripts',
  ],

  storageSecurity: [
    'Generate secure filenames',
    'Implement access controls',
    'Use virus scanning',
    'Monitor storage quotas',
    'Implement rate limiting',
  ],

  infrastructure: [
    'Use HTTPS for uploads',
    'Implement CORS policies',
    'Monitor resource usage',
    'Setup proper backup strategies',
    'Configure CDN security headers',
  ],
}
```

### Performance Optimization Guidelines

```typescript
const PERFORMANCE_GUIDELINES = {
  fileProcessing: {
    images: 'Use Sharp for image processing',
    videos: 'Implement queue-based processing',
    documents: 'Validate without full parsing',
  },

  storage: {
    local: 'Use SSD storage với proper caching',
    cloud: 'Implement retry logic với exponential backoff',
    cdn: 'Configure proper cache headers',
  },

  bandwidth: {
    compression: 'Enable gzip compression',
    chunking: 'Use chunked uploads cho large files',
    streaming: 'Implement streaming uploads',
  },
}
```

> 💡 **Remember**: File upload security requires multiple layers of protection. Never trust user input, always validate files thoroughly, và implement proper resource management để prevent abuse và ensure system stability.
