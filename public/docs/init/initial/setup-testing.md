# Testing Strategy for Team NestJS Project

## Tổng quan

Testing là crucial part của software development process. Comprehensive testing strategy đảm bảo code quality, reduce bugs, và confidence khi deploy to production. Tài liệu này cover unit testing, integration testing, và e2e testing cho NestJS project.

## 1. Testing Pyramid

### 1.1 Testing Levels

```
        /\
       /  \
      / E2E \     <- Few, Slow, Expensive
     /______\
    /        \
   /Integration\ <- Some, Medium Speed
  /__________\
 /            \
/  Unit Tests  \   <- Many, Fast, Cheap
/______________\
```

### 1.2 Testing Distribution

- **Unit Tests**: 70% - Fast, isolated, mock dependencies
- **Integration Tests**: 20% - Test component interactions
- **E2E Tests**: 10% - Test complete user journeys

## 2. Testing Setup & Configuration

### 2.1 Dependencies Installation

```bash
# Core testing dependencies (usually included with NestJS)
npm install --save-dev jest @types/jest ts-jest

# Supertest for HTTP testing
npm install --save-dev supertest @types/supertest

# Testing utilities
npm install --save-dev @nestjs/testing

# Test database
npm install --save-dev @testcontainers/postgresql

# Mock data generation
npm install --save-dev faker @types/faker

# Coverage reporting
npm install --save-dev nyc
```

### 2.2 Jest Configuration

```javascript
// jest.config.js
module.exports = {
  moduleFileExtensions: ['js', 'json', 'ts'],
  rootDir: 'src',
  testRegex: '.*\\.spec\\.ts$',
  transform: {
    '^.+\\.(t|j)s$': 'ts-jest',
  },
  collectCoverageFrom: [
    '**/*.(t|j)s',
    '!**/*.spec.ts',
    '!**/*.interface.ts',
    '!**/*.dto.ts',
    '!**/*.entity.ts',
    '!**/node_modules/**',
    '!**/dist/**',
  ],
  coverageDirectory: '../coverage',
  testEnvironment: 'node',
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
  setupFilesAfterEnv: ['<rootDir>/test/setup.ts'],
  moduleNameMapping: {
    '^src/(.*)$': '<rootDir>/$1',
  },
}
```

### 2.3 E2E Jest Configuration

```javascript
// test/jest-e2e.json
{
  "moduleFileExtensions": ["js", "json", "ts"],
  "rootDir": ".",
  "testEnvironment": "node",
  "testRegex": ".e2e-spec.ts$",
  "transform": {
    "^.+\\.(t|j)s$": "ts-jest"
  },
  "setupFilesAfterEnv": ["<rootDir>/setup-e2e.ts"],
  "testTimeout": 60000
}
```

## 3. Test Database Setup

### 3.1 Test Database Service

```typescript
// src/test/test-database.service.ts
import { Injectable } from '@nestjs/common'
import { PrismaClient } from '@prisma/client'
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql'

@Injectable()
export class TestDatabaseService {
  private container: StartedPostgreSqlContainer
  private prisma: PrismaClient

  async setupDatabase(): Promise<PrismaClient> {
    // Start PostgreSQL container
    this.container = await new PostgreSqlContainer('postgres:15')
      .withDatabase('test_db')
      .withUsername('test_user')
      .withPassword('test_password')
      .start()

    // Create Prisma client
    this.prisma = new PrismaClient({
      datasources: {
        db: {
          url: this.container.getConnectionUri(),
        },
      },
    })

    // Connect and run migrations
    await this.prisma.$connect()

    // Run migrations (you might need to implement this)
    await this.runMigrations()

    return this.prisma
  }

  async cleanDatabase(): Promise<void> {
    if (!this.prisma) return

    // Clean all tables in reverse order of dependencies
    const tables = [
      'user_permissions',
      'refresh_tokens',
      'login_history',
      'posts',
      'profiles',
      'users',
      'categories',
      'permissions',
    ]

    await this.prisma.$transaction(tables.map((table) => this.prisma.$queryRawUnsafe(`DELETE FROM "${table}"`)))
  }

  async teardownDatabase(): Promise<void> {
    if (this.prisma) {
      await this.prisma.$disconnect()
    }

    if (this.container) {
      await this.container.stop()
    }
  }

  private async runMigrations(): Promise<void> {
    // Implement migration logic here
    // This could involve running prisma migrate commands or raw SQL
  }
}
```

### 3.2 Test Setup Files

```typescript
// src/test/setup.ts
import { TestDatabaseService } from './test-database.service'

let testDb: TestDatabaseService

beforeAll(async () => {
  testDb = new TestDatabaseService()
  await testDb.setupDatabase()
}, 60000)

afterEach(async () => {
  await testDb.cleanDatabase()
})

afterAll(async () => {
  await testDb.teardownDatabase()
})

export { testDb }
```

## 4. Unit Testing

### 4.1 Service Unit Tests

```typescript
// src/modules/users/users.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing'
import { UsersService } from './users.service'
import { PrismaService } from 'src/shared/services/prisma.service'
import { PasswordService } from 'src/modules/auth/services/password.service'
import { CreateUserDto } from './dto/create-user.dto'
import { ConflictException, NotFoundException } from '@nestjs/common'
import { User, Role } from '@prisma/client'

describe('UsersService', () => {
  let service: UsersService
  let prismaService: jest.Mocked<PrismaService>
  let passwordService: jest.Mocked<PasswordService>

  const mockUser: User = {
    id: '1',
    email: 'test@example.com',
    name: 'Test User',
    password: 'hashedPassword',
    role: Role.USER,
    isActive: true,
    isVerified: false,
    lastLoginAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  }

  beforeEach(async () => {
    const mockPrismaService = {
      user: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
    }

    const mockPasswordService = {
      hashPassword: jest.fn(),
      comparePassword: jest.fn(),
    }

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: PasswordService,
          useValue: mockPasswordService,
        },
      ],
    }).compile()

    service = module.get<UsersService>(UsersService)
    prismaService = module.get(PrismaService)
    passwordService = module.get(PasswordService)
  })

  it('should be defined', () => {
    expect(service).toBeDefined()
  })

  describe('create', () => {
    it('should create a new user successfully', async () => {
      const createUserDto: CreateUserDto = {
        email: 'test@example.com',
        name: 'Test User',
        password: 'password123',
      }

      prismaService.user.findUnique.mockResolvedValue(null)
      passwordService.hashPassword.mockResolvedValue('hashedPassword')
      prismaService.user.create.mockResolvedValue(mockUser)

      const result = await service.create(createUserDto)

      expect(prismaService.user.findUnique).toHaveBeenCalledWith({
        where: { email: createUserDto.email },
      })
      expect(passwordService.hashPassword).toHaveBeenCalledWith(createUserDto.password)
      expect(prismaService.user.create).toHaveBeenCalledWith({
        data: {
          email: createUserDto.email,
          name: createUserDto.name,
          password: 'hashedPassword',
        },
        select: expect.any(Object),
      })
      expect(result).toEqual(mockUser)
    })

    it('should throw ConflictException if user already exists', async () => {
      const createUserDto: CreateUserDto = {
        email: 'test@example.com',
        name: 'Test User',
        password: 'password123',
      }

      prismaService.user.findUnique.mockResolvedValue(mockUser)

      await expect(service.create(createUserDto)).rejects.toThrow(ConflictException)
      expect(passwordService.hashPassword).not.toHaveBeenCalled()
      expect(prismaService.user.create).not.toHaveBeenCalled()
    })
  })

  describe('findById', () => {
    it('should return a user by id', async () => {
      prismaService.user.findUnique.mockResolvedValue(mockUser)

      const result = await service.findById('1')

      expect(prismaService.user.findUnique).toHaveBeenCalledWith({
        where: { id: '1' },
        include: expect.any(Object),
      })
      expect(result).toEqual(mockUser)
    })

    it('should throw NotFoundException if user not found', async () => {
      prismaService.user.findUnique.mockResolvedValue(null)

      await expect(service.findById('999')).rejects.toThrow(NotFoundException)
    })
  })

  describe('findAll', () => {
    it('should return paginated users', async () => {
      const users = [mockUser]
      prismaService.user.findMany.mockResolvedValue(users)
      prismaService.user.count.mockResolvedValue(1)

      const result = await service.findAll({ page: 1, limit: 10 })

      expect(result).toEqual({
        data: users,
        pagination: {
          page: 1,
          limit: 10,
          total: 1,
          pages: 1,
          hasNext: false,
          hasPrev: false,
        },
      })
    })
  })
})
```

### 4.2 Controller Unit Tests

```typescript
// src/modules/users/users.controller.spec.ts
import { Test, TestingModule } from '@nestjs/testing'
import { UsersController } from './users.controller'
import { UsersService } from './users.service'
import { CreateUserDto } from './dto/create-user.dto'
import { UpdateUserDto } from './dto/update-user.dto'
import { JwtAuthGuard } from 'src/shared/guards/jwt-auth.guard'
import { RolesGuard } from 'src/shared/guards/roles.guard'

describe('UsersController', () => {
  let controller: UsersController
  let service: jest.Mocked<UsersService>

  const mockUser = {
    id: '1',
    email: 'test@example.com',
    name: 'Test User',
    role: 'USER',
    isActive: true,
    createdAt: new Date(),
  }

  beforeEach(async () => {
    const mockUsersService = {
      create: jest.fn(),
      findAll: jest.fn(),
      findById: jest.fn(),
      update: jest.fn(),
      remove: jest.fn(),
    }

    const module: TestingModule = await Test.createTestingModule({
      controllers: [UsersController],
      providers: [
        {
          provide: UsersService,
          useValue: mockUsersService,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile()

    controller = module.get<UsersController>(UsersController)
    service = module.get(UsersService)
  })

  it('should be defined', () => {
    expect(controller).toBeDefined()
  })

  describe('create', () => {
    it('should create a new user', async () => {
      const createUserDto: CreateUserDto = {
        email: 'test@example.com',
        name: 'Test User',
        password: 'password123',
      }

      service.create.mockResolvedValue(mockUser)

      const result = await controller.create(createUserDto)

      expect(service.create).toHaveBeenCalledWith(createUserDto)
      expect(result).toEqual(mockUser)
    })
  })

  describe('findAll', () => {
    it('should return paginated users', async () => {
      const paginatedResult = {
        data: [mockUser],
        pagination: {
          page: 1,
          limit: 10,
          total: 1,
          pages: 1,
          hasNext: false,
          hasPrev: false,
        },
      }

      service.findAll.mockResolvedValue(paginatedResult)

      const result = await controller.findAll({ page: 1, limit: 10 })

      expect(service.findAll).toHaveBeenCalledWith({ page: 1, limit: 10 })
      expect(result).toEqual(paginatedResult)
    })
  })

  describe('findOne', () => {
    it('should return a user by id', async () => {
      service.findById.mockResolvedValue(mockUser)

      const result = await controller.findOne('1')

      expect(service.findById).toHaveBeenCalledWith('1')
      expect(result).toEqual(mockUser)
    })
  })
})
```

## 5. Integration Testing

### 5.1 Module Integration Tests

```typescript
// src/modules/users/users.integration.spec.ts
import { Test, TestingModule } from '@nestjs/testing'
import { UsersService } from './users.service'
import { PrismaService } from 'src/shared/services/prisma.service'
import { PasswordService } from 'src/modules/auth/services/password.service'
import { TestDatabaseService } from 'src/test/test-database.service'
import { CreateUserDto } from './dto/create-user.dto'

describe('UsersService Integration', () => {
  let service: UsersService
  let prisma: PrismaService
  let testDb: TestDatabaseService

  beforeAll(async () => {
    testDb = new TestDatabaseService()
    const testPrisma = await testDb.setupDatabase()

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: PrismaService,
          useValue: testPrisma,
        },
        PasswordService,
      ],
    }).compile()

    service = module.get<UsersService>(UsersService)
    prisma = module.get<PrismaService>(PrismaService)
  })

  afterAll(async () => {
    await testDb.teardownDatabase()
  })

  beforeEach(async () => {
    await testDb.cleanDatabase()
  })

  describe('User CRUD Operations', () => {
    it('should create and retrieve a user', async () => {
      const createUserDto: CreateUserDto = {
        email: 'test@example.com',
        name: 'Test User',
        password: 'password123',
      }

      // Create user
      const createdUser = await service.create(createUserDto)
      expect(createdUser.email).toBe(createUserDto.email)
      expect(createdUser.name).toBe(createUserDto.name)
      expect(createdUser.id).toBeDefined()

      // Retrieve user
      const retrievedUser = await service.findById(createdUser.id)
      expect(retrievedUser).toBeDefined()
      expect(retrievedUser.email).toBe(createUserDto.email)
    })

    it('should handle user relationships correctly', async () => {
      // Create user with profile
      const user = await prisma.user.create({
        data: {
          email: 'test@example.com',
          name: 'Test User',
          password: 'hashedPassword',
          profile: {
            create: {
              bio: 'Test bio',
            },
          },
        },
        include: {
          profile: true,
        },
      })

      expect(user.profile).toBeDefined()
      expect(user.profile.bio).toBe('Test bio')
    })

    it('should enforce unique email constraint', async () => {
      const createUserDto: CreateUserDto = {
        email: 'test@example.com',
        name: 'Test User',
        password: 'password123',
      }

      // Create first user
      await service.create(createUserDto)

      // Try to create second user with same email
      await expect(service.create(createUserDto)).rejects.toThrow()
    })
  })
})
```

## 6. E2E Testing

### 6.1 E2E Test Setup

```typescript
// test/setup-e2e.ts
import { TestDatabaseService } from '../src/test/test-database.service'

let testDb: TestDatabaseService

beforeAll(async () => {
  testDb = new TestDatabaseService()
  await testDb.setupDatabase()
}, 60000)

afterEach(async () => {
  await testDb.cleanDatabase()
})

afterAll(async () => {
  await testDb.teardownDatabase()
})

export { testDb }
```

### 6.2 Authentication E2E Tests

```typescript
// test/auth.e2e-spec.ts
import { Test, TestingModule } from '@nestjs/testing'
import { INestApplication, ValidationPipe } from '@nestjs/common'
import * as request from 'supertest'
import { AppModule } from '../src/app.module'
import { PrismaService } from '../src/shared/services/prisma.service'
import { testDb } from './setup-e2e'

describe('Authentication (e2e)', () => {
  let app: INestApplication
  let prisma: PrismaService

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(await testDb.setupDatabase())
      .compile()

    app = moduleFixture.createNestApplication()
    app.useGlobalPipes(new ValidationPipe())

    prisma = moduleFixture.get<PrismaService>(PrismaService)

    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  describe('/auth/register (POST)', () => {
    it('should register a new user', async () => {
      const registerDto = {
        email: 'test@example.com',
        name: 'Test User',
        password: 'password123',
      }

      const response = await request(app.getHttpServer()).post('/auth/register').send(registerDto).expect(201)

      expect(response.body.user).toBeDefined()
      expect(response.body.user.email).toBe(registerDto.email)
      expect(response.body.tokens).toBeDefined()
      expect(response.body.tokens.accessToken).toBeDefined()
      expect(response.body.tokens.refreshToken).toBeDefined()
    })

    it('should return 409 if user already exists', async () => {
      const registerDto = {
        email: 'test@example.com',
        name: 'Test User',
        password: 'password123',
      }

      // Create user first
      await request(app.getHttpServer()).post('/auth/register').send(registerDto).expect(201)

      // Try to register again
      await request(app.getHttpServer()).post('/auth/register').send(registerDto).expect(409)
    })

    it('should validate input data', async () => {
      const invalidData = {
        email: 'invalid-email',
        password: '123', // Too short
      }

      await request(app.getHttpServer()).post('/auth/register').send(invalidData).expect(400)
    })
  })

  describe('/auth/login (POST)', () => {
    beforeEach(async () => {
      // Create a test user
      await request(app.getHttpServer()).post('/auth/register').send({
        email: 'test@example.com',
        name: 'Test User',
        password: 'password123',
      })
    })

    it('should login with correct credentials', async () => {
      const loginDto = {
        email: 'test@example.com',
        password: 'password123',
      }

      const response = await request(app.getHttpServer()).post('/auth/login').send(loginDto).expect(200)

      expect(response.body.user).toBeDefined()
      expect(response.body.tokens).toBeDefined()
      expect(response.body.tokens.accessToken).toBeDefined()
    })

    it('should return 401 for invalid credentials', async () => {
      const loginDto = {
        email: 'test@example.com',
        password: 'wrongpassword',
      }

      await request(app.getHttpServer()).post('/auth/login').send(loginDto).expect(401)
    })
  })

  describe('Protected Routes', () => {
    let accessToken: string

    beforeEach(async () => {
      // Register and login to get token
      await request(app.getHttpServer()).post('/auth/register').send({
        email: 'test@example.com',
        name: 'Test User',
        password: 'password123',
      })

      const loginResponse = await request(app.getHttpServer()).post('/auth/login').send({
        email: 'test@example.com',
        password: 'password123',
      })

      accessToken = loginResponse.body.tokens.accessToken
    })

    it('should access protected route with valid token', async () => {
      await request(app.getHttpServer()).get('/auth/profile').set('Authorization', `Bearer ${accessToken}`).expect(200)
    })

    it('should return 401 for protected route without token', async () => {
      await request(app.getHttpServer()).get('/auth/profile').expect(401)
    })

    it('should return 401 for protected route with invalid token', async () => {
      await request(app.getHttpServer()).get('/auth/profile').set('Authorization', 'Bearer invalid-token').expect(401)
    })
  })
})
```

### 6.3 Users E2E Tests

```typescript
// test/users.e2e-spec.ts
import { Test, TestingModule } from '@nestjs/testing'
import { INestApplication } from '@nestjs/common'
import * as request from 'supertest'
import { AppModule } from '../src/app.module'
import { PrismaService } from '../src/shared/services/prisma.service'
import { testDb } from './setup-e2e'

describe('Users (e2e)', () => {
  let app: INestApplication
  let adminToken: string
  let userToken: string

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider(PrismaService)
      .useValue(await testDb.setupDatabase())
      .compile()

    app = moduleFixture.createNestApplication()
    await app.init()
  })

  afterAll(async () => {
    await app.close()
  })

  beforeEach(async () => {
    // Create admin user
    const adminResponse = await request(app.getHttpServer()).post('/auth/register').send({
      email: 'admin@example.com',
      name: 'Admin User',
      password: 'password123',
    })

    // Update user role to admin (this would normally be done via admin panel)
    const prisma = app.get<PrismaService>(PrismaService)
    await prisma.user.update({
      where: { email: 'admin@example.com' },
      data: { role: 'ADMIN' },
    })

    // Login admin to get token
    const adminLoginResponse = await request(app.getHttpServer()).post('/auth/login').send({
      email: 'admin@example.com',
      password: 'password123',
    })

    adminToken = adminLoginResponse.body.tokens.accessToken

    // Create regular user
    const userResponse = await request(app.getHttpServer()).post('/auth/register').send({
      email: 'user@example.com',
      name: 'Regular User',
      password: 'password123',
    })

    userToken = userResponse.body.tokens.accessToken
  })

  describe('/users (GET)', () => {
    it('should allow admin to get all users', async () => {
      const response = await request(app.getHttpServer())
        .get('/users')
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)

      expect(response.body.data).toBeDefined()
      expect(Array.isArray(response.body.data)).toBe(true)
      expect(response.body.pagination).toBeDefined()
    })

    it('should deny regular user access to all users', async () => {
      await request(app.getHttpServer()).get('/users').set('Authorization', `Bearer ${userToken}`).expect(403)
    })

    it('should deny unauthenticated access', async () => {
      await request(app.getHttpServer()).get('/users').expect(401)
    })
  })

  describe('/users/profile (GET)', () => {
    it('should allow authenticated user to get own profile', async () => {
      const response = await request(app.getHttpServer())
        .get('/users/profile')
        .set('Authorization', `Bearer ${userToken}`)
        .expect(200)

      expect(response.body.user).toBeDefined()
      expect(response.body.user.email).toBe('user@example.com')
    })
  })
})
```

## 7. Test Utilities & Helpers

### 7.1 Factory Functions

```typescript
// src/test/factories/user.factory.ts
import { User, Role } from '@prisma/client'
import { faker } from '@faker-js/faker'

export interface CreateUserData {
  email?: string
  name?: string
  password?: string
  role?: Role
  isActive?: boolean
}

export class UserFactory {
  static create(overrides: CreateUserData = {}): Omit<User, 'id' | 'createdAt' | 'updatedAt'> {
    return {
      email: overrides.email || faker.internet.email(),
      name: overrides.name || faker.person.fullName(),
      password: overrides.password || 'hashedPassword123',
      role: overrides.role || Role.USER,
      isActive: overrides.isActive ?? true,
      isVerified: false,
      lastLoginAt: null,
    }
  }

  static createMany(count: number, overrides: CreateUserData = {}): Omit<User, 'id' | 'createdAt' | 'updatedAt'>[] {
    return Array.from({ length: count }, () => this.create(overrides))
  }
}
```

### 7.2 Test Helpers

```typescript
// src/test/helpers/auth.helper.ts
import { JwtService } from '@nestjs/jwt'
import { User } from '@prisma/client'

export class AuthTestHelper {
  static generateMockToken(user: Partial<User>, jwtService: JwtService): string {
    const payload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    }

    return jwtService.sign(payload)
  }

  static createMockUser(overrides: Partial<User> = {}): User {
    return {
      id: '1',
      email: 'test@example.com',
      name: 'Test User',
      password: 'hashedPassword',
      role: 'USER',
      isActive: true,
      isVerified: false,
      lastLoginAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    } as User
  }
}
```

## 8. Testing Scripts

### 8.1 Package.json Scripts

```json
{
  "scripts": {
    "test": "jest",
    "test:watch": "jest --watch",
    "test:cov": "jest --coverage",
    "test:debug": "node --inspect-brk -r tsconfig-paths/register -r ts-node/register node_modules/.bin/jest --runInBand",
    "test:e2e": "jest --config ./test/jest-e2e.json",
    "test:e2e:watch": "jest --config ./test/jest-e2e.json --watch",
    "test:unit": "jest --testPathIgnorePatterns=e2e",
    "test:integration": "jest --testNamePattern='Integration'",
    "test:ci": "jest --coverage --watchAll=false",
    "test:affected": "jest --findRelatedTests"
  }
}
```

## 9. CI/CD Integration

### 9.1 GitHub Actions Test Workflow

```yaml
# .github/workflows/test.yml
name: Test Suite

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main]

jobs:
  test:
    runs-on: ubuntu-latest

    services:
      postgres:
        image: postgres:15
        env:
          POSTGRES_PASSWORD: postgres
          POSTGRES_DB: test_db
        options: >-
          --health-cmd pg_isready
          --health-interval 10s
          --health-timeout 5s
          --health-retries 5

    steps:
      - uses: actions/checkout@v3

      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Run unit tests
        run: npm run test:unit

      - name: Run integration tests
        run: npm run test:integration
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/test_db

      - name: Run e2e tests
        run: npm run test:e2e
        env:
          DATABASE_URL: postgresql://postgres:postgres@localhost:5432/test_db

      - name: Upload coverage reports
        uses: codecov/codecov-action@v3
        with:
          file: ./coverage/lcov.info
```

## 10. Best Practices

### 10.1 Testing Guidelines

1. **Test Structure**: Follow AAA pattern (Arrange, Act, Assert)
2. **Test Naming**: Use descriptive test names
3. **Mock Dependencies**: Mock external dependencies in unit tests
4. **Test Data**: Use factories for test data generation
5. **Cleanup**: Always clean up after tests

### 10.2 Coverage Goals

- **Unit Tests**: Aim for 80%+ coverage
- **Critical Paths**: 100% coverage for business logic
- **Integration Tests**: Focus on component interactions
- **E2E Tests**: Cover main user journeys

### 10.3 Performance Considerations

- **Parallel Testing**: Run tests in parallel when possible
- **Test Database**: Use in-memory or containerized databases
- **Selective Testing**: Run only affected tests in development
- **Test Optimization**: Keep tests fast and focused

## Kết luận

Comprehensive testing strategy cho NestJS project bao gồm:

- **Multiple Test Levels**: Unit, Integration, và E2E tests
- **Proper Setup**: Test databases và configuration
- **Mock Strategy**: Appropriate mocking for different test types
- **CI/CD Integration**: Automated testing trong pipeline
- **Coverage Goals**: Clear targets cho code coverage
- **Best Practices**: Guidelines cho maintainable tests

Testing strategy này đảm bảo:

- **Code Quality**: Early bug detection
- **Confidence**: Safe refactoring và deployment
- **Documentation**: Tests serve as living documentation
- **Team Productivity**: Faster development cycles
- **Reliability**: Stable production deployments
