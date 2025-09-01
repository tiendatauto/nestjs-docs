# Middleware trong NestJS

Các vấn đề thường gặp và best practices khi làm việc với Middleware.

## 🔍 Middleware là gì?

Middleware functions trong NestJS execute **đầu tiên** trong request pipeline, ngay sau khi request đến server và **trước** tất cả các components khác.

### Middleware functions có thể:

- **Execute code** - Run logic trước khi request đến route handler
- **Make changes to request/response objects** - Modify req/res objects
- **End request-response cycle** - Response directly mà không cần đến controller
- **Call next middleware** trong stack - Pass control to next middleware

### Cách hoạt động:

```
Request → Middleware → Guards → Interceptors → Pipes → Controller → Response
           ↑
      Đầu tiên chạy
```

### Execution Order:

```typescript
// Order: Middleware (1st) → Guards → Interceptors → Pipes → Controller
app.use(globalMiddleware);          // 1. Chạy đầu tiên
consumer.apply(LoggerMiddleware);   // 2. Chạy tiếp

@UseGuards(AuthGuard)              // 3. Sau middleware
@UseInterceptors(LogInterceptor)   // 4. Sau guards
@Post()                            // 5. Cuối cùng
create() {}
```

## 🎯 Cách implement Middleware

### 1. **Functional Middleware**

```typescript
export function logger(req: Request, res: Response, next: NextFunction) {
  console.log(`${req.method} ${req.originalUrl}`)
  next()
}
```

**Cách sử dụng:**

```typescript
// Đăng ký trong module
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(logger).forRoutes('*')
  }
}

// Hoặc global trong main.ts
app.use(logger)
```

### 2. **Class-based Middleware**

```typescript
@Injectable()
export class LoggerMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    console.log(`${req.method} ${req.originalUrl}`)
    next()
  }
}
```

**Cách sử dụng:**

```typescript
// Đăng ký trong module với DI support
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggerMiddleware).forRoutes('*') // Apply to all routes
  }
}

// Apply cho specific routes
consumer
  .apply(LoggerMiddleware)
  .forRoutes({ path: 'users', method: RequestMethod.GET }, { path: 'users/*', method: RequestMethod.POST })

// Apply cho specific controllers
consumer.apply(LoggerMiddleware).forRoutes(UserController)
```

### 3. **Global Middleware (Express/Fastify)**

```typescript
// main.ts
import * as morgan from 'morgan'
app.use(morgan('combined'))

// Global CORS
import * as cors from 'cors'
app.use(cors())

// Global JSON parsing
app.use(express.json({ limit: '10mb' }))
```

**Cách sử dụng:** Automatic apply cho tất cả requests, không cần config thêm.

## ⚠️ Các vấn đề thường gặp

### 1. **Middleware Registration Issues**

```typescript
// ❌ Sai - Không configure middleware
@Module({
  controllers: [AppController],
})
export class AppModule {}

// ✅ Đúng - Configure middleware properly
@Module({
  controllers: [AppController],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LoggerMiddleware).forRoutes('*') // Apply to all routes
  }
}
```

### 2. **Route-specific Middleware**

```typescript
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(LoggerMiddleware)
      .exclude({ path: 'health', method: RequestMethod.GET }, { path: 'metrics', method: RequestMethod.GET })
      .forRoutes(UserController)

    consumer
      .apply(AuthMiddleware)
      .forRoutes({ path: 'users', method: RequestMethod.POST }, { path: 'users/*', method: RequestMethod.PUT })
  }
}
```

### 3. **Dependency Injection trong Middleware**

```typescript
@Injectable()
export class AuthMiddleware implements NestMiddleware {
  constructor(
    private authService: AuthService,
    private logger: Logger,
  ) {}

  async use(req: Request, res: Response, next: NextFunction) {
    try {
      const token = req.headers.authorization?.replace('Bearer ', '')

      if (!token) {
        throw new UnauthorizedException('Token not provided')
      }

      const user = await this.authService.validateToken(token)
      req.user = user // Attach user to request

      this.logger.log(`User ${user.id} authenticated`)
      next()
    } catch (error) {
      this.logger.error('Authentication failed', error)
      res.status(401).json({ message: 'Unauthorized' })
    }
  }
}
```

## 🔧 Common Middleware Examples

### 1. **CORS Middleware**

```typescript
@Injectable()
export class CorsMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    res.header('Access-Control-Allow-Origin', '*')
    res.header('Access-Control-Allow-Methods', 'GET,PUT,POST,DELETE,OPTIONS')
    res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization')

    if (req.method === 'OPTIONS') {
      res.sendStatus(200)
    } else {
      next()
    }
  }
}
```

### 2. **Request ID Middleware**

```typescript
@Injectable()
export class RequestIdMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    const requestId =
      req.headers['x-request-id'] || req.headers['x-correlation-id'] || Math.random().toString(36).substring(7)

    req.requestId = requestId
    res.setHeader('x-request-id', requestId)

    next()
  }
}
```

### 3. **Rate Limiting Middleware**

```typescript
@Injectable()
export class RateLimitMiddleware implements NestMiddleware {
  private readonly requests = new Map<string, number[]>()
  private readonly windowMs = 15 * 60 * 1000 // 15 minutes
  private readonly maxRequests = 100

  use(req: Request, res: Response, next: NextFunction) {
    const clientIp = req.ip
    const now = Date.now()

    // Get existing requests for this IP
    const clientRequests = this.requests.get(clientIp) || []

    // Filter out old requests
    const recentRequests = clientRequests.filter((time) => now - time < this.windowMs)

    if (recentRequests.length >= this.maxRequests) {
      return res.status(429).json({
        error: 'Too many requests',
        retryAfter: Math.ceil(this.windowMs / 1000),
      })
    }

    // Add current request
    recentRequests.push(now)
    this.requests.set(clientIp, recentRequests)

    next()
  }
}
```

### 4. **Body Size Limit Middleware**

```typescript
@Injectable()
export class BodySizeLimitMiddleware implements NestMiddleware {
  private readonly maxSize = 10 * 1024 * 1024 // 10MB

  use(req: Request, res: Response, next: NextFunction) {
    const contentLength = parseInt(req.headers['content-length'] || '0')

    if (contentLength > this.maxSize) {
      return res.status(413).json({
        error: 'Request entity too large',
        maxSize: this.maxSize,
      })
    }

    next()
  }
}
```

## 🔄 Middleware vs Other Components

### Execution Order

```typescript
// Order: Middleware → Guards → Interceptors → Pipes → Controller
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer
      .apply(LoggerMiddleware) // 1. First
      .forRoutes('*')
  }
}

@UseGuards(AuthGuard) // 2. Second
@UseInterceptors(LoggingInterceptor) // 3. Third
@Controller()
export class AppController {
  @UsePipes(ValidationPipe) // 4. Fourth
  @Post() // 5. Finally
  create() {}
}
```

### When to use what?

- **Middleware**: Early request processing (logging, CORS, auth)
- **Guards**: Authentication/authorization logic
- **Interceptors**: Transform data, AOP concerns
- **Pipes**: Validation and transformation

## 📊 Advanced Patterns

### 1. **Conditional Middleware**

```typescript
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    if (process.env.NODE_ENV !== 'production') {
      consumer.apply(morgan('dev')).forRoutes('*')
    }

    consumer.apply(helmet()).forRoutes('*')
  }
}
```

### 2. **Middleware Chain**

```typescript
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware, LoggerMiddleware, AuthMiddleware).forRoutes('*')
  }
}
```

### 3. **Dynamic Middleware**

```typescript
@Injectable()
export class DynamicMiddleware implements NestMiddleware {
  constructor(private configService: ConfigService) {}

  use(req: Request, res: Response, next: NextFunction) {
    const feature = this.configService.get('FEATURE_FLAG')

    if (!feature) {
      return res.status(503).json({
        error: 'Feature not available',
      })
    }

    next()
  }
}
```

## 🚨 Common Pitfalls

### 1. **Forgetting to call next()**

```typescript
// ❌ Sai - Quên call next()
@Injectable()
export class BadMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    console.log('Processing request...')
    // Forgot next()! Request will hang
  }
}

// ✅ Đúng
@Injectable()
export class GoodMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    console.log('Processing request...')
    next() // Don't forget this!
  }
}
```

### 2. **Handling Async Operations**

```typescript
// ❌ Sai - Không handle async properly
@Injectable()
export class BadAsyncMiddleware implements NestMiddleware {
  use(req: Request, res: Response, next: NextFunction) {
    this.asyncOperation() // Fire and forget - bad!
    next()
  }
}

// ✅ Đúng
@Injectable()
export class GoodAsyncMiddleware implements NestMiddleware {
  async use(req: Request, res: Response, next: NextFunction) {
    try {
      await this.asyncOperation()
      next()
    } catch (error) {
      next(error) // Pass error to error handler
    }
  }
}
```

### 3. **Memory Leaks trong Global State**

```typescript
// ❌ Sai - Memory leak potential
@Injectable()
export class LeakyMiddleware implements NestMiddleware {
  private requests = [] // Never cleaned up!

  use(req: Request, res: Response, next: NextFunction) {
    this.requests.push(req) // Memory leak!
    next()
  }
}

// ✅ Đúng - Proper cleanup
@Injectable()
export class CleanMiddleware implements NestMiddleware {
  private requests = new Map<string, Date>()

  use(req: Request, res: Response, next: NextFunction) {
    const now = new Date()
    this.requests.set(req.ip, now)

    // Cleanup old entries
    this.cleanup()
    next()
  }

  private cleanup() {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000)
    for (const [ip, time] of this.requests.entries()) {
      if (time < oneHourAgo) {
        this.requests.delete(ip)
      }
    }
  }
}
```

## 📝 Best Practices

### ✅ **DO's**

- Luôn call `next()` hoặc send response
- Handle errors properly trong async middleware
- Keep middleware focused và lightweight
- Use dependency injection cho shared services
- Cleanup resources để avoid memory leaks

### ❌ **DON'T's**

- Đừng modify request/response unnecessarily
- Đừng perform heavy computations
- Đừng block request pipeline quá lâu
- Đừng assume request order

## 📋 Tóm tắt

> **Nhớ:** Middleware chạy đầu tiên trong request pipeline

### Khi nào sử dụng Middleware:

- ✅ **Request logging**
- ✅ **CORS handling**
- ✅ **Security headers**
- ✅ **Rate limiting**
- ✅ **Request preprocessing**
- ✅ **Global authentication**
