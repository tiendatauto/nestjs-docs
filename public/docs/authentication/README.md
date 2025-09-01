# Authentication Guards trong NestJS

## Tổng quan

Authentication Guard là một khái niệm quan trọng trong NestJS để bảo vệ các route/endpoint khỏi truy cập trái phép. Có nhiều cách khác nhau để implement Authentication Guard.

## 1. Basic Authentication Guard

### Cách 1: Simple Token Validation Guard

```typescript
import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common'
import { Request } from 'express'

@Injectable()
export class SimpleAuthGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request>()
    const token = request.headers.authorization?.replace('Bearer ', '')

    if (!token) {
      throw new UnauthorizedException('Token không được cung cấp')
    }

    // Validate token logic ở đây
    if (token !== 'valid-token') {
      throw new UnauthorizedException('Token không hợp lệ')
    }

    return true
  }
}
```

**Ưu điểm:**

- Đơn giản, dễ hiểu
- Phù hợp cho ứng dụng nhỏ

**Nhược điểm:**

- Không linh hoạt
- Khó mở rộng

## 2. JWT Authentication Guard

### Cách 2: JWT Guard với Passport

```typescript
import { Injectable, ExecutionContext, UnauthorizedException } from '@nestjs/common'
import { AuthGuard } from '@nestjs/passport'
import { JwtService } from '@nestjs/jwt'

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {
  constructor(private jwtService: JwtService) {
    super()
  }

  canActivate(context: ExecutionContext) {
    const request = context.switchToHttp().getRequest()
    const token = this.extractTokenFromHeader(request)

    if (!token) {
      throw new UnauthorizedException('Token không tồn tại')
    }

    try {
      const payload = this.jwtService.verify(token)
      request.user = payload
    } catch (error) {
      throw new UnauthorizedException('Token không hợp lệ')
    }

    return super.canActivate(context)
  }

  private extractTokenFromHeader(request: any): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? []
    return type === 'Bearer' ? token : undefined
  }
}
```

**Setup JWT Strategy:**

```typescript
import { Injectable } from '@nestjs/common'
import { PassportStrategy } from '@nestjs/passport'
import { ExtractJwt, Strategy } from 'passport-jwt'

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET,
    })
  }

  async validate(payload: any) {
    return { userId: payload.sub, username: payload.username }
  }
}
```

**Ưu điểm:**

- Bảo mật cao
- Stateless
- Tích hợp tốt với Passport

**Nhược điểm:**

- Phức tạp hơn
- Cần setup thêm strategy

## 3. Custom Authentication Guard với Database

### Cách 3: Database Token Validation Guard

```typescript
import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common'
import { PrismaService } from '../services/prisma.service'
import { JwtService } from '@nestjs/jwt'

@Injectable()
export class DatabaseAuthGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest()
    const token = this.extractTokenFromHeader(request)

    if (!token) {
      throw new UnauthorizedException('Token không được cung cấp')
    }

    try {
      // Verify JWT token
      const payload = this.jwtService.verify(token)

      // Check user exists in database
      const user = await this.prisma.user.findUnique({
        where: { id: payload.userId },
        select: { id: true, email: true, isActive: true },
      })

      if (!user || !user.isActive) {
        throw new UnauthorizedException('User không tồn tại hoặc bị vô hiệu hóa')
      }

      // Check if token is in blacklist (optional)
      const blacklistedToken = await this.prisma.tokenBlacklist.findUnique({
        where: { token },
      })

      if (blacklistedToken) {
        throw new UnauthorizedException('Token đã bị vô hiệu hóa')
      }

      request.user = user
      return true
    } catch (error) {
      throw new UnauthorizedException('Xác thực thất bại')
    }
  }

  private extractTokenFromHeader(request: any): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? []
    return type === 'Bearer' ? token : undefined
  }
}
```

**Ưu điểm:**

- Kiểm tra real-time database
- Có thể revoke token
- Kiểm tra trạng thái user

**Nhược điểm:**

- Chậm hơn (query database)
- Tốn tài nguyên

## 4. Flexible Authentication Guard với Reflection

### Cách 4: Reflector-based Guard

```typescript
import { Injectable, CanActivate, ExecutionContext, UnauthorizedException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { JwtService } from '@nestjs/jwt'
import { IS_PUBLIC_KEY } from '../decorators/public.decorator'

@Injectable()
export class FlexibleAuthGuard implements CanActivate {
  constructor(
    private jwtService: JwtService,
    private reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Check if route is marked as public
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      context.getHandler(),
      context.getClass(),
    ])

    if (isPublic) {
      return true
    }

    const request = context.switchToHttp().getRequest()
    const token = this.extractTokenFromHeader(request)

    if (!token) {
      throw new UnauthorizedException('Token không được cung cấp')
    }

    try {
      const payload = await this.jwtService.verifyAsync(token, {
        secret: process.env.JWT_SECRET,
      })
      request.user = payload
    } catch {
      throw new UnauthorizedException('Token không hợp lệ')
    }

    return true
  }

  private extractTokenFromHeader(request: any): string | undefined {
    const [type, token] = request.headers.authorization?.split(' ') ?? []
    return type === 'Bearer' ? token : undefined
  }
}
```

**Public Decorator:**

```typescript
import { SetMetadata } from '@nestjs/common'

export const IS_PUBLIC_KEY = 'isPublic'
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true)
```

**Sử dụng:**

```typescript
@Controller('users')
export class UsersController {
  @Public()
  @Get('login')
  login() {
    // Route này không cần authentication
  }

  @Get('profile')
  getProfile() {
    // Route này cần authentication
  }
}
```

**Ưu điểm:**

- Linh hoạt, có thể skip authentication cho một số route
- Sử dụng decorator dễ hiểu
- Tái sử dụng tốt

## 5. Role-based Authentication Guard

### Cách 5: Role Guard

```typescript
import { Injectable, CanActivate, ExecutionContext, ForbiddenException } from '@nestjs/common'
import { Reflector } from '@nestjs/core'
import { ROLES_KEY } from '../decorators/roles.decorator'

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requiredRoles = this.reflector.getAllAndOverride<string[]>(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ])

    if (!requiredRoles) {
      return true
    }

    const { user } = context.switchToHttp().getRequest()

    if (!user) {
      throw new ForbiddenException('User chưa được xác thực')
    }

    const hasRole = requiredRoles.some((role) => user.roles?.includes(role))

    if (!hasRole) {
      throw new ForbiddenException('Không có quyền truy cập')
    }

    return true
  }
}
```

**Roles Decorator:**

```typescript
import { SetMetadata } from '@nestjs/common'

export const ROLES_KEY = 'roles'
export const Roles = (...roles: string[]) => SetMetadata(ROLES_KEY, roles)
```

## 6. Cách đăng ký Guard

### Global Guard (Toàn bộ ứng dụng)

```typescript
// app.module.ts hoặc shared.module.ts
import { APP_GUARD } from '@nestjs/core'

@Module({
  providers: [
    {
      provide: APP_GUARD,
      useClass: FlexibleAuthGuard,
    },
  ],
})
export class AppModule {}
```

### Controller Level Guard

```typescript
@Controller('users')
@UseGuards(JwtAuthGuard)
export class UsersController {
  // Tất cả routes trong controller này sẽ sử dụng JwtAuthGuard
}
```

### Route Level Guard

```typescript
@Controller('users')
export class UsersController {
  @UseGuards(JwtAuthGuard)
  @Get('profile')
  getProfile() {
    // Chỉ route này sử dụng JwtAuthGuard
  }
}
```

## 7. Kết hợp Multiple Guards

```typescript
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AdminController {
  // Cần cả JWT authentication và role admin
}
```

## So sánh các cách tiếp cận

| Cách tiếp cận   | Độ phức tạp | Hiệu suất | Bảo mật | Linh hoạt  | Khuyến nghị     |
| --------------- | ----------- | --------- | ------- | ---------- | --------------- |
| Simple Token    | Thấp        | Cao       | Thấp    | Thấp       | Demo/Prototype  |
| JWT Guard       | Trung bình  | Cao       | Cao     | Trung bình | Production      |
| Database Guard  | Cao         | Thấp      | Rất cao | Cao        | Enterprise      |
| Reflector Guard | Trung bình  | Cao       | Cao     | Rất cao    | **Khuyến nghị** |
| Role Guard      | Trung bình  | Cao       | Cao     | Cao        | Kết hợp         |

## Best Practices

1. **Sử dụng Reflector Guard** cho hầu hết trường hợp
2. **Kết hợp multiple guards** khi cần kiểm tra cả authentication và authorization
3. **Sử dụng Public decorator** cho các route không cần authentication
4. **Validate token format** trước khi verify
5. **Handle errors gracefully** với các HTTP status codes phù hợp
6. **Cache user data** nếu cần query database thường xuyên
7. **Implement token refresh mechanism** cho UX tốt hơn

## Lưu ý khi implement

- Luôn validate input trước khi xử lý
- Sử dụng environment variables cho secret keys
- Implement proper error handling
- Consider rate limiting để tránh brute force attacks
- Log authentication attempts cho security monitoring
