# Dependency Injection trong NestJS

Các vấn đề thường gặp và best practices khi làm việc với DI trong NestJS.

## 🔍 Dependency Injection là gì?

Dependency Injection (DI) trong NestJS là design pattern cho phép **inject dependencies** vào classes thay vì tự tạo trong class. NestJS có built-in **IoC (Inversion of Control) container** quản lý việc này.

### DI trong NestJS cho phép:

- **Automatic resolution** của dependencies - NestJS tự động resolve và inject
- **Loose coupling** giữa các components - Classes không depend vào concrete implementations
- **Easy testing** với mock dependencies - Dễ dàng replace dependencies trong tests
- **Centralized configuration** của services - Manage dependencies ở module level
- **Lifecycle management** - NestJS quản lý creation và destruction của instances

### Cách hoạt động:

```typescript
// 1. NestJS scan và register providers
@Injectable()
export class UserService {}

@Module({
  providers: [UserService], // 2. Register trong DI container
})
export class UserModule {}

// 3. Automatic injection khi needed
@Controller('users')
export class UserController {
  constructor(private userService: UserService) {} // 4. Auto-injected
}
```

### DI Container Lifecycle:

```
App Start → Scan Modules → Register Providers → Resolve Dependencies → Inject → Ready
```

## 🎯 Cách sử dụng Provider Types

### 1. **Class Providers (Standard)**

```typescript
// Basic class provider
@Injectable()
export class UserService {
  findAll() {
    return []
  }
}

// Register trong module
@Module({
  providers: [UserService], // Shorthand syntax
  // Tương đương với:
  // providers: [{ provide: UserService, useClass: UserService }]
})
export class UserModule {}
```

**Cách sử dụng:**

```typescript
// Automatic injection trong constructor
@Controller('users')
export class UserController {
  constructor(private userService: UserService) {}

  @Get()
  findAll() {
    return this.userService.findAll() // Use injected service
  }
}

// Custom provider syntax khi cần logic khác
providers: [
  {
    provide: UserService,
    useClass: process.env.NODE_ENV === 'test' ? MockUserService : UserService,
  },
]
```

### 2. **Value Providers (Constants/Mocks)**

```typescript
const DATABASE_CONFIG = {
  host: 'localhost',
  port: 5432,
  username: 'user',
  password: 'pass',
}

const mockUserService = {
  findAll: () => ['mock user'],
  findOne: (id: string) => ({ id, name: 'Mock User' }),
}
```

**Cách sử dụng:**

```typescript
// Register value providers
@Module({
  providers: [
    {
      provide: 'DATABASE_CONFIG',
      useValue: DATABASE_CONFIG,
    },
    {
      provide: UserService,
      useValue: mockUserService, // Use mock cho testing
    },
  ],
})
export class TestModule {}

// Inject using custom token
@Injectable()
export class DatabaseService {
  constructor(
    @Inject('DATABASE_CONFIG')
    private config: typeof DATABASE_CONFIG,
  ) {
    console.log(`Connecting to ${config.host}:${config.port}`)
  }
}
```

### 3. **Factory Providers (Dynamic Creation)**

```typescript
// Factory provider cho complex initialization
providers: [
  {
    provide: 'DATABASE_CONNECTION',
    useFactory: async (configService: ConfigService) => {
      const connectionString = configService.get('DATABASE_URL')
      const connection = await createConnection(connectionString)
      return connection
    },
    inject: [ConfigService], // Dependencies cần cho factory
  },
]
```

**Cách sử dụng:**

```typescript
// Use factory result
@Injectable()
export class UserRepository {
  constructor(
    @Inject('DATABASE_CONNECTION')
    private connection: Connection,
  ) {}

  async findAll() {
    return this.connection.query('SELECT * FROM users')
  }
}

// Factory với conditional logic
providers: [
  {
    provide: 'LOGGER',
    useFactory: (configService: ConfigService) => {
      const logLevel = configService.get('LOG_LEVEL')
      return logLevel === 'debug' ? new DebugLogger() : new ProductionLogger()
    },
    inject: [ConfigService],
  },
]
```

### 4. **Async Providers (Async Initialization)**

```typescript
providers: [
  {
    provide: 'ASYNC_SERVICE',
    useFactory: async () => {
      // Async operations
      const connection = await connectToDatabase()
      const cache = await initializeCache()
      return new DatabaseService(connection, cache)
    },
  },
]
```

**Cách sử dụng:**

```typescript
// NestJS sẽ wait cho async provider complete trước khi start app
@Injectable()
export class AppService {
  constructor(
    @Inject('ASYNC_SERVICE')
    private asyncService: DatabaseService,
  ) {}

  async getHealth() {
    return this.asyncService.checkConnection()
  }
}

// Async factory với dependencies
providers: [
  {
    provide: 'INITIALIZED_SERVICE',
    useFactory: async (configService: ConfigService, logger: Logger) => {
      logger.log('Initializing service...')
      const config = await configService.loadAsync()
      return new MyService(config)
    },
    inject: [ConfigService, Logger],
  },
]
```

### 3. **Factory Providers**

```typescript
providers: [
  {
    provide: 'DATABASE_CONNECTION',
    useFactory: async (configService: ConfigService) => {
      const connectionString = configService.get('DATABASE_URL')
      return await createConnection(connectionString)
    },
    inject: [ConfigService],
  },
]
```

### 4. **Async Providers**

```typescript
providers: [
  {
    provide: 'ASYNC_SERVICE',
    useFactory: async () => {
      const connection = await connectToDatabase()
      return new DatabaseService(connection)
    },
  },
]
```

## ⚠️ Các vấn đề thường gặp

### 1. **Circular Dependencies**

```typescript
// ❌ Sai - Circular dependency
@Injectable()
export class UserService {
  constructor(private postService: PostService) {}
}

@Injectable()
export class PostService {
  constructor(private userService: UserService) {} // Circular!
}

// ✅ Đúng - Break circular dependency
@Injectable()
export class UserService {
  constructor(
    @Inject(forwardRef(() => PostService))
    private postService: PostService,
  ) {}
}

@Injectable()
export class PostService {
  constructor(
    @Inject(forwardRef(() => UserService))
    private userService: UserService,
  ) {}
}
```

### 2. **Scope Issues**

```typescript
// ❌ Sai - Request scope có thể cause performance issues
@Injectable({ scope: Scope.REQUEST })
export class ExpensiveService {
  // This creates new instance per request
}

// ✅ Đúng - Use singleton scope cho expensive services
@Injectable({ scope: Scope.DEFAULT }) // Singleton
export class ExpensiveService {
  // Shared instance across all requests
}
```

### 3. **Missing Provider Registration**

```typescript
// ❌ Sai - Service not registered
@Module({
  controllers: [UserController],
  // Missing UserService in providers!
})
export class UserModule {}

// ✅ Đúng - Register all providers
@Module({
  controllers: [UserController],
  providers: [UserService], // Add to providers
})
export class UserModule {}
```

## 🔧 Advanced DI Patterns

### 1. **Custom Tokens**

```typescript
// String token
export const DATABASE_CONFIG = 'DATABASE_CONFIG'

providers: [
  {
    provide: DATABASE_CONFIG,
    useValue: {
      host: 'localhost',
      port: 5432,
    },
  },
]

// Injection
@Injectable()
export class DatabaseService {
  constructor(
    @Inject(DATABASE_CONFIG)
    private config: DatabaseConfig,
  ) {}
}
```

### 2. **Dynamic Providers**

```typescript
export const createDatabaseProviders = (entities: any[]): Provider[] => {
  return entities.map((entity) => ({
    provide: `${entity.name}Repository`,
    useFactory: (connection: Connection) => connection.getRepository(entity),
    inject: ['DATABASE_CONNECTION'],
  }))
}

// Usage trong module
@Module({
  providers: [...createDatabaseProviders([User, Post, Comment])],
})
export class DatabaseModule {}
```

### 3. **Optional Dependencies**

```typescript
@Injectable()
export class UserService {
  constructor(
    private userRepository: UserRepository,
    @Optional()
    @Inject('CACHE_SERVICE')
    private cacheService?: CacheService,
  ) {}

  async findUser(id: string) {
    // Use cache if available
    if (this.cacheService) {
      const cached = await this.cacheService.get(id)
      if (cached) return cached
    }

    return this.userRepository.findById(id)
  }
}
```

### 4. **Self-Injection**

```typescript
@Injectable()
export class UserService {
  constructor(
    @Inject(forwardRef(() => UserService))
    private self?: UserService,
  ) {}

  // Use self for method delegation or proxy patterns
}
```

## 🏗️ Module Patterns

### 1. **Feature Module**

```typescript
@Module({
  controllers: [UserController],
  providers: [UserService, UserRepository],
  exports: [UserService], // Export for other modules
})
export class UserModule {}
```

### 2. **Global Module**

```typescript
@Global()
@Module({
  providers: [
    {
      provide: 'LOGGER',
      useClass: WinstonLogger,
    },
  ],
  exports: ['LOGGER'],
})
export class LoggerModule {}
```

### 3. **Dynamic Module**

```typescript
@Module({})
export class ConfigModule {
  static forRoot(options: ConfigOptions): DynamicModule {
    return {
      module: ConfigModule,
      providers: [
        {
          provide: 'CONFIG_OPTIONS',
          useValue: options,
        },
        ConfigService,
      ],
      exports: [ConfigService],
      global: true,
    }
  }
}

// Usage
@Module({
  imports: [
    ConfigModule.forRoot({
      envFilePath: '.env',
    }),
  ],
})
export class AppModule {}
```

### 4. **Async Module Configuration**

```typescript
@Module({})
export class DatabaseModule {
  static forRootAsync(options: {
    useFactory: (...args: any[]) => Promise<DatabaseConfig>
    inject?: any[]
  }): DynamicModule {
    return {
      module: DatabaseModule,
      providers: [
        {
          provide: 'DATABASE_CONFIG',
          useFactory: options.useFactory,
          inject: options.inject || [],
        },
        DatabaseService,
      ],
      exports: [DatabaseService],
    }
  }
}

// Usage
DatabaseModule.forRootAsync({
  useFactory: async (configService: ConfigService) => ({
    url: configService.get('DATABASE_URL'),
  }),
  inject: [ConfigService],
})
```

## 🧪 Testing với DI

### 1. **Unit Testing với Mocks**

```typescript
describe('UserService', () => {
  let service: UserService
  let mockRepository: jest.Mocked<UserRepository>

  beforeEach(async () => {
    const mockRepo = {
      findById: jest.fn(),
      save: jest.fn(),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UserService,
        {
          provide: UserRepository,
          useValue: mockRepo,
        },
      ],
    }).compile()

    service = module.get<UserService>(UserService)
    mockRepository = module.get(UserRepository)
  })

  it('should find user by id', async () => {
    const user = { id: '1', name: 'John' }
    mockRepository.findById.mockResolvedValue(user)

    const result = await service.findById('1')
    expect(result).toEqual(user)
  })
})
```

### 2. **Integration Testing**

```typescript
describe('UserController (e2e)', () => {
  let app: INestApplication
  let userService: UserService

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [UserModule],
    }).compile()

    app = moduleFixture.createNestApplication()
    userService = moduleFixture.get<UserService>(UserService)
    await app.init()
  })

  it('/users (GET)', () => {
    return request(app.getHttpServer()).get('/users').expect(200).expect(userService.findAll())
  })
})
```

## 🔍 Custom Decorators cho DI

### 1. **Repository Decorator**

```typescript
export const InjectRepository = (entity: any) => Inject(`${entity.name}Repository`)

// Usage
@Injectable()
export class UserService {
  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
  ) {}
}
```

### 2. **Config Decorator**

```typescript
export const InjectConfig = (key: string) => Inject(`CONFIG_${key.toUpperCase()}`)

// Usage
@Injectable()
export class DatabaseService {
  constructor(
    @InjectConfig('database')
    private dbConfig: DatabaseConfig,
  ) {}
}
```

## 🚨 Common Pitfalls

### 1. **Provider Not Found**

```typescript
// ❌ Lỗi: "Nest can't resolve dependencies"
@Injectable()
export class UserService {
  constructor(
    private someService: SomeService, // Not registered anywhere!
  ) {}
}

// ✅ Fix: Register provider
@Module({
  providers: [UserService, SomeService],
})
export class UserModule {}
```

### 2. **Wrong Injection Token**

```typescript
// ❌ Sai token
@Injectable()
export class UserService {
  constructor(
    @Inject('WRONG_TOKEN')
    private service: SomeService,
  ) {}
}

// ✅ Đúng token
providers: [
  {
    provide: 'CORRECT_TOKEN',
    useClass: SomeService,
  },
]
```

### 3. **Scope Mismatch**

```typescript
// ❌ REQUEST scope service inject SINGLETON
@Injectable({ scope: Scope.REQUEST })
export class RequestService {
  constructor(
    private singletonService: SingletonService, // OK
  ) {}
}

@Injectable() // DEFAULT = SINGLETON
export class SingletonService {
  constructor(
    private requestService: RequestService, // ERROR!
  ) {}
}
```

## 📝 Best Practices

### ✅ **DO's**

- Use constructor injection
- Make dependencies explicit
- Use interfaces cho loose coupling
- Register all providers properly
- Use appropriate scopes

### ❌ **DON'T's**

- Đừng create circular dependencies
- Đừng inject REQUEST scope vào SINGLETON
- Đừng use service locator pattern
- Đừng modify providers at runtime

## 📋 Tóm tắt

> **Nhớ:** DI container manages object lifecycle và dependencies

### Khi nào sử dụng các Provider types:

- ✅ **useClass**: Standard service injection
- ✅ **useValue**: Mock objects, configuration
- ✅ **useFactory**: Dynamic creation, async setup
- ✅ **useExisting**: Alias cho existing provider
