# Exception Filters trong NestJS

Các vấn đề thường gặp và best practices khi xử lý exceptions trong NestJS.

## 🔍 Exception Filter là gì?

Exception Filters trong NestJS handle tất cả **unhandled exceptions** trong app. Chúng được execute **cuối cùng** trong request lifecycle, chỉ khi có exception xảy ra.

### Exception Filters cho phép:

- **Handle tất cả unhandled exceptions** - Catch errors không được handle trong code
- **Transform error response format** - Consistent error response structure
- **Log errors một cách consistent** - Centralized error logging
- **Provide user-friendly error messages** - Hide technical details từ users

### Cách hoạt động:

```
Request → Middleware → Guards → Interceptors → Pipes → Controller
                                                              ↓ (if error)
Response ← Exception Filters ← Error
```

### Execution Order khi có error:

```typescript
@UseGuards(AuthGuard)           // 1. Execute
@UseInterceptors(LogInterceptor) // 2. Execute
@UseFilters(HttpExceptionFilter) // 5. Execute if error
@Post()                          // 3. Execute
create(@Body(ValidationPipe) dto) { // 4. Execute or throw error
  throw new BadRequestException('Error');
}
```

## 🎯 Cách implement Exception Filters

### 1. **Basic Exception Filter**

```typescript
import { ExceptionFilter, Catch, ArgumentsHost, HttpException } from '@nestjs/common'
import { Request, Response } from 'express'

@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    const ctx = host.switchToHttp()
    const response = ctx.getResponse<Response>()
    const request = ctx.getRequest<Request>()
    const status = exception.getStatus()

    response.status(status).json({
      success: false,
      statusCode: status,
      timestamp: new Date().toISOString(),
      path: request.url,
      message: exception.message,
    })
  }
}
```

### 2. **Cách đăng ký Exception Filter**

#### Global Exception Filter

```typescript
// main.ts
app.useGlobalFilters(new HttpExceptionFilter())

// hoặc trong module (recommended cho DI)
providers: [
  {
    provide: APP_FILTER,
    useClass: HttpExceptionFilter,
  },
]
```

**Cách sử dụng:** Tự động handle tất cả HttpExceptions trong app.

#### Controller-level Filter

```typescript
@UseFilters(HttpExceptionFilter)
@Controller('users')
export class UsersController {}
```

**Cách sử dụng:** Handle exceptions cho tất cả methods trong controller này.

#### Method-level Filter

```typescript
@UseFilters(HttpExceptionFilter)
@Get(':id')
findOne(@Param('id') id: string) {}
```

**Cách sử dụng:** Chỉ handle exceptions cho method này.

### 3. **Built-in Global Exception Filter Response**

Khi không có custom filter, NestJS tự động return:

```json
{
  "statusCode": 404,
  "message": "Cannot GET /api/nonexistent",
  "error": "Not Found"
}
```

**Cách customize:** Tạo global filter để override format này.

## ⚠️ Các vấn đề thường gặp

### 1. **Global Exception Filter Setup**

```typescript
// main.ts - Đúng cách setup global filter
app.useGlobalFilters(new GlobalExceptionFilter())

// hoặc trong module (recommended)
providers: [
  {
    provide: APP_FILTER,
    useClass: GlobalExceptionFilter,
  },
]
```

### 2. **Catching Different Exception Types**

```typescript
// ❌ Sai - Chỉ catch HttpException
@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    // Chỉ xử lý được HttpException
  }
}

// ✅ Đúng - Catch tất cả exceptions
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp()
    const response = ctx.getResponse<Response>()

    let status = 500
    let message = 'Internal server error'

    if (exception instanceof HttpException) {
      status = exception.getStatus()
      message = exception.message
    } else if (exception instanceof Error) {
      message = exception.message
    }

    response.status(status).json({
      success: false,
      statusCode: status,
      message,
      timestamp: new Date().toISOString(),
    })
  }
}
```

### 3. **Validation Error Handling**

```typescript
@Catch(BadRequestException)
export class ValidationExceptionFilter implements ExceptionFilter {
  catch(exception: BadRequestException, host: ArgumentsHost) {
    const ctx = host.switchToHttp()
    const response = ctx.getResponse<Response>()
    const exceptionResponse = exception.getResponse() as any

    // Handle validation errors từ class-validator
    if (exceptionResponse.message && Array.isArray(exceptionResponse.message)) {
      return response.status(400).json({
        success: false,
        statusCode: 400,
        message: 'Validation failed',
        errors: exceptionResponse.message,
        timestamp: new Date().toISOString(),
      })
    }

    // Handle other BadRequestExceptions
    response.status(400).json({
      success: false,
      statusCode: 400,
      message: exception.message,
      timestamp: new Date().toISOString(),
    })
  }
}
```

## 🔧 Advanced Exception Handling

### 1. **Multiple Exception Filters**

```typescript
// Specific exception filters
@Catch(HttpException)
export class HttpExceptionFilter implements ExceptionFilter {
  catch(exception: HttpException, host: ArgumentsHost) {
    // Handle HTTP exceptions
  }
}

@Catch(ValidationError)
export class ValidationFilter implements ExceptionFilter {
  catch(exception: ValidationError, host: ArgumentsHost) {
    // Handle validation errors
  }
}

@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    // Handle all other exceptions
  }
}
```

### 2. **Database Exception Handling**

```typescript
@Catch(PrismaClientKnownRequestError)
export class PrismaExceptionFilter implements ExceptionFilter {
  catch(exception: PrismaClientKnownRequestError, host: ArgumentsHost) {
    const ctx = host.switchToHttp()
    const response = ctx.getResponse<Response>()

    let status = 500
    let message = 'Database error'

    switch (exception.code) {
      case 'P2002':
        status = 409
        message = 'Unique constraint violation'
        break
      case 'P2025':
        status = 404
        message = 'Record not found'
        break
      case 'P2003':
        status = 400
        message = 'Foreign key constraint violation'
        break
      default:
        status = 500
        message = 'Database error'
    }

    response.status(status).json({
      success: false,
      statusCode: status,
      message,
      code: exception.code,
      timestamp: new Date().toISOString(),
    })
  }
}
```

### 3. **Custom Business Logic Exceptions**

```typescript
// Custom exception class
export class BusinessLogicException extends HttpException {
  constructor(message: string, errorCode: string) {
    super(
      {
        message,
        errorCode,
        statusCode: 422,
      },
      422,
    )
  }
}

// Exception filter for business logic
@Catch(BusinessLogicException)
export class BusinessLogicFilter implements ExceptionFilter {
  catch(exception: BusinessLogicException, host: ArgumentsHost) {
    const ctx = host.switchToHttp()
    const response = ctx.getResponse<Response>()
    const exceptionResponse = exception.getResponse() as any

    response.status(422).json({
      success: false,
      statusCode: 422,
      message: exceptionResponse.message,
      errorCode: exceptionResponse.errorCode,
      timestamp: new Date().toISOString(),
    })
  }
}
```

## 📊 Logging và Monitoring

### 1. **Exception Logging**

```typescript
@Catch()
export class GlobalExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalExceptionFilter.name)

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp()
    const request = ctx.getRequest<Request>()
    const response = ctx.getResponse<Response>()

    let status = 500
    let message = 'Internal server error'

    if (exception instanceof HttpException) {
      status = exception.getStatus()
      message = exception.message
    }

    // Log error với context
    this.logger.error(
      `${request.method} ${request.url} - ${status} - ${message}`,
      exception instanceof Error ? exception.stack : 'Unknown error',
    )

    response.status(status).json({
      success: false,
      statusCode: status,
      message: process.env.NODE_ENV === 'production' ? 'Something went wrong' : message,
      timestamp: new Date().toISOString(),
    })
  }
}
```

### 2. **Rate Limiting Exception**

```typescript
@Catch(ThrottlerException)
export class ThrottlerExceptionFilter implements ExceptionFilter {
  catch(exception: ThrottlerException, host: ArgumentsHost) {
    const ctx = host.switchToHttp()
    const response = ctx.getResponse<Response>()

    response.status(429).json({
      success: false,
      statusCode: 429,
      message: 'Too many requests',
      retryAfter: '60 seconds',
      timestamp: new Date().toISOString(),
    })
  }
}
```

## 🎭 Filter Binding Scope

### Method Level

```typescript
@UseFilters(HttpExceptionFilter)
@Get()
findAll() {}
```

### Controller Level

```typescript
@UseFilters(HttpExceptionFilter)
@Controller('users')
export class UsersController {}
```

### Global Level

```typescript
// main.ts
app.useGlobalFilters(new GlobalExceptionFilter())

// hoặc trong module
providers: [
  {
    provide: APP_FILTER,
    useClass: GlobalExceptionFilter,
  },
]
```

## 🔄 Execution Order

```typescript
// Filters chạy sau khi exception xảy ra
// Order: Guards → Interceptors → Pipes → Controller → Exception Filters
@UseGuards(AuthGuard)
@UseInterceptors(LoggingInterceptor)
@UseFilters(HttpExceptionFilter)
@Post()
create(@Body(ValidationPipe) dto: CreateDto) {
  throw new BadRequestException('Something went wrong');
}
```

## 📝 Best Practices

### ✅ **DO's**

- Luôn có global exception filter
- Log tất cả exceptions với context
- Provide user-friendly error messages
- Hide sensitive information trong production
- Use specific filters cho specific exceptions

### ❌ **DON'T's**

- Đừng expose stack traces trong production
- Đừng log sensitive data
- Đừng catch exceptions mà không handle properly
- Đừng return 500 cho business logic errors

## 🚨 Security Considerations

### 1. **Information Disclosure**

```typescript
// ❌ Sai - Expose sensitive info
response.json({
  error: exception.stack, // Dangerous!
  query: request.body, // May contain passwords
})

// ✅ Đúng - Safe error response
response.json({
  success: false,
  message: process.env.NODE_ENV === 'production' ? 'Internal server error' : exception.message,
  timestamp: new Date().toISOString(),
})
```

### 2. **Rate Limiting Error Responses**

```typescript
// Prevent information disclosure through error timing
private async delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Add consistent delay to error responses
await this.delay(100);
```

## 📋 Tóm tắt

> **Nhớ:** Exception Filters là layer cuối cùng để handle errors

### Khi nào sử dụng Exception Filters:

- ✅ **Global error handling**
- ✅ **Error logging và monitoring**
- ✅ **Consistent error response format**
- ✅ **Security error sanitization**
- ✅ **Business logic error transformation**
