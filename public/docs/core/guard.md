# Multiple Global Guards trong NestJS

Khi cần sử dụng nhiều Global Guard, bạn có thể áp dụng các phương pháp sau:

## 🔧 Phương pháp 1: Khai báo nhiều APP_GUARD providers

Đăng ký nhiều guards như các providers riêng biệt:

```typescript
providers: [
  {
    provide: APP_GUARD,
    useClass: AuthenticationGuard,
  },
  {
    provide: APP_GUARD,
    useClass: AccessTokenGuard,
  },
  {
    provide: APP_GUARD,
    useClass: APIKeyGuard,
  },
]
```

> **Lưu ý:** NestJS sẽ chạy lần lượt tất cả guards theo thứ tự khai báo.

## 🎯 Phương pháp 2: Tạo Composite Guard

Nếu muốn gộp nhiều guards thành một guard duy nhất, hãy tạo một guard wrapper:

```typescript
@Injectable()
export class MultiAuthGuard implements CanActivate {
  constructor(
    private readonly accessTokenGuard: AccessTokenGuard,
    private readonly apiKeyGuard: APIKeyGuard,
    private readonly authenticationGuard: AuthenticationGuard,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    // Thử từng guard theo thứ tự
    if (await this.accessTokenGuard.canActivate(context)) return true
    if (await this.apiKeyGuard.canActivate(context)) return true
    return this.authenticationGuard.canActivate(context)
  }
}
```

Sau đó đăng ký guard composite này:

```typescript
{
  provide: APP_GUARD,
  useClass: MultiAuthGuard,
}
```

## 🎛️ Phương pháp 3: Kết hợp Global và Route-specific Guards

Sử dụng một guard global và áp dụng guards khác cho các route cụ thể:

### Ví dụ:

- `AuthenticationGuard` làm guard global
- `AccessTokenGuard` và `APIKeyGuard` chỉ áp dụng cho route cụ thể

```typescript
@UseGuards(AccessTokenGuard)
@Get('private')
getPrivateData() {
  return 'Private data access successful';
}
```

## � Tóm tắt

> **Quan trọng:** Trong module, bạn chỉ có thể gán một guard cho `APP_GUARD` vì nó là DI token singleton.

### Khi cần nhiều global guards:

- ✅ **Tùy chọn 1:** Đăng ký nhiều `APP_GUARD` providers
- ✅ **Tùy chọn 2:** Gộp chúng thành một `MultiAuthGuard`
- ✅ **Tùy chọn 3:** Kết hợp global và route-specific guards
