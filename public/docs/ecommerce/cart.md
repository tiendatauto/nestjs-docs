# Phân tích chi tiết hệ thống Quản lý giỏ hàng (Cart Management) trong dự án NestJS ecom

## 1. Tổng quan kiến trúc quản lý giỏ hàng

### 1.1 Các chức năng chính

1. **Thêm sản phẩm vào giỏ (Add to Cart)** - Thêm SKU với số lượng vào giỏ hàng
2. **Xem giỏ hàng (View Cart)** - Hiển thị danh sách sản phẩm đã thêm, group theo shop
3. **Cập nhật sản phẩm (Update Cart Item)** - Thay đổi số lượng hoặc variant sản phẩm
4. **Xóa sản phẩm khỏi giỏ (Remove from Cart)** - Xóa một hoặc nhiều sản phẩm cùng lúc
5. **Validation business rules** - Kiểm tra stock, product availability, user ownership
6. **Multi-shop grouping** - Nhóm sản phẩm theo shop owner
7. **Internationalization** - Hỗ trợ đa ngôn ngữ cho tên sản phẩm

### 1.2 Các đối tượng chính

- **CartItem** - Item trong giỏ hàng (liên kết User và SKU)
- **SKU** - Biến thể sản phẩm cụ thể với stock
- **Product** - Sản phẩm chính với thông tin publish
- **ProductTranslation** - Bản dịch tên và mô tả sản phẩm
- **User** - Shop owner (createdBy của Product)

---

## 2. Phân tích chi tiết các đối tượng

### 2.1 CartItem (Item trong giỏ hàng)

- **Schema:** Định nghĩa trong `prisma/schema.prisma`
- **Thuộc tính chính:**
  - `id`: int, khóa chính
  - `quantity`: int, số lượng sản phẩm
  - `skuId`: int, khóa ngoại liên kết đến SKU
  - `userId`: int, khóa ngoại liên kết đến User
- **Quan hệ:**
  - `user`: User (n-1), người sở hữu cart item
  - `sku`: SKU (n-1), biến thể sản phẩm
- **Ràng buộc:**
  - `@@unique([userId, skuId])`: Mỗi user chỉ có 1 cart item cho 1 SKU
  - `@@index([userId])`: Index cho query theo user
- **Đặc điểm:**
  - Không sử dụng soft delete (dữ liệu tạm thời)
  - Cascade delete khi xóa User hoặc SKU
  - Liên kết trực tiếp đến SKU, không phải Product

**Code thực tế (CartItem Schema trích từ source):**

```prisma
model CartItem {
  id       Int  @id @default(autoincrement())
  quantity Int
  skuId    Int
  sku      SKU  @relation(fields: [skuId], references: [id], onDelete: Cascade, onUpdate: NoAction)
  userId   Int
  user     User @relation(fields: [userId], references: [id], onDelete: Cascade, onUpdate: NoAction)

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([userId, skuId])
  @@index([userId])
}
```

### 2.2 CartItem Business Logic

**Code thực tế (CartItem Zod Schema):**

```typescript
export const CartItemSchema = z.object({
  id: z.number(),
  quantity: z.number().int().positive(), // Phải là số nguyên dương
  skuId: z.number(),
  userId: z.number(),
  createdAt: z.coerce.date(), // Tự động convert sang Date
  updatedAt: z.coerce.date(),
})
```

### 2.3 CartItemDetail (Response Structure)

- **Schema:** Định nghĩa trong `cart.model.ts`
- **Cấu trúc group theo shop:**
  - `shop`: Thông tin shop owner (User)
  - `cartItems`: Mảng cart items với đầy đủ thông tin nested
- **Nested data:**
  - CartItem → SKU → Product → ProductTranslation
  - Bao gồm tất cả thông tin cần thiết để hiển thị sản phẩm

**Code thực tế (CartItemDetail Schema):**

```typescript
export const CartItemDetailSchema = z.object({
  shop: UserSchema.pick({
    id: true,
    name: true,
    avatar: true,
  }),
  cartItems: z.array(
    CartItemSchema.extend({
      sku: SKUSchema.extend({
        product: ProductSchema.extend({
          productTranslations: z.array(
            ProductTranslationSchema.omit({
              createdById: true,
              updatedById: true,
              deletedById: true,
              deletedAt: true,
              createdAt: true,
              updatedAt: true,
            }),
          ),
        }).omit({
          createdById: true,
          updatedById: true,
          deletedById: true,
          deletedAt: true,
          createdAt: true,
          updatedAt: true,
        }),
      }).omit({
        createdById: true,
        updatedById: true,
        deletedById: true,
        deletedAt: true,
        createdAt: true,
        updatedAt: true,
      }),
    }),
  ),
})
```

---

## 3. Flow nghiệp vụ chi tiết

### 3.1 Flow thêm sản phẩm vào giỏ (Add to Cart)

- **API:** `POST /cart`
- **Controller:** `CartController.addToCart`
- **Service:** `CartService.addToCart`
- **Repository:** `CartRepo.create`

#### 3.1.1 Flow thực tế

1. **Validate input** - Kiểm tra skuId và quantity từ request body
2. **Business validation** - Gọi validateSKU để kiểm tra tất cả business rules
3. **UPSERT operation** - Tạo mới hoặc tăng quantity nếu đã tồn tại
4. **Return cart item** - Trả về thông tin cart item vừa tạo/cập nhật

**Code thực tế (CartRepo.create):**

```typescript
async create(userId: number, body: AddToCartBodyType): Promise<CartItemType> {
  // Validate business rules trước khi thao tác database
  await this.validateSKU({
    skuId: body.skuId,
    quantity: body.quantity,
    userId,
    isCreate: true, // Flag để check quantity + existing quantity <= stock
  })

  // UPSERT: Update if exists, Create if not exists
  return this.prismaService.cartItem.upsert({
    where: {
      userId_skuId: {
        // Composite unique constraint
        userId,
        skuId: body.skuId,
      },
    },
    update: {
      quantity: {
        increment: body.quantity, // Tăng quantity thay vì replace
      },
    },
    create: {
      userId,
      skuId: body.skuId,
      quantity: body.quantity,
    },
  })
}
```

#### 3.1.2 Business Validation Logic

**Code thực tế (CartRepo.validateSKU):**

```typescript
private async validateSKU({
  skuId,
  quantity,
  userId,
  isCreate,
}: {
  skuId: number
  quantity: number
  userId: number
  isCreate: boolean
}): Promise<SKUSchemaType> {
  // Query song song để tối ưu performance
  const [cartItem, sku] = await Promise.all([
    // Check cart item hiện tại của user với SKU này
    this.prismaService.cartItem.findUnique({
      where: {
        userId_skuId: {
          // Composite unique key
          userId,
          skuId,
        },
      },
    }),
    // Lấy thông tin SKU và product liên quan
    this.prismaService.sKU.findUnique({
      where: { id: skuId, deletedAt: null }, // SKU chưa bị xóa
      include: {
        product: true, // Include product để check publish status
      },
    }),
  ])

  // Kiểm tra tồn tại của SKU
  if (!sku) {
    throw NotFoundSKUException
  }

  // Kiểm tra nếu là create và quantity + existing quantity > stock
  if (cartItem && isCreate && quantity + cartItem.quantity > sku.stock) {
    throw InvalidQuantityException
  }

  // Kiểm tra lượng hàng còn lại
  if (sku.stock < 1 || sku.stock < quantity) {
    throw OutOfStockSKUException
  }

  const { product } = sku

  // Kiểm tra sản phẩm có hợp lệ không
  // - Chưa bị xóa (deletedAt = null)
  // - Đã được publish (publishedAt != null)
  // - Publish date <= hiện tại
  if (
    product.deletedAt !== null ||
    product.publishedAt === null ||
    (product.publishedAt !== null && product.publishedAt > new Date())
  ) {
    throw ProductNotFoundException
  }

  return sku
}
```

### 3.2 Flow xem giỏ hàng (View Cart)

- **API:** `GET /cart`
- **Controller:** `CartController.getCart`
- **Service:** `CartService.getCart`
- **Repository:** `CartRepo.list2`

#### 3.2.1 Raw SQL Approach cho Performance

**Code thực tế (CartRepo.list2 - Raw SQL Query):**

```typescript
async list2({
  userId,
  languageId,
  page,
  limit,
}: {
  userId: number
  languageId: string
  limit: number
  page: number
}): Promise<GetCartResType> {
  const skip = (page - 1) * limit
  const take = limit

  /**
   * Query 1: Đếm tổng số shops có cart items
   * ========================================
   * Mục đích: Tính toán pagination (totalPages)
   * Logic: GROUP BY createdById để đếm số shops duy nhất
   */
  const totalItems$ = this.prismaService.$queryRaw<{ createdById: number }[]>`
    SELECT
      "Product"."createdById"
    FROM "CartItem"
    JOIN "SKU" ON "CartItem"."skuId" = "SKU"."id"
    JOIN "Product" ON "SKU"."productId" = "Product"."id"
    WHERE "CartItem"."userId" = ${userId}
      AND "Product"."deletedAt" IS NULL
      AND "Product"."publishedAt" IS NOT NULL
      AND "Product"."publishedAt" <= NOW()
    GROUP BY "Product"."createdById"
  `

  /**
   * Query 2: Lấy cart data với grouping và pagination
   * =================================================
   * Đây là query phức tạp nhất trong hệ thống
   *
   * Các technique được sử dụng:
   * - json_agg(): Aggregate rows thành JSON array
   * - jsonb_build_object(): Tạo JSON object từ columns
   * - Subquery cho ProductTranslation
   * - COALESCE để handle null values
   * - Dynamic language filtering
   * - GROUP BY để group theo shop
   * - ORDER BY với aggregation (MAX) cho pagination
   */
  const data$ = await this.prismaService.$queryRaw<CartItemDetailType[]>`
   SELECT
     "Product"."createdById",
     json_agg(
       jsonb_build_object(
         'id', "CartItem"."id",
         'quantity', "CartItem"."quantity",
         'skuId', "CartItem"."skuId",
         'userId', "CartItem"."userId",
         'createdAt', "CartItem"."createdAt",
         'updatedAt', "CartItem"."updatedAt",
         'sku', jsonb_build_object(
           'id', "SKU"."id",
            'value', "SKU"."value",
            'price', "SKU"."price",
            'stock', "SKU"."stock",
            'image', "SKU"."image",
            'productId', "SKU"."productId",
            'product', jsonb_build_object(
              'id', "Product"."id",
              'publishedAt', "Product"."publishedAt",
              'name', "Product"."name",
              'basePrice', "Product"."basePrice",
              'virtualPrice', "Product"."virtualPrice",
              'brandId', "Product"."brandId",
              'images', "Product"."images",
              'variants', "Product"."variants",
              /**
               * Subquery cho ProductTranslation
               * ===============================
               * COALESCE: Trả về '[]' nếu không có translation nào
               * FILTER: Chỉ aggregate những row có pt.id IS NOT NULL
               * Dynamic language filtering: Nếu ALL_LANGUAGE_CODE thì lấy tất cả ngôn ngữ
               */
              'productTranslations', COALESCE((
                SELECT json_agg(
                  jsonb_build_object(
                    'id', pt."id",
                    'productId', pt."productId",
                    'languageId', pt."languageId",
                    'name', pt."name",
                    'description', pt."description"
                  )
                ) FILTER (WHERE pt."id" IS NOT NULL)
                FROM "ProductTranslation" pt
                WHERE pt."productId" = "Product"."id"
                  AND pt."deletedAt" IS NULL
                  ${languageId === ALL_LANGUAGE_CODE ? Prisma.sql`` : Prisma.sql`AND pt."languageId" = ${languageId}`}
              ), '[]'::json)
            )
         )
       ) ORDER BY "CartItem"."updatedAt" DESC -- Sắp xếp cart items theo thời gian cập nhật
     ) AS "cartItems",
     jsonb_build_object(
       'id', "User"."id",
       'name', "User"."name",
       'avatar', "User"."avatar"
     ) AS "shop"
   FROM "CartItem"
   JOIN "SKU" ON "CartItem"."skuId" = "SKU"."id"
   JOIN "Product" ON "SKU"."productId" = "Product"."id"
   LEFT JOIN "ProductTranslation" ON "Product"."id" = "ProductTranslation"."productId"
     AND "ProductTranslation"."deletedAt" IS NULL
     ${languageId === ALL_LANGUAGE_CODE ? Prisma.sql`` : Prisma.sql`AND "ProductTranslation"."languageId" = ${languageId}`}
   LEFT JOIN "User" ON "Product"."createdById" = "User"."id"
   WHERE "CartItem"."userId" = ${userId}
      AND "Product"."deletedAt" IS NULL
      AND "Product"."publishedAt" IS NOT NULL
      AND "Product"."publishedAt" <= NOW()
   GROUP BY "Product"."createdById", "User"."id" -- Group theo shop
   ORDER BY MAX("CartItem"."updatedAt") DESC -- Sắp xếp shops theo cart item mới nhất
    LIMIT ${take} -- Pagination
    OFFSET ${skip}
 `

  // Execute cả 2 queries song song để tối ưu performance
  const [data, totalItems] = await Promise.all([data$, totalItems$])
  return {
    data,
    page,
    limit,
    totalItems: totalItems.length,
    totalPages: Math.ceil(totalItems.length / limit),
  }
}
```

### 3.3 Flow cập nhật cart item (Update Cart Item)

- **API:** `PUT /cart/:cartItemId`
- **Controller:** `CartController.updateCartItem`
- **Service:** `CartService.updateCartItem`
- **Repository:** `CartRepo.update`

#### 3.3.1 Flow thực tế

1. **Validate ownership** - Đảm bảo cart item thuộc về user
2. **Business validation** - Kiểm tra SKU mới và quantity
3. **Update database** - Cập nhật cả SKU và quantity
4. **Error handling** - Handle Prisma errors gracefully

**Code thực tế (CartRepo.update):**

```typescript
async update({
  userId,
  body,
  cartItemId,
}: {
  userId: number
  cartItemId: number
  body: UpdateCartItemBodyType
}): Promise<CartItemType> {
  // Validate business rules cho SKU mới
  await this.validateSKU({
    skuId: body.skuId,
    quantity: body.quantity,
    userId,
    isCreate: false, // Flag để không check existing quantity (vì đang replace)
  })

  // Update cart item với error handling
  return this.prismaService.cartItem
    .update({
      where: {
        id: cartItemId,
        userId, // Đảm bảo cart item thuộc về user này
      },
      data: {
        skuId: body.skuId, // Có thể thay đổi SKU (variant)
        quantity: body.quantity, // Thay đổi quantity
      },
    })
    .catch((error) => {
      // Handle Prisma errors gracefully
      if (isNotFoundPrismaError(error)) {
        throw NotFoundCartItemException
      }
      throw error // Re-throw other errors
    })
}
```

### 3.4 Flow xóa sản phẩm khỏi giỏ (Delete Cart Items)

- **API:** `POST /cart/delete`
- **Controller:** `CartController.deleteCart`
- **Service:** `CartService.deleteCart`
- **Repository:** `CartRepo.delete`

#### 3.4.1 Bulk Delete Operation

**Code thực tế (CartRepo.delete):**

```typescript
delete(userId: number, body: DeleteCartBodyType): Promise<{ count: number }> {
  return this.prismaService.cartItem.deleteMany({
    where: {
      id: {
        in: body.cartItemIds, // Xóa những items có ID trong danh sách
      },
      userId, // Security: Chỉ xóa items của user này
    },
  })
}
```

**Service layer handling:**

```typescript
async deleteCart(userId: number, body: DeleteCartBodyType) {
  const { count } = await this.cartRepo.delete(userId, body)
  return {
    message: `${count} item(s) deleted from cart`,
  }
}
```

---

## 4. API Endpoints và Implementation

### 4.1 Cart Controller Overview

**Code thực tế (CartController):**

```typescript
@Controller('cart') // Định nghĩa base route là '/cart'
export class CartController {
  constructor(private readonly cartService: CartService) {}

  /**
   * API: GET /cart - Lấy danh sách giỏ hàng của user
   * ==================================================
   * Input:
   * - userId: Lấy từ JWT token thông qua @ActiveUser decorator
   * - query: Thông tin phân trang (page, limit)
   * Output: Danh sách sản phẩm trong giỏ hàng theo shop, có phân trang
   */
  @Get()
  @ZodSerializerDto(GetCartResDTO)
  getCart(@ActiveUser('userId') userId: number, @Query() query: PaginationQueryDTO) {
    return this.cartService.getCart(userId, query)
  }

  /**
   * API: POST /cart - Thêm sản phẩm vào giỏ hàng
   * ==============================================
   * Input:
   * - body: Chứa skuId và quantity cần thêm
   * - userId: Lấy từ JWT token
   * Output: Thông tin cart item vừa được tạo/cập nhật
   */
  @Post()
  @ZodSerializerDto(CartItemDTO)
  addToCart(@Body() body: AddToCartBodyDTO, @ActiveUser('userId') userId: number) {
    return this.cartService.addToCart(userId, body)
  }

  /**
   * API: PUT /cart/:cartItemId - Cập nhật sản phẩm trong giỏ hàng
   * =============================================================
   * Input:
   * - cartItemId: ID của cart item cần cập nhật (từ URL params)
   * - body: Thông tin mới (skuId, quantity)
   * - userId: Lấy từ JWT token
   * Output: Thông tin cart item sau khi cập nhật
   */
  @Put(':cartItemId')
  @ZodSerializerDto(CartItemDTO)
  updateCartItem(
    @ActiveUser('userId') userId: number,
    @Param() param: GetCartItemParamsDTO,
    @Body() body: UpdateCartItemBodyDTO,
  ) {
    return this.cartService.updateCartItem({
      userId,
      cartItemId: param.cartItemId,
      body,
    })
  }

  /**
   * API: POST /cart/delete - Xóa nhiều sản phẩm khỏi giỏ hàng
   * =========================================================
   * Input:
   * - body: Chứa mảng cartItemIds cần xóa
   * - userId: Lấy từ JWT token
   * Output: Message thông báo số lượng item đã xóa
   */
  @Post('delete')
  @ZodSerializerDto(MessageResDTO)
  deleteCart(@Body() body: DeleteCartBodyDTO, @ActiveUser('userId') userId: number) {
    return this.cartService.deleteCart(userId, body)
  }
}
```

### 4.2 DTO Validation

**Code thực tế (Cart DTOs):**

```typescript
/**
 * AddToCartBodyDTO - DTO cho request body khi thêm sản phẩm vào giỏ
 * Chứa: skuId, quantity
 */
export class AddToCartBodyDTO extends createZodDto(AddToCartBodySchema) {}

/**
 * UpdateCartItemBodyDTO - DTO cho request body khi cập nhật cart item
 * Giống AddToCartBodyDTO: skuId, quantity
 */
export class UpdateCartItemBodyDTO extends createZodDto(UpdateCartItemBodySchema) {}

/**
 * DeleteCartBodyDTO - DTO cho request body khi xóa cart items
 * Chứa: cartItemIds (mảng các ID cần xóa)
 */
export class DeleteCartBodyDTO extends createZodDto(DeleteCartBodySchema) {}

/**
 * GetCartResDTO - DTO cho response khi lấy danh sách giỏ hàng
 * Bao gồm: data (mảng cart items), totalItems, page, limit, totalPages
 */
export class GetCartResDTO extends createZodDto(GetCartResSchema) {}
```

---

## 5. Error Handling và Business Rules

### 5.1 Custom Exceptions

**Code thực tế (Cart Errors):**

```typescript
/**
 * Lỗi: Không tìm thấy SKU
 * Xảy ra khi: User thêm sản phẩm với SKU không tồn tại hoặc đã bị xóa
 */
export const NotFoundSKUException = new NotFoundException('Error.SKU.NotFound')

/**
 * Lỗi: SKU hết hàng
 * Xảy ra khi: User thêm số lượng vượt quá stock hiện có
 */
export const OutOfStockSKUException = new BadRequestException('Error.SKU.OutOfStock')

/**
 * Lỗi: Không tìm thấy sản phẩm
 * Xảy ra khi: Sản phẩm đã bị xóa hoặc chưa được publish
 */
export const ProductNotFoundException = new NotFoundException('Error.Product.NotFound')

/**
 * Lỗi: Không tìm thấy cart item
 * Xảy ra khi: User cập nhật/xóa cart item không tồn tại hoặc không thuộc về họ
 */
export const NotFoundCartItemException = new NotFoundException('Error.CartItem.NotFound')

/**
 * Lỗi: Số lượng không hợp lệ
 * Xảy ra khi: User nhập quantity <= 0 hoặc vượt quá stock
 */
export const InvalidQuantityException = new BadRequestException('Error.CartItem.InvalidQuantity')
```

### 5.2 Business Rules Validation

**Các quy tắc nghiệp vụ được áp dụng:**

1. **SKU Validation:**

   - SKU phải tồn tại và chưa bị xóa
   - SKU phải còn đủ hàng (stock >= quantity)
   - Nếu là create và sản phẩm đã có trong giỏ, tổng quantity không vượt stock

2. **Product Validation:**

   - Product phải được publish và chưa bị xóa
   - Product publish date phải <= hiện tại

3. **Security Validation:**

   - User chỉ có thể thao tác với cart items của mình
   - Validate ownership trong tất cả operations

4. **Data Integrity:**
   - Unique constraint: 1 user chỉ có 1 cart item cho 1 SKU
   - Cascade delete khi xóa User hoặc SKU
   - Positive quantity validation

---

## 6. Multi-shop Architecture

### 6.1 Grouping theo Shop

**Logic grouping:**

- Cart items được group theo `createdById` của Product
- Mỗi shop (User) có thể có nhiều products
- User có thể mua từ nhiều shops trong 1 lần

### 6.2 Shop Information Structure

**Response format:**

```json
{
  "data": [
    {
      "shop": {
        "id": 1,
        "name": "Shop ABC",
        "avatar": "https://example.com/avatar.jpg"
      },
      "cartItems": [
        {
          "id": 1,
          "quantity": 2,
          "sku": {
            "id": 1,
            "value": "red-xl",
            "price": 299000,
            "stock": 10,
            "product": {
              "name": "Áo thun",
              "productTranslations": [...]
            }
          }
        }
      ]
    }
  ],
  "totalItems": 1,
  "page": 1,
  "limit": 10,
  "totalPages": 1
}
```

---

## 7. Internationalization Support

### 7.1 Language Filtering

**Dynamic language handling:**

```sql
-- Nếu ALL_LANGUAGE_CODE thì lấy tất cả ngôn ngữ
${languageId === ALL_LANGUAGE_CODE ? Prisma.sql`` : Prisma.sql`AND pt."languageId" = ${languageId}`}
```

### 7.2 ProductTranslation Integration

- Mỗi Product có thể có nhiều ProductTranslation
- Filter theo languageId từ i18n context
- Fallback về tên gốc nếu không có translation

**Code thực tế (Service integration):**

```typescript
getCart(userId: number, query: PaginationQueryType) {
  return this.cartRepo.list2({
    userId,
    languageId: I18nContext.current()?.lang as string, // Lấy ngôn ngữ hiện tại
    page: query.page,
    limit: query.limit,
  })
}
```

---

## 8. Performance Optimization

### 8.1 Database Query Optimization

**Techniques được sử dụng:**

1. **Parallel Queries:** Execute count và data queries song song
2. **Raw SQL:** Sử dụng raw SQL thay vì ORM cho complex aggregation
3. **JSON Aggregation:** Group data ở database level thay vì application level
4. **Proper Indexing:** Index trên userId và composite unique key
5. **Selective Fields:** Chỉ lấy fields cần thiết, omit audit fields

### 8.2 UPSERT Pattern

**Optimistic operation:**

```typescript
// UPSERT: Update if exists, Create if not exists
return this.prismaService.cartItem.upsert({
  where: {
    userId_skuId: { userId, skuId: body.skuId },
  },
  update: {
    quantity: { increment: body.quantity }, // Tăng quantity thay vì replace
  },
  create: {
    userId,
    skuId: body.skuId,
    quantity: body.quantity,
  },
})
```

### 8.3 Memory Optimization

- Pagination ở database level, không load tất cả data vào memory
- Stream processing cho large datasets
- Lazy loading với proper include strategy

---

## 9. Service Layer Architecture

### 9.1 Layered Architecture

**3-tier pattern:**

```
Controller (HTTP/Validation)
    ↓
Service (Business Logic/i18n)
    ↓
Repository (Data Access/Raw SQL)
    ↓
Database (PostgreSQL/Prisma)
```

### 9.2 Service Responsibilities

**Code thực tế (CartService):**

```typescript
@Injectable()
export class CartService {
  constructor(private readonly cartRepo: CartRepo) {}

  /**
   * Lấy danh sách giỏ hàng của user
   * ===============================
   * Logic:
   * - Lấy language hiện tại từ i18n context
   * - Gọi repository để query database
   * - Repository sẽ group theo shop và apply pagination
   */
  getCart(userId: number, query: PaginationQueryType) {
    return this.cartRepo.list2({
      userId,
      languageId: I18nContext.current()?.lang as string,
      page: query.page,
      limit: query.limit,
    })
  }

  /**
   * Thêm sản phẩm vào giỏ hàng
   * ==========================
   * Logic sẽ được handle ở repository:
   * - Validate SKU tồn tại và còn hàng
   * - Nếu sản phẩm đã có trong giỏ thì tăng quantity
   * - Nếu chưa có thì tạo mới
   */
  addToCart(userId: number, body: AddToCartBodyType) {
    return this.cartRepo.create(userId, body)
  }
}
```

---

## 10. Data Validation Strategy

### 10.1 Zod Schema Validation

**Request validation:**

```typescript
export const AddToCartBodySchema = CartItemSchema.pick({
  skuId: true,
  quantity: true,
}).strict() // strict() đảm bảo không có extra fields

export const DeleteCartBodySchema = z
  .object({
    cartItemIds: z.array(z.number().int().positive()), // Mảng các cart item IDs
  })
  .strict()
```

### 10.2 Runtime Business Validation

**Multi-level validation:**

1. **Zod Schema:** Validate data types và structure
2. **Business Rules:** Validate stock, product availability
3. **Security Rules:** Validate ownership và permissions
4. **Database Constraints:** Unique constraints, foreign keys

---

## 11. Transaction Management

### 11.1 ACID Compliance

**Database operations:**

- UPSERT operations trong single transaction
- Composite unique constraints để prevent race conditions
- Cascade deletes để maintain referential integrity

### 11.2 Race Condition Handling

**Concurrent cart operations:**

- Composite unique key `(userId, skuId)` ngăn duplicate items
- Stock validation được check trong validateSKU
- Atomic increment operations với UPSERT

---

## 12. Điểm nổi bật trong thiết kế

### 12.1 Business Logic Excellence

1. **Comprehensive Validation:** 6 tầng validation từ schema đến business rules
2. **UPSERT Pattern:** Handle both create và update elegantly
3. **Multi-shop Support:** Group products theo shop owner
4. **Internationalization:** Dynamic language filtering
5. **Security-first:** Validate ownership trong mọi operations

### 12.2 Performance Optimization

1. **Raw SQL Queries:** Complex aggregation ở database level
2. **Parallel Execution:** Execute multiple queries cùng lúc
3. **Proper Indexing:** Composite unique keys và single field indexes
4. **Memory Efficiency:** Database-level pagination và selective loading
5. **JSON Aggregation:** Reduce database roundtrips

### 12.3 Code Quality

1. **Repository Pattern:** Clean separation of concerns
2. **Type Safety:** Zod schemas + TypeScript types
3. **Error Handling:** Comprehensive custom exceptions
4. **Documentation:** Extensive code comments explaining business logic
5. **Testability:** Modular design với dependency injection

### 12.4 User Experience

1. **Bulk Operations:** Delete multiple items cùng lúc
2. **Smart UPSERT:** Tự động tăng quantity nếu item đã tồn tại
3. **Real-time Validation:** Immediate feedback về stock availability
4. **Multi-language:** Localized product names
5. **Flexible Updates:** Có thể đổi variant (SKU) và quantity

---

## 13. Sơ đồ tổng quát flow cart management

```
1. Add to Cart Flow:
   Validate Input → Business Rules Check → Stock Validation → UPSERT Operation → Return Cart Item

2. View Cart Flow:
   Get Language → Count Total Shops → Complex Raw SQL Query → Group by Shop → Apply Pagination

3. Update Cart Flow:
   Validate Ownership → Business Rules Check → Update Database → Error Handling

4. Delete Cart Flow:
   Validate Ownership → Bulk Delete Operation → Return Count

5. Multi-shop Architecture:
   Cart Items → Group by Product.createdById → Shop Info + Items → Paginated Response

6. Validation Pipeline:
   Zod Schema → Business Rules → Stock Check → Product Publish Status → Ownership Check
```

---

## 14. Cart Lifecycle

### 14.1 Cart Item States

```
CREATED → (quantity updates) → UPDATED → (delete or order) → REMOVED
```

### 14.2 Integration Points

- **Order Creation:** Cart items được convert thành order items
- **Stock Management:** Real-time stock checking khi add/update
- **Product Management:** Auto-remove items khi product unpublished
- **User Management:** Cascade delete khi xóa user

---

> **Nguồn code thực tế:**
>
> - prisma/schema.prisma (CartItem model definition)
> - ecom/src/routes/cart/\* (Complete cart module implementation)
> - ecom/src/routes/cart/cart.controller.ts (HTTP API endpoints)
> - ecom/src/routes/cart/cart.service.ts (Business logic layer)
> - ecom/src/routes/cart/cart.repo.ts (Data access với raw SQL optimization)
> - ecom/src/routes/cart/cart.model.ts (Zod schemas và TypeScript types)
> - ecom/src/routes/cart/cart.dto.ts (NestJS DTOs cho validation)
> - ecom/src/routes/cart/cart.error.ts (Custom exceptions)
> - ecom/src/shared/models/\* (Shared schemas cho SKU, Product, User)
