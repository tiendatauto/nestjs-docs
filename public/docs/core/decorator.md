# Decorators trong NestJS

Các vấn đề thường gặp và best practices khi làm việc với Decorators.

## 🔍 Decorators là gì?

Decorators trong NestJS là **functions** được execute tại **compile time** để add metadata hoặc modify behavior. Chúng là foundation của NestJS architecture.

### Decorators được sử dụng cho:

- **Classes** (Controllers, Services, Modules) - Define class purpose và configuration
- **Methods** (Route handlers) - Define HTTP routes và apply middleware
- **Properties** (Dependency injection) - Configure how dependencies are injected
- **Parameters** (Request data extraction) - Extract data từ HTTP request

### Cách hoạt động:

```typescript
@Controller('users') // 1. Class decorator - define route prefix
export class UserController {
  @Get(':id') // 2. Method decorator - define route
  @UseGuards(AuthGuard) // 3. Method decorator - apply guard
  findOne(
    @Param('id') id: string, // 4. Parameter decorator - extract route param
    @Query('include') include: string, // 5. Parameter decorator - extract query
  ) {}
}
```

### Execution Time:

- **Decorators execute at compile time** (khi class được defined)
- **Metadata được store** và used by NestJS at runtime
- **Functions decorated được call** at runtime when needed

## 🎯 Cách sử dụng Built-in Decorators

### 1. **Class Decorators**

```typescript
@Controller('users') // Route prefix
export class UserController {}

@Injectable() // Mark as provider for DI
export class UserService {}

@Module({
  // Module configuration
  controllers: [UserController],
  providers: [UserService],
})
export class UserModule {}

@Catch(HttpException) // Exception filter
export class HttpExceptionFilter {}
```

**Cách sử dụng:**

```typescript
// @Controller tự động register routes
@Controller('api/v1/users')  // Base path: /api/v1/users
export class UserController {
  @Get()          // Route: GET /api/v1/users
  @Get(':id')     // Route: GET /api/v1/users/:id
  @Post()         // Route: POST /api/v1/users
}

// @Injectable enable dependency injection
@Injectable()
export class UserService {
  constructor(private userRepository: UserRepository) {}
}
```

### 2. **Method Decorators**

```typescript
@Get('profile')         // HTTP GET method
@Post('create')         // HTTP POST method
@Put(':id')            // HTTP PUT with parameter
@Delete(':id')         // HTTP DELETE with parameter
@Patch(':id')          // HTTP PATCH with parameter

@UseGuards(AuthGuard)  // Apply authentication
@UsePipes(ValidationPipe) // Apply validation
@UseInterceptors(LoggingInterceptor) // Apply logging
@UseFilters(HttpExceptionFilter) // Apply error handling

@HttpCode(201)         // Custom status code
@Header('Cache-Control', 'none') // Custom header
@Redirect('https://nestjs.com', 301) // Redirect response
```

**Cách sử dụng:**

```typescript
@Controller('users')
export class UserController {
  @Get()
  @UseInterceptors(CacheInterceptor)
  @HttpCode(200)
  findAll() {
    // This method will be cached and return status 200
    return this.userService.findAll()
  }

  @Post()
  @UseGuards(AuthGuard)
  @UsePipes(ValidationPipe)
  @HttpCode(201)
  create(@Body() createUserDto: CreateUserDto) {
    // This method requires authentication, validates input, returns 201
    return this.userService.create(createUserDto)
  }
}
```

### 3. **Property Decorators**

```typescript
@Inject('CONFIG')       // Custom provider injection
@InjectRepository(User) // TypeORM repository injection
@Optional()            // Optional dependency
@Self()               // Inject from current injector only
```

**Cách sử dụng:**

```typescript
@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,

    @Inject('DATABASE_CONFIG')
    private dbConfig: DatabaseConfig,

    @Optional()
    @Inject('CACHE_SERVICE')
    private cacheService?: CacheService,
  ) {}
}
```

### 4. **Parameter Decorators**

```typescript
@Body()                    // Entire request body
@Body('name')              // Specific body property
@Param()                   // All route parameters
@Param('id')               // Specific route parameter
@Query()                   // All query parameters
@Query('page')             // Specific query parameter
@Headers()                 // All headers
@Headers('authorization')  // Specific header
@Req()                     // Raw request object
@Res()                     // Raw response object
@Session()                 // Session object
@Ip()                      // Client IP address
```

**Cách sử dụng:**

```typescript
@Controller('users')
export class UserController {
  @Get(':id')
  findOne(
    @Param('id', ParseIntPipe) id: number, // /users/123 → id = 123 (number)
    @Query('include') include?: string, // ?include=posts → include = "posts"
    @Headers('authorization') auth?: string, // Authorization header
  ) {
    return this.userService.findOne(id, { include })
  }

  @Post()
  create(
    @Body() createUserDto: CreateUserDto, // Request body as DTO
    @Req() request: Request, // Raw Express request
    @Ip() clientIp: string, // Client IP address
  ) {
    return this.userService.create(createUserDto, clientIp)
  }

  @Get()
  findAll(
    @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number, // Default page = 1
    @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number, // Default limit = 10
    @Query() filters: any, // All query parameters
  ) {
    return this.userService.findAll({ page, limit, ...filters })
  }
}
```

## ⚠️ Các vấn đề thường gặp

### 1. **Parameter Decorator Order**

```typescript
// ❌ Sai - Wrong order có thể cause issues
@Post(':id')
create(
  @Body(ValidationPipe) dto: CreateDto,
  @Param('id', ParseIntPipe) id: number,
) {}

// ✅ Đúng - Consistent parameter order
@Post(':id')
create(
  @Param('id', ParseIntPipe) id: number,
  @Body(ValidationPipe) dto: CreateDto,
) {}
```

### 2. **Custom Decorator Implementation**

```typescript
// ❌ Sai - Không handle edge cases
export const User = createParamDecorator((data: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest()
  return request.user // What if user is undefined?
})

// ✅ Đúng - Handle edge cases
export const User = createParamDecorator((data: keyof UserEntity | undefined, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest()
  const user = request.user

  if (!user) {
    throw new UnauthorizedException('User not found in request')
  }

  return data ? user[data] : user
})
```

### 3. **Validation Decorator Issues**

```typescript
// ❌ Sai - Thiếu validation cho nested properties
export class CreateUserDto {
  @IsString()
  name: string

  // Missing validation
  address: {
    street: string
    city: string
  }
}

// ✅ Đúng - Proper nested validation
export class CreateUserDto {
  @IsString()
  name: string

  @ValidateNested()
  @Type(() => AddressDto)
  address: AddressDto
}
```

## 🔧 Custom Decorators

### 1. **Auth Decorator**

```typescript
export const Auth = (...roles: string[]) => {
  return applyDecorators(
    SetMetadata('roles', roles),
    UseGuards(AuthGuard, RolesGuard),
    ApiBearerAuth(),
  );
};

// Usage
@Auth('admin', 'user')
@Get('profile')
getProfile() {}
```

### 2. **API Response Decorator**

```typescript
export const ApiResponseDto = <T>(
  model: new () => T,
  status: number = 200,
) => {
  return applyDecorators(
    ApiResponse({
      status,
      description: 'Success',
      type: model,
    }),
    ApiResponse({
      status: 400,
      description: 'Bad Request',
    }),
    ApiResponse({
      status: 500,
      description: 'Internal Server Error',
    }),
  );
};

// Usage
@ApiResponseDto(UserResponseDto)
@Get(':id')
findOne() {}
```

### 3. **Logging Decorator**

```typescript
export const LogExecution = (target: any, propertyName: string, descriptor: PropertyDescriptor) => {
  const method = descriptor.value

  descriptor.value = async function (...args: any[]) {
    const start = Date.now()
    console.log(`Starting ${propertyName}`)

    try {
      const result = await method.apply(this, args)
      console.log(`${propertyName} completed in ${Date.now() - start}ms`)
      return result
    } catch (error) {
      console.error(`${propertyName} failed in ${Date.now() - start}ms`, error)
      throw error
    }
  }
}

// Usage
export class UserService {
  @LogExecution
  async findUser(id: number) {
    // Method implementation
  }
}
```

### 4. **Cache Decorator**

```typescript
const CACHE_KEY_METADATA = 'cache_key'

export const Cache = (key: string, ttl: number = 300) => {
  return (target: any, propertyName: string, descriptor: PropertyDescriptor) => {
    Reflect.defineMetadata(CACHE_KEY_METADATA, { key, ttl }, descriptor.value)
  }
}

// Usage với interceptor
@Injectable()
export class CacheInterceptor implements NestInterceptor {
  constructor(private cacheService: CacheService) {}

  async intercept(context: ExecutionContext, next: CallHandler): Promise<Observable<any>> {
    const handler = context.getHandler()
    const cacheMetadata = Reflect.getMetadata(CACHE_KEY_METADATA, handler)

    if (cacheMetadata) {
      const cachedValue = await this.cacheService.get(cacheMetadata.key)
      if (cachedValue) {
        return of(cachedValue)
      }
    }

    return next.handle()
  }
}
```

## 🎭 Method Decorators Combination

### 1. **Order Matters**

```typescript
// Decorators execute bottom-up
@UseGuards(AuthGuard)     // 3. Third
@UseInterceptors(Logger)  // 2. Second
@UsePipes(ValidationPipe) // 1. First
@Post()
create() {}
```

### 2. **Common Combinations**

```typescript
@ApiTags('Users')
@Controller('users')
export class UsersController {
  @ApiOperation({ summary: 'Create user' })
  @ApiResponse({ status: 201, type: UserResponseDto })
  @UseGuards(AuthGuard)
  @UsePipes(new ValidationPipe({ transform: true }))
  @Post()
  async create(@Body() dto: CreateUserDto) {}

  @ApiOperation({ summary: 'Get user by ID' })
  @UseGuards(AuthGuard)
  @Get(':id')
  async findOne(@Param('id', ParseUUIDPipe) id: string) {}
}
```

## 🔍 Metadata và Reflection

### 1. **Setting Metadata**

```typescript
export const Roles = (...roles: string[]) => SetMetadata('roles', roles);

// Usage
@Roles('admin', 'moderator')
@Get('admin-only')
adminEndpoint() {}
```

### 2. **Reading Metadata trong Guard**

```typescript
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>('roles', [
      context.getHandler(),
      context.getClass(),
    ])

    if (!requiredRoles) {
      return true
    }

    const { user } = context.switchToHttp().getRequest()
    return requiredRoles.some((role) => user.roles?.includes(role))
  }
}
```

### 3. **Custom Metadata Keys**

```typescript
export const IS_PUBLIC_KEY = 'isPublic'
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true)

// Check trong AuthGuard
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ])

    if (isPublic) {
      return true
    }

    // Check authentication
    return this.validateToken(context)
  }
}
```

## 🚨 Common Pitfalls

### 1. **Decorator Execution Context**

```typescript
// ❌ Sai - Accessing service trong decorator definition
@Controller('users')
export class UsersController {
  constructor(private userService: UserService) {}

  // This won't work - decorator executes before DI
  @SetMetadata('service', this.userService) // undefined!
  @Get()
  findAll() {}
}

// ✅ Đúng - Use metadata hoặc factory pattern
const ServiceMetadata = (serviceName: string) => SetMetadata('serviceName', serviceName);

@ServiceMetadata('UserService')
@Get()
findAll() {}
```

### 2. **Parameter Decorator Validation**

```typescript
// ❌ Sai - Không validate extracted data
export const UserId = createParamDecorator((data: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest()
  return request.user?.id // Might be undefined
})

// ✅ Đúng - Validate extracted data
export const UserId = createParamDecorator((data: unknown, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest()
  const userId = request.user?.id

  if (!userId) {
    throw new UnauthorizedException('User ID not found')
  }

  return userId
})
```

### 3. **Composition Decorator Issues**

```typescript
// ❌ Sai - Không reusable
@UseGuards(AuthGuard)
@UseGuards(RolesGuard)
@SetMetadata('roles', ['admin'])
@ApiBearerAuth()
@Get('admin')
adminEndpoint() {}

// ✅ Đúng - Reusable composition
export const AdminOnly = () => applyDecorators(
  SetMetadata('roles', ['admin']),
  UseGuards(AuthGuard, RolesGuard),
  ApiBearerAuth(),
);

@AdminOnly()
@Get('admin')
adminEndpoint() {}
```

## 📝 Best Practices

### ✅ **DO's**

- Use built-in decorators khi có thể
- Create reusable composite decorators
- Validate data trong custom parameter decorators
- Use meaningful decorator names
- Handle edge cases trong custom decorators

### ❌ **DON'T's**

- Đừng access DI container trong decorator definition
- Đừng create overly complex decorators
- Đừng ignore decorator execution order
- Đừng forget error handling

## 🔧 Testing Decorators

### 1. **Testing Custom Decorators**

```typescript
describe('UserId Decorator', () => {
  let mockExecutionContext: ExecutionContext

  beforeEach(() => {
    mockExecutionContext = {
      switchToHttp: () => ({
        getRequest: () => ({
          user: { id: '123' },
        }),
      }),
    } as ExecutionContext
  })

  it('should extract user ID from request', () => {
    const factory = UserIdDecorator[PARAMTYPES_METADATA]
    const result = factory(null, mockExecutionContext)

    expect(result).toBe('123')
  })
})
```

### 2. **Testing Metadata**

```typescript
describe('Roles Decorator', () => {
  it('should set roles metadata', () => {
    @Roles('admin', 'user')
    class TestController {
      testMethod() {}
    }

    const roles = Reflect.getMetadata('roles', TestController)
    expect(roles).toEqual(['admin', 'user'])
  })
})
```

## 📋 Tóm tắt

> **Nhớ:** Decorators add metadata và behavior, không thay đổi core logic

### Khi nào sử dụng Custom Decorators:

- ✅ **Reusable authentication/authorization**
- ✅ **API documentation consistency**
- ✅ **Common validation patterns**
- ✅ **Cross-cutting concerns**
- ✅ **Reduce code duplication**
