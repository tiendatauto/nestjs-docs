# Phân tích chi tiết hệ thống Phân quyền và vai trò (RBAC/PBAC) trong dự án NestJS ecom

## 1. Tổng quan kiến trúc phân quyền

### 1.1 Các chức năng chính

1. **Quản lý vai trò (Role Management)** - Tạo, sửa, xóa và quản lý vai trò người dùng
2. **Quản lý quyền hạn (Permission Management)** - Tự động sync và quản lý permissions từ API endpoints
3. **Kiểm soát quyền truy cập (Access Control)** - Xác thực và phân quyền dựa trên JWT token
4. **Phân quyền theo module (Module-based Access)** - Phân quyền theo nhóm chức năng nghiệp vụ
5. **Caching quyền hạn (Permission Caching)** - Tối ưu hiệu suất với Redis cache
6. **Audit trail** - Theo dõi lịch sử thay đổi role và permission

### 1.2 Mô hình phân quyền áp dụng

Dự án sử dụng kết hợp cả **RBAC (Role-Based Access Control)** và **PBAC (Permission-Based Access Control)**:

- **RBAC**: Người dùng được gán vai trò (Role), mỗi vai trò có các quyền hạn nhất định
- **PBAC**: Kiểm soát quyền truy cập chi tiết dựa trên từng permission cụ thể (path + method)
- **Module-based**: Phân quyền theo module nghiệp vụ (AUTH, PRODUCT, CART, ORDER, etc.)

### 1.3 Các đối tượng chính

- **User** - Người dùng hệ thống (có roleId)
- **Role** - Vai trò người dùng (ADMIN, CLIENT, SELLER)
- **Permission** - Quyền hạn cụ thể (API endpoint + HTTP method)
- **Module** - Nhóm chức năng nghiệp vụ để phân quyền

---

## 2. Phân tích chi tiết các đối tượng

### 2.1 User (Người dùng)

- **Schema:** Định nghĩa trong `prisma/schema.prisma`
- **Thuộc tính phân quyền chính:**
  - `roleId`: int, khóa ngoại liên kết đến Role (bắt buộc, không nullable)
  - `status`: enum UserStatus (ACTIVE, INACTIVE, BLOCKED) - kiểm soát trạng thái hoạt động
- **Quan hệ:**
  - `role`: Role (n-1), mỗi user thuộc 1 role duy nhất
- **Đặc điểm:**
  - Mỗi user phải có 1 role (không nullable)
  - Role quyết định toàn bộ quyền truy cập của user
  - Status ACTIVE mới có thể truy cập hệ thống

**Code thực tế (User Schema trích từ source):**

```prisma
model User {
  id          Int     @id @default(autoincrement())
  email       String
  name        String  @db.VarChar(500)
  // ...other fields...
  status      UserStatus @default(INACTIVE)
  roleId      Int
  role        Role    @relation(fields: [roleId], references: [id], onDelete: NoAction, onUpdate: NoAction)
  // ...audit trail relationships...
  createdPermissions Permission[] @relation("PermissionCreatedBy")
  updatedPermissions Permission[] @relation("PermissionUpdatedBy")
  deletedPermissions Permission[] @relation("PermissionDeletedBy")
  createdRoles       Role[]       @relation("RoleCreatedBy")
  updatedRoles       Role[]       @relation("RoleUpdatedBy")
  deletedRoles       Role[]       @relation("RoleDeletedBy")
}
```

### 2.2 Role (Vai trò)

- **Schema:** Định nghĩa trong `prisma/schema.prisma`
- **Thuộc tính chính:**
  - `id`: int, khóa chính
  - `name`: varchar(500), tên role (unique, không trùng lặp)
  - `description`: string, mô tả chi tiết về role
  - `isActive`: boolean, trạng thái hoạt động của role (default: true)
  - Các trường audit trail: `createdById`, `updatedById`, `deletedById`, `deletedAt`
- **Quan hệ:**
  - `permissions`: Permission[] (n-n), các quyền của role
  - `users`: User[] (1-n), các user thuộc role này
- **3 Role cơ bản được bảo vệ:**
  - `ADMIN`: Toàn quyền hệ thống, không thể xóa/sửa
  - `SELLER`: Người bán hàng, không thể xóa/sửa
  - `CLIENT`: Khách hàng, không thể xóa/sửa

**Code thực tế (Role Schema):**

```prisma
model Role {
  id          Int          @id @default(autoincrement())
  name        String       @db.VarChar(500)
  description String       @default("")
  isActive    Boolean      @default(true)
  permissions Permission[]
  users       User[]

  createdById Int?
  createdBy   User? @relation("RoleCreatedBy", fields: [createdById], references: [id], onDelete: SetNull, onUpdate: NoAction)
  updatedById Int?
  updatedBy   User? @relation("RoleUpdatedBy", fields: [updatedById], references: [id], onDelete: SetNull, onUpdate: NoAction)
  deletedById Int?
  deletedBy   User? @relation("RoleDeletedBy", fields: [deletedById], references: [id], onDelete: SetNull, onUpdate: NoAction)

  deletedAt DateTime?
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt

  @@index([deletedAt])
}
```

**Code thực tế (Role Constants):**

```typescript
export const RoleName = {
  Admin: 'ADMIN',
  Client: 'CLIENT',
  Seller: 'SELLER',
} as const
```

### 2.3 Permission (Quyền hạn)

- **Schema:** Định nghĩa trong `prisma/schema.prisma`
- **Thuộc tính chính:**
  - `id`: int, khóa chính
  - `name`: varchar(500), tên permission
  - `description`: string, mô tả permission
  - `path`: varchar(1000), đường dẫn API (vd: "/users/:userId", "/products")
  - `method`: enum HTTPMethod (GET, POST, PUT, DELETE, PATCH, OPTIONS, HEAD)
  - `module`: varchar(500), module nghiệp vụ (AUTH, PRODUCT, CART, ORDER, etc.)
  - Các trường audit trail
- **Quan hệ:**
  - `roles`: Role[] (n-n), các role có permission này
- **Đặc điểm:**
  - Combination của `path + method` tạo thành permission duy nhất
  - Được tự động sync từ routes thực tế của ứng dụng
  - Phân nhóm theo module để dễ quản lý
  - Hỗ trợ dynamic path parameters (ví dụ: `:userId`)

**Code thực tế (Permission Schema):**

```prisma
model Permission {
  id          Int        @id @default(autoincrement())
  name        String     @db.VarChar(500)
  description String     @default("")
  path        String     @db.VarChar(1000)
  method      HTTPMethod
  module      String     @default("") @db.VarChar(500)
  roles       Role[]

  createdById Int?
  createdBy   User? @relation("PermissionCreatedBy", fields: [createdById], references: [id], onDelete: SetNull, onUpdate: NoAction)
  updatedById Int?
  updatedBy   User? @relation("PermissionUpdatedBy", fields: [updatedById], references: [id], onDelete: SetNull, onUpdate: NoAction)
  deletedById Int?
  deletedBy   User? @relation("PermissionDeletedBy", fields: [deletedById], references: [id], onDelete: SetNull, onUpdate: NoAction)

  deletedAt DateTime?
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt

  @@index([deletedAt])
}
```

**Code thực tế (HTTP Method Constants):**

```typescript
export const HTTPMethod = {
  GET: 'GET',
  POST: 'POST',
  PUT: 'PUT',
  DELETE: 'DELETE',
  PATCH: 'PATCH',
  OPTIONS: 'OPTIONS',
  HEAD: 'HEAD',
} as const
```

---

## 3. Mối quan hệ giữa các đối tượng

### 3.1 Sơ đồ mối quan hệ

```
User (n) ←→ (1) Role (n) ←→ (n) Permission
```

### 3.2 Chi tiết mối quan hệ

1. **User ↔ Role (n-1)**

   - Một User chỉ thuộc về một Role duy nhất (`roleId` không nullable)
   - Một Role có thể có nhiều User
   - Ràng buộc `onDelete: NoAction` để đảm bảo không xóa Role khi có User

2. **Role ↔ Permission (n-n)**

   - Một Role có thể có nhiều Permission
   - Một Permission có thể thuộc về nhiều Role
   - Quan hệ thông qua bảng trung gian ngầm định của Prisma

3. **Module-based Grouping**
   - Permission được nhóm theo module nghiệp vụ
   - Mỗi Role được gán Permission theo nhóm module phù hợp

---

## 4. Flow nghiệp vụ quản lý phân quyền

### 4.1 Flow quản lý Role

#### 4.1.1 Tạo Role mới

- **API:** `POST /roles`
- **Controller:** `RoleController.create`
- **Service:** `RoleService.create`
- **Flow thực tế:**
  1. Validate dữ liệu đầu vào (name, description, isActive)
  2. Kiểm tra trùng lặp tên role
  3. Tạo role mới với người tạo (`createdById`)
  4. Trả về thông tin role đã tạo

**Code thực tế:**

```typescript
// RoleController.create
@Post()
@ZodSerializerDto(CreateRoleResDTO)
create(@Body() body: CreateRoleBodyDTO, @ActiveUser('userId') userId: number) {
  return this.roleService.create({
    data: body,
    createdById: userId,
  })
}

// RoleService.create
async create({ data, createdById }: { data: CreateRoleBodyType; createdById: number }) {
  try {
    const role = await this.roleRepo.create({
      createdById,
      data,
    })
    return role
  } catch (error) {
    if (isUniqueConstraintPrismaError(error)) {
      throw RoleAlreadyExistsException
    }
    throw error
  }
}
```

#### 4.1.2 Cập nhật Role và gán Permission

- **API:** `PUT /roles/:roleId`
- **Controller:** `RoleController.update`
- **Service:** `RoleService.update`
- **Flow thực tế:**
  1. Lấy userId từ token (thông qua decorator `@ActiveUser`)
  2. Kiểm tra role có phải là role cơ bản không (ADMIN, CLIENT, SELLER)
  3. Validate dữ liệu đầu vào (name, description, isActive, permissionIds)
  4. Kiểm tra các permissionIds có tồn tại và chưa bị xóa không
  5. Cập nhật role với permissions mới (sử dụng Prisma `set` operation)
  6. Xóa cache của role đã cập nhật
  7. Trả về role đã cập nhật kèm permissions

**Code thực tế:**

```typescript
// RoleService.update - Kiểm tra role cơ bản
private async verifyRole(roleId: number) {
  const role = await this.roleRepo.findById(roleId)
  if (!role) {
    throw NotFoundRecordException
  }
  const baseRoles: string[] = [RoleName.Admin, RoleName.Client, RoleName.Seller]

  if (baseRoles.includes(role.name)) {
    throw ProhibitedActionOnBaseRoleException
  }
}

// RoleRepo.update - Cập nhật permissions
async update({ id, updatedById, data }: { id: number; updatedById: number; data: UpdateRoleBodyType }) {
  // Kiểm tra permissions có bị xóa không
  if (data.permissionIds.length > 0) {
    const permissions = await this.prismaService.permission.findMany({
      where: { id: { in: data.permissionIds } }
    })
    const deletedPermission = permissions.filter((permission) => permission.deletedAt)
    if (deletedPermission.length > 0) {
      const deletedIds = deletedPermission.map((permission) => permission.id).join(', ')
      throw new Error(`Permission with id has been deleted: ${deletedIds}`)
    }
  }

  return this.prismaService.role.update({
    where: { id, deletedAt: null },
    data: {
      name: data.name,
      description: data.description,
      isActive: data.isActive,
      permissions: {
        set: data.permissionIds.map((id) => ({ id })),
      },
      updatedById,
    },
    include: {
      permissions: { where: { deletedAt: null } }
    },
  })
}
```

#### 4.1.3 Xóa Role (Soft Delete)

- **API:** `DELETE /roles/:roleId`
- **Controller:** `RoleController.delete`
- **Service:** `RoleService.delete`
- **Flow thực tế:**
  1. Kiểm tra role có phải là role cơ bản không
  2. Kiểm tra role không có user nào đang sử dụng
  3. Thực hiện soft delete (cập nhật `deletedAt`, `deletedById`)
  4. Xóa cache của role
  5. Trả về thông báo thành công

### 4.2 Flow quản lý Permission

#### 4.2.1 Tự động sync Permission từ Routes

Hệ thống có cơ chế tự động đồng bộ permissions từ các routes thực tế trong ứng dụng:

**Script:** `ecom/initialScript/create-permissions.ts`

**Flow thực tế:**

1. Khởi tạo NestJS app và lấy danh sách routes
2. Parse routes thành format permission (path + method + module)
3. So sánh với permissions hiện tại trong database
4. Xóa permissions không còn tồn tại trong routes
5. Thêm permissions mới từ routes
6. Cập nhật lại permissions cho các role cơ bản

**Code thực tế:**

```typescript
// Lấy danh sách routes từ NestJS
const availableRoutes = router.stack
  .map((layer) => {
    if (layer.route) {
      const path = layer.route?.path
      const method = String(layer.route?.stack[0].method).toUpperCase()
      const moduleName = String(path.split('/')[1]).toUpperCase()
      return {
        path,
        method,
        name: method + ' ' + path,
        module: moduleName,
      }
    }
  })
  .filter((item) => item !== undefined)

// So sánh và sync permissions
const permissionsToDelete = permissionsInDb.filter((item) => {
  return !availableRoutesMap[`${item.method}-${item.path}`]
})

const routesToAdd = availableRoutes.filter((item) => {
  return !permissionInDbMap[`${item.method}-${item.path}`]
})

// Phân quyền theo module cho các role
const SellerModule = ['AUTH', 'MEDIA', 'MANAGE-PRODUCT', 'PRODUCT-TRANSLATION', 'PROFILE', 'CART', 'ORDERS', 'REVIEWS']
const ClientModule = ['AUTH', 'MEDIA', 'PROFILE', 'CART', 'ORDERS', 'REVIEWS']

const adminPermissionIds = updatedPermissionsInDb.map((item) => ({ id: item.id }))
const sellerPermissionIds = updatedPermissionsInDb
  .filter((item) => SellerModule.includes(item.module))
  .map((item) => ({ id: item.id }))
const clientPermissionIds = updatedPermissionsInDb
  .filter((item) => ClientModule.includes(item.module))
  .map((item) => ({ id: item.id }))
```

---

## 5. Flow kiểm soát quyền truy cập

### 5.1 AccessTokenGuard - Cơ chế chính

**File:** `ecom/src/shared/guards/access-token.guard.ts`

#### 5.1.1 Cơ chế hoạt động

1. **Extract và validate JWT token** từ Authorization header
2. **Lấy thông tin role và permissions** từ database hoặc cache
3. **Kiểm tra quyền truy cập** dựa trên path và method hiện tại
4. **Cache permissions** để tối ưu hiệu suất

#### 5.1.2 Flow chi tiết

**Code thực tế:**

```typescript
@Injectable()
export class AccessTokenGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest()

    // 1. Extract và validate token
    const decodedAccessToken = await this.extractAndValidateToken(request)

    // 2. Check user permission
    await this.validateUserPermission(decodedAccessToken, request)
    return true
  }

  private async validateUserPermission(decodedAccessToken: AccessTokenPayload, request: any): Promise<void> {
    const roleId: number = decodedAccessToken.roleId
    const path: string = request.route.path
    const method = request.method as keyof typeof HTTPMethod
    const cacheKey = `role:${roleId}`

    // 1. Thử lấy từ cache
    let cachedRole = await this.cacheManager.get<CachedRole>(cacheKey)

    // 2. Nếu không có trong cache, query từ database
    if (cachedRole === null) {
      const role = await this.prismaService.role.findUniqueOrThrow({
        where: { id: roleId, deletedAt: null, isActive: true },
        include: {
          permissions: { where: { deletedAt: null } },
        },
      })

      // Transform permissions thành object để tra cứu nhanh
      const permissionObject = keyBy(role.permissions, (permission) => `${permission.path}:${permission.method}`)
      cachedRole = { ...role, permissions: permissionObject }
      await this.cacheManager.set(cacheKey, cachedRole, 1000 * 60 * 60) // Cache 1 hour
    }

    // 3. Kiểm tra quyền truy cập
    const canAccess = cachedRole.permissions[`${path}:${method}`]
    if (!canAccess) {
      throw new ForbiddenException()
    }
  }
}
```

### 5.2 Cơ chế Cache để tối ưu hiệu suất

- **Cache Key:** `role:{roleId}`
- **Cache Duration:** 1 hour (3600 seconds)
- **Cache Invalidation:** Khi role được cập nhật hoặc xóa
- **Cache Structure:** Transform permissions array thành object với key `path:method` để tra cứu O(1)

**Code thực tế:**

```typescript
// Transform permissions để tra cứu nhanh
const permissionObject = keyBy(
  role.permissions,
  (permission) => `${permission.path}:${permission.method}`,
) as CachedRole['permissions']

// Cache invalidation khi update role
await this.cacheManager.del(`role:${updatedRole.id}`)
```

### 5.3 Decorator hỗ trợ

#### 5.3.1 @ActiveUser - Lấy thông tin user

**File:** `ecom/src/shared/decorators/active-user.decorator.ts`

```typescript
export const ActiveUser = createParamDecorator(
  (field: keyof AccessTokenPayload | undefined, context: ExecutionContext) => {
    const request = context.switchToHttp().getRequest()
    const user: AccessTokenPayload | undefined = request[REQUEST_USER_KEY]
    return field ? user?.[field] : user
  },
)
```

#### 5.3.2 @ActiveRolePermissions - Lấy thông tin role và permissions

**File:** `ecom/src/shared/decorators/active-role-permissions.decorator.ts`

```typescript
export const ActiveRolePermissions = createParamDecorator(
  (field: keyof RolePermissionsType | undefined, context: ExecutionContext) => {
    const request = context.switchToHttp().getRequest()
    const rolePermissions: RolePermissionsType | undefined = request[REQUEST_ROLE_PERMISSIONS]
    return field ? rolePermissions?.[field] : rolePermissions
  },
)
```

#### 5.3.3 @Auth và @IsPublic - Kiểm soát xác thực

**File:** `ecom/src/shared/decorators/auth.decorator.ts`

```typescript
export const Auth = (authTypes: AuthTypeType[], options?: { condition: ConditionGuardType }) => {
  return SetMetadata(AUTH_TYPE_KEY, {
    authTypes,
    options: options ?? { condition: ConditionGuard.And },
  })
}

export const IsPublic = () => Auth([AuthType.None])
```

---

## 6. Logic nghiệp vụ nâng cao

### 6.1 Phân quyền theo module

Hệ thống chia permissions thành các module nghiệp vụ:

- **AUTH**: Xác thực, đăng nhập, đăng ký, 2FA
- **MEDIA**: Upload, quản lý file, presigned URL
- **MANAGE-PRODUCT**: Quản lý sản phẩm (chỉ seller/admin)
- **PRODUCT-TRANSLATION**: Dịch sản phẩm đa ngôn ngữ
- **PROFILE**: Quản lý hồ sơ cá nhân
- **CART**: Giỏ hàng, thêm/sửa/xóa sản phẩm
- **ORDERS**: Đơn hàng, thanh toán, tracking
- **REVIEWS**: Đánh giá sản phẩm

### 6.2 Phân quyền theo role cụ thể

**ADMIN:**

- Toàn quyền tất cả module
- Có thể quản lý role và permission
- Không thể bị xóa hoặc sửa đổi
- Có thể tạo/sửa/xóa user, role, permission

**SELLER:**

- AUTH, MEDIA, MANAGE-PRODUCT, PRODUCT-TRANSLATION, PROFILE, CART, ORDERS, REVIEWS
- Có thể tạo và quản lý sản phẩm của mình
- Có thể xem đơn hàng từ khách mua sản phẩm của mình
- Không được quản lý role/permission

**CLIENT:**

- AUTH, MEDIA, PROFILE, CART, ORDERS, REVIEWS
- Chỉ có thể mua hàng, không được bán
- Có thể đánh giá sản phẩm đã mua
- Quản lý giỏ hàng và đơn hàng của bản thân

### 6.3 Bảo vệ role cơ bản

```typescript
private async verifyRole(roleId: number) {
  const role = await this.roleRepo.findById(roleId)
  if (!role) {
    throw NotFoundRecordException
  }
  const baseRoles: string[] = [RoleName.Admin, RoleName.Client, RoleName.Seller]

  if (baseRoles.includes(role.name)) {
    throw ProhibitedActionOnBaseRoleException
  }
}
```

### 6.4 Soft Delete và Audit Trail

- **Soft Delete**: Tất cả role và permission đều sử dụng soft delete (`deletedAt`)
- **Audit Trail**: Tracking người tạo, sửa, xóa cho cả role và permission
- **Data Integrity**: Không cho phép xóa role khi còn user, không cho phép gán permission đã bị xóa

---

## 7. Error handling và validation

### 7.1 Custom exceptions

```typescript
export const RoleAlreadyExistsException = new BadRequestException('Role name already exists')
export const NotFoundRecordException = new NotFoundException('Record not found')
export const ProhibitedActionOnBaseRoleException = new BadRequestException('Cannot modify base role')
export const InvalidPermissionException = new BadRequestException('Invalid permission ID')
export const RoleInUseException = new BadRequestException('Cannot delete role that is in use')
```

### 7.2 Validation với Zod

```typescript
// Role validation
export const CreateRoleBodySchema = z.object({
  name: z.string().min(1).max(500),
  description: z.string().optional(),
  isActive: z.boolean().optional(),
  permissionIds: z.array(z.number()).optional(),
})

// Permission validation
export const CreatePermissionBodySchema = z.object({
  name: z.string().min(1).max(500),
  description: z.string().optional(),
  path: z.string().min(1).max(1000),
  method: z.enum(['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD']),
  module: z.string().max(500),
})
```

---

## 8. Điểm nổi bật trong thiết kế

### 8.1 Performance Optimization

1. **Redis Caching**: Cache role và permissions để giảm tải database
2. **Object Transformation**: Transform permissions array thành object để tra cứu O(1)
3. **Selective Cache Invalidation**: Chỉ xóa cache khi có thay đổi thực sự
4. **Indexed Database**: Index trên `deletedAt` để query nhanh

### 8.2 Security

1. **JWT-based Authentication**: Sử dụng JWT để xác thực với roleId embedded
2. **Fine-grained Authorization**: Kiểm soát quyền đến từng API endpoint cụ thể
3. **Role-based Separation**: Tách biệt rõ ràng quyền của admin, seller, client
4. **Protected Base Roles**: Bảo vệ role cơ bản khỏi bị xóa/sửa

### 8.3 Maintainability

1. **Auto-sync Permissions**: Tự động đồng bộ permissions từ routes thực tế
2. **Module-based Organization**: Tổ chức permissions theo module nghiệp vụ
3. **Audit Trail**: Tracking đầy đủ lịch sử thay đổi
4. **Soft Delete**: Không mất dữ liệu lịch sử

### 8.4 Scalability

1. **Caching Strategy**: Sử dụng Redis để scale horizontally
2. **Stateless Design**: Guard hoạt động stateless, dễ scale
3. **Database Optimization**: Index và query optimization
4. **Lazy Loading**: Chỉ load permissions khi cần

---

## 9. Sơ đồ tổng quát flow kiểm soát quyền truy cập

```
1. Client Request → API Endpoint
   ↓
2. AccessTokenGuard.canActivate()
   ↓
3. Extract JWT Token from Authorization Header
   ↓
4. Verify JWT Token → Get userId, roleId
   ↓
5. Check Redis Cache for Role Permissions (key: role:{roleId})
   ↓
6. If Cache Miss:
   - Query Database for Role + Permissions
   - Transform to Object {path:method → permission}
   - Cache for 1 hour
   ↓
7. Check Permission: rolePermissions[currentPath:currentMethod]
   ↓
8. If Permission Found → Allow Access
   ↓
9. If Permission Not Found → Throw ForbiddenException
```

---

## 10. Flow quản lý role và permission

```
1. Role Management Flow:
   Admin → Create Role → Assign Permissions → Users get Role → Access Control

2. Permission Sync Flow:
   App Startup → Extract Routes → Compare DB → Sync Permissions → Update Role Permissions

3. Access Control Flow:
   User Request → JWT Validation → Role Lookup → Permission Check → Allow/Deny

4. Cache Management Flow:
   Permission Change → Cache Invalidation → Next Request → Cache Rebuild
```

---

> **Nguồn code thực tế:**
>
> - prisma/schema.prisma (User, Role, Permission models)
> - ecom/src/routes/role/\* (Role management APIs)
> - ecom/src/routes/permission/\* (Permission management APIs)
> - ecom/src/shared/guards/access-token.guard.ts (Authorization guard)
> - ecom/src/shared/decorators/\* (Auth decorators)
> - ecom/src/shared/constants/role.constant.ts (Role constants)
> - ecom/initialScript/create-permissions.ts (Auto-sync permissions script)
> - ecom/src/shared/services/token.service.ts (JWT token handling)
