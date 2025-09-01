# Pipes trong NestJS

Những vấn đề thường gặp và best practices khi làm việc với Pipes.

## 🔍 Pipe là gì?

Pipes trong NestJS là classes implement `PipeTransform` interface, execute **trước khi data đến controller method**. Chúng được execute **sau Guards và Interceptors**.

### Pipes có 2 use cases chính:

- **Transformation**: Transform input data thành desired format (string → number, DTO conversion)
- **Validation**: Validate input data, throw exception nếu invalid

### Cách hoạt động:

```
Request → Middleware → Guards → Interceptors → Pipes → Controller
                                              ↑
                                    Validate & Transform
```

### Execution Order:

```typescript
@UseGuards(AuthGuard)           // 1. First
@UseInterceptors(LogInterceptor) // 2. Second
@Post(':id')                     // 3. Route
create(
  @Param('id', ParseIntPipe)     // 4. Param pipe
  id: number,
  @Body(ValidationPipe)          // 5. Body pipe
  dto: CreateDto
) {}
```

## 🎯 Cách sử dụng Built-in Pipes

### 1. **ValidationPipe** - Validate DTO

```typescript
// Global validation (recommended)
// main.ts
app.useGlobalPipes(new ValidationPipe({
  whitelist: true,              // Remove unknown properties
  forbidNonWhitelisted: true,   // Throw error for unknown properties
  transform: true,              // Auto transform types
}));

// Method level
@Post()
create(@Body(ValidationPipe) createDto: CreateUserDto) {}

// Parameter level với custom config
@Post()
create(@Body(new ValidationPipe({ groups: ['create'] })) dto: CreateUserDto) {}
```

### 2. **ParseIntPipe** - Transform string to number

```typescript
// Basic usage
@Get(':id')
findOne(@Param('id', ParseIntPipe) id: number) {}

// With custom error message
@Get(':id')
findOne(
  @Param('id', new ParseIntPipe({ errorHttpStatusCode: HttpStatus.NOT_ACCEPTABLE }))
  id: number
) {}

// With default value
@Get()
findAll(@Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number) {}
```

### 3. **ParseUUIDPipe** - Validate UUID format

```typescript
@Get(':uuid')
findByUuid(@Param('uuid', ParseUUIDPipe) uuid: string) {}

// Specific UUID version
@Get(':uuid')
findByUuid(
  @Param('uuid', new ParseUUIDPipe({ version: '4' }))
  uuid: string
) {}
```

### 4. **ParseBoolPipe** - Transform string to boolean

```typescript
@Get()
findAll(@Query('active', ParseBoolPipe) active: boolean) {}
// ?active=true → true
// ?active=false → false
// ?active=1 → true
// ?active=0 → false
```

### 5. **ParseArrayPipe** - Transform string to array

```typescript
@Get()
findAll(
  @Query('ids', new ParseArrayPipe({ items: Number, separator: ',' }))
  ids: number[]
) {}
// ?ids=1,2,3 → [1, 2, 3]
```

## 🔧 Custom Pipes Implementation

### 1. **Basic Custom Pipe**

```typescript
@Injectable()
export class CustomValidationPipe implements PipeTransform {
  transform(value: any, metadata: ArgumentMetadata) {
    // Validate và transform logic here
    console.log('Pipe metadata:', metadata)
    // metadata.type: 'body' | 'query' | 'param' | 'custom'
    // metadata.metatype: Class constructor
    // metadata.data: decorator parameter

    return value
  }
}
```

**Cách sử dụng:**

```typescript
// Method level
@Post()
create(@Body(CustomValidationPipe) dto: CreateUserDto) {}

// Global level
// main.ts
app.useGlobalPipes(new CustomValidationPipe());

// Provider level
providers: [
  {
    provide: APP_PIPE,
    useClass: CustomValidationPipe,
  },
]
```

### 2. **Trim Pipe**

```typescript
@Injectable()
export class TrimPipe implements PipeTransform {
  transform(value: any): any {
    if (typeof value === 'string') {
      return value.trim()
    }

    if (typeof value === 'object' && value !== null) {
      return this.trimObject(value)
    }

    return value
  }

  private trimObject(obj: any): any {
    const trimmed = {}
    for (const key in obj) {
      if (typeof obj[key] === 'string') {
        trimmed[key] = obj[key].trim()
      } else {
        trimmed[key] = obj[key]
      }
    }
    return trimmed
  }
}
```

**Cách sử dụng:**

```typescript
// Apply cho body để trim tất cả string fields
@Post()
create(@Body(TrimPipe, ValidationPipe) dto: CreateUserDto) {}

// Apply global để trim tất cả inputs
app.useGlobalPipes(new TrimPipe());

// Kết quả:
// Input: { name: "  John  ", email: " john@email.com " }
// Output: { name: "John", email: "john@email.com" }
```

### 3. **Default Value Pipe**

```typescript
@Injectable()
export class DefaultValuePipe implements PipeTransform {
  constructor(private defaultValue: any) {}

  transform(value: any): any {
    return value !== undefined && value !== null ? value : this.defaultValue
  }
}
```

**Cách sử dụng:**

```typescript
// Set default values cho query parameters
@Get()
findAll(
  @Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number,
  @Query('limit', new DefaultValuePipe(10), ParseIntPipe) limit: number,
) {}

// URL: /users → page=1, limit=10
// URL: /users?page=2 → page=2, limit=10
// URL: /users?page=2&limit=20 → page=2, limit=20
```

## ⚠️ Các vấn đề thường gặp

### 1. **Global ValidationPipe Configuration**

```typescript
// main.ts - Cấu hình global validation
app.useGlobalPipes(
  new ValidationPipe({
    // Tự động remove properties không có trong DTO
    whitelist: true,

    // Throw error nếu có extra properties
    forbidNonWhitelisted: true,

    // Tự động transform types
    transform: true,

    // Transform primitive types
    transformOptions: {
      enableImplicitConversion: true,
    },

    // Disable detailed errors in production
    disableErrorMessages: process.env.NODE_ENV === 'production',
  }),
)
```

### 2. **DTO Validation Issues**

```typescript
// ❌ Sai - Không validate nested objects
export class CreateUserDto {
  @IsString()
  name: string

  // Thiếu validation cho nested object
  address: AddressDto
}

// ✅ Đúng - Validate nested objects
export class CreateUserDto {
  @IsString()
  name: string

  @ValidateNested()
  @Type(() => AddressDto)
  address: AddressDto
}

export class AddressDto {
  @IsString()
  street: string

  @IsString()
  city: string
}
```

### 3. **Array Validation**

```typescript
// ✅ Validate array of primitives
export class CreateUsersDto {
  @IsArray()
  @IsString({ each: true })
  names: string[]
}

// ✅ Validate array of objects
export class CreateUsersDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateUserDto)
  users: CreateUserDto[]
}
```

### 4. **Optional vs Required Fields**

```typescript
export class UpdateUserDto {
  @IsOptional()
  @IsString()
  name?: string

  @IsOptional()
  @IsEmail()
  email?: string

  // ❌ Sai - IsOptional() phải đứng trước
  @IsString()
  @IsOptional()
  wrongOrder?: string
}
```

## 🔧 Custom Pipe Examples

### 1. **Trim Pipe**

```typescript
@Injectable()
export class TrimPipe implements PipeTransform {
  transform(value: any): any {
    if (typeof value === 'string') {
      return value.trim()
    }

    if (typeof value === 'object' && value !== null) {
      return this.trimObject(value)
    }

    return value
  }

  private trimObject(obj: any): any {
    const trimmed = {}
    for (const key in obj) {
      if (typeof obj[key] === 'string') {
        trimmed[key] = obj[key].trim()
      } else {
        trimmed[key] = obj[key]
      }
    }
    return trimmed
  }
}
```

### 2. **Default Value Pipe**

```typescript
@Injectable()
export class DefaultValuePipe implements PipeTransform {
  constructor(private defaultValue: any) {}

  transform(value: any): any {
    return value !== undefined && value !== null ? value : this.defaultValue;
  }
}

// Sử dụng
@Get()
findAll(@Query('page', new DefaultValuePipe(1), ParseIntPipe) page: number) {}
```

### 3. **File Validation Pipe**

```typescript
@Injectable()
export class FileValidationPipe implements PipeTransform {
  constructor(
    private maxSize: number = 5 * 1024 * 1024, // 5MB
    private allowedTypes: string[] = ['image/jpeg', 'image/png'],
  ) {}

  transform(file: Express.Multer.File): Express.Multer.File {
    if (!file) {
      throw new BadRequestException('File is required')
    }

    if (file.size > this.maxSize) {
      throw new BadRequestException('File too large')
    }

    if (!this.allowedTypes.includes(file.mimetype)) {
      throw new BadRequestException('Invalid file type')
    }

    return file
  }
}
```

## 🎭 Pipe Binding Scope

### Method Level

```typescript
@Post()
create(@Body(new ValidationPipe()) createDto: CreateUserDto) {}
```

### Parameter Level

```typescript
@Get(':id')
findOne(@Param('id', ParseIntPipe) id: number) {}
```

### Global Level

```typescript
// main.ts
app.useGlobalPipes(new ValidationPipe())

// hoặc trong module
providers: [
  {
    provide: APP_PIPE,
    useClass: ValidationPipe,
  },
]
```

## 🔄 Execution Order

```typescript
// Thứ tự thực thi: Guards → Interceptors → Pipes → Controller → Interceptors
@UseGuards(AuthGuard)
@UseInterceptors(LoggingInterceptor)
@Post()
create(@Body(ValidationPipe) dto: CreateDto) {
  // Controller logic
}
```

## 📝 Best Practices

### ✅ **DO's**

- Luôn validate input data
- Sử dụng `whitelist: true` để remove extra properties
- Transform data types khi cần thiết
- Throw meaningful error messages
- Use `@IsOptional()` cho optional fields

### ❌ **DON'T's**

- Đừng skip validation cho sensitive endpoints
- Đừng transform data không cần thiết
- Đừng validate trong controller (dùng Pipe)
- Đừng quên validate nested objects

## 🚨 Common Pitfalls

### 1. **Forgot to enable transform**

```typescript
// ❌ Sai - Không enable transform
app.useGlobalPipes(new ValidationPipe())

// ✅ Đúng
app.useGlobalPipes(
  new ValidationPipe({
    transform: true,
  }),
)
```

### 2. **Wrong pipe order**

```typescript
// ❌ Sai - ValidationPipe trước ParseIntPipe
@Get(':id')
findOne(@Param('id', ValidationPipe, ParseIntPipe) id: number) {}

// ✅ Đúng - ParseIntPipe trước ValidationPipe
@Get(':id')
findOne(@Param('id', ParseIntPipe, ValidationPipe) id: number) {}
```

## 📋 Tóm tắt

> **Nhớ:** Pipes chạy trước khi data đến controller method

### Khi nào sử dụng Pipes:

- ✅ **Input validation**
- ✅ **Data transformation**
- ✅ **Type conversion**
- ✅ **Data sanitization**
- ✅ **Default value assignment**
