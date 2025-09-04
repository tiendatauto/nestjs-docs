# Phân tích chi tiết hệ thống quản lý người dùng (User Management) trong dự án NestJS ecom

## 1. Tổng quan kiến trúc quản lý người dùng

### 1.1 Các chức năng chính

1. **Đăng ký (Registration)** - Tạo tài khoản mới với xác thực OTP email
2. **Đăng nhập (Login)** - Xác thực với email/password + 2FA (tùy chọn)
3. **Đăng xuất (Logout)** - Hủy refresh token và đánh dấu device không hoạt động
4. **Quản lý hồ sơ (Profile)** - Xem và cập nhật thông tin cá nhân
5. **Xác thực 2 yếu tố (2FA)** - Thiết lập và quản lý TOTP
6. **Quên mật khẩu** - Đặt lại mật khẩu qua OTP email
7. **Quản lý phiên đăng nhập** - Theo dõi và quản lý thiết bị đăng nhập
8. **OAuth2 Google** - Đăng nhập bằng tài khoản Google

### 1.2 Các đối tượng chính

- **User** - Người dùng hệ thống
- **Device** - Thiết bị đăng nhập (browser, mobile app, etc.)
- **RefreshToken** - Token để làm mới access token
- **VerificationCode** - Mã OTP cho các hoạt động xác thực
- **Role** - Vai trò người dùng (liên kết với hệ thống phân quyền)

---

## 2. Phân tích chi tiết các đối tượng

### 2.1 User (Người dùng)

- **Schema:** Định nghĩa trong `prisma/schema.prisma`
- **Thuộc tính chính:**
  - `id`: int, khóa chính
  - `email`: string, email duy nhất
  - `name`: varchar(500), tên người dùng
  - `password`: varchar(500), mật khẩu đã hash (Argon2)
  - `phoneNumber`: varchar(50), số điện thoại
  - `avatar`: varchar(1000), nullable, URL ảnh đại diện
  - `totpSecret`: varchar(1000), nullable, secret cho 2FA TOTP
  - `status`: enum UserStatus (ACTIVE, INACTIVE, BLOCKED), default INACTIVE
  - `roleId`: int, khóa ngoại liên kết đến Role
  - Các trường audit trail: `createdAt`, `updatedAt`, `deletedAt`
- **Quan hệ:**
  - `role`: Role (n-1), vai trò người dùng
  - `devices`: Device[] (1-n), các thiết bị đã đăng nhập
  - `refreshTokens`: RefreshToken[] (1-n), các refresh token
  - `carts`: CartItem[] (1-n), giỏ hàng
  - `orders`: Order[] (1-n), đơn hàng
  - Tự quan hệ tracking: `createdBy`, `updatedBy`, `deletedBy`

**Code thực tế (User Schema trích từ source):**

```prisma
model User {
  id          Int     @id @default(autoincrement())
  email       String
  name        String  @db.VarChar(500)
  password    String  @db.VarChar(500)
  phoneNumber String  @db.VarChar(50)
  avatar      String? @db.VarChar(1000)
  totpSecret  String? @db.VarChar(1000)
  status      UserStatus @default(INACTIVE)
  roleId      Int
  role        Role    @relation(fields: [roleId], references: [id], onDelete: NoAction, onUpdate: NoAction)
  devices     Device[]
  refreshTokens RefreshToken[]
  // ...other relationships...
}
```

### 2.2 Device (Thiết bị)

- **Schema:** Định nghĩa trong `prisma/schema.prisma`
- **Thuộc tính chính:**
  - `id`: int, khóa chính
  - `userId`: int, khóa ngoại liên kết đến User
  - `userAgent`: string, thông tin trình duyệt/ứng dụng
  - `ip`: string, địa chỉ IP
  - `lastActive`: datetime, thời gian hoạt động cuối (auto update)
  - `createdAt`: datetime, thời gian tạo
  - `isActive`: boolean, trạng thái thiết bị (đang đăng nhập hay đã logout)
- **Quan hệ:**
  - `user`: User (n-1), người dùng sở hữu thiết bị
  - `refreshTokens`: RefreshToken[] (1-n), các refresh token của thiết bị

**Code thực tế:**

```prisma
model Device {
  id            Int            @id @default(autoincrement())
  userId        Int
  user          User           @relation(fields: [userId], references: [id], onDelete: Cascade, onUpdate: NoAction)
  userAgent     String
  ip            String
  lastActive    DateTime       @updatedAt
  createdAt     DateTime       @default(now())
  isActive      Boolean        @default(true)
  refreshTokens RefreshToken[]
}
```

### 2.3 RefreshToken

- **Schema:** Định nghĩa trong `prisma/schema.prisma`
- **Thuộc tính chính:**
  - `token`: string, unique, refresh token JWT
  - `userId`: int, khóa ngoại liên kết đến User
  - `deviceId`: int, khóa ngoại liên kết đến Device
  - `expiresAt`: datetime, thời gian hết hạn
  - `createdAt`: datetime, thời gian tạo
- **Quan hệ:**
  - `user`: User (n-1), người dùng sở hữu token
  - `device`: Device (n-1), thiết bị tạo token
- **Đặc điểm:**
  - Mỗi thiết bị có thể có nhiều refresh token (khi refresh)
  - Token cũ bị xóa khi tạo token mới
  - Cascade delete khi xóa User hoặc Device

**Code thực tế:**

```prisma
model RefreshToken {
  token     String   @unique @db.VarChar(1000)
  userId    Int
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade, onUpdate: NoAction)
  deviceId  Int
  device    Device   @relation(fields: [deviceId], references: [id], onDelete: Cascade, onUpdate: NoAction)
  expiresAt DateTime
  createdAt DateTime @default(now())
}
```

### 2.4 VerificationCode (Mã xác thực)

- **Schema:** Định nghĩa trong `prisma/schema.prisma`
- **Thuộc tính chính:**
  - `id`: int, khóa chính
  - `email`: varchar(500), email nhận mã
  - `code`: varchar(50), mã OTP (6 số)
  - `type`: enum VerificationCodeType (REGISTER, FORGOT_PASSWORD, LOGIN, DISABLE_2FA)
  - `expiresAt`: datetime, thời gian hết hạn
  - `createdAt`: datetime, thời gian tạo
- **Ràng buộc:**
  - `@@unique([email, type])`: Mỗi email chỉ có 1 mã cho mỗi loại
  - `@@index([expiresAt])`: Index để cleanup mã hết hạn
- **Đặc điểm:**
  - Sử dụng upsert khi tạo mã mới (thay thế mã cũ nếu có)
  - Tự động hết hạn theo thời gian cấu hình
  - Bị xóa sau khi sử dụng thành công

**Code thực tế:**

```prisma
model VerificationCode {
  id    Int                  @id @default(autoincrement())
  email String               @db.VarChar(500)
  code  String               @db.VarChar(50)
  type  VerificationCodeType
  expiresAt DateTime
  createdAt DateTime @default(now())
  @@unique([email, type])
  @@index([expiresAt])
}
```

**Các loại mã xác thực:**

```typescript
export const TypeOfVerificationCode = {
  REGISTER: "REGISTER", // Đăng ký tài khoản
  FORGOT_PASSWORD: "FORGOT_PASSWORD", // Quên mật khẩu
  LOGIN: "LOGIN", // Đăng nhập (khi có 2FA)
  DISABLE_2FA: "DISABLE_2FA", // Tắt 2FA
} as const;
```

---

## 3. Flow nghiệp vụ chi tiết

### 3.1 Flow đăng ký (Registration)

#### 3.1.1 Gửi OTP đăng ký

- **API:** `POST /auth/otp`
- **Controller:** `AuthController.sendOTP`
- **Service:** `AuthService.sendOTP`
- **Flow thực tế:**
  1. Kiểm tra email đã tồn tại chưa (nếu type = REGISTER)
  2. Tạo mã OTP 6 chữ số ngẫu nhiên
  3. Lưu OTP vào database với thời gian hết hạn
  4. Gửi OTP qua email
  5. Trả về thông báo thành công

**Code thực tế:**

```typescript
// AuthService.sendOTP
async sendOTP(body: SendOTPBodyType) {
  const user = await this.sharedUserRepository.findUnique({
    email: body.email,
  })

  // Kiểm tra logic cho từng loại OTP
  if (body.type === TypeOfVerificationCode.REGISTER && user) {
    throw EmailAlreadyExistsException
  }
  if (body.type === TypeOfVerificationCode.FORGOT_PASSWORD && !user) {
    throw EmailNotFoundException
  }

  // Tạo mã OTP
  const code = generateOTP() // Random 6-digit number

  await this.authRepository.createVerificationCode({
    email: body.email,
    code,
    type: body.type,
    expiresAt: addMilliseconds(new Date(), ms(envConfig.OTP_EXPIRES_IN)),
  })

  // Gửi OTP qua email
  const { error } = await this.emailService.sendOTP({
    email: body.email,
    code,
  })

  if (error) {
    throw FailedToSendOTPException
  }

  return { message: 'Gửi mã OTP thành công' }
}

// AuthRepository.createVerificationCode - Sử dụng upsert
async createVerificationCode(payload: Pick<VerificationCodeType, 'email' | 'type' | 'code' | 'expiresAt'>) {
  return this.prismaService.verificationCode.upsert({
    where: {
      email_type: {
        email: payload.email,
        type: payload.type,
      },
    },
    create: payload,
    update: {
      code: payload.code,
      expiresAt: payload.expiresAt,
    },
  })
}
```

#### 3.1.2 Đăng ký tài khoản

- **API:** `POST /auth/register`
- **Controller:** `AuthController.register`
- **Service:** `AuthService.register`
- **Flow thực tế:**
  1. Validate dữ liệu đầu vào (email, password, confirmPassword, name, phoneNumber, code)
  2. Kiểm tra mã OTP hợp lệ và chưa hết hạn
  3. Hash mật khẩu bằng Argon2
  4. Lấy roleId mặc định (CLIENT)
  5. Tạo user mới trong database
  6. Xóa mã OTP đã sử dụng
  7. Trả về thông tin user (ẩn password và totpSecret)

**Code thực tế:**

```typescript
// AuthService.register
async register(body: RegisterBodyType) {
  try {
    // Validate OTP
    await this.validateVerificationCode({
      email: body.email,
      type: TypeOfVerificationCode.REGISTER,
    })

    const clientRoleId = await this.sharedRoleRepository.getClientRoleId()
    const hashedPassword = await this.hashingService.hash(body.password)

    const [user] = await Promise.all([
      this.authRepository.createUser({
        email: body.email,
        name: body.name,
        phoneNumber: body.phoneNumber,
        password: hashedPassword,
        roleId: clientRoleId,
      }),
      this.authRepository.deleteVerificationCode({
        email_type: {
          email: body.email,
          type: TypeOfVerificationCode.REGISTER,
        },
      }),
    ])

    return user
  } catch (error) {
    if (isUniqueConstraintPrismaError(error)) {
      throw EmailAlreadyExistsException
    }
    throw error
  }
}

// Validation OTP
async validateVerificationCode({ email, type }: { email: string; type: TypeOfVerificationCodeType }) {
  const verificationCode = await this.authRepository.findUniqueVerificationCode({
    email_type: { email, type },
  })

  if (!verificationCode) {
    throw InvalidOTPException
  }

  if (verificationCode.expiresAt < new Date()) {
    throw OTPExpiredException
  }

  return verificationCode
}
```

### 3.2 Flow đăng nhập (Login)

#### 3.2.1 Đăng nhập cơ bản (không có 2FA)

- **API:** `POST /auth/login`
- **Controller:** `AuthController.login`
- **Service:** `AuthService.login`
- **Flow thực tế:**
  1. Validate email và password
  2. Kiểm tra user tồn tại và password đúng
  3. Tạo Device mới (lưu userAgent và IP)
  4. Tạo cặp Access Token + Refresh Token
  5. Lưu Refresh Token vào database
  6. Trả về cả hai token

**Code thực tế:**

```typescript
// AuthService.login (phần cơ bản)
async login(body: LoginBodyType & { userAgent: string; ip: string }) {
  // 1. Kiểm tra user và password
  const user = await this.authRepository.findUniqueUserIncludeRole({
    email: body.email,
  })

  if (!user) {
    throw EmailNotFoundException
  }

  const isPasswordMatch = await this.hashingService.compare(body.password, user.password)
  if (!isPasswordMatch) {
    throw InvalidPasswordException
  }

  // 2. Nếu user chưa bật 2FA, tiếp tục đăng nhập
  if (!user.totpSecret) {
    // 3. Tạo device mới
    const device = await this.authRepository.createDevice({
      userId: user.id,
      userAgent: body.userAgent,
      ip: body.ip,
    })

    // 4. Tạo tokens
    const tokens = await this.generateTokens({
      userId: user.id,
      deviceId: device.id,
      roleId: user.roleId,
      roleName: user.role.name,
    })

    return tokens
  }

  // Nếu có 2FA, cần kiểm tra thêm...
}

// Tạo cặp tokens
async generateTokens({ userId, deviceId, roleId, roleName }: AccessTokenPayloadCreate) {
  const [accessToken, refreshToken] = await Promise.all([
    this.tokenService.signAccessToken({
      userId,
      deviceId,
      roleId,
      roleName,
    }),
    this.tokenService.signRefreshToken({
      userId,
    }),
  ])

  const decodedRefreshToken = await this.tokenService.verifyRefreshToken(refreshToken)

  await this.authRepository.createRefreshToken({
    token: refreshToken,
    userId,
    expiresAt: new Date(decodedRefreshToken.exp * 1000),
    deviceId,
  })

  return { accessToken, refreshToken }
}
```

#### 3.2.2 Đăng nhập với 2FA

- **Flow mở rộng khi user đã bật 2FA:**
  1. Sau khi validate email/password thành công
  2. Kiểm tra user có `totpSecret` (đã bật 2FA)
  3. Yêu cầu một trong hai: `totpCode` (TOTP app) hoặc `code` (OTP email)
  4. Validate mã xác thực
  5. Nếu hợp lệ, tiếp tục tạo device và tokens

**Code thực tế:**

```typescript
// AuthService.login (phần 2FA)
if (user.totpSecret) {
  // Nếu không có mã TOTP và Code thì thông báo
  if (!body.totpCode && !body.code) {
    throw InvalidTOTPAndCodeException;
  }

  // Kiểm tra TOTP Code (từ app như Google Authenticator)
  if (body.totpCode) {
    const isValid = this.twoFactorService.verifyTOTP({
      email: user.email,
      secret: user.totpSecret,
      token: body.totpCode,
    });
    if (!isValid) {
      throw InvalidTOTPException;
    }
  } else if (body.code) {
    // Kiểm tra mã OTP email
    await this.validateVerificationCode({
      email: user.email,
      type: TypeOfVerificationCode.LOGIN,
    });
  }
}
```

### 3.3 Flow làm mới token (Refresh Token)

- **API:** `POST /auth/refresh-token`
- **Controller:** `AuthController.refreshToken`
- **Service:** `AuthService.refreshToken`
- **Flow thực tế:**
  1. Validate refresh token JWT
  2. Kiểm tra refresh token có tồn tại trong database không
  3. Cập nhật thông tin device (IP, userAgent mới)
  4. Xóa refresh token cũ
  5. Tạo cặp token mới
  6. Trả về access token và refresh token mới

**Code thực tế:**

```typescript
// AuthService.refreshToken
async refreshToken({ refreshToken, userAgent, ip }: RefreshTokenBodyType & { userAgent: string; ip: string }) {
  try {
    // 1. Validate JWT
    const { userId } = await this.tokenService.verifyRefreshToken(refreshToken)

    // 2. Kiểm tra token trong database
    const refreshTokenInDb = await this.authRepository.findUniqueRefreshTokenIncludeUserRole({
      token: refreshToken,
    })

    if (!refreshTokenInDb) {
      // Token đã được sử dụng rồi - có thể bị đánh cắp
      throw RefreshTokenAlreadyUsedException
    }

    const {
      deviceId,
      user: {
        roleId,
        role: { name: roleName },
      },
    } = refreshTokenInDb

    // 3. Cập nhật device
    const $updateDevice = this.authRepository.updateDevice(deviceId, {
      ip,
      userAgent,
    })

    // 4. Xóa token cũ
    const $deleteRefreshToken = this.authRepository.deleteRefreshToken({
      token: refreshToken,
    })

    // 5. Tạo tokens mới
    const $tokens = this.generateTokens({ userId, roleId, roleName, deviceId })

    const [, , tokens] = await Promise.all([$updateDevice, $deleteRefreshToken, $tokens])
    return tokens
  } catch (error) {
    if (error instanceof HttpException) {
      throw error
    }
    throw UnauthorizedAccessException
  }
}
```

### 3.4 Flow đăng xuất (Logout)

- **API:** `POST /auth/logout`
- **Controller:** `AuthController.logout`
- **Service:** `AuthService.logout`
- **Flow thực tế:**
  1. Validate refresh token JWT
  2. Xóa refresh token khỏi database
  3. Đánh dấu device là không hoạt động (`isActive = false`)
  4. Trả về thông báo thành công

**Code thực tế:**

```typescript
// AuthService.logout
async logout(refreshToken: string) {
  try {
    // 1. Validate JWT
    await this.tokenService.verifyRefreshToken(refreshToken)

    // 2. Xóa refresh token
    const deletedRefreshToken = await this.authRepository.deleteRefreshToken({
      token: refreshToken,
    })

    // 3. Cập nhật device là đã logout
    await this.authRepository.updateDevice(deletedRefreshToken.deviceId, {
      isActive: false,
    })

    return { message: 'Đăng xuất thành công' }
  } catch (error) {
    if (isNotFoundPrismaError(error)) {
      throw RefreshTokenAlreadyUsedException
    }
    throw UnauthorizedAccessException
  }
}
```

### 3.5 Flow quên mật khẩu (Forgot Password)

#### 3.5.1 Gửi OTP quên mật khẩu

- **Sử dụng chung API:** `POST /auth/otp` với `type: "FORGOT_PASSWORD"`
- **Logic tương tự gửi OTP đăng ký nhưng:**
  - Kiểm tra email phải tồn tại trong hệ thống
  - Type = `FORGOT_PASSWORD`

#### 3.5.2 Đặt lại mật khẩu

- **API:** `POST /auth/forgot-password`
- **Controller:** `AuthController.forgotPassword`
- **Service:** `AuthService.forgotPassword`
- **Flow thực tế:**
  1. Validate dữ liệu (email, code, newPassword, confirmNewPassword)
  2. Kiểm tra email tồn tại
  3. Validate mã OTP
  4. Hash mật khẩu mới
  5. Cập nhật mật khẩu trong database
  6. Xóa mã OTP đã sử dụng

**Code thực tế:**

```typescript
// AuthService.forgotPassword
async forgotPassword(body: ForgotPasswordBodyType) {
  const { email, code, newPassword } = body

  // 1. Kiểm tra email tồn tại
  const user = await this.sharedUserRepository.findUnique({ email })
  if (!user) {
    throw EmailNotFoundException
  }

  // 2. Validate OTP
  await this.validateVerificationCode({
    email,
    type: TypeOfVerificationCode.FORGOT_PASSWORD,
  })

  // 3. Hash mật khẩu mới và cập nhật
  const hashedPassword = await this.hashingService.hash(newPassword)

  await Promise.all([
    this.sharedUserRepository.update(
      { id: user.id },
      {
        password: hashedPassword,
        updatedById: user.id,
      },
    ),
    this.authRepository.deleteVerificationCode({
      email_type: {
        email: body.email,
        type: TypeOfVerificationCode.FORGOT_PASSWORD,
      },
    }),
  ])

  return {
    message: 'Đổi mật khẩu thành công',
  }
}
```

---

## 4. Flow 2FA (Two-Factor Authentication)

### 4.1 Thiết lập 2FA

- **API:** `POST /auth/2fa/setup`
- **Controller:** `AuthController.setupTwoFactorAuth`
- **Service:** `AuthService.setupTwoFactorAuth`
- **Flow thực tế:**
  1. Kiểm tra user tồn tại và chưa bật 2FA
  2. Tạo TOTP secret và URI
  3. Lưu secret vào database
  4. Trả về secret và URI (để tạo QR code)

**Code thực tế:**

```typescript
// AuthService.setupTwoFactorAuth
async setupTwoFactorAuth(userId: number) {
  // 1. Kiểm tra user và trạng thái 2FA
  const user = await this.sharedUserRepository.findUnique({ id: userId })
  if (!user) {
    throw EmailNotFoundException
  }
  if (user.totpSecret) {
    throw TOTPAlreadyEnabledException
  }

  // 2. Tạo secret và URI
  const { secret, uri } = this.twoFactorService.generateTOTPSecret(user.email)

  // 3. Lưu secret vào database
  await this.sharedUserRepository.update(
    { id: userId },
    { totpSecret: secret, updatedById: userId }
  )

  // 4. Trả về để client tạo QR code
  return { secret, uri }
}

// TwoFactorService.generateTOTPSecret
generateTOTPSecret(email: string) {
  const totp = this.createTOTP(email)
  return {
    secret: totp.secret.base32,
    uri: totp.toString(), // URI để tạo QR code
  }
}
```

### 4.2 Tắt 2FA

- **API:** `POST /auth/2fa/disable`
- **Controller:** `AuthController.disableTwoFactorAuth`
- **Service:** `AuthService.disableTwoFactorAuth`
- **Flow thực tế:**
  1. Kiểm tra user tồn tại và đã bật 2FA
  2. Validate một trong hai: `totpCode` hoặc `code` (OTP email)
  3. Cập nhật `totpSecret = null`
  4. Trả về thông báo thành công

**Code thực tế:**

```typescript
// AuthService.disableTwoFactorAuth
async disableTwoFactorAuth(data: DisableTwoFactorBodyType & { userId: number }) {
  const { userId, totpCode, code } = data

  // 1. Kiểm tra user và trạng thái 2FA
  const user = await this.sharedUserRepository.findUnique({ id: userId })
  if (!user) {
    throw EmailNotFoundException
  }
  if (!user.totpSecret) {
    throw TOTPNotEnabledException
  }

  // 2. Validate TOTP hoặc OTP email
  if (totpCode) {
    const isValid = this.twoFactorService.verifyTOTP({
      email: user.email,
      secret: user.totpSecret,
      token: totpCode,
    })
    if (!isValid) {
      throw InvalidTOTPException
    }
  } else if (code) {
    await this.validateVerificationCode({
      email: user.email,
      type: TypeOfVerificationCode.DISABLE_2FA,
    })
  }

  // 3. Tắt 2FA
  await this.sharedUserRepository.update(
    { id: userId },
    { totpSecret: null, updatedById: userId }
  )

  return { message: 'Tắt 2FA thành công' }
}
```

### 4.3 Xác thực TOTP

**Service:** `TwoFactorService`

```typescript
// TwoFactorService.verifyTOTP
verifyTOTP({ email, token, secret }: { email: string; secret: string; token: string }): boolean {
  const totp = this.createTOTP(email, secret)
  const delta = totp.validate({ token, window: 1 })
  return delta !== null // null = invalid, number = valid
}

private createTOTP(email: string, secret?: string) {
  return new OTPAuth.TOTP({
    issuer: envConfig.APP_NAME,
    label: email,
    algorithm: 'SHA1',
    digits: 6,
    period: 30, // 30 seconds
    secret: secret || new OTPAuth.Secret(),
  })
}
```

---

## 5. Flow quản lý hồ sơ (Profile Management)

### 5.1 Xem hồ sơ

- **API:** `GET /profile`
- **Controller:** `ProfileController.getProfile`
- **Service:** `ProfileService.getProfile`
- **Flow thực tế:**
  1. Lấy userId từ token (decorator `@ActiveUser`)
  2. Query user với thông tin role và permissions
  3. Trả về thông tin đầy đủ (trừ password và totpSecret)

**Code thực tế:**

```typescript
// ProfileService.getProfile
async getProfile(userId: number) {
  const user = await this.sharedUserRepository.findUniqueIncludeRolePermissions({
    id: userId,
  })

  if (!user) {
    throw NotFoundRecordException
  }

  return user
}
```

### 5.2 Cập nhật hồ sơ

- **API:** `PUT /profile`
- **Controller:** `ProfileController.updateProfile`
- **Service:** `ProfileService.updateProfile`
- **Flow thực tế:**
  1. Lấy userId từ token
  2. Validate dữ liệu đầu vào (name, phoneNumber, avatar, etc.)
  3. Cập nhật thông tin user
  4. Trả về user đã cập nhật

**Code thực tế:**

```typescript
// ProfileService.updateProfile
async updateProfile({ userId, body }: { userId: number; body: UpdateMeBodyType }) {
  try {
    return await this.sharedUserRepository.update(
      { id: userId },
      {
        ...body,
        updatedById: userId,
      },
    )
  } catch (error) {
    if (isUniqueConstraintPrismaError(error)) {
      throw NotFoundRecordException
    }
    throw error
  }
}
```

### 5.3 Đổi mật khẩu

- **API:** `PUT /profile/change-password`
- **Controller:** `ProfileController.changePassword`
- **Service:** `ProfileService.changePassword`
- **Flow thực tế:**
  1. Lấy userId từ token
  2. Validate dữ liệu (password, newPassword, confirmNewPassword)
  3. Kiểm tra mật khẩu hiện tại đúng không
  4. Hash mật khẩu mới
  5. Cập nhật trong database

**Code thực tế:**

```typescript
// ProfileService.changePassword
async changePassword({ userId, body }: { userId: number; body: Omit<ChangePasswordBodyType, 'confirmNewPassword'> }) {
  try {
    const { password, newPassword } = body

    const user = await this.sharedUserRepository.findUnique({ id: userId })
    if (!user) {
      throw NotFoundRecordException
    }

    const isPasswordMatch = await this.hashingService.compare(password, user.password)
    if (!isPasswordMatch) {
      throw InvalidPasswordException
    }

    const hashedPassword = await this.hashingService.hash(newPassword)

    await this.sharedUserRepository.update(
      { id: userId },
      {
        password: hashedPassword,
        updatedById: userId,
      },
    )

    return { message: 'Password changed successfully' }
  } catch (error) {
    if (isUniqueConstraintPrismaError(error)) {
      throw NotFoundRecordException
    }
    throw error
  }
}
```

---

## 6. Flow OAuth2 Google

### 6.1 Lấy authorization URL

- **API:** `GET /auth/google-link`
- **Controller:** `AuthController.getAuthorizationUrl`
- **Service:** `GoogleService.getAuthorizationUrl`
- **Flow thực tế:**
  1. Tạo state chứa thông tin device (userAgent, IP)
  2. Tạo Google OAuth2 authorization URL
  3. Trả về URL để redirect

### 6.2 Xử lý callback từ Google

- **API:** `GET /auth/google/callback`
- **Controller:** `AuthController.googleCallback`
- **Service:** `GoogleService.googleCallback`
- **Flow thực tế:**
  1. Nhận authorization code và state từ Google
  2. Exchange code để lấy access token từ Google
  3. Lấy thông tin user từ Google API
  4. Tìm hoặc tạo user trong database
  5. Tạo device và tokens
  6. Redirect về client với tokens

---

## 7. Quản lý phiên đăng nhập và thiết bị

### 7.1 Tracking thiết bị

Mỗi lần đăng nhập thành công, hệ thống tạo một record Device mới:

```typescript
// AuthRepository.createDevice
createDevice(data: Pick<DeviceType, 'userId' | 'userAgent' | 'ip'>) {
  return this.prismaService.device.create({
    data: {
      ...data,
      isActive: true, // Mặc định là active
      lastActive: new Date(), // Thời gian hiện tại
    },
  })
}
```

### 7.2 Cập nhật hoạt động thiết bị

Mỗi lần refresh token, hệ thống cập nhật thông tin thiết bị:

```typescript
// AuthRepository.updateDevice
updateDevice(deviceId: number, data: Partial<DeviceType>) {
  return this.prismaService.device.update({
    where: { id: deviceId },
    data: {
      ...data,
      lastActive: new Date(), // Tự động cập nhật lastActive
    },
  })
}
```

### 7.3 Đánh dấu thiết bị logout

Khi logout, thiết bị được đánh dấu không hoạt động:

```typescript
await this.authRepository.updateDevice(deletedRefreshToken.deviceId, {
  isActive: false,
});
```

---

## 8. Bảo mật và validation

### 8.1 Validation với Zod

Tất cả input đều được validate bằng Zod schemas:

```typescript
// Validation đăng ký
export const RegisterBodySchema = UserSchema.pick({
  email: true,
  password: true,
  name: true,
  phoneNumber: true,
})
  .extend({
    confirmPassword: z.string().min(6).max(100),
    code: z.string().length(6),
  })
  .strict()
  .superRefine(({ confirmPassword, password }, ctx) => {
    if (confirmPassword !== password) {
      ctx.addIssue({
        code: "custom",
        message: "Password and confirm password must match",
        path: ["confirmPassword"],
      });
    }
  });

// Validation đăng nhập với 2FA
export const LoginBodySchema = UserSchema.pick({
  email: true,
  password: true,
})
  .extend({
    totpCode: z.string().length(6).optional(),
    code: z.string().length(6).optional(),
  })
  .strict()
  .superRefine(({ totpCode, code }, ctx) => {
    const message =
      "Bạn chỉ nên truyền mã xác thực 2FA hoặc mã OTP. Không được truyền cả 2";
    if (totpCode !== undefined && code !== undefined) {
      ctx.addIssue({
        path: ["totpCode"],
        message,
        code: "custom",
      });
      ctx.addIssue({
        path: ["code"],
        message,
        code: "custom",
      });
    }
  });
```

### 8.2 Hash mật khẩu

Sử dụng Argon2 để hash mật khẩu:

```typescript
// HashingService
async hash(data: string): Promise<string> {
  return argon2.hash(data)
}

async compare(data: string, hashedData: string): Promise<boolean> {
  return argon2.verify(hashedData, data)
}
```

### 8.3 JWT tokens

- **Access Token**: Chứa userId, deviceId, roleId, roleName
- **Refresh Token**: Chỉ chứa userId
- **Expiration**: Access token ngắn (15-30 phút), Refresh token dài (7-30 ngày)

---

## 9. Error handling

### 9.1 Custom exceptions

```typescript
export const EmailAlreadyExistsException = new BadRequestException(
  "Email already exists"
);
export const EmailNotFoundException = new NotFoundException("Email not found");
export const InvalidOTPException = new BadRequestException("Invalid OTP");
export const OTPExpiredException = new BadRequestException("OTP expired");
export const InvalidTOTPException = new BadRequestException(
  "Invalid TOTP code"
);
export const RefreshTokenAlreadyUsedException = new UnauthorizedException(
  "Refresh token already used"
);
export const TOTPAlreadyEnabledException = new BadRequestException(
  "2FA already enabled"
);
export const TOTPNotEnabledException = new BadRequestException(
  "2FA not enabled"
);
```

### 9.2 Error handling patterns

```typescript
try {
  // Business logic
} catch (error) {
  if (isUniqueConstraintPrismaError(error)) {
    throw EmailAlreadyExistsException;
  }
  if (isNotFoundPrismaError(error)) {
    throw EmailNotFoundException;
  }
  throw error; // Re-throw unknown errors
}
```

---

## 10. Điểm nổi bật trong thiết kế

### 10.1 Security Best Practices

1. **Password Hashing**: Sử dụng Argon2 (state-of-the-art)
2. **JWT Security**: Separate access/refresh tokens, short expiration
3. **2FA Support**: TOTP với backup qua email OTP
4. **Device Tracking**: Theo dõi và quản lý thiết bị đăng nhập
5. **OTP Security**: Thời gian hết hạn, unique per email+type

### 10.2 User Experience

1. **Flexible 2FA**: TOTP app hoặc email OTP
2. **Device Management**: Tracking thiết bị, logout per device
3. **OAuth2 Integration**: Đăng nhập Google
4. **Password Recovery**: Qua email OTP

### 10.3 Data Integrity

1. **Audit Trail**: Tracking người tạo/sửa/xóa
2. **Soft Delete**: Không mất dữ liệu lịch sử
3. **Transaction**: Đảm bảo tính nhất quán
4. **Validation**: Comprehensive input validation

### 10.4 Scalability

1. **Stateless Authentication**: JWT tokens
2. **Device Isolation**: Mỗi thiết bị có token riêng
3. **Database Optimization**: Proper indexing và relationships
4. **Clean Architecture**: Repository pattern, service layers

---

## 11. Sơ đồ tổng quát flow authentication

```
1. Registration Flow:
   User → Send OTP → Validate Email → Create Account → Auto Login

2. Login Flow:
   User → Validate Credentials → [2FA Check] → Create Device → Generate Tokens

3. Token Refresh Flow:
   Client → Validate Refresh Token → Update Device → Generate New Tokens

4. Logout Flow:
   Client → Validate Refresh Token → Delete Token → Mark Device Inactive

5. 2FA Setup Flow:
   User → Generate TOTP Secret → Save to DB → Return QR Code Data

6. Password Recovery Flow:
   User → Send OTP → Validate OTP → Update Password → Delete OTP
```

---

> **Nguồn code thực tế:**
>
> - prisma/schema.prisma (User, Device, RefreshToken, VerificationCode models)
> - ecom/src/routes/auth/\* (Authentication logic)
> - ecom/src/routes/profile/\* (Profile management)
> - ecom/src/shared/services/2fa.service.ts (TOTP implementation)
> - ecom/src/shared/services/hashing.service.ts (Password hashing)
> - ecom/src/shared/services/token.service.ts (JWT handling)
> - ecom/src/shared/decorators/\* (Authentication decorators)
> - ecom/src/shared/constants/auth.constant.ts (Auth constants)
