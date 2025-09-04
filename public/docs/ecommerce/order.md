# Phân tích chi tiết hệ thống Quản lý đơn hàng (Order Management) trong dự án NestJS ecom

## 1. Tổng quan kiến trúc quản lý đơn hàng

### 1.1 Các chức năng chính

1. **Tạo đơn hàng từ giỏ hàng (Create Order)** - Chuyển đổi cart items thành orders với validation đầy đủ
2. **Theo dõi trạng thái đơn hàng (Order Status Tracking)** - Quản lý lifecycle của đơn hàng
3. **Hủy đơn hàng (Cancel Order)** - Hủy đơn hàng trong điều kiện cho phép
4. **Xem lịch sử đơn hàng (Order History)** - Danh sách và chi tiết đơn hàng của người dùng
5. **Quản lý thanh toán (Payment Integration)** - Tích hợp với hệ thống thanh toán
6. **Quản lý kho hàng (Inventory Management)** - Kiểm soát stock và prevent overselling
7. **Multi-shop orders** - Hỗ trợ đơn hàng từ nhiều shop khác nhau

### 1.2 Các đối tượng chính

- **Order** - Đơn hàng chính
- **ProductSKUSnapshot** - Snapshot của sản phẩm tại thời điểm đặt hàng
- **Payment** - Thông tin thanh toán
- **OrderStatus** - Trạng thái đơn hàng
- **Receiver** - Thông tin người nhận hàng

---

## 2. Phân tích chi tiết các đối tượng

### 2.1 Order (Đơn hàng)

- **Schema:** Định nghĩa trong `prisma/schema.prisma`
- **Thuộc tính chính:**
  - `id`: int, khóa chính
  - `userId`: int, khóa ngoại liên kết đến User (người mua)
  - `shopId`: int nullable, khóa ngoại liên kết đến User (người bán)
  - `status`: enum OrderStatus, trạng thái đơn hàng
  - `receiver`: Json, thông tin người nhận (name, phone, address)
  - `paymentId`: int, khóa ngoại liên kết đến Payment
  - Các trường audit trail: `createdById`, `updatedById`, `deletedById`, `deletedAt`
- **Quan hệ:**
  - `user`: User (n-1), người mua đơn hàng
  - `shop`: User (n-1), người bán/shop
  - `items`: ProductSKUSnapshot[] (1-n), các sản phẩm trong đơn hàng
  - `products`: Product[] (n-n), liên kết với products gốc
  - `payment`: Payment (n-1), thông tin thanh toán
  - `reviews`: Review[] (1-n), đánh giá sản phẩm

**Code thực tế (Order Schema trích từ source):**

```prisma
model Order {
  id          Int                  @id @default(autoincrement())
  userId      Int
  user        User                 @relation(fields: [userId], references: [id], onDelete: NoAction, onUpdate: NoAction)
  status      OrderStatus
  items       ProductSKUSnapshot[]
  products    Product[]
  reviews     Review[]
  /// [Receiver]
  receiver    Json
  shopId      Int?
  shop        User?                @relation("Shop", fields: [shopId], references: [id], onDelete: SetNull, onUpdate: NoAction)
  paymentId   Int
  payment     Payment              @relation(fields: [paymentId], references: [id], onDelete: NoAction, onUpdate: NoAction)

  createdById Int?
  createdBy   User? @relation("OrderCreatedBy", fields: [createdById], references: [id], onDelete: SetNull, onUpdate: NoAction)
  updatedById Int?
  updatedBy   User? @relation("OrderUpdatedBy", fields: [updatedById], references: [id], onDelete: SetNull, onUpdate: NoAction)
  deletedById Int?
  deletedBy   User? @relation("OrderDeletedBy", fields: [deletedById], references: [id], onDelete: SetNull, onUpdate: NoAction)

  deletedAt DateTime?
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt

  @@index([deletedAt])
  @@index([status, deletedAt])
}
```

### 2.2 OrderStatus (Trạng thái đơn hàng)

- **Enum:** Định nghĩa trong `prisma/schema.prisma`
- **Các trạng thái:**
  - `PENDING_PAYMENT`: Chờ thanh toán
  - `PENDING_PICKUP`: Chờ lấy hàng
  - `PENDING_DELIVERY`: Đang giao hàng
  - `DELIVERED`: Đã giao hàng
  - `RETURNED`: Đã trả hàng
  - `CANCELLED`: Đã hủy

**Code thực tế (OrderStatus Constants):**

```typescript
export const OrderStatus = {
  PENDING_PAYMENT: 'PENDING_PAYMENT',
  PENDING_PICKUP: 'PENDING_PICKUP',
  PENDING_DELIVERY: 'PENDING_DELIVERY',
  DELIVERED: 'DELIVERED',
  RETURNED: 'RETURNED',
  CANCELLED: 'CANCELLED',
} as const
```

### 2.3 ProductSKUSnapshot (Snapshot sản phẩm)

- **Schema:** Định nghĩa trong `prisma/schema.prisma`
- **Thuộc tính chính:**
  - `id`: int, khóa chính
  - `productName`: varchar(500), tên sản phẩm tại thời điểm đặt hàng
  - `skuPrice`: float, giá SKU tại thời điểm đặt hàng
  - `image`: string, hình ảnh sản phẩm
  - `skuValue`: varchar(500), giá trị SKU (size, color, etc.)
  - `quantity`: int, số lượng đặt mua
  - `skuId`: int nullable, liên kết đến SKU gốc
  - `orderId`: int nullable, liên kết đến Order
  - `productId`: int nullable, liên kết đến Product gốc
  - `productTranslations`: Json, bản dịch sản phẩm
- **Quan hệ:**
  - `sku`: SKU (n-1), SKU gốc
  - `order`: Order (n-1), đơn hàng chứa item này
  - `product`: Product (n-1), sản phẩm gốc
- **Đặc điểm:**
  - Lưu trữ snapshot của sản phẩm tại thời điểm đặt hàng
  - Đảm bảo dữ liệu lịch sử không bị thay đổi khi sản phẩm gốc cập nhật
  - Hỗ trợ đa ngôn ngữ với productTranslations

**Code thực tế (ProductSKUSnapshot Schema):**

```prisma
model ProductSKUSnapshot {
  id          Int    @id @default(autoincrement())
  productName String @db.VarChar(500)
  skuPrice    Float
  image       String
  skuValue    String @db.VarChar(500)
  skuId       Int?
  sku         SKU?   @relation(fields: [skuId], references: [id], onDelete: SetNull, onUpdate: NoAction)
  orderId     Int?
  order       Order? @relation(fields: [orderId], references: [id], onDelete: SetNull, onUpdate: NoAction)

  quantity            Int
  productId           Int?
  product             Product? @relation(fields: [productId], references: [id], onDelete: SetNull, onUpdate: NoAction)
  /// [ProductTranslations]
  productTranslations Json

  createdAt DateTime @default(now())
}
```

### 2.4 Payment (Thanh toán)

- **Schema:** Định nghĩa trong `prisma/schema.prisma`
- **Thuộc tính chính:**
  - `id`: int, khóa chính
  - `status`: enum PaymentStatus, trạng thái thanh toán
  - `createdAt`: datetime, thời gian tạo
  - `updatedAt`: datetime, thời gian cập nhật
- **Quan hệ:**
  - `orders`: Order[] (1-n), các đơn hàng thuộc payment này
- **Đặc điểm:**
  - Một payment có thể chứa nhiều orders (multi-shop)
  - Tự động hủy sau 24 giờ nếu không thanh toán

**Code thực tế (Payment Schema):**

```prisma
model Payment {
  id        Int           @id @default(autoincrement())
  orders    Order[]
  status    PaymentStatus
  createdAt DateTime      @default(now())
  updatedAt DateTime      @updatedAt
}
```

---

## 3. Flow nghiệp vụ chi tiết

### 3.1 Flow tạo đơn hàng (Create Order)

- **API:** `POST /orders`
- **Controller:** `OrderController.create`
- **Service:** `OrderService.create`
- **Repository:** `OrderRepo.create`

#### 3.1.1 Flow thực tế

**Code thực tế (OrderController.create):**

```typescript
@Post()
@ZodSerializerDto(CreateOrderResDTO)
create(@ActiveUser('userId') userId: number, @Body() body: CreateOrderBodyDTO) {
  return this.orderService.create(userId, body)
}
```

#### 3.1.2 Logic nghiệp vụ phức tạp

**Flow chính:**

1. **Validation cart items** - Kiểm tra tất cả cartItemIds có tồn tại
2. **Stock validation** - Kiểm tra số lượng tồn kho
3. **Product availability** - Kiểm tra sản phẩm chưa bị xóa/ẩn
4. **Shop validation** - Kiểm tra SKU thuộc đúng shop
5. **Distributed locking** - Lock SKUs để tránh race condition
6. **Transaction processing** - Tạo order trong database transaction
7. **Stock update** - Trừ số lượng tồn kho
8. **Payment scheduling** - Schedule auto-cancel payment job
9. **Cart cleanup** - Xóa cart items đã order

**Code thực tế (OrderRepo.create - Distributed Locking):**

```typescript
async create(userId: number, body: CreateOrderBodyType): Promise<{
  paymentId: number
  orders: CreateOrderResType['orders']
}> {
  // 1. Lấy tất cả cartItemIds
  const allBodyCartItemIds = body.map((item) => item.cartItemIds).flat()
  const cartItemsForSKUId = await this.prismaService.cartItem.findMany({
    where: {
      id: { in: allBodyCartItemIds },
      userId,
    },
    select: { skuId: true },
  })
  const skuIds = cartItemsForSKUId.map((cartItem) => cartItem.skuId)

  // 2. Lock tất cả các SKU cần mua để tránh race condition
  const locks = await Promise.all(
    skuIds.map((skuId) => redlock.acquire([`lock:sku:${skuId}`], 3000))
  ) // Giữ khóa trong 3 giây

  try {
    const [paymentId, orders] = await this.prismaService.$transaction<
      [number, CreateOrderResType['orders']]
    >(async (tx) => {
      // 3. Validation logic trong transaction
      const cartItems = await tx.cartItem.findMany({
        where: { id: { in: allBodyCartItemIds }, userId },
        include: {
          sku: {
            include: {
              product: { include: { productTranslations: true } },
            },
          },
        },
      })

      // 4. Kiểm tra cart items tồn tại
      if (cartItems.length !== allBodyCartItemIds.length) {
        throw NotFoundCartItemException
      }

      // 5. Kiểm tra stock availability
      const isOutOfStock = cartItems.some((item) => {
        return item.sku.stock < item.quantity
      })
      if (isOutOfStock) {
        throw OutOfStockSKUException
      }

      // 6. Kiểm tra product availability
      const isExistNotReadyProduct = cartItems.some(
        (item) =>
          item.sku.product.deletedAt !== null ||
          item.sku.product.publishedAt === null ||
          item.sku.product.publishedAt > new Date(),
      )
      if (isExistNotReadyProduct) {
        throw ProductNotFoundException
      }

      // 7. Tạo payment
      const payment = await tx.payment.create({
        data: { status: PaymentStatus.PENDING },
      })

      // 8. Tạo orders
      const orders: CreateOrderResType['orders'] = []
      for (const item of body) {
        const order = await tx.order.create({
          data: {
            userId,
            status: OrderStatus.PENDING_PAYMENT,
            receiver: item.receiver,
            createdById: userId,
            shopId: item.shopId,
            paymentId: payment.id,
            items: {
              create: item.cartItemIds.map((cartItemId) => {
                const cartItem = cartItemMap.get(cartItemId)!
                return {
                  productName: cartItem.sku.product.name,
                  skuPrice: cartItem.sku.price,
                  image: cartItem.sku.image,
                  skuId: cartItem.sku.id,
                  skuValue: cartItem.sku.value,
                  quantity: cartItem.quantity,
                  productId: cartItem.sku.product.id,
                  productTranslations: cartItem.sku.product.productTranslations.map((translation) => ({
                    id: translation.id,
                    name: translation.name,
                    description: translation.description,
                    languageId: translation.languageId,
                  })),
                }
              }),
            },
            products: {
              connect: item.cartItemIds.map((cartItemId) => {
                const cartItem = cartItemMap.get(cartItemId)!
                return { id: cartItem.sku.product.id }
              }),
            },
          },
        })
        orders.push(order)
      }

      // 9. Xóa cart items
      await tx.cartItem.deleteMany({
        where: { id: { in: allBodyCartItemIds } },
      })

      // 10. Trừ stock với optimistic locking
      for (const item of cartItems) {
        await tx.sKU
          .update({
            where: {
              id: item.sku.id,
              updatedAt: item.sku.updatedAt, // Optimistic locking
              stock: { gte: item.quantity }, // Đảm bảo stock đủ
            },
            data: {
              stock: { decrement: item.quantity },
            },
          })
          .catch((e) => {
            if (isNotFoundPrismaError(e)) {
              throw VersionConflictException
            }
            throw e
          })
      }

      // 11. Schedule auto-cancel payment job
      await this.orderProducer.addCancelPaymentJob(payment.id)

      return [payment.id, orders]
    })

    return { paymentId, orders }
  } finally {
    // 12. Giải phóng locks
    await Promise.all(locks.map((lock) => lock.release().catch(() => {})))
  }
}
```

### 3.2 Flow xem danh sách đơn hàng (Order List)

- **API:** `GET /orders`
- **Controller:** `OrderController.getCart` (tên function không chính xác)
- **Service:** `OrderService.list`
- **Repository:** `OrderRepo.list`

#### 3.2.1 Flow thực tế

1. **User-specific filtering** - Chỉ lấy orders của user hiện tại
2. **Status filtering** - Lọc theo trạng thái (optional)
3. **Pagination** - Hỗ trợ phân trang
4. **Include items** - Kèm theo order items
5. **Sort by creation time** - Mới nhất lên đầu

**Code thực tế (OrderRepo.list):**

```typescript
async list(userId: number, query: GetOrderListQueryType): Promise<GetOrderListResType> {
  const { page, limit, status } = query
  const skip = (page - 1) * limit
  const take = limit
  const where: Prisma.OrderWhereInput = {
    userId,
    status, // undefined sẽ được Prisma ignore
  }

  // Promise.all để chạy đồng thời count và findMany
  const totalItem$ = this.prismaService.order.count({ where })
  const data$ = await this.prismaService.order.findMany({
    where,
    include: { items: true }, // Tránh N+1 query problem
    skip,
    take,
    orderBy: { createdAt: 'desc' }, // Mới nhất lên đầu
  })

  const [data, totalItems] = await Promise.all([data$, totalItem$])

  return {
    data,
    page,
    limit,
    totalItems,
    totalPages: Math.ceil(totalItems / limit),
  }
}
```

### 3.3 Flow xem chi tiết đơn hàng (Order Detail)

- **API:** `GET /orders/:orderId`
- **Controller:** `OrderController.detail`
- **Service:** `OrderService.detail`
- **Repository:** `OrderRepo.detail`

#### 3.3.1 Flow thực tế

1. **User authorization** - Chỉ cho phép xem order của bản thân
2. **Soft delete check** - Không lấy order đã bị xóa
3. **Include items** - Kèm theo chi tiết items

**Code thực tế (OrderRepo.detail):**

```typescript
async detail(userId: number, orderid: number): Promise<GetOrderDetailResType> {
  const order = await this.prismaService.order.findUnique({
    where: {
      id: orderid,
      userId, // Chỉ lấy order của user hiện tại
      deletedAt: null, // Không lấy order đã xóa
    },
    include: { items: true }, // Kèm theo order items
  })

  if (!order) {
    throw OrderNotFoundException
  }

  return order
}
```

### 3.4 Flow hủy đơn hàng (Cancel Order)

- **API:** `PUT /orders/:orderId`
- **Controller:** `OrderController.cancel`
- **Service:** `OrderService.cancel`
- **Repository:** `OrderRepo.cancel`

#### 3.4.1 Flow thực tế

1. **User authorization** - Chỉ cho phép hủy order của bản thân
2. **Status validation** - Chỉ cho phép hủy khi PENDING_PAYMENT
3. **Update status** - Chuyển trạng thái thành CANCELLED
4. **Audit trail** - Lưu updatedById

**Code thực tế (OrderRepo.cancel):**

```typescript
async cancel(userId: number, orderId: number): Promise<CancelOrderResType> {
  try {
    // 1. Kiểm tra order tồn tại và thuộc user
    const order = await this.prismaService.order.findUniqueOrThrow({
      where: {
        id: orderId,
        userId,
        deletedAt: null,
      },
    })

    // 2. Kiểm tra chỉ cho phép hủy khi PENDING_PAYMENT
    if (order.status !== OrderStatus.PENDING_PAYMENT) {
      throw CannotCancelOrderException
    }

    // 3. Cập nhật trạng thái
    const updatedOrder = await this.prismaService.order.update({
      where: {
        id: orderId,
        userId,
        deletedAt: null,
      },
      data: {
        status: OrderStatus.CANCELLED,
        updatedById: userId, // Audit trail
      },
    })

    return updatedOrder
  } catch (error) {
    if (isNotFoundPrismaError(error)) {
      throw OrderNotFoundException
    }
    throw error
  }
}
```

---

## 4. Queue System và Background Jobs

### 4.1 OrderProducer - Queue Management

**File:** `ecom/src/routes/order/order.producer.ts`

#### 4.1.1 Auto-cancel Payment Job

- **Job:** Cancel payment tự động sau 24 giờ
- **Queue:** PAYMENT_QUEUE_NAME
- **Delay:** 24 hours
- **Purpose:** Hủy payment nếu user không thanh toán trong thời hạn

**Code thực tế:**

```typescript
@Injectable()
export class OrderProducer {
  constructor(@InjectQueue(PAYMENT_QUEUE_NAME) private paymentQueue: Queue) {}

  async addCancelPaymentJob(paymentId: number) {
    return this.paymentQueue.add(
      CANCEL_PAYMENT_JOB_NAME,
      { paymentId },
      {
        delay: 1000 * 60 * 60 * 24, // delay 24h
        jobId: generateCancelPaymentJobId(paymentId),
        removeOnComplete: true,
        removeOnFail: true,
      },
    )
  }
}
```

---

## 5. Validation và Error Handling

### 5.1 Request Validation với Zod

**Schema validation cho Create Order:**

```typescript
export const CreateOrderBodySchema = z
  .array(
    z.object({
      shopId: z.number(),
      receiver: z.object({
        name: z.string(),
        phone: z.string().min(9).max(20),
        address: z.string(),
      }),
      cartItemIds: z.array(z.number()).min(1),
    }),
  )
  .min(1)
```

### 5.2 Custom Exceptions

**Code thực tế (order.error.ts):**

```typescript
// NOT FOUND ERRORS
export const OrderNotFoundException = new NotFoundException('Error.OrderNotFound')
export const ProductNotFoundException = new NotFoundException('Error.ProductNotFound')
export const NotFoundCartItemException = new NotFoundException('Error.NotFoundCartItem')

// BUSINESS LOGIC ERRORS
export const OutOfStockSKUException = new BadRequestException('Error.OutOfStockSKU')
export const SKUNotBelongToShopException = new BadRequestException('Error.SKUNotBelongToShop')
export const CannotCancelOrderException = new BadRequestException('Error.CannotCancelOrder')
```

---

## 6. Concurrency Control và Race Condition Handling

### 6.1 Distributed Locking với Redis Redlock

- **Purpose:** Tránh race condition khi nhiều user đặt cùng lúc
- **Lock key:** `lock:sku:{skuId}`
- **Lock duration:** 3 seconds
- **Pattern:** Lock → Transaction → Release

**Code thực tế:**

```typescript
// Lock tất cả các SKU cần mua
const locks = await Promise.all(skuIds.map((skuId) => redlock.acquire([`lock:sku:${skuId}`], 3000)))

try {
  // Xử lý trong transaction
  const result = await this.prismaService.$transaction(async (tx) => {
    // Business logic
  })
  return result
} finally {
  // Giải phóng lock
  await Promise.all(locks.map((lock) => lock.release().catch(() => {})))
}
```

### 6.2 Optimistic Locking với Prisma

- **Purpose:** Đảm bảo stock không bị cập nhật bởi process khác
- **Method:** Sử dụng `updatedAt` làm version field
- **Pattern:** Check version → Update → Handle conflict

**Code thực tế:**

```typescript
await tx.sKU
  .update({
    where: {
      id: item.sku.id,
      updatedAt: item.sku.updatedAt, // Optimistic locking
      stock: { gte: item.quantity }, // Đảm bảo stock đủ
    },
    data: {
      stock: { decrement: item.quantity },
    },
  })
  .catch((e) => {
    if (isNotFoundPrismaError(e)) {
      throw VersionConflictException
    }
    throw e
  })
```

---

## 7. Multi-shop Order Support

### 7.1 Kiến trúc Multi-shop

- **Payment:** Một payment có thể chứa orders từ nhiều shops
- **Order:** Mỗi order thuộc về một shop cụ thể
- **Validation:** Đảm bảo SKU thuộc đúng shop được chọn

### 7.2 Shop Validation Logic

**Code thực tế:**

```typescript
// Tạo map để tra cứu nhanh
const cartItemMap = new Map<number, (typeof cartItems)[0]>()
cartItems.forEach((item) => {
  cartItemMap.set(item.id, item)
})

// Kiểm tra SKU thuộc đúng shop
const isValidShop = body.every((item) => {
  const bodyCartItemIds = item.cartItemIds
  return bodyCartItemIds.every((cartItemId) => {
    const cartItem = cartItemMap.get(cartItemId)!
    return item.shopId === cartItem.sku.createdById // SKU.createdById = shopId
  })
})

if (!isValidShop) {
  throw SKUNotBelongToShopException
}
```

---

## 8. Data Snapshot Pattern

### 8.1 ProductSKUSnapshot Purpose

- **Immutable History:** Lưu trữ thông tin sản phẩm tại thời điểm đặt hàng
- **Price Protection:** Giá không thay đổi khi shop cập nhật giá
- **Product Changes:** Thông tin sản phẩm không bị ảnh hưởng khi product gốc thay đổi
- **Multi-language:** Lưu trữ bản dịch tại thời điểm đặt hàng

### 8.2 Snapshot Creation

**Code thực tế:**

```typescript
items: {
  create: item.cartItemIds.map((cartItemId) => {
    const cartItem = cartItemMap.get(cartItemId)!
    return {
      productName: cartItem.sku.product.name,
      skuPrice: cartItem.sku.price,
      image: cartItem.sku.image,
      skuId: cartItem.sku.id,
      skuValue: cartItem.sku.value,
      quantity: cartItem.quantity,
      productId: cartItem.sku.product.id,
      productTranslations: cartItem.sku.product.productTranslations.map((translation) => ({
        id: translation.id,
        name: translation.name,
        description: translation.description,
        languageId: translation.languageId,
      })),
    }
  }),
}
```

---

## 9. Order Status Lifecycle

### 9.1 Trạng thái và chuyển đổi

```
PENDING_PAYMENT → PENDING_PICKUP → PENDING_DELIVERY → DELIVERED
       ↓                ↓               ↓              ↓
   CANCELLED        CANCELLED       RETURNED       RETURNED
```

### 9.2 Business Rules

- **PENDING_PAYMENT:** Có thể hủy bất cứ lúc nào
- **PENDING_PICKUP:** Chỉ shop mới có thể cập nhật
- **PENDING_DELIVERY:** Đang trong quá trình giao hàng
- **DELIVERED:** Hoàn thành, có thể review
- **CANCELLED:** Trạng thái cuối, không thể thay đổi
- **RETURNED:** Đã trả hàng

---

## 10. Performance Optimizations

### 10.1 Database Optimizations

1. **Indexes:** Index trên `deletedAt` và `status`
2. **Promise.all:** Chạy đồng thời count và findMany
3. **Include strategy:** Tránh N+1 query problem
4. **Pagination:** Giới hạn số lượng records

### 10.2 Concurrency Optimizations

1. **Distributed Locking:** Redis Redlock cho stock management
2. **Optimistic Locking:** Version-based conflict detection
3. **Transaction Scope:** Giảm thiểu thời gian lock database
4. **Queue Processing:** Async job processing

---

## 11. Điểm nổi bật trong thiết kế

### 11.1 Security và Data Integrity

1. **User Authorization:** Chỉ cho phép thao tác trên order của bản thân
2. **Stock Validation:** Ngăn chặn overselling
3. **Product Availability:** Kiểm tra sản phẩm còn bán
4. **Transaction Atomicity:** Đảm bảo consistency

### 11.2 Scalability và Performance

1. **Distributed Locking:** Handle concurrent access
2. **Queue System:** Async processing cho heavy operations
3. **Database Optimization:** Proper indexing và query optimization
4. **Caching Strategy:** Có thể implement Redis caching

### 11.3 Business Logic

1. **Multi-shop Support:** Flexible architecture
2. **Payment Integration:** Centralized payment management
3. **Auto-cancel:** Background job để hủy payment
4. **Audit Trail:** Đầy đủ lịch sử thay đổi

### 11.4 Error Handling

1. **Comprehensive Validation:** Validation ở mọi layer
2. **Custom Exceptions:** Clear error messages
3. **Graceful Failure:** Proper error recovery
4. **Lock Release:** Đảm bảo release locks trong mọi trường hợp

---

## 12. Sơ đồ tổng quát flow order management

```
1. Create Order Flow:
   Cart Items → Validation → Locking → Transaction → Payment → Queue Job

2. Order List Flow:
   User Request → Filter by User → Status Filter → Pagination → Include Items

3. Order Detail Flow:
   User Request → Authorization → Find Order → Include Items → Return Detail

4. Cancel Order Flow:
   User Request → Authorization → Status Check → Update Status → Audit Trail

5. Payment Auto-cancel Flow:
   Order Created → Schedule Job → 24h Delay → Cancel Payment → Update Orders
```

---

> **Nguồn code thực tế:**
>
> - prisma/schema.prisma (Order, ProductSKUSnapshot, Payment models)
> - ecom/src/routes/order/\* (Order management APIs)
> - ecom/src/routes/order/order.repo.ts (Core business logic với locking và transactions)
> - ecom/src/routes/order/order.producer.ts (Queue integration)
> - ecom/src/shared/constants/order.constant.ts (Order status constants)
> - ecom/src/shared/models/shared-order.model.ts (Zod validation schemas)
> - ecom/src/routes/order/order.error.ts (Custom exceptions)
