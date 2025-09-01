# Interceptors trong NestJS

Các vấn đề thường gặp và best practices khi làm việc với Interceptors.

## 🔍 Interceptor là gì?

Interceptors là classes implement `NestInterceptor` interface, hoạt động như middleware cho HTTP requests. Chúng được execute **sau Guards** và **trước Pipes**.

### Interceptors cho phép:

- **Transform request/response data** - Modify data trước khi đến controller hoặc sau khi return
- **Bind extra logic** trước/sau method execution - Logging, monitoring, caching
- **Transform hoặc override** kết quả từ function - Change response format
- **Extend basic function behavior** - Add timeout, retry logic
- **Hoàn toàn override function** cho caching purposes - Return cached data

### Cách hoạt động:

```
Request → Middleware → Guards → Interceptors → Pipes → Controller → Interceptors → Response
                                    ↑                              ↑
                                Pre-processing                 Post-processing
```

## 🚀 Cách implement Interceptor

### 1. **Tạo Basic Interceptor**

```typescript
import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common'
import { Observable } from 'rxjs'

@Injectable()
export class BasicInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    console.log('Before execution...')

    const now = Date.now()
    return next.handle().pipe(tap(() => console.log(`After execution... ${Date.now() - now}ms`)))
  }
}
```

### 2. **Cách đăng ký Interceptor**

#### Global Interceptor

```typescript
// main.ts
app.useGlobalInterceptors(new LoggingInterceptor())

// hoặc trong module (recommended)
providers: [
  {
    provide: APP_INTERCEPTOR,
    useClass: LoggingInterceptor,
  },
]
```

**Cách sử dụng:** Tự động apply cho tất cả routes trong app.

#### Controller-level Interceptor

```typescript
@UseInterceptors(LoggingInterceptor)
@Controller('cats')
export class CatsController {}
```

**Cách sử dụng:** Apply cho tất cả methods trong controller này.

#### Method-level Interceptor

```typescript
@UseInterceptors(TransformInterceptor)
@Get()
findAll() {
  return [];
}
```

**Cách sử dụng:** Chỉ apply cho method này.

## ⚠️ Các vấn đề thường gặp

### 1. **Thứ tự thực thi Interceptor**

```typescript
// Thứ tự: Global → Controller → Method
@UseInterceptors(ControllerInterceptor)
@Controller()
export class AppController {
  @UseInterceptors(MethodInterceptor)
  @Get()
  getData() {
    return 'data'
  }
}
```

> **Lưu ý:** Interceptors chạy theo thứ tự: Global → Controller → Method → Handler → Method → Controller → Global

### 2. **Exception Handling trong Interceptor**

```typescript
@Injectable()
export class ErrorInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      catchError((err) => {
        // Log error
        console.error('Interceptor caught error:', err)

        // Re-throw để Exception Filter xử lý
        return throwError(() => err)
      }),
    )
  }
}
```

### 3. **Transform Response Data**

```typescript
@Injectable()
export class TransformInterceptor<T> implements NestInterceptor<T, Response<T>> {
  intercept(context: ExecutionContext, next: CallHandler): Observable<Response<T>> {
    return next.handle().pipe(
      map((data) => ({
        success: true,
        data,
        timestamp: new Date().toISOString(),
        path: context.switchToHttp().getRequest().url,
      })),
    )
  }
}
```

**Cách sử dụng:**

```typescript
// Apply global để transform tất cả responses
// main.ts
app.useGlobalInterceptors(new TransformInterceptor())

// Kết quả: Tất cả API responses sẽ có format:
// {
//   "success": true,
//   "data": {...actual data...},
//   "timestamp": "2025-08-30T10:30:00.000Z",
//   "path": "/api/users"
// }

// Apply cho specific controller
@UseInterceptors(TransformInterceptor)
@Controller('api/users')
export class UsersController {
  @Get()
  findAll() {
    return [{ id: 1, name: 'John' }]
    // Response sẽ được transform thành format trên
  }
}
```

## 💡 Các cách implement thông dụng

### 1. **Error Handling Interceptor**

```typescript
@Injectable()
export class ErrorHandlingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      catchError((err) => {
        // Log error với context
        const request = context.switchToHttp().getRequest()
        console.error(`Error in ${request.method} ${request.url}:`, err.message)

        // Transform error response
        if (err instanceof HttpException) {
          throw err // Let exception filter handle it
        }

        throw new InternalServerErrorException('Something went wrong')
      }),
    )
  }
}
```

**Cách sử dụng:**

```typescript
// Apply global để catch tất cả errors
app.useGlobalInterceptors(new ErrorHandlingInterceptor());

// Hoặc apply cho specific routes có high error risk
@UseInterceptors(ErrorHandlingInterceptor)
@Post('risky-operation')
riskyOperation() {
  // Any error here will be handled by interceptor
}
```

### 2. **Timeout Interceptor**

```typescript
@Injectable()
export class TimeoutInterceptor implements NestInterceptor {
  constructor(private readonly timeout: number = 5000) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    return next.handle().pipe(
      timeout(this.timeout),
      catchError((err) => {
        if (err.name === 'TimeoutError') {
          throw new RequestTimeoutException('Request timeout')
        }
        throw err
      }),
    )
  }
}
```

**Cách sử dụng:**

```typescript
// Apply cho operations có thể slow
@UseInterceptors(new TimeoutInterceptor(10000)) // 10 seconds
@Get('slow-operation')
slowOperation() {
  return this.slowService.process();
}

// Apply cho cả controller với default timeout
@UseInterceptors(TimeoutInterceptor)
@Controller('external-api')
export class ExternalApiController {}
```

## 🎯 Best Practices

### ✅ **DO's**

- Sử dụng `map()` để transform response
- Sử dụng `tap()` để side effects (logging)
- Sử dụng `catchError()` để handle exceptions
- Keep interceptors focused và single-purpose

### ❌ **DON'T's**

- Đừng modify request body trong interceptor (dùng Pipe)
- Đừng block execution quá lâu
- Đừng throw exceptions từ interceptor mà không handle

## 📝 Common Use Cases

### 1. **Logging Interceptor**

```typescript
@Injectable()
export class LoggingInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest()
    const method = request.method
    const url = request.url
    const now = Date.now()

    return next.handle().pipe(
      tap(() => {
        const response = context.switchToHttp().getResponse()
        console.log(`${method} ${url} ${response.statusCode} - ${Date.now() - now}ms`)
      }),
    )
  }
}
```

### 2. **Cache Interceptor**

```typescript
@Injectable()
export class CacheInterceptor implements NestInterceptor {
  constructor(private cacheService: CacheService) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
    const key = this.generateCacheKey(context)
    const cachedValue = await this.cacheService.get(key)

    if (cachedValue) {
      return of(cachedValue)
    }

    return next.handle().pipe(
      tap((response) => {
        this.cacheService.set(key, response, 300) // 5 minutes
      }),
    )
  }
}
```

## 🔄 Kết hợp với các Components khác

### Với Guards

```typescript
// Thứ tự: Guards → Interceptors → Pipes → Controller
@UseGuards(AuthGuard)
@UseInterceptors(LoggingInterceptor)
@UsePipes(ValidationPipe)
@Get()
getData() {}
```

### Với Exception Filters

```typescript
// Exception Filters chạy sau khi Interceptors catch error
@UseInterceptors(ErrorInterceptor)
@UseFilters(HttpExceptionFilter)
@Get()
getData() {}
```

## 📋 Tóm tắt

> **Nhớ:** Interceptors hoạt động theo pattern AOP (Aspect-Oriented Programming)

### Khi nào sử dụng Interceptors:

- ✅ **Logging và monitoring**
- ✅ **Response transformation**
- ✅ **Caching mechanisms**
- ✅ **Timeout handling**
- ✅ **Rate limiting**
