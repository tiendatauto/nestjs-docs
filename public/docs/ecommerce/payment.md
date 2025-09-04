# Phân tích chi tiết hệ thống Quản lý thanh toán (Payment Management) trong dự án NestJS ecom

## 1. Tổng quan kiến trúc quản lý thanh toán

### 1.1 Các chức năng chính

1. **Xử lý thanh toán (Payment Processing)** - Nhận và xử lý webhook từ payment gateway
2. **Quản lý trạng thái thanh toán (Payment Status Management)** - Theo dõi và cập nhật trạng thái thanh toán
3. **Hủy thanh toán tự động (Auto-cancel Payment)** - Hủy thanh toán sau thời gian chờ (24h)
4. **Đồng bộ trạng thái đơn hàng (Order Status Sync)** - Cập nhật trạng thái đơn hàng khi thanh toán thành công
5. **Hoàn trả kho hàng (Stock Restoration)** - Hoàn trả stock khi hủy thanh toán
6. **Thông báo realtime (Real-time Notification)** - Thông báo cho user qua WebSocket
7. **Ghi nhận giao dịch (Transaction Logging)** - Lưu trữ chi tiết giao dịch từ ngân hàng

### 1.2 Các đối tượng chính

- **Payment** - Thông tin thanh toán chính
- **PaymentTransaction** - Chi tiết giao dịch từ ngân hàng
- **PaymentStatus** - Trạng thái thanh toán
- **WebhookPaymentBody** - Dữ liệu webhook từ payment gateway
- **Queue Jobs** - Background jobs để xử lý auto-cancel

---

## 2. Phân tích chi tiết các đối tượng

### 2.1 Payment (Thanh toán)

- **Schema:** Định nghĩa trong `prisma/schema.prisma`
- **Thuộc tính chính:**
  - `id`: int, khóa chính
  - `status`: enum PaymentStatus, trạng thái thanh toán
  - `createdAt`: datetime, thời gian tạo
  - `updatedAt`: datetime, thời gian cập nhật
- **Quan hệ:**
  - `orders`: Order[] (1-n), các đơn hàng thuộc payment này
- **Đặc điểm:**
  - Một payment có thể chứa nhiều orders (multi-shop support)
  - Tự động hủy sau 24 giờ nếu không thanh toán
  - Liên kết trực tiếp với order lifecycle

**Code thực tế (Payment Schema trích từ source):**

```prisma
model Payment {
  id        Int           @id @default(autoincrement())
  orders    Order[]
  status    PaymentStatus
  createdAt DateTime      @default(now())
  updatedAt DateTime      @updatedAt
}
```

### 2.2 PaymentStatus (Trạng thái thanh toán)

- **Enum:** Định nghĩa trong `prisma/schema.prisma`
- **Các trạng thái:**
  - `PENDING`: Chờ thanh toán
  - `SUCCESS`: Thanh toán thành công
  - `FAILED`: Thanh toán thất bại (hoặc bị hủy)

**Code thực tế (PaymentStatus Constants):**

```typescript
export const PaymentStatus = {
  PENDING: 'PENDING',
  SUCCESS: 'SUCCESS',
  FAILED: 'FAILED',
} as const
export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus]
```

### 2.3 PaymentTransaction (Giao dịch thanh toán)

- **Schema:** Định nghĩa trong `prisma/schema.prisma`
- **Thuộc tính chính:**
  - `id`: int, khóa chính (từ payment gateway)
  - `gateway`: varchar(100), tên ngân hàng/payment gateway
  - `transactionDate`: datetime, thời gian giao dịch từ ngân hàng
  - `accountNumber`: varchar(100), số tài khoản
  - `subAccount`: varchar(250), tài khoản phụ
  - `amountIn`: int, số tiền vào (default 0)
  - `amountOut`: int, số tiền ra (default 0)
  - `accumulated`: int, số dư tài khoản
  - `code`: varchar(250), mã thanh toán (chứa payment ID)
  - `transactionContent`: text, nội dung chuyển khoản
  - `referenceNumber`: varchar(255), mã tham chiếu SMS
  - `body`: text, toàn bộ nội dung tin nhắn SMS
- **Đặc điểm:**
  - Lưu trữ chi tiết giao dịch từ ngân hàng
  - Hỗ trợ cả giao dịch vào (in) và ra (out)
  - Unique constraint trên ID để tránh duplicate

**Code thực tế (PaymentTransaction Schema):**

```prisma
model PaymentTransaction {
  id                 Int      @id @default(autoincrement())
  gateway            String   @db.VarChar(100)
  transactionDate    DateTime @default(now())
  accountNumber      String?  @db.VarChar(100)
  subAccount         String?  @db.VarChar(250)
  amountIn           Int      @default(0)
  amountOut          Int      @default(0)
  accumulated        Int      @default(0)
  code               String?  @db.VarChar(250)
  transactionContent String?  @db.Text
  referenceNumber    String?  @db.VarChar(255)
  body               String?  @db.Text

  createdAt DateTime @default(now())
}
```

### 2.4 WebhookPaymentBody (Webhook từ Payment Gateway)

- **Schema:** Định nghĩa trong `payment.model.ts`
- **Thuộc tính chính:**
  - `id`: number, ID giao dịch trên SePay
  - `gateway`: string, Brand name của ngân hàng
  - `transactionDate`: string, thời gian giao dịch phía ngân hàng
  - `accountNumber`: string, số tài khoản ngân hàng
  - `code`: string nullable, mã code thanh toán (chứa payment ID)
  - `content`: string nullable, nội dung chuyển khoản
  - `transferType`: enum ('in' | 'out'), loại giao dịch
  - `transferAmount`: number, số tiền giao dịch
  - `accumulated`: number, số dư tài khoản
  - `subAccount`: string nullable, tài khoản định danh
  - `referenceCode`: string nullable, mã tham chiếu SMS
  - `description`: string, toàn bộ nội dung tin nhắn SMS

**Code thực tế (WebhookPaymentBody Schema):**

```typescript
/**
 * https://docs.sepay.vn/tich-hop-webhooks.html
 */
export const WebhookPaymentBodySchema = z.object({
  id: z.number(), // ID giao dịch trên SePay
  gateway: z.string(), // Brand name của ngân hàng
  transactionDate: z.string(), // Thời gian xảy ra giao dịch phía ngân hàng
  accountNumber: z.string().nullable(), // Số tài khoản ngân hàng
  code: z.string().nullable(), // Mã code thanh toán (sepay tự nhận diện dựa vào cấu hình tại Công ty -> Cấu hình chung)
  content: z.string().nullable(), // Nội dung chuyển khoản
  transferType: z.enum(['in', 'out']), // Loại giao dịch. in là tiền vào, out là tiền ra
  transferAmount: z.number(), // Số tiền giao dịch
  accumulated: z.number(), // Số dư tài khoản (lũy kế)
  subAccount: z.string().nullable(), // Tài khoản ngân hàng phụ (tài khoản định danh),
  referenceCode: z.string().nullable(), // Mã tham chiếu của tin nhắn sms
  description: z.string(), // Toàn bộ nội dung tin nhắn sms
})
```

---

## 3. Flow nghiệp vụ chi tiết

### 3.1 Flow tạo payment khi tạo order

- **Trigger:** Khi user tạo order từ cart
- **Location:** `OrderRepo.create`
- **Flow thực tế:**
  1. Trong transaction tạo order
  2. Tạo payment với status PENDING
  3. Liên kết orders với payment
  4. Schedule auto-cancel job (24h delay)

**Code thực tế (trong OrderRepo.create):**

```typescript
// 5. Tạo order và xóa cartItem trong transaction để đảm bảo tính toàn vẹn dữ liệu
const payment = await tx.payment.create({
  data: {
    status: PaymentStatus.PENDING,
  },
})

const orders: CreateOrderResType['orders'] = []
for (const item of body) {
  const order = await tx.order.create({
    data: {
      userId,
      status: OrderStatus.PENDING_PAYMENT,
      receiver: item.receiver,
      createdById: userId,
      shopId: item.shopId,
      paymentId: payment.id, // Liên kết với payment
      // ...other order data
    },
  })
  orders.push(order)
}

// Schedule auto-cancel job
await this.orderProducer.addCancelPaymentJob(payment.id)
```

### 3.2 Flow xử lý webhook thanh toán

- **API:** `POST /payment/receiver`
- **Controller:** `PaymentController.receiver`
- **Service:** `PaymentService.receiver`
- **Repository:** `PaymentRepo.receiver`

#### 3.2.1 Flow thực tế

1. **Validate webhook data** - Kiểm tra dữ liệu từ payment gateway
2. **Record transaction** - Lưu chi tiết giao dịch vào PaymentTransaction
3. **Extract payment ID** - Parse payment ID từ code hoặc content
4. **Validate payment** - Kiểm tra payment tồn tại và số tiền khớp
5. **Update status** - Cập nhật payment và orders thành công
6. **Remove scheduled job** - Hủy auto-cancel job
7. **Real-time notification** - Thông báo cho user qua WebSocket

**Code thực tế (PaymentRepo.receiver):**

```typescript
async receiver(body: WebhookPaymentBodyType): Promise<number> {
  // 1. Thêm thông tin giao dịch vào DB
  let amountIn = 0
  let amountOut = 0
  if (body.transferType === 'in') {
    amountIn = body.transferAmount
  } else if (body.transferType === 'out') {
    amountOut = body.transferAmount
  }

  // Kiểm tra duplicate transaction
  const paymentTransaction = await this.prismaService.paymentTransaction.findUnique({
    where: { id: body.id },
  })
  if (paymentTransaction) {
    throw new BadRequestException('Transaction already exists')
  }

  const userId = await this.prismaService.$transaction(async (tx) => {
    // 2. Lưu transaction details
    await tx.paymentTransaction.create({
      data: {
        id: body.id,
        gateway: body.gateway,
        transactionDate: parse(body.transactionDate, 'yyyy-MM-dd HH:mm:ss', new Date()),
        accountNumber: body.accountNumber,
        subAccount: body.subAccount,
        amountIn,
        amountOut,
        accumulated: body.accumulated,
        code: body.code,
        transactionContent: body.content,
        referenceNumber: body.referenceCode,
        body: body.description,
      },
    })

    // 3. Extract payment ID từ code hoặc content
    const paymentId = body.code
      ? Number(body.code.split(PREFIX_PAYMENT_CODE)[1])
      : Number(body.content?.split(PREFIX_PAYMENT_CODE)[1])
    if (isNaN(paymentId)) {
      throw new BadRequestException('Cannot get payment id from content')
    }

    // 4. Validate payment và amount
    const payment = await tx.payment.findUnique({
      where: { id: paymentId },
      include: {
        orders: {
          include: { items: true },
        },
      },
    })
    if (!payment) {
      throw new BadRequestException(`Cannot find payment with id ${paymentId}`)
    }

    const userId = payment.orders[0].userId
    const { orders } = payment
    const totalPrice = this.getTotalPrice(orders)
    if (totalPrice !== body.transferAmount) {
      throw new BadRequestException(`Price not match, expected ${totalPrice} but got ${body.transferAmount}`)
    }

    // 5. Cập nhật trạng thái
    await Promise.all([
      tx.payment.update({
        where: { id: paymentId },
        data: { status: PaymentStatus.SUCCESS },
      }),
      tx.order.updateMany({
        where: {
          id: { in: orders.map((order) => order.id) },
        },
        data: { status: OrderStatus.PENDING_PICKUP },
      }),
      this.paymentProducer.removeJob(paymentId), // Hủy auto-cancel job
    ])

    return userId
  })

  return userId
}
```

#### 3.2.2 Real-time notification

**Code thực tế (PaymentService.receiver):**

```typescript
async receiver(body: WebhookPaymentBodyType) {
  const userId = await this.paymentRepo.receiver(body)

  // Gửi thông báo realtime cho user
  this.server.to(generateRoomUserId(userId)).emit('payment', {
    status: 'success',
  })

  return {
    message: 'Payment received successfully',
  }
}
```

### 3.3 Flow hủy thanh toán tự động (Auto-cancel)

#### 3.3.1 Schedule auto-cancel job

**File:** `OrderProducer.addCancelPaymentJob`

**Code thực tế:**

```typescript
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
```

#### 3.3.2 Process auto-cancel job

**File:** `PaymentConsumer.process`

**Code thực tế:**

```typescript
@Processor(PAYMENT_QUEUE_NAME)
export class PaymentConsumer extends WorkerHost {
  async process(job: Job<{ paymentId: number }, any, string>): Promise<any> {
    switch (job.name) {
      case CANCEL_PAYMENT_JOB_NAME: {
        const { paymentId } = job.data
        await this.sharedPaymentRepo.cancelPaymentAndOrder(paymentId)
        return {}
      }
      default: {
        break
      }
    }
  }
}
```

#### 3.3.3 Cancel payment and restore stock

**File:** `SharedPaymentRepository.cancelPaymentAndOrder`

**Flow thực tế:**

1. **Find payment with orders** - Lấy payment cùng với orders và items
2. **Extract SKU snapshots** - Lấy tất cả items cần hoàn trả stock
3. **Atomic transaction** - Cập nhật trong transaction
4. **Update orders status** - PENDING_PAYMENT → CANCELLED
5. **Restore stock** - Increment stock cho tất cả SKUs
6. **Update payment status** - PENDING → FAILED

**Code thực tế:**

```typescript
async cancelPaymentAndOrder(paymentId: number) {
  const payment = await this.prismaService.payment.findUnique({
    where: { id: paymentId },
    include: {
      orders: {
        include: { items: true },
      },
    },
  })
  if (!payment) {
    throw Error('Payment not found')
  }

  const { orders } = payment
  const productSKUSnapshots = orders.map((order) => order.items).flat()

  await this.prismaService.$transaction(async (tx) => {
    // Update orders to CANCELLED
    const updateOrder$ = tx.order.updateMany({
      where: {
        id: { in: orders.map((order) => order.id) },
        status: OrderStatus.PENDING_PAYMENT,
        deletedAt: null,
      },
      data: { status: OrderStatus.CANCELLED },
    })

    // Restore stock for all SKUs
    const updateSkus$ = Promise.all(
      productSKUSnapshots
        .filter((item) => item.skuId)
        .map((item) =>
          tx.sKU.update({
            where: { id: item.skuId as number },
            data: {
              stock: { increment: item.quantity }, // Hoàn trả exact quantity
            },
          }),
        ),
    )

    // Update payment to FAILED
    const updatePayment$ = tx.payment.update({
      where: { id: paymentId },
      data: { status: PaymentStatus.FAILED },
    })

    return await Promise.all([updateOrder$, updateSkus$, updatePayment$])
  })
}
```

---

## 4. Queue System và Background Jobs

### 4.1 Payment Queue Configuration

- **Queue Name:** `PAYMENT_QUEUE_NAME = 'payment'`
- **Job Name:** `CANCEL_PAYMENT_JOB_NAME = 'cancel-payment'`
- **Job ID Pattern:** `paymentId-{paymentId}`

### 4.2 OrderProducer - Schedule Jobs

**Chức năng:** Schedule auto-cancel payment job khi tạo order

```typescript
async addCancelPaymentJob(paymentId: number) {
  return this.paymentQueue.add(
    CANCEL_PAYMENT_JOB_NAME,
    { paymentId },
    {
      delay: 1000 * 60 * 60 * 24, // 24 hours
      jobId: generateCancelPaymentJobId(paymentId),
      removeOnComplete: true,
      removeOnFail: true,
    },
  )
}
```

### 4.3 PaymentProducer - Remove Jobs

**Chức năng:** Remove auto-cancel job khi thanh toán thành công

```typescript
removeJob(paymentId: number) {
  return this.paymentQueue.remove(generateCancelPaymentJobId(paymentId))
}
```

### 4.4 PaymentConsumer - Process Jobs

**Chức năng:** Xử lý auto-cancel job sau 24 giờ

```typescript
async process(job: Job<{ paymentId: number }, any, string>): Promise<any> {
  switch (job.name) {
    case CANCEL_PAYMENT_JOB_NAME: {
      const { paymentId } = job.data
      await this.sharedPaymentRepo.cancelPaymentAndOrder(paymentId)
      return {}
    }
  }
}
```

---

## 5. WebSocket Integration

### 5.1 Real-time Payment Notification

**File:** `PaymentService` (với WebSocketGateway)

**Namespace:** `payment`

**Code thực tế:**

```typescript
@Injectable()
@WebSocketGateway({ namespace: 'payment' })
export class PaymentService {
  @WebSocketServer()
  server: Server

  async receiver(body: WebhookPaymentBodyType) {
    const userId = await this.paymentRepo.receiver(body)

    // Emit to user-specific room
    this.server.to(generateRoomUserId(userId)).emit('payment', {
      status: 'success',
    })

    return {
      message: 'Payment received successfully',
    }
  }
}
```

### 5.2 Room Management

- **Room Pattern:** `userId-{userId}`
- **Event:** `payment`
- **Payload:** `{ status: 'success' }`

---

## 6. Security và Authentication

### 6.1 Payment API Key Authentication

**Controller Security:**

```typescript
@Controller('payment')
@ApiSecurity('payment-api-key')
export class PaymentController {
  @Post('/receiver')
  @Auth(['PaymentAPIKey']) // Custom auth guard for payment gateway
  receiver(@Body() body: WebhookPaymentBodyDTO) {
    return this.paymentService.receiver(body)
  }
}
```

### 6.2 Webhook Validation

- **Duplicate Prevention:** Kiểm tra transaction ID đã tồn tại
- **Amount Validation:** So sánh số tiền từ webhook với order total
- **Payment ID Extraction:** Parse từ code hoặc content với PREFIX_PAYMENT_CODE

---

## 7. Error Handling và Validation

### 7.1 Validation với Zod

**Webhook validation:**

```typescript
export const WebhookPaymentBodySchema = z.object({
  id: z.number(),
  gateway: z.string(),
  transactionDate: z.string(),
  transferType: z.enum(['in', 'out']),
  transferAmount: z.number(),
  // ...other fields
})
```

### 7.2 Custom Error Handling

**Common errors:**

```typescript
// Duplicate transaction
if (paymentTransaction) {
  throw new BadRequestException('Transaction already exists')
}

// Invalid payment ID
if (isNaN(paymentId)) {
  throw new BadRequestException('Cannot get payment id from content')
}

// Payment not found
if (!payment) {
  throw new BadRequestException(`Cannot find payment with id ${paymentId}`)
}

// Amount mismatch
if (totalPrice !== body.transferAmount) {
  throw new BadRequestException(`Price not match, expected ${totalPrice} but got ${body.transferAmount}`)
}
```

---

## 8. Multi-shop Payment Support

### 8.1 Payment-Orders Relationship

- **Pattern:** 1 Payment → N Orders
- **Use case:** User mua từ nhiều shops trong 1 lần thanh toán
- **Implementation:** Orders cùng chung 1 paymentId

### 8.2 Total Price Calculation

**Code thực tế:**

```typescript
private getTotalPrice(orders: OrderIncludeProductSKUSnapshotType[]): number {
  return orders.reduce((total, order) => {
    const orderTotal = order.items.reduce((totalPrice, productSku) => {
      return totalPrice + productSku.skuPrice * productSku.quantity
    }, 0)
    return total + orderTotal
  }, 0)
}
```

---

## 9. Data Integrity và Transaction Management

### 9.1 Atomic Operations

**Payment processing transaction:**

```typescript
const userId = await this.prismaService.$transaction(async (tx) => {
  // 1. Save transaction
  await tx.paymentTransaction.create({...})

  // 2. Validate payment and amount
  const payment = await tx.payment.findUnique({...})

  // 3. Update payment and orders atomically
  await Promise.all([
    tx.payment.update({...}),
    tx.order.updateMany({...}),
    this.paymentProducer.removeJob(paymentId),
  ])

  return userId
})
```

### 9.2 Stock Management

**Auto-cancel với stock restoration:**

```typescript
await this.prismaService.$transaction(async (tx) => {
  // Update orders status
  const updateOrder$ = tx.order.updateMany({...})

  // Restore stock
  const updateSkus$ = Promise.all(
    productSKUSnapshots
      .filter((item) => item.skuId)
      .map((item) =>
        tx.sKU.update({
          where: { id: item.skuId as number },
          data: { stock: { increment: item.quantity } },
        }),
      ),
  )

  // Update payment status
  const updatePayment$ = tx.payment.update({...})

  return await Promise.all([updateOrder$, updateSkus$, updatePayment$])
})
```

---

## 10. Payment Gateway Integration

### 10.1 SePay Integration

- **Documentation:** https://docs.sepay.vn/tich-hop-webhooks.html
- **Webhook Endpoint:** `/payment/receiver`
- **Authentication:** API Key based
- **Data Format:** JSON webhook payload

### 10.2 Payment Code Format

- **Prefix:** `DH` (PREFIX_PAYMENT_CODE)
- **Format:** `DH{paymentId}`
- **Usage:** User ghi vào nội dung chuyển khoản để identify payment

### 10.3 Transaction Processing

1. **Bank Transaction** → SePay system
2. **SePay Webhook** → Application `/payment/receiver`
3. **Validation & Processing** → Update order status
4. **Real-time Notification** → User notification

---

## 11. Điểm nổi bật trong thiết kế

### 11.1 Reliability và Data Consistency

1. **Atomic Transactions:** Đảm bảo payment và order status nhất quán
2. **Duplicate Prevention:** Kiểm tra transaction ID trước khi xử lý
3. **Stock Management:** Hoàn trả stock chính xác khi cancel
4. **Queue System:** Reliable background job processing

### 11.2 Scalability

1. **Queue-based Processing:** Async handling cho auto-cancel jobs
2. **WebSocket Notification:** Real-time user experience
3. **Multi-shop Support:** Flexible payment architecture
4. **Database Optimization:** Efficient batch operations

### 11.3 Security

1. **API Key Authentication:** Secure webhook endpoint
2. **Amount Validation:** Prevent payment fraud
3. **Transaction Logging:** Complete audit trail
4. **Idempotency:** Safe webhook replay handling

### 11.4 User Experience

1. **Real-time Notification:** Instant payment confirmation
2. **Auto-cancel Protection:** Prevent indefinite pending payments
3. **Multi-shop Checkout:** Single payment for multiple shops
4. **Transparent Processing:** Complete transaction history

---

## 12. Sơ đồ tổng quát flow payment management

```
1. Create Payment Flow:
   Order Creation → Create Payment (PENDING) → Schedule Auto-cancel Job (24h)

2. Payment Success Flow:
   Bank Transfer → SePay Webhook → Validate & Process → Update Status → Remove Job → WebSocket Notify

3. Auto-cancel Flow:
   24h Timer → Queue Job → Cancel Payment → Cancel Orders → Restore Stock

4. Multi-shop Flow:
   Multiple Orders → Single Payment → Single Webhook → Update All Orders

5. Transaction Flow:
   Webhook Received → Save Transaction → Extract Payment ID → Validate Amount → Update Status
```

---

## 13. Payment Status Lifecycle

### 13.1 Trạng thái và chuyển đổi

```
PENDING → SUCCESS (webhook success)
   ↓
PENDING → FAILED (auto-cancel after 24h)
```

### 13.2 Business Rules

- **PENDING:** Cho phép auto-cancel sau 24h
- **SUCCESS:** Không thể thay đổi, orders chuyển sang PENDING_PICKUP
- **FAILED:** Trạng thái cuối, orders chuyển sang CANCELLED

---

> **Nguồn code thực tế:**
>
> - prisma/schema.prisma (Payment, PaymentTransaction models)
> - ecom/src/routes/payment/\* (Payment processing APIs)
> - ecom/src/routes/payment/payment.repo.ts (Core webhook processing logic)
> - ecom/src/queues/payment.consumer.ts (Auto-cancel job processing)
> - ecom/src/shared/repositories/shared-payment.repo.ts (Payment và stock management)
> - ecom/src/routes/order/order.producer.ts (Payment job scheduling)
> - ecom/src/shared/constants/payment.constant.ts (Payment status constants)
> - ecom/src/shared/constants/queue.constant.ts (Queue configuration)
