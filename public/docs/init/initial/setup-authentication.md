# Authentication & Authorization Setup for Team NestJS Project

## Tổng quan

Authentication và Authorization là core security features của mọi ứng dụng web. Tài liệu này hướng dẫn implement comprehensive auth system với JWT, role-based access control, và security best practices.

## 1. Architecture Overview

### 1.1 Authentication Flow

```
Client → Login Request → Auth Service → JWT Token → Protected Routes
   ↓
Refresh Token → Token Renewal → Continue Session
```

### 1.2 Authorization Levels

- **Authentication**: User identity verification
- **Role-based**: Access based on user roles (USER, ADMIN, MODERATOR)
- **Permission-based**: Granular permissions per resource
- **Resource-based**: Owner-only access to specific resources

## 2. Dependencies Installation

### 2.1 Core Authentication Packages

```bash
# JWT and Passport
npm install @nestjs/jwt @nestjs/passport passport passport-jwt passport-local
npm install --save-dev @types/passport-jwt @types/passport-local

# Password hashing
npm install bcrypt
npm install --save-dev @types/bcrypt

# Class validation
npm install class-validator class-transformer

# Optional: Social auth
npm install passport-google-oauth20
npm install --save-dev @types/passport-google-oauth20
```

## 3. Database Schema for Auth

### 3.1 User & Auth Related Models

```prisma
// prisma/schema.prisma
model User {
  id          String    @id @default(cuid())
  email       String    @unique
  username    String?   @unique
  name        String?
  password    String
  role        Role      @default(USER)
  isActive    Boolean   @default(true)
  isVerified  Boolean   @default(false)
  lastLoginAt DateTime?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  // Relations
  profile      Profile?
  refreshTokens RefreshToken[]
  permissions   UserPermission[]
  loginHistory  LoginHistory[]

  @@map("users")
}

model RefreshToken {
  id        String   @id @default(cuid())
  token     String   @unique
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  expiresAt DateTime
  createdAt DateTime @default(now())

  @@map("refresh_tokens")
}

model Permission {
  id          String           @id @default(cuid())
  name        String           @unique
  description String?
  resource    String
  action      String
  users       UserPermission[]

  @@unique([resource, action])
  @@map("permissions")
}

model UserPermission {
  id           String     @id @default(cuid())
  userId       String
  permissionId String
  user         User       @relation(fields: [userId], references: [id], onDelete: Cascade)
  permission   Permission @relation(fields: [permissionId], references: [id], onDelete: Cascade)
  grantedAt    DateTime   @default(now())

  @@unique([userId, permissionId])
  @@map("user_permissions")
}

model LoginHistory {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  ipAddress String
  userAgent String?
  success   Boolean
  createdAt DateTime @default(now())

  @@map("login_history")
}

enum Role {
  USER
  ADMIN
  MODERATOR
}
```

## 4. JWT Configuration

### 4.1 JWT Service Setup

```typescript
// src/modules/auth/services/jwt.service.ts
import { Injectable } from '@nestjs/common'
import { JwtService as NestJwtService } from '@nestjs/jwt'
import { ConfigService } from '@nestjs/config'

export interface JwtPayload {
  sub: string
  email: string
  role: string
  iat?: number
  exp?: number
}

export interface TokenPair {
  accessToken: string
  refreshToken: string
}

@Injectable()
export class JwtService {
  constructor(
    private readonly jwtService: NestJwtService,
    private readonly config: ConfigService,
  ) {}

  async generateTokenPair(payload: JwtPayload): Promise<TokenPair> {
    const [accessToken, refreshToken] = await Promise.all([
      this.generateAccessToken(payload),
      this.generateRefreshToken(payload),
    ])

    return { accessToken, refreshToken }
  }

  async generateAccessToken(payload: JwtPayload): Promise<string> {
    return this.jwtService.signAsync(payload, {
      secret: this.config.get('JWT_SECRET'),
      expiresIn: this.config.get('JWT_EXPIRES_IN', '15m'),
    })
  }

  async generateRefreshToken(payload: JwtPayload): Promise<string> {
    return this.jwtService.signAsync(payload, {
      secret: this.config.get('REFRESH_TOKEN_SECRET'),
      expiresIn: this.config.get('REFRESH_TOKEN_EXPIRES_IN', '7d'),
    })
  }

  async verifyAccessToken(token: string): Promise<JwtPayload> {
    return this.jwtService.verifyAsync(token, {
      secret: this.config.get('JWT_SECRET'),
    })
  }

  async verifyRefreshToken(token: string): Promise<JwtPayload> {
    return this.jwtService.verifyAsync(token, {
      secret: this.config.get('REFRESH_TOKEN_SECRET'),
    })
  }

  extractTokenFromHeader(authHeader?: string): string | null {
    if (!authHeader) return null

    const [type, token] = authHeader.split(' ')
    return type === 'Bearer' ? token : null
  }
}
```

## 5. Authentication Guards

### 5.1 JWT Authentication Guard

```typescript
// src/shared/guards/jwt-auth.guard.ts
import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { JwtService } from 'src/modules/auth/services/jwt.service'
import { PrismaService } from 'src/shared/services/prisma.service'
import { IS_PUBLIC_KEY } from '../decorators/public.decorator'

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check if route is public
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ])

    if (isPublic) {
      return true
    }

    const request = context.switchToHttp().getRequest()
    const authHeader = request.headers.authorization
    const token = this.jwtService.extractTokenFromHeader(authHeader)

    if (!token) {
      throw new UnauthorizedException('Access token is required')
    }

    try {
      // Verify JWT token
      const payload = await this.jwtService.verifyAccessToken(token)

      // Get user from database
      const user = await this.prisma.user.findUnique({
        where: { id: payload.sub },
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          isActive: true,
          isVerified: true,
          permissions: {
            include: {
              permission: true,
            },
          },
        },
      })

      if (!user) {
        throw new UnauthorizedException('User not found')
      }

      if (!user.isActive) {
        throw new UnauthorizedException('Account is deactivated')
      }

      // Attach user to request
      request.user = {
        ...user,
        permissions: user.permissions.map((up) => up.permission),
      }

      return true
    } catch (error) {
      throw new UnauthorizedException('Invalid or expired token')
    }
  }
}
```

### 5.2 Roles Guard

```typescript
// src/shared/guards/roles.guard.ts
import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { ROLES_KEY } from '../decorators/roles.decorator'
import { Role } from '@prisma/client'

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ])

    if (!requiredRoles) {
      return true
    }

    const { user } = context.switchToHttp().getRequest()

    if (!user) {
      throw new ForbiddenException('User not authenticated')
    }

    const hasRole = requiredRoles.includes(user.role)

    if (!hasRole) {
      throw new ForbiddenException('Insufficient permissions')
    }

    return true
  }
}
```

### 5.3 Permissions Guard

```typescript
// src/shared/guards/permissions.guard.ts
import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator'

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ])

    if (!requiredPermissions) {
      return true
    }

    const { user } = context.switchToHttp().getRequest()

    if (!user) {
      throw new ForbiddenException('User not authenticated')
    }

    const userPermissions = user.permissions.map((p) => `${p.resource}:${p.action}`)

    const hasPermission = requiredPermissions.every((permission) => userPermissions.includes(permission))

    if (!hasPermission) {
      throw new ForbiddenException('Insufficient permissions')
    }

    return true
  }
}
```

## 6. Decorators

### 6.1 Public Decorator

```typescript
// src/shared/decorators/public.decorator.ts
import { SetMetadata } from '@nestjs/common'

export const IS_PUBLIC_KEY = 'isPublic'
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true)
```

### 6.2 Roles Decorator

```typescript
// src/shared/decorators/roles.decorator.ts
import { SetMetadata } from '@nestjs/common'
import { Role } from '@prisma/client'

export const ROLES_KEY = 'roles'
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles)
```

### 6.3 Permissions Decorator

```typescript
// src/shared/decorators/permissions.decorator.ts
import { SetMetadata } from '@nestjs/common'

export const PERMISSIONS_KEY = 'permissions'
export const RequirePermissions = (...permissions: string[]) => SetMetadata(PERMISSIONS_KEY, permissions)
```

### 6.4 Current User Decorator

```typescript
// src/shared/decorators/current-user.decorator.ts
import { createParamDecorator, ExecutionContext } from '@nestjs/common'

export const CurrentUser = createParamDecorator((data: string, ctx: ExecutionContext) => {
  const request = ctx.switchToHttp().getRequest()
  const user = request.user

  return data ? user?.[data] : user
})
```

## 7. Authentication Service

### 7.1 Auth Service Implementation

```typescript
// src/modules/auth/auth.service.ts
import { Injectable, UnauthorizedException, ConflictException } from '@nestjs/common'
import { PrismaService } from 'src/shared/services/prisma.service'
import { JwtService, JwtPayload, TokenPair } from './services/jwt.service'
import { PasswordService } from './services/password.service'
import { LoginDto } from './dto/login.dto'
import { RegisterDto } from './dto/register.dto'
import { RefreshTokenDto } from './dto/refresh-token.dto'

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly passwordService: PasswordService,
  ) {}

  async register(registerDto: RegisterDto): Promise<{ user: any; tokens: TokenPair }> {
    const { email, password, name } = registerDto

    // Check if user exists
    const existingUser = await this.prisma.user.findUnique({
      where: { email },
    })

    if (existingUser) {
      throw new ConflictException('User with this email already exists')
    }

    // Hash password
    const hashedPassword = await this.passwordService.hashPassword(password)

    // Create user
    const user = await this.prisma.user.create({
      data: {
        email,
        name,
        password: hashedPassword,
      },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        isActive: true,
        createdAt: true,
      },
    })

    // Generate tokens
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    }

    const tokens = await this.jwtService.generateTokenPair(payload)

    // Store refresh token
    await this.storeRefreshToken(user.id, tokens.refreshToken)

    return { user, tokens }
  }

  async login(loginDto: LoginDto, ipAddress: string, userAgent?: string): Promise<{ user: any; tokens: TokenPair }> {
    const { email, password } = loginDto

    // Find user
    const user = await this.prisma.user.findUnique({
      where: { email },
    })

    if (!user) {
      await this.logLoginAttempt(null, ipAddress, userAgent, false)
      throw new UnauthorizedException('Invalid credentials')
    }

    // Verify password
    const isPasswordValid = await this.passwordService.comparePassword(password, user.password)

    if (!isPasswordValid) {
      await this.logLoginAttempt(user.id, ipAddress, userAgent, false)
      throw new UnauthorizedException('Invalid credentials')
    }

    if (!user.isActive) {
      throw new UnauthorizedException('Account is deactivated')
    }

    // Generate tokens
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      role: user.role,
    }

    const tokens = await this.jwtService.generateTokenPair(payload)

    // Store refresh token and update last login
    await Promise.all([
      this.storeRefreshToken(user.id, tokens.refreshToken),
      this.prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      }),
      this.logLoginAttempt(user.id, ipAddress, userAgent, true),
    ])

    return {
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
      tokens,
    }
  }

  async refreshToken(refreshTokenDto: RefreshTokenDto): Promise<TokenPair> {
    const { refreshToken } = refreshTokenDto

    try {
      // Verify refresh token
      const payload = await this.jwtService.verifyRefreshToken(refreshToken)

      // Check if refresh token exists in database
      const storedToken = await this.prisma.refreshToken.findUnique({
        where: { token: refreshToken },
        include: { user: true },
      })

      if (!storedToken || storedToken.expiresAt < new Date()) {
        throw new UnauthorizedException('Invalid or expired refresh token')
      }

      // Generate new token pair
      const newPayload: JwtPayload = {
        sub: storedToken.user.id,
        email: storedToken.user.email,
        role: storedToken.user.role,
      }

      const tokens = await this.jwtService.generateTokenPair(newPayload)

      // Replace refresh token
      await this.prisma.refreshToken.update({
        where: { id: storedToken.id },
        data: {
          token: tokens.refreshToken,
          expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
        },
      })

      return tokens
    } catch (error) {
      throw new UnauthorizedException('Invalid refresh token')
    }
  }

  async logout(userId: string, refreshToken?: string): Promise<void> {
    if (refreshToken) {
      await this.prisma.refreshToken.deleteMany({
        where: {
          userId,
          token: refreshToken,
        },
      })
    } else {
      // Logout from all devices
      await this.prisma.refreshToken.deleteMany({
        where: { userId },
      })
    }
  }

  private async storeRefreshToken(userId: string, token: string): Promise<void> {
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) // 7 days

    await this.prisma.refreshToken.create({
      data: {
        userId,
        token,
        expiresAt,
      },
    })
  }

  private async logLoginAttempt(
    userId: string | null,
    ipAddress: string,
    userAgent?: string,
    success: boolean = false,
  ): Promise<void> {
    if (userId) {
      await this.prisma.loginHistory.create({
        data: {
          userId,
          ipAddress,
          userAgent,
          success,
        },
      })
    }
  }
}
```

## 8. Password Service

### 8.1 Password Hashing Service

```typescript
// src/modules/auth/services/password.service.ts
import { Injectable } from '@nestjs/common'
import * as bcrypt from 'bcrypt'
import { ConfigService } from '@nestjs/config'

@Injectable()
export class PasswordService {
  private readonly saltRounds: number

  constructor(private readonly config: ConfigService) {
    this.saltRounds = this.config.get('BCRYPT_ROUNDS', 12)
  }

  async hashPassword(password: string): Promise<string> {
    return bcrypt.hash(password, this.saltRounds)
  }

  async comparePassword(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash)
  }

  generateRandomPassword(length: number = 12): string {
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*'
    let password = ''

    for (let i = 0; i < length; i++) {
      password += charset.charAt(Math.floor(Math.random() * charset.length))
    }

    return password
  }

  validatePasswordStrength(password: string): { isValid: boolean; errors: string[] } {
    const errors: string[] = []

    if (password.length < 8) {
      errors.push('Password must be at least 8 characters long')
    }

    if (!/(?=.*[a-z])/.test(password)) {
      errors.push('Password must contain at least one lowercase letter')
    }

    if (!/(?=.*[A-Z])/.test(password)) {
      errors.push('Password must contain at least one uppercase letter')
    }

    if (!/(?=.*\d)/.test(password)) {
      errors.push('Password must contain at least one number')
    }

    if (!/(?=.*[@$!%*?&])/.test(password)) {
      errors.push('Password must contain at least one special character')
    }

    return {
      isValid: errors.length === 0,
      errors,
    }
  }
}
```

## 9. DTOs

### 9.1 Authentication DTOs

```typescript
// src/modules/auth/dto/login.dto.ts
import { IsEmail, IsString, MinLength } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'

export class LoginDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email: string

  @ApiProperty({ example: 'password123' })
  @IsString()
  @MinLength(6)
  password: string
}

// src/modules/auth/dto/register.dto.ts
import { IsEmail, IsString, MinLength, IsOptional } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'

export class RegisterDto {
  @ApiProperty({ example: 'user@example.com' })
  @IsEmail()
  email: string

  @ApiProperty({ example: 'John Doe' })
  @IsOptional()
  @IsString()
  name?: string

  @ApiProperty({ example: 'password123' })
  @IsString()
  @MinLength(8)
  password: string
}

// src/modules/auth/dto/refresh-token.dto.ts
import { IsString } from 'class-validator'
import { ApiProperty } from '@nestjs/swagger'

export class RefreshTokenDto {
  @ApiProperty()
  @IsString()
  refreshToken: string
}
```

## 10. Auth Controller

### 10.1 Authentication Endpoints

```typescript
// src/modules/auth/auth.controller.ts
import { Controller, Post, Body, UseGuards, Req, Get } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger'
import { Request } from 'express'
import { AuthService } from './auth.service'
import { LoginDto } from './dto/login.dto'
import { RegisterDto } from './dto/register.dto'
import { RefreshTokenDto } from './dto/refresh-token.dto'
import { Public } from 'src/shared/decorators/public.decorator'
import { CurrentUser } from 'src/shared/decorators/current-user.decorator'

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Register new user' })
  async register(@Body() registerDto: RegisterDto) {
    return this.authService.register(registerDto)
  }

  @Public()
  @Post('login')
  @ApiOperation({ summary: 'Login user' })
  async login(@Body() loginDto: LoginDto, @Req() req: Request) {
    const ipAddress = req.ip || req.connection.remoteAddress || 'unknown'
    const userAgent = req.get('User-Agent')

    return this.authService.login(loginDto, ipAddress, userAgent)
  }

  @Public()
  @Post('refresh')
  @ApiOperation({ summary: 'Refresh access token' })
  async refreshToken(@Body() refreshTokenDto: RefreshTokenDto) {
    return this.authService.refreshToken(refreshTokenDto)
  }

  @Post('logout')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout user' })
  async logout(@CurrentUser('id') userId: string, @Body() body?: { refreshToken?: string }) {
    await this.authService.logout(userId, body?.refreshToken)
    return { message: 'Logged out successfully' }
  }

  @Get('profile')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current user profile' })
  async getProfile(@CurrentUser() user: any) {
    return { user }
  }
}
```

## 11. Module Configuration

### 11.1 Auth Module

```typescript
// src/modules/auth/auth.module.ts
import { Module } from '@nestjs/common'
import { JwtModule } from '@nestjs/jwt'
import { PassportModule } from '@nestjs/passport'
import { AuthController } from './auth.controller'
import { AuthService } from './auth.service'
import { JwtService } from './services/jwt.service'
import { PasswordService } from './services/password.service'

@Module({
  imports: [
    PassportModule,
    JwtModule.register({}), // Configuration will be handled in JwtService
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtService, PasswordService],
  exports: [AuthService, JwtService, PasswordService],
})
export class AuthModule {}
```

### 11.2 App Module with Guards

```typescript
// src/app.module.ts
import { Module } from '@nestjs/common'
import { APP_GUARD } from '@nestjs/core'
import { ConfigurationModule } from './shared/config/configuration.module'
import { SharedModule } from './shared/shared.module'
import { AuthModule } from './modules/auth/auth.module'
import { JwtAuthGuard } from './shared/guards/jwt-auth.guard'
import { RolesGuard } from './shared/guards/roles.guard'
import { PermissionsGuard } from './shared/guards/permissions.guard'

@Module({
  imports: [ConfigurationModule, SharedModule, AuthModule],
  providers: [
    {
      provide: APP_GUARD,
      useClass: JwtAuthGuard,
    },
    {
      provide: APP_GUARD,
      useClass: RolesGuard,
    },
    {
      provide: APP_GUARD,
      useClass: PermissionsGuard,
    },
  ],
})
export class AppModule {}
```

## 12. Usage Examples

### 12.1 Protected Route Examples

```typescript
// src/modules/users/users.controller.ts
import { Controller, Get, Post, Body, Param, Delete } from '@nestjs/common'
import { ApiTags, ApiBearerAuth } from '@nestjs/swagger'
import { Roles } from 'src/shared/decorators/roles.decorator'
import { RequirePermissions } from 'src/shared/decorators/permissions.decorator'
import { CurrentUser } from 'src/shared/decorators/current-user.decorator'
import { Public } from 'src/shared/decorators/public.decorator'
import { Role } from '@prisma/client'

@ApiTags('Users')
@Controller('users')
export class UsersController {
  @Public()
  @Get('public')
  getPublicUsers() {
    return { message: 'This is a public endpoint' }
  }

  @Get('profile')
  @ApiBearerAuth()
  getMyProfile(@CurrentUser() user: any) {
    return { user }
  }

  @Get()
  @Roles(Role.ADMIN, Role.MODERATOR)
  @ApiBearerAuth()
  getAllUsers() {
    return { message: 'Only admin and moderator can access this' }
  }

  @Delete(':id')
  @RequirePermissions('users:delete')
  @ApiBearerAuth()
  deleteUser(@Param('id') id: string) {
    return { message: `Delete user ${id}` }
  }

  @Post('admin-only')
  @Roles(Role.ADMIN)
  @RequirePermissions('users:create', 'users:manage')
  @ApiBearerAuth()
  adminOnlyAction(@Body() data: any) {
    return { message: 'Admin only action executed' }
  }
}
```

## 13. Security Best Practices

### 13.1 Security Headers & Middleware

```typescript
// src/main.ts
import { NestFactory } from '@nestjs/core'
import { ValidationPipe } from '@nestjs/common'
import helmet from 'helmet'
import { rateLimit } from 'express-rate-limit'
import { AppModule } from './app.module'

async function bootstrap() {
  const app = await NestFactory.create(AppModule)

  // Security headers
  app.use(helmet())

  // Rate limiting
  app.use(
    '/auth',
    rateLimit({
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 5, // limit each IP to 5 requests per windowMs for auth routes
      message: 'Too many authentication attempts, please try again later.',
    }),
  )

  // Global validation
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  )

  await app.listen(3000)
}
bootstrap()
```

### 13.2 Environment Variables

```bash
# .env
JWT_SECRET=your-super-secure-jwt-secret-key-at-least-32-characters
JWT_EXPIRES_IN=15m
REFRESH_TOKEN_SECRET=your-refresh-token-secret-key-different-from-jwt
REFRESH_TOKEN_EXPIRES_IN=7d
BCRYPT_ROUNDS=12
```

## Kết luận

Authentication và Authorization system này cung cấp:

- **Comprehensive Security**: JWT tokens, refresh tokens, password hashing
- **Flexible Authorization**: Role-based và permission-based access control
- **Developer Experience**: Easy-to-use decorators và guards
- **Audit Trail**: Login history và security logging
- **Scalability**: Token-based authentication cho distributed systems
- **Best Practices**: Security headers, rate limiting, validation

System này ready cho production use và có thể extend thêm features như:

- Social authentication (Google, Facebook)
- Two-factor authentication (2FA)
- Password reset flows
- Account verification
- Session management
