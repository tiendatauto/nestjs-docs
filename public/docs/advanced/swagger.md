# 🎨 Swagger trong NestJS

## 🔍 Swagger là gì?

**Swagger** (còn gọi là OpenAPI) là một framework mạnh mẽ cho việc thiết kế, xây dựng, tài liệu hóa và sử dụng REST APIs. Trong ecosystem NestJS, Swagger đóng vai trò quan trọng trong việc:

- **Tự động tạo API documentation** từ code annotations
- **Interactive API explorer** cho testing APIs
- **Type-safe client generation** cho frontend
- **API contract validation** và standardization

### 🔄 Cách hoạt động trong NestJS Ecosystem

```mermaid
graph TD
    A[Controller với Decorators] --> B[Swagger Scanner]
    B --> C[OpenAPI Schema Generation]
    C --> D[Swagger UI]
    C --> E[JSON/YAML Export]
    C --> F[Client Code Generation]
```

**Execution Order & Lifecycle:**

1. **Build time**: NestJS quét các decorators trong controllers
2. **Runtime initialization**: Tạo OpenAPI schema từ metadata
3. **Route registration**: Mount Swagger UI tại endpoint được chỉ định
4. **Request handling**: Serve interactive documentation và schema

### 🏗️ Kiến trúc và Components

```typescript
// Core Components của Swagger trong NestJS
interface SwaggerComponents {
  DocumentBuilder: 'Tạo cấu hình cơ bản cho API docs'
  SwaggerModule: 'Module chính để setup và serve documentation'
  ApiDecorators: 'Các decorators để annotate controllers và DTOs'
  SchemaFactory: 'Tự động tạo JSON schema từ TypeScript types'
}
```

---

## 🎯 Cách implement Swagger

### 1. Basic Implementation

**Bước 1: Cài đặt dependencies**

```bash
npm install --save @nestjs/swagger swagger-ui-express
npm install --save-dev @types/swagger-ui-express
```

**Bước 2: Setup cơ bản trong main.ts**

```typescript
// src/main.ts
import { NestFactory } from '@nestjs/core'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { AppModule } from './app.module'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)

  // Swagger Configuration
  const config = new DocumentBuilder()
    .setTitle('My API')
    .setDescription('API description for my awesome application')
    .setVersion('1.0')
    .addTag('users', 'User management endpoints')
    .addTag('auth', 'Authentication endpoints')
    .build()

  // Create OpenAPI document
  const document = SwaggerModule.createDocument(app, config)

  // Setup Swagger UI
  SwaggerModule.setup('api', app, document)

  await app.listen(3000)
  console.log('📚 Swagger UI available at: http://localhost:3000/api')
}

bootstrap()
```

**Bước 3: Basic Controller Documentation**

```typescript
// src/users/users.controller.ts
import { Controller, Get, Post, Body, Param } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger'
import { CreateUserDto } from './dto/create-user.dto'
import { User } from './entities/user.entity'

@ApiTags('users') // Nhóm endpoints theo tag
@Controller('users')
export class UsersController {
  @Get()
  @ApiOperation({ summary: 'Get all users' }) // Mô tả operation
  @ApiResponse({
    status: 200,
    description: 'List of users retrieved successfully',
    type: [User], // Specify return type
  })
  async findAll(): Promise<User[]> {
    // Implementation
    return []
  }

  @Post()
  @ApiOperation({ summary: 'Create a new user' })
  @ApiResponse({
    status: 201,
    description: 'User created successfully',
    type: User,
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid input data',
  })
  async create(@Body() createUserDto: CreateUserDto): Promise<User> {
    // Implementation
    return new User()
  }
}
```

### 2. Advanced Implementation với Authentication

```typescript
// src/main.ts - Advanced setup
import { NestFactory } from '@nestjs/core'
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger'
import { ValidationPipe } from '@nestjs/common'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)

  // Global validation pipe
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  )

  // Advanced Swagger Configuration
  const config = new DocumentBuilder()
    .setTitle('E-commerce API')
    .setDescription(
      `
      Comprehensive e-commerce API with user management, 
      product catalog, orders, and payment processing.
      
      **Authentication**: JWT Bearer token required for protected endpoints.
      **Rate Limiting**: 100 requests per minute per IP.
      **Versioning**: API version in URL path.
    `,
    )
    .setVersion('2.0')
    .setContact('API Support', 'https://example.com/support', 'api-support@example.com')
    .setLicense('MIT', 'https://opensource.org/licenses/MIT')
    .addServer('http://localhost:3000', 'Development')
    .addServer('https://api-staging.example.com', 'Staging')
    .addServer('https://api.example.com', 'Production')

    // JWT Authentication
    .addBearerAuth(
      {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
        name: 'JWT',
        description: 'Enter JWT token',
        in: 'header',
      },
      'JWT-auth', // Security scheme name
    )

    // API Key Authentication
    .addApiKey(
      {
        type: 'apiKey',
        name: 'X-API-KEY',
        in: 'header',
        description: 'API Key for external integrations',
      },
      'api-key',
    )

    // Tags với descriptions
    .addTag('auth', 'Authentication và authorization endpoints')
    .addTag('users', 'User management và profiles')
    .addTag('products', 'Product catalog và inventory')
    .addTag('orders', 'Order processing và tracking')
    .addTag('payments', 'Payment processing endpoints')
    .addTag('admin', 'Administrative functions')
    .build()

  // Create document với custom options
  const document = SwaggerModule.createDocument(app, config, {
    operationIdFactory: (controllerKey: string, methodKey: string) => methodKey,
    deepScanRoutes: true, // Scan nested routes
  })

  // Custom Swagger UI options
  SwaggerModule.setup('api', app, document, {
    swaggerOptions: {
      filter: true, // Enable filtering
      showRequestDuration: true, // Show request duration
      docExpansion: 'none', // Collapse all by default
      defaultModelsExpandDepth: 2, // Model expansion depth
      defaultModelExpandDepth: 2,
      tryItOutEnabled: true, // Enable try-it-out
      persistAuthorization: true, // Persist auth across page refreshes
    },
    customSiteTitle: 'E-commerce API Documentation',
    customfavIcon: '/favicon.ico',
    customJs: ['https://cdnjs.cloudflare.com/ajax/libs/swagger-ui/4.15.5/swagger-ui-bundle.min.js'],
    customCssUrl: '/custom-swagger.css',
  })

  await app.listen(3000)
}
```

### 3. DTO Documentation với Validation

```typescript
// src/users/dto/create-user.dto.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { IsEmail, IsString, IsOptional, MinLength, MaxLength, IsEnum, IsPhoneNumber, Matches } from 'class-validator'

export enum UserRole {
  USER = 'user',
  ADMIN = 'admin',
  MODERATOR = 'moderator',
}

export class CreateUserDto {
  @ApiProperty({
    description: 'User email address',
    example: 'john.doe@example.com',
    format: 'email',
    maxLength: 100,
  })
  @IsEmail({}, { message: 'Please provide a valid email address' })
  @MaxLength(100, { message: 'Email must not exceed 100 characters' })
  email: string

  @ApiProperty({
    description: 'User password',
    example: 'MySecureP@ssw0rd',
    minLength: 8,
    maxLength: 50,
    format: 'password',
  })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  @MaxLength(50, { message: 'Password must not exceed 50 characters' })
  @Matches(/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/, {
    message: 'Password must contain uppercase, lowercase, number and special character',
  })
  password: string

  @ApiProperty({
    description: 'User first name',
    example: 'John',
    minLength: 2,
    maxLength: 50,
  })
  @IsString()
  @MinLength(2, { message: 'First name must be at least 2 characters long' })
  @MaxLength(50, { message: 'First name must not exceed 50 characters' })
  firstName: string

  @ApiProperty({
    description: 'User last name',
    example: 'Doe',
    minLength: 2,
    maxLength: 50,
  })
  @IsString()
  @MinLength(2, { message: 'Last name must be at least 2 characters long' })
  @MaxLength(50, { message: 'Last name must not exceed 50 characters' })
  lastName: string

  @ApiPropertyOptional({
    description: 'User phone number',
    example: '+1234567890',
    pattern: '^\\+[1-9]\\d{1,14}$',
  })
  @IsOptional()
  @IsPhoneNumber(null, { message: 'Please provide a valid phone number' })
  phoneNumber?: string

  @ApiPropertyOptional({
    description: 'User role in the system',
    enum: UserRole,
    default: UserRole.USER,
    example: UserRole.USER,
  })
  @IsOptional()
  @IsEnum(UserRole, { message: 'Role must be one of: user, admin, moderator' })
  role?: UserRole = UserRole.USER

  @ApiPropertyOptional({
    description: 'User date of birth',
    example: '1990-01-15',
    format: 'date',
  })
  @IsOptional()
  @IsString()
  dateOfBirth?: string
}
```

### 4. Entity Documentation

```typescript
// src/users/entities/user.entity.ts
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Exclude } from 'class-transformer'

export class User {
  @ApiProperty({
    description: 'Unique identifier for the user',
    example: '123e4567-e89b-12d3-a456-426614174000',
    format: 'uuid',
  })
  id: string

  @ApiProperty({
    description: 'User email address',
    example: 'john.doe@example.com',
    format: 'email',
  })
  email: string

  @ApiProperty({
    description: 'User first name',
    example: 'John',
  })
  firstName: string

  @ApiProperty({
    description: 'User last name',
    example: 'Doe',
  })
  lastName: string

  @ApiPropertyOptional({
    description: 'User phone number',
    example: '+1234567890',
  })
  phoneNumber?: string

  @ApiProperty({
    description: 'User role in the system',
    enum: ['user', 'admin', 'moderator'],
    example: 'user',
  })
  role: string

  @ApiProperty({
    description: 'Whether the user account is active',
    example: true,
  })
  isActive: boolean

  @ApiProperty({
    description: 'Date when the user was created',
    example: '2023-01-15T10:30:00Z',
    format: 'date-time',
  })
  createdAt: Date

  @ApiProperty({
    description: 'Date when the user was last updated',
    example: '2023-01-15T10:30:00Z',
    format: 'date-time',
  })
  updatedAt: Date

  @Exclude() // Exclude from response
  password: string

  @ApiPropertyOptional({
    description: 'User profile picture URL',
    example: 'https://example.com/avatar.jpg',
    format: 'uri',
  })
  avatarUrl?: string
}
```

---

## 💡 Các cách sử dụng thông dụng

### 1. Authentication & Authorization Documentation

```typescript
// src/auth/auth.controller.ts
import { Controller, Post, Body, UseGuards, Get } from '@nestjs/common'
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiBearerAuth,
  ApiUnauthorizedResponse,
  ApiForbiddenResponse,
} from '@nestjs/swagger'
import { JwtAuthGuard } from './guards/jwt-auth.guard'
import { RolesGuard } from './guards/roles.guard'
import { Roles } from './decorators/roles.decorator'
import { CurrentUser } from './decorators/current-user.decorator'

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  @Post('login')
  @ApiOperation({
    summary: 'User login',
    description: 'Authenticate user with email and password to receive JWT token',
  })
  @ApiResponse({
    status: 200,
    description: 'Login successful',
    schema: {
      type: 'object',
      properties: {
        access_token: {
          type: 'string',
          example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
          description: 'JWT access token',
        },
        refresh_token: {
          type: 'string',
          example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
          description: 'JWT refresh token',
        },
        expires_in: {
          type: 'number',
          example: 3600,
          description: 'Token expiration time in seconds',
        },
        user: {
          $ref: '#/components/schemas/User',
        },
      },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid credentials',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 401 },
        message: { type: 'string', example: 'Invalid email or password' },
        error: { type: 'string', example: 'Unauthorized' },
      },
    },
  })
  async login(@Body() loginDto: LoginDto) {
    // Implementation
  }

  @Get('profile')
  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('JWT-auth') // Reference to security scheme
  @ApiOperation({
    summary: 'Get user profile',
    description: 'Retrieve current user profile information',
  })
  @ApiResponse({
    status: 200,
    description: 'Profile retrieved successfully',
    type: User,
  })
  @ApiUnauthorizedResponse({
    description: 'JWT token missing or invalid',
  })
  async getProfile(@CurrentUser() user: User) {
    return user
  }

  @Get('admin-only')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  @ApiBearerAuth('JWT-auth')
  @ApiOperation({
    summary: 'Admin only endpoint',
    description: 'Access restricted to users with admin role',
  })
  @ApiResponse({
    status: 200,
    description: 'Admin data retrieved successfully',
  })
  @ApiUnauthorizedResponse({
    description: 'JWT token missing or invalid',
  })
  @ApiForbiddenResponse({
    description: 'Insufficient permissions - admin role required',
  })
  async getAdminData() {
    return { message: 'This is admin-only data' }
  }
}
```

### 2. Pagination và Filtering Documentation

```typescript
// src/common/dto/pagination.dto.ts
import { ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsOptional, IsPositive, Max, Min } from 'class-validator'

export class PaginationDto {
  @ApiPropertyOptional({
    description: 'Page number (1-based)',
    minimum: 1,
    default: 1,
    example: 1,
  })
  @IsOptional()
  @Type(() => Number)
  @IsPositive({ message: 'Page must be a positive number' })
  page?: number = 1

  @ApiPropertyOptional({
    description: 'Number of items per page',
    minimum: 1,
    maximum: 100,
    default: 10,
    example: 10,
  })
  @IsOptional()
  @Type(() => Number)
  @Min(1, { message: 'Limit must be at least 1' })
  @Max(100, { message: 'Limit cannot exceed 100' })
  limit?: number = 10

  @ApiPropertyOptional({
    description: 'Field to sort by',
    example: 'createdAt',
    enum: ['createdAt', 'updatedAt', 'name', 'email'],
  })
  @IsOptional()
  sortBy?: string = 'createdAt'

  @ApiPropertyOptional({
    description: 'Sort order',
    enum: ['ASC', 'DESC'],
    default: 'DESC',
    example: 'DESC',
  })
  @IsOptional()
  sortOrder?: 'ASC' | 'DESC' = 'DESC'

  @ApiPropertyOptional({
    description: 'Search term for filtering results',
    example: 'john',
    maxLength: 100,
  })
  @IsOptional()
  search?: string
}

// Paginated Response Schema
export class PaginatedResponse<T> {
  @ApiProperty({
    description: 'Array of items for current page',
    isArray: true,
  })
  data: T[]

  @ApiProperty({
    description: 'Pagination metadata',
    type: 'object',
    properties: {
      total: { type: 'number', example: 150, description: 'Total number of items' },
      page: { type: 'number', example: 1, description: 'Current page number' },
      limit: { type: 'number', example: 10, description: 'Items per page' },
      totalPages: { type: 'number', example: 15, description: 'Total number of pages' },
      hasNextPage: { type: 'boolean', example: true, description: 'Whether there is a next page' },
      hasPrevPage: { type: 'boolean', example: false, description: 'Whether there is a previous page' },
    },
  })
  meta: {
    total: number
    page: number
    limit: number
    totalPages: number
    hasNextPage: boolean
    hasPrevPage: boolean
  }
}
```

### 3. File Upload Documentation

```typescript
// src/upload/upload.controller.ts
import {
  Controller,
  Post,
  UseInterceptors,
  UploadedFile,
  UploadedFiles,
  ParseFilePipe,
  MaxFileSizeValidator,
  FileTypeValidator,
} from '@nestjs/common'
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express'
import { ApiTags, ApiOperation, ApiConsumes, ApiBody, ApiResponse } from '@nestjs/swagger'

@ApiTags('upload')
@Controller('upload')
export class UploadController {
  @Post('single')
  @UseInterceptors(FileInterceptor('file'))
  @ApiOperation({
    summary: 'Upload single file',
    description: 'Upload a single image file (JPG, PNG, GIF). Max size: 5MB',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'File upload',
    type: 'object',
    properties: {
      file: {
        type: 'string',
        format: 'binary',
        description: 'Image file to upload',
      },
      description: {
        type: 'string',
        description: 'Optional file description',
        example: 'Profile picture',
      },
    },
    required: ['file'],
  })
  @ApiResponse({
    status: 201,
    description: 'File uploaded successfully',
    schema: {
      type: 'object',
      properties: {
        id: { type: 'string', example: 'file-123' },
        filename: { type: 'string', example: 'profile.jpg' },
        originalName: { type: 'string', example: 'my-photo.jpg' },
        mimetype: { type: 'string', example: 'image/jpeg' },
        size: { type: 'number', example: 1024768 },
        url: { type: 'string', example: 'https://example.com/uploads/profile.jpg' },
        uploadedAt: { type: 'string', format: 'date-time' },
      },
    },
  })
  @ApiResponse({
    status: 400,
    description: 'Invalid file type or size',
    schema: {
      type: 'object',
      properties: {
        statusCode: { type: 'number', example: 400 },
        message: { type: 'string', example: 'File size exceeds maximum limit of 5MB' },
        error: { type: 'string', example: 'Bad Request' },
      },
    },
  })
  async uploadFile(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 }), // 5MB
          new FileTypeValidator({ fileType: /(jpg|jpeg|png|gif)$/i }),
        ],
      }),
    )
    file: Express.Multer.File,
    @Body('description') description?: string,
  ) {
    // Implementation
    return {
      id: 'file-123',
      filename: file.filename,
      originalName: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      url: `https://example.com/uploads/${file.filename}`,
      uploadedAt: new Date(),
    }
  }

  @Post('multiple')
  @UseInterceptors(FilesInterceptor('files', 10)) // Max 10 files
  @ApiOperation({
    summary: 'Upload multiple files',
    description: 'Upload multiple image files (JPG, PNG, GIF). Max 10 files, 5MB each',
  })
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Multiple file upload',
    type: 'object',
    properties: {
      files: {
        type: 'array',
        items: {
          type: 'string',
          format: 'binary',
        },
        description: 'Array of image files to upload',
      },
    },
  })
  @ApiResponse({
    status: 201,
    description: 'Files uploaded successfully',
    schema: {
      type: 'object',
      properties: {
        uploadedFiles: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              filename: { type: 'string' },
              originalName: { type: 'string' },
              size: { type: 'number' },
              url: { type: 'string' },
            },
          },
        },
        totalUploaded: { type: 'number', example: 3 },
        totalSize: { type: 'number', example: 2048576 },
      },
    },
  })
  async uploadFiles(
    @UploadedFiles(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 }),
          new FileTypeValidator({ fileType: /(jpg|jpeg|png|gif)$/i }),
        ],
      }),
    )
    files: Express.Multer.File[],
  ) {
    // Implementation
    return {
      uploadedFiles: files.map((file) => ({
        id: `file-${Date.now()}`,
        filename: file.filename,
        originalName: file.originalname,
        size: file.size,
        url: `https://example.com/uploads/${file.filename}`,
      })),
      totalUploaded: files.length,
      totalSize: files.reduce((sum, file) => sum + file.size, 0),
    }
  }
}
```

### 4. Error Response Documentation

```typescript
// src/common/filters/http-exception.filter.ts
import { ApiProperty } from '@nestjs/swagger'

export class ErrorResponse {
  @ApiProperty({
    description: 'HTTP status code',
    example: 400,
  })
  statusCode: number

  @ApiProperty({
    description: 'Error message or array of validation errors',
    oneOf: [
      { type: 'string', example: 'Invalid input data' },
      {
        type: 'array',
        items: { type: 'string' },
        example: ['email must be an email', 'password is too short'],
      },
    ],
  })
  message: string | string[]

  @ApiProperty({
    description: 'Error type',
    example: 'Bad Request',
  })
  error: string

  @ApiProperty({
    description: 'Request timestamp',
    example: '2023-01-15T10:30:00Z',
    format: 'date-time',
  })
  timestamp: string

  @ApiProperty({
    description: 'API endpoint path',
    example: '/api/users',
  })
  path: string

  @ApiProperty({
    description: 'Unique request identifier for tracking',
    example: 'req-123e4567-e89b-12d3-a456-426614174000',
    required: false,
  })
  requestId?: string
}

// Common Error Response Decorators
export const ApiValidationErrorResponse = () =>
  ApiResponse({
    status: 400,
    description: 'Validation failed',
    type: ErrorResponse,
    example: {
      statusCode: 400,
      message: ['email must be an email', 'password must be longer than or equal to 8 characters'],
      error: 'Bad Request',
      timestamp: '2023-01-15T10:30:00Z',
      path: '/api/users',
      requestId: 'req-123e4567-e89b-12d3-a456-426614174000',
    },
  })

export const ApiNotFoundErrorResponse = () =>
  ApiResponse({
    status: 404,
    description: 'Resource not found',
    type: ErrorResponse,
    example: {
      statusCode: 404,
      message: 'User with ID 123 not found',
      error: 'Not Found',
      timestamp: '2023-01-15T10:30:00Z',
      path: '/api/users/123',
    },
  })
```

---

## ⚠️ Các vấn đề thường gặp

### 1. Missing Type Information

**Vấn đề:**

```typescript
// ❌ Swagger không thể infer type
@Get()
async getUsers() {
  return this.usersService.findAll() // Return type unknown
}
```

**Giải pháp:**

```typescript
// ✅ Explicit type annotation
@Get()
@ApiResponse({
  status: 200,
  description: 'Users retrieved successfully',
  type: [User] // Explicitly specify type
})
async getUsers(): Promise<User[]> {
  return this.usersService.findAll()
}

// ✅ Hoặc sử dụng decorator
@Get()
@ApiOkResponse({ type: [User] })
async getUsers(): Promise<User[]> {
  return this.usersService.findAll()
}
```

### 2. Complex Response Types

**Vấn đề:**

```typescript
// ❌ Complex nested response không được document
@Get('stats')
async getStats() {
  return {
    users: { total: 100, active: 95 },
    orders: { total: 500, pending: 20 },
    revenue: { thisMonth: 10000, lastMonth: 8500 }
  }
}
```

**Giải pháp:**

```typescript
// ✅ Tạo explicit response DTO
class StatsResponse {
  @ApiProperty({
    description: 'User statistics',
    type: 'object',
    properties: {
      total: { type: 'number', example: 100 },
      active: { type: 'number', example: 95 }
    }
  })
  users: {
    total: number
    active: number
  }

  @ApiProperty({
    description: 'Order statistics',
    type: 'object',
    properties: {
      total: { type: 'number', example: 500 },
      pending: { type: 'number', example: 20 }
    }
  })
  orders: {
    total: number
    pending: number
  }

  @ApiProperty({
    description: 'Revenue statistics',
    type: 'object',
    properties: {
      thisMonth: { type: 'number', example: 10000 },
      lastMonth: { type: 'number', example: 8500 }
    }
  })
  revenue: {
    thisMonth: number
    lastMonth: number
  }
}

@Get('stats')
@ApiOkResponse({ type: StatsResponse })
async getStats(): Promise<StatsResponse> {
  // Implementation
}
```

### 3. Generic Types và Polymorphism

**Vấn đề:**

```typescript
// ❌ Generic types không được handle correctly
class ApiResponse<T> {
  data: T
  success: boolean
}

@Get()
async getUsers(): Promise<ApiResponse<User[]>> {
  // Type information lost
}
```

**Giải pháp:**

```typescript
// ✅ Sử dụng factory functions
export function createApiResponse<T>(type: Type<T>) {
  class ApiResponseClass {
    @ApiProperty({ type: () => type, isArray: true })
    data: T

    @ApiProperty({ example: true })
    success: boolean
  }

  return ApiResponseClass
}

// Usage
const UserListResponse = createApiResponse(User)

@Get()
@ApiOkResponse({ type: UserListResponse })
async getUsers() {
  return {
    data: await this.usersService.findAll(),
    success: true
  }
}
```

### 4. Circular Dependencies

**Vấn đề:**

```typescript
// ❌ Circular reference giữa entities
class User {
  @ApiProperty({ type: () => [Order] }) // Forward reference
  orders: Order[]
}

class Order {
  @ApiProperty({ type: () => User }) // Circular reference
  user: User
}
```

**Giải pháp:**

```typescript
// ✅ Sử dụng forward references và lazy loading
class User {
  @ApiProperty({
    type: () => [Order],
    description: 'User orders',
  })
  orders: Order[]
}

class Order {
  @ApiProperty({
    type: () => User,
    description: 'Order owner',
  })
  user: User
}

// ✅ Hoặc tách thành separate DTOs
class UserSummaryDto {
  @ApiProperty()
  id: string

  @ApiProperty()
  name: string
  // Không include orders để avoid circular reference
}

class OrderDto {
  @ApiProperty()
  id: string

  @ApiProperty({ type: UserSummaryDto })
  user: UserSummaryDto
}
```

---

## 🔧 Advanced Patterns

### 1. Custom Decorators cho Swagger

```typescript
// src/common/decorators/api-paginated-response.decorator.ts
import { applyDecorators, Type } from '@nestjs/common'
import { ApiOkResponse, getSchemaPath } from '@nestjs/swagger'

export const ApiPaginatedResponse = <TModel extends Type<any>>(
  model: TModel,
) => {
  return applyDecorators(
    ApiOkResponse({
      description: 'Paginated response',
      schema: {
        allOf: [
          {
            properties: {
              data: {
                type: 'array',
                items: { $ref: getSchemaPath(model) },
              },
              meta: {
                type: 'object',
                properties: {
                  total: { type: 'number', example: 100 },
                  page: { type: 'number', example: 1 },
                  limit: { type: 'number', example: 10 },
                  totalPages: { type: 'number', example: 10 },
                  hasNextPage: { type: 'boolean', example: true },
                  hasPrevPage: { type: 'boolean', example: false },
                },
              },
            },
          },
        ],
      },
    }),
  )
}

// Usage
@Get()
@ApiPaginatedResponse(User)
async getUsers(@Query() paginationDto: PaginationDto) {
  return this.usersService.findAllPaginated(paginationDto)
}
```

### 2. Environment-specific Documentation

```typescript
// src/config/swagger.config.ts
export function createSwaggerConfig(environment: string) {
  const baseConfig = new DocumentBuilder()
    .setTitle('API Documentation')
    .setDescription('API for our application')
    .setVersion('1.0')

  switch (environment) {
    case 'development':
      return baseConfig.addServer('http://localhost:3000', 'Development').addBearerAuth().build()

    case 'staging':
      return baseConfig
        .addServer('https://api-staging.example.com', 'Staging')
        .addBearerAuth()
        .addApiKey({ type: 'apiKey', name: 'x-api-key', in: 'header' })
        .build()

    case 'production':
      return baseConfig
        .addServer('https://api.example.com', 'Production')
        .addBearerAuth()
        .addApiKey({ type: 'apiKey', name: 'x-api-key', in: 'header' })
        .setTermsOfService('https://example.com/terms')
        .setContact('API Support', 'https://example.com/support', 'support@example.com')
        .setLicense('Commercial', 'https://example.com/license')
        .build()

    default:
      return baseConfig.build()
  }
}

// src/main.ts
const swaggerConfig = createSwaggerConfig(process.env.NODE_ENV)
const document = SwaggerModule.createDocument(app, swaggerConfig)
```

### 3. API Versioning Documentation

```typescript
// src/versioning/v1/users/users.controller.ts
@ApiTags('users-v1')
@Controller({ path: 'users', version: '1' })
export class UsersV1Controller {
  @Get()
  @ApiOperation({
    summary: 'Get users (v1)',
    deprecated: true, // Mark as deprecated
    description: 'Legacy endpoint - use v2 instead',
  })
  @ApiResponse({
    status: 200,
    description: 'Users retrieved (legacy format)',
    headers: {
      'X-API-Version': {
        description: 'API version',
        schema: { type: 'string', example: '1.0' },
      },
      'X-Deprecated': {
        description: 'Deprecation notice',
        schema: { type: 'string', example: 'This endpoint is deprecated. Use v2.' },
      },
    },
  })
  async getUsers() {
    // Legacy implementation
  }
}

// src/versioning/v2/users/users.controller.ts
@ApiTags('users-v2')
@Controller({ path: 'users', version: '2' })
export class UsersV2Controller {
  @Get()
  @ApiOperation({
    summary: 'Get users (v2)',
    description: 'Enhanced endpoint with additional features',
  })
  @ApiResponse({
    status: 200,
    description: 'Users retrieved (enhanced format)',
  })
  async getUsers() {
    // Enhanced implementation
  }
}
```

### 4. Plugin-based Extensions

```typescript
// src/swagger/plugins/auth-plugin.ts
import { INestApplication } from '@nestjs/common'
import { SwaggerModule } from '@nestjs/swagger'

export class SwaggerAuthPlugin {
  static setup(app: INestApplication, document: any) {
    // Add custom authentication examples
    document.paths = Object.keys(document.paths).reduce((paths, path) => {
      const pathItem = document.paths[path]

      Object.keys(pathItem).forEach((method) => {
        const operation = pathItem[method]

        if (operation.security) {
          // Add examples for authenticated requests
          operation.examples = {
            'with-auth': {
              summary: 'Authenticated request',
              value: {
                headers: {
                  Authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
                },
              },
            },
          }
        }
      })

      paths[path] = pathItem
      return paths
    }, {})

    return document
  }
}

// Usage in main.ts
let document = SwaggerModule.createDocument(app, config)
document = SwaggerAuthPlugin.setup(app, document)
SwaggerModule.setup('api', app, document)
```

---

## 📝 Best Practices

### ✅ DO's

**1. Comprehensive Documentation**

```typescript
// ✅ Always provide detailed descriptions
@ApiOperation({
  summary: 'Create a new user account',
  description: `
    Creates a new user account in the system with the provided information.

    **Requirements:**
    - Email must be unique
    - Password must meet security requirements
    - Phone number must be valid international format

    **Business Rules:**
    - New users are created with 'user' role by default
    - Email verification is required before account activation
    - Duplicate emails will result in 409 Conflict error
  `
})
```

**2. Consistent Error Documentation**

```typescript
// ✅ Document all possible error scenarios
@Post()
@ApiResponse({ status: 201, description: 'User created successfully', type: User })
@ApiResponse({ status: 400, description: 'Validation failed', type: ErrorResponse })
@ApiResponse({ status: 409, description: 'Email already exists', type: ErrorResponse })
@ApiResponse({ status: 422, description: 'Business rule violation', type: ErrorResponse })
@ApiResponse({ status: 500, description: 'Internal server error', type: ErrorResponse })
async createUser(@Body() createUserDto: CreateUserDto): Promise<User> {
  // Implementation
}
```

**3. Rich Examples**

```typescript
// ✅ Provide realistic examples
@ApiProperty({
  description: 'User email address',
  example: 'john.doe@company.com', // Realistic example
  pattern: '^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$',
  maxLength: 100
})
email: string
```

**4. Schema Composition**

```typescript
// ✅ Use composition for reusable schemas
class BaseEntity {
  @ApiProperty({ format: 'uuid' })
  id: string

  @ApiProperty({ format: 'date-time' })
  createdAt: Date

  @ApiProperty({ format: 'date-time' })
  updatedAt: Date
}

class User extends BaseEntity {
  @ApiProperty()
  email: string

  @ApiProperty()
  firstName: string
}
```

### ❌ DON'Ts

**1. Sparse Documentation**

```typescript
// ❌ Minimal, unhelpful documentation
@Get()
@ApiOperation({ summary: 'Get users' }) // Too brief
@ApiResponse({ status: 200, type: [User] }) // Missing description
async getUsers() {
  // Implementation
}
```

**2. Hardcoded Values**

```typescript
// ❌ Hardcoded servers and configuration
const config = new DocumentBuilder()
  .addServer('http://localhost:3000') // Hardcoded
  .setVersion('1.0') // Should come from package.json
  .build()
```

**3. Missing Validation Documentation**

```typescript
// ❌ Validation rules not reflected in Swagger
@ApiProperty({ example: 'john@example.com' })
@IsEmail() // Validation not documented
@MaxLength(100) // Length constraint not shown
email: string
```

**4. Inconsistent Naming**

```typescript
// ❌ Inconsistent tag and operation naming
@ApiTags('user-management') // Inconsistent with other tags
@ApiOperation({ summary: 'getUserList' }) // camelCase instead of sentence
```

### 🎯 Performance Best Practices

**1. Conditional Documentation**

```typescript
// ✅ Only include Swagger in development/staging
if (process.env.NODE_ENV !== 'production') {
  const document = SwaggerModule.createDocument(app, config)
  SwaggerModule.setup('api', app, document)
}
```

**2. Lazy Loading for Large APIs**

```typescript
// ✅ Split large APIs into modules
const userDocument = SwaggerModule.createDocument(app, userConfig, {
  include: [UsersModule],
})

const orderDocument = SwaggerModule.createDocument(app, orderConfig, {
  include: [OrdersModule],
})

SwaggerModule.setup('api/users', app, userDocument)
SwaggerModule.setup('api/orders', app, orderDocument)
```

---

## 🚨 Common Pitfalls

### 1. Security Vulnerabilities

**❌ Pitfall: Exposing Sensitive Information**

```typescript
// ❌ Sensitive data in examples
@ApiProperty({
  example: 'password123', // Exposes real password patterns
  description: 'User password'
})
password: string

@ApiProperty({
  example: 'sk_live_123456789', // Real API key in documentation
  description: 'Stripe API key'
})
apiKey: string
```

**✅ Solution: Safe Examples**

```typescript
// ✅ Safe, generic examples
@ApiProperty({
  example: '••••••••',
  description: 'User password (8+ characters, mixed case, numbers, symbols)',
  format: 'password'
})
password: string

@ApiProperty({
  example: 'sk_test_xxxxxxxxxxxxxxxx',
  description: 'API key for external service integration',
  format: 'password' // Hide in UI
})
apiKey: string
```

### 2. Performance Issues

**❌ Pitfall: Heavy Schema Generation**

```typescript
// ❌ Complex recursive schemas
class User {
  @ApiProperty({ type: () => [User] }) // Recursive reference
  friends: User[]

  @ApiProperty({ type: () => [Order] })
  orders: Order[] // Deep nesting
}
```

**✅ Solution: Shallow References**

```typescript
// ✅ Use summary DTOs
class UserSummaryDto {
  @ApiProperty()
  id: string

  @ApiProperty()
  name: string
}

class User {
  @ApiProperty({ type: () => [UserSummaryDto] })
  friends: UserSummaryDto[]

  @ApiProperty({
    description: 'Number of orders',
    example: 5,
  })
  orderCount: number
}
```

### 3. Maintenance Issues

**❌ Pitfall: Outdated Documentation**

```typescript
// ❌ Documentation không sync với code
@ApiResponse({
  status: 200,
  description: 'Returns user with profile',
  type: User // But actually returns UserWithProfile
})
async getUser(): Promise<UserWithProfile> {
  // Code changed but docs didn't
}
```

**✅ Solution: Type-driven Documentation**

```typescript
// ✅ Let TypeScript drive the documentation
@ApiResponse({
  status: 200,
  description: 'User retrieved successfully'
  // Type inferred from return type
})
async getUser(): Promise<UserWithProfile> {
  // Documentation stays in sync
}
```

---

## 📋 Tóm tắt

### 🎯 Key Takeaways

1. **Type Safety First**: Luôn sử dụng TypeScript types để drive documentation
2. **Comprehensive Coverage**: Document tất cả endpoints, responses, và error cases
3. **Rich Examples**: Cung cấp realistic examples và use cases
4. **Security Awareness**: Không expose sensitive information
5. **Performance Consideration**: Optimize cho large APIs với lazy loading
6. **Maintenance**: Keep documentation in sync với code changes

### 🚀 When to Use Swagger

**✅ Perfect for:**

- REST APIs với complex data structures
- Public APIs cần external developer adoption
- Teams cần shared API contracts
- APIs với multiple consumers (web, mobile, partners)
- Development environments cần testing interface

**❌ Consider alternatives for:**

- Simple internal APIs với minimal documentation needs
- GraphQL APIs (use GraphQL Playground instead)
- Real-time APIs (WebSocket) - needs specialized docs
- High-performance production environments (overhead concerns)

### 🔄 Integration Strategy

1. **Development**: Full Swagger với all features enabled
2. **Staging**: Swagger enabled với production-like examples
3. **Production**: Optional - consider security implications
4. **CI/CD**: Generate static documentation for deployment
5. **Testing**: Use Swagger schemas for API testing validation

---

**🎉 Với Swagger, bạn có thể tạo ra API documentation chất lượng cao, tự động cập nhật và developer-friendly!**
