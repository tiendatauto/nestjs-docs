# Phân tích chi tiết hệ thống Quản lý sản phẩm (Product Management) trong dự án NestJS ecom

## 1. Tổng quan kiến trúc quản lý sản phẩm

### 1.1 Các chức năng chính

1. **Tạo và quản lý sản phẩm (Product CRUD)** - Create, Read, Update, Delete sản phẩm
2. **Quản lý biến thể sản phẩm (SKU Management)** - Quản lý variants, stock, pricing cho từng SKU
3. **Quản lý danh mục sản phẩm (Category Management)** - Phân loại sản phẩm hierarchical
4. **Quản lý thương hiệu (Brand Management)** - Quản lý brands với translations
5. **Đánh giá sản phẩm (Review System)** - Customer reviews và ratings
6. **Hệ thống xuất bản (Publication System)** - Draft, scheduled, published states
7. **Đa ngôn ngữ (Internationalization)** - Product translations cho multiple languages
8. **Advanced filtering và sorting** - Complex search, filter, pagination
9. **Audit trail và ownership** - Track creator, modifier, soft delete

### 1.2 Các đối tượng chính

- **Product** - Sản phẩm chính với thông tin cơ bản
- **SKU** - Stock Keeping Unit, biến thể cụ thể của sản phẩm
- **ProductTranslation** - Bản dịch tên và mô tả sản phẩm
- **Category** - Danh mục sản phẩm (hierarchical)
- **Brand** - Thương hiệu sản phẩm
- **Review** - Đánh giá của khách hàng
- **ProductSKUSnapshot** - Snapshot của SKU trong order

---

## 2. Phân tích chi tiết các đối tượng

### 2.1 Product (Sản phẩm chính)

- **Schema:** Định nghĩa trong `prisma/schema.prisma`
- **Thuộc tính chính:**
  - `id`: int, khóa chính
  - `publishedAt`: datetime nullable, thời gian xuất bản
  - `name`: varchar(500), tên sản phẩm
  - `basePrice`: float, giá gốc sản phẩm
  - `virtualPrice`: float, giá ảo (để hiển thị discount)
  - `brandId`: int, khóa ngoại liên kết đến Brand
  - `images`: string[], mảng URLs hình ảnh
  - `variants`: json, cấu hình variants (color, size, etc.)
- **Quan hệ:**
  - `brand`: Brand (n-1), thương hiệu sản phẩm
  - `categories`: Category[] (n-n), các danh mục chứa sản phẩm
  - `skus`: SKU[] (1-n), các biến thể sản phẩm
  - `reviews`: Review[] (1-n), đánh giá sản phẩm
  - `productTranslations`: ProductTranslation[] (1-n), bản dịch đa ngôn ngữ
  - `orders`: Order[] (1-n), các đơn hàng chứa sản phẩm này
- **Audit trail:**
  - `createdBy`, `updatedBy`, `deletedBy`: User references
  - `createdAt`, `updatedAt`, `deletedAt`: Timestamps

**Code thực tế (Product Schema trích từ source):**

```prisma
model Product {
  id                  Int                  @id @default(autoincrement())
  publishedAt         DateTime?
  name                String               @db.VarChar(500)
  basePrice           Float
  virtualPrice        Float
  brandId             Int
  brand               Brand                @relation(fields: [brandId], references: [id], onDelete: NoAction, onUpdate: NoAction)
  images              String[]
  categories          Category[]
  /// [Variants]
  variants            Json
  skus                SKU[]
  reviews             Review[]
  productTranslations ProductTranslation[]
  orders              Order[]
  productSKUSnapshots ProductSKUSnapshot[]

  createdById Int
  createdBy   User  @relation("ProductCreatedBy", fields: [createdById], references: [id], onDelete: Cascade, onUpdate: NoAction)
  updatedById Int?
  updatedBy   User? @relation("ProductUpdatedBy", fields: [updatedById], references: [id], onDelete: SetNull, onUpdate: NoAction)
  deletedById Int?
  deletedBy   User? @relation("ProductDeletedBy", fields: [deletedById], references: [id], onDelete: SetNull, onUpdate: NoAction)

  deletedAt DateTime?
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt

  @@index([deletedAt])
}
```

**Đặc điểm quan trọng:**

- `publishedAt`: Null = draft, có giá trị = published
- `variants`: JSON field chứa cấu trúc variant options
- `basePrice` vs `virtualPrice`: Để tính % discount
- Soft delete pattern với audit trail

### 2.2 SKU Entity (Stock Keeping Units)

**Code thực tế (SKU Schema trích từ source):**

```prisma
model SKU {
  id              Int       @id @default(autoincrement())
  productId       Int
  product         Product   @relation(fields: [productId], references: [id], onDelete: Cascade, onUpdate: NoAction)

  name            String    @db.VarChar(500)
  sku             String    @unique @db.VarChar(200)
  price           Float
  inventory       Int       @default(0)
  soldCount       Int       @default(0)
  weight          Float?
  /// [Variant]
  variant         Json

  cartItems       CartItem[]
  orderItems      OrderItem[]

  createdById Int
  createdBy   User  @relation("SKUCreatedBy", fields: [createdById], references: [id], onDelete: Cascade, onUpdate: NoAction)
  updatedById Int?
  updatedBy   User? @relation("SKUUpdatedBy", fields: [updatedById], references: [id], onDelete: SetNull, onUpdate: NoAction)
  deletedById Int?
  deletedBy   User? @relation("SKUDeletedBy", fields: [deletedById], references: [id], onDelete: SetNull, onUpdate: NoAction)

  deletedAt DateTime?
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt

  @@index([deletedAt])
}
```

**Đặc điểm quan trọng:**

- `sku`: Mã SKU unique (được generate tự động)
- `variant`: JSON chứa giá trị cụ thể của variants
- `inventory`: Real-time stock tracking
- `soldCount`: Statistics cho popularity

### 2.3 Category Entity (Hierarchical Categories)

**Code thực tế (Category Schema trích từ source):**

```prisma
model Category {
  id          Int       @id @default(autoincrement())
  name        String    @db.VarChar(200)
  slug        String    @unique @db.VarChar(200)
  description String?   @db.Text
  image       String?

  parentId    Int?
  parent      Category? @relation("CategoryHierarchy", fields: [parentId], references: [id], onDelete: NoAction, onUpdate: NoAction)
  children    Category[] @relation("CategoryHierarchy")

  products    Product[]

  createdById Int
  createdBy   User  @relation("CategoryCreatedBy", fields: [createdById], references: [id], onDelete: Cascade, onUpdate: NoAction)
  updatedById Int?
  updatedBy   User? @relation("CategoryUpdatedBy", fields: [updatedById], references: [id], onDelete: SetNull, onUpdate: NoAction)
  deletedById Int?
  deletedBy   User? @relation("CategoryDeletedBy", fields: [deletedById], references: [id], onDelete: SetNull, onUpdate: NoAction)

  deletedAt DateTime?
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt

  @@index([deletedAt])
}
```

### 2.4 Brand Entity

**Code thực tế (Brand Schema trích từ source):**

```prisma
model Brand {
  id          Int     @id @default(autoincrement())
  name        String  @db.VarChar(200)
  slug        String  @unique @db.VarChar(200)
  description String? @db.Text
  logo        String?
  website     String?

  products          Product[]
  brandTranslations BrandTranslation[]

  createdById Int
  createdBy   User  @relation("BrandCreatedBy", fields: [createdById], references: [id], onDelete: Cascade, onUpdate: NoAction)
  updatedById Int?
  updatedBy   User? @relation("BrandUpdatedBy", fields: [updatedById], references: [id], onDelete: SetNull, onUpdate: NoAction)
  deletedById Int?
  deletedBy   User? @relation("BrandDeletedBy", fields: [deletedById], references: [id], onDelete: SetNull, onUpdate: NoAction)

  deletedAt DateTime?
  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt

  @@index([deletedAt])
}
```

### 2.5 Review Entity

**Code thực tế (Review Schema trích từ source):**

```prisma
model Review {
  id         Int     @id @default(autoincrement())
  productId  Int
  product    Product @relation(fields: [productId], references: [id], onDelete: Cascade, onUpdate: NoAction)
  userId     Int
  user       User    @relation(fields: [userId], references: [id], onDelete: Cascade, onUpdate: NoAction)

  rating     Int
  comment    String? @db.Text
  media      String[]
  isApproved Boolean  @default(false)

  createdAt DateTime  @default(now())
  updatedAt DateTime  @updatedAt
  deletedAt DateTime?

  @@index([productId, isApproved])
  @@index([userId])
  @@index([rating])
}
```

### 2.6 ProductTranslation Entity

**Code thực tế (ProductTranslation Schema trích từ source):**

```prisma
model ProductTranslation {
  id          Int     @id @default(autoincrement())
  productId   Int
  product     Product @relation(fields: [productId], references: [id], onDelete: Cascade, onUpdate: NoAction)
  locale      String  @db.VarChar(5)
  name        String  @db.VarChar(500)
  description String? @db.Text

  @@unique([productId, locale])
}
```

---

## 3. API Controllers - Dual Architecture

### 3.1 Public Product Controller (`ProductController`)

**File:** `src/routes/product/product.controller.ts`

**Code thực tế trích từ source:**

```typescript
@Controller('products')
@IsPublic()
export class ProductController {
  constructor(private readonly productService: ProductService) {}

  @Get()
  async findMany(@Query() query: FindManyProductDto) {
    return this.productService.findMany(query)
  }

  @Get(':id')
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.productService.findOne(id)
  }

  @Get(':id/reviews')
  async getReviews(@Param('id', ParseIntPipe) productId: number, @Query() query: FindManyReviewDto) {
    return this.productService.getReviews(productId, query)
  }

  @Get(':id/similar')
  async getSimilarProducts(@Param('id', ParseIntPipe) id: number) {
    return this.productService.getSimilarProducts(id)
  }
}
```

**Đặc điểm:**

- `@IsPublic()`: Không yêu cầu authentication
- Chỉ expose các API read-only
- Chỉ trả về sản phẩm đã published (`publishedAt IS NOT NULL`)

### 3.2 Management Product Controller (`ManageProductController`)

**File:** `src/routes/product/manage-product.controller.ts`

**Code thực tế trích từ source:**

```typescript
@Controller('manage/products')
@UseGuards(JwtGuard)
export class ManageProductController {
  constructor(private readonly manageProductService: ManageProductService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.CONTENT_MANAGER)
  async create(@Body() createProductDto: CreateProductDto, @User() user: AuthUser) {
    return this.manageProductService.create(createProductDto, user)
  }

  @Get()
  @Roles(UserRole.ADMIN, UserRole.CONTENT_MANAGER)
  async findMany(@Query() query: FindManyProductDto) {
    return this.manageProductService.findMany(query)
  }

  @Get(':id')
  @Roles(UserRole.ADMIN, UserRole.CONTENT_MANAGER)
  async findOne(@Param('id', ParseIntPipe) id: number) {
    return this.manageProductService.findOne(id)
  }

  @Put(':id')
  @Roles(UserRole.ADMIN, UserRole.CONTENT_MANAGER)
  async update(
    @Param('id', ParseIntPipe) id: number,
    @Body() updateProductDto: UpdateProductDto,
    @User() user: AuthUser,
  ) {
    return this.manageProductService.update(id, updateProductDto, user)
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN, UserRole.CONTENT_MANAGER)
  async remove(@Param('id', ParseIntPipe) id: number, @User() user: AuthUser) {
    return this.manageProductService.remove(id, user)
  }

  @Post(':id/publish')
  @Roles(UserRole.ADMIN, UserRole.CONTENT_MANAGER)
  async publish(@Param('id', ParseIntPipe) id: number, @User() user: AuthUser) {
    return this.manageProductService.publish(id, user)
  }

  @Post(':id/unpublish')
  @Roles(UserRole.ADMIN, UserRole.CONTENT_MANAGER)
  async unpublish(@Param('id', ParseIntPipe) id: number, @User() user: AuthUser) {
    return this.manageProductService.unpublish(id, user)
  }
}
```

**Đặc điểm:**

- Yêu cầu JWT authentication
- Role-based access control (`@Roles()`)
- Full CRUD operations
- Publication workflow management

---

## 4. Service Layer Logic

### 4.1 ProductService (Public Service)

**File:** `src/routes/product/product.service.ts`

**Code thực tế trích từ source:**

```typescript
@Injectable()
export class ProductService {
  constructor(private readonly productRepo: ProductRepo) {}

  async findMany(query: FindManyProductDto) {
    return this.productRepo.findMany({
      ...query,
      where: {
        ...query.where,
        publishedAt: {
          not: null,
        },
        deletedAt: null,
      },
      include: {
        brand: true,
        categories: true,
        skus: {
          where: {
            deletedAt: null,
          },
        },
        productTranslations: true,
      },
    })
  }

  async findOne(id: number) {
    const product = await this.productRepo.findUnique({
      where: {
        id,
        publishedAt: {
          not: null,
        },
        deletedAt: null,
      },
      include: {
        brand: {
          include: {
            brandTranslations: true,
          },
        },
        categories: {
          include: {
            parent: true,
          },
        },
        skus: {
          where: {
            deletedAt: null,
          },
        },
        productTranslations: true,
      },
    })

    if (!product) {
      throw new NotFoundException('Product not found')
    }

    return product
  }

  async getReviews(productId: number, query: FindManyReviewDto) {
    // Verify product exists
    await this.findOne(productId)

    return this.productRepo.findReviews(productId, query)
  }

  async getSimilarProducts(id: number) {
    const product = await this.findOne(id)

    return this.productRepo.findMany({
      where: {
        id: {
          not: id,
        },
        brandId: product.brandId,
        publishedAt: {
          not: null,
        },
        deletedAt: null,
      },
      take: 5,
      include: {
        brand: true,
        skus: {
          where: {
            deletedAt: null,
          },
          take: 1,
        },
      },
    })
  }
}
```

### 4.2 ManageProductService (Admin Service)

**File:** `src/routes/product/manage-product.service.ts`

**Code thực tế trích từ source (các method chính):**

```typescript
@Injectable()
export class ManageProductService {
  constructor(private readonly productRepo: ProductRepo) {}

  async create(createProductDto: CreateProductDto, user: AuthUser) {
    const { skus, translations, categories, ...productData } = createProductDto

    return this.productRepo.transaction(async (tx) => {
      // Create the product
      const product = await tx.product.create({
        data: {
          ...productData,
          createdById: user.id,
          categories: categories
            ? {
                connect: categories.map((id) => ({ id })),
              }
            : undefined,
        },
      })

      // Create translations if provided
      if (translations && translations.length > 0) {
        await tx.productTranslation.createMany({
          data: translations.map((translation) => ({
            ...translation,
            productId: product.id,
          })),
        })
      }

      // Generate and create SKUs
      if (skus && skus.length > 0) {
        const skusWithCodes = await this.generateSKUs(product, skus)
        await tx.sku.createMany({
          data: skusWithCodes.map((sku) => ({
            ...sku,
            productId: product.id,
            createdById: user.id,
          })),
        })
      }

      return this.findOne(product.id)
    })
  }

  async update(id: number, updateProductDto: UpdateProductDto, user: AuthUser) {
    const { skus, translations, categories, ...productData } = updateProductDto

    // Check if user has access to this product
    await this.checkProductAccess(id, user)

    return this.productRepo.transaction(async (tx) => {
      // Update the product
      await tx.product.update({
        where: { id },
        data: {
          ...productData,
          updatedById: user.id,
          categories: categories
            ? {
                set: categories.map((categoryId) => ({ id: categoryId })),
              }
            : undefined,
        },
      })

      // Update translations
      if (translations) {
        // Delete existing translations
        await tx.productTranslation.deleteMany({
          where: { productId: id },
        })

        // Create new translations
        if (translations.length > 0) {
          await tx.productTranslation.createMany({
            data: translations.map((translation) => ({
              ...translation,
              productId: id,
            })),
          })
        }
      }

      // Update SKUs if provided
      if (skus !== undefined) {
        await this.updateSKUs(tx, id, skus, user)
      }

      return this.findOne(id)
    })
  }

  async publish(id: number, user: AuthUser) {
    await this.checkProductAccess(id, user)

    const product = await this.productRepo.findUnique({
      where: { id, deletedAt: null },
      include: {
        skus: {
          where: { deletedAt: null },
        },
      },
    })

    if (!product) {
      throw new NotFoundException('Product not found')
    }

    if (product.skus.length === 0) {
      throw new BadRequestException('Cannot publish a product without any SKUs')
    }

    return this.productRepo.update({
      where: { id },
      data: {
        publishedAt: new Date(),
        updatedById: user.id,
      },
    })
  }

  async unpublish(id: number, user: AuthUser) {
    await this.checkProductAccess(id, user)

    return this.productRepo.update({
      where: { id },
      data: {
        publishedAt: null,
        updatedById: user.id,
      },
    })
  }

  async remove(id: number, user: AuthUser) {
    await this.checkProductAccess(id, user)

    return this.productRepo.update({
      where: { id },
      data: {
        deletedAt: new Date(),
        deletedById: user.id,
      },
    })
  }

  // Private helper methods
  private async generateSKUs(product: any, skuDtos: any[]) {
    return skuDtos.map((skuDto) => {
      const skuCode = this.generateSKUCode(product.name, skuDto.variant)
      return {
        ...skuDto,
        sku: skuCode,
      }
    })
  }

  private generateSKUCode(productName: string, variant: any): string {
    const productCode = productName
      .substring(0, 3)
      .toUpperCase()
      .replace(/[^A-Z]/g, '')

    const variantCode = Object.values(variant)
      .map((v: any) => v.substring(0, 2).toUpperCase())
      .join('')

    const timestamp = Date.now().toString().slice(-4)

    return `${productCode}-${variantCode}-${timestamp}`
  }

  private async updateSKUs(tx: any, productId: number, skus: any[], user: AuthUser) {
    // Get existing SKUs
    const existingSKUs = await tx.sku.findMany({
      where: { productId, deletedAt: null },
    })

    const skusToKeep = skus.filter((sku) => sku.id)
    const skusToCreate = skus.filter((sku) => !sku.id)
    const skuIdsToKeep = skusToKeep.map((sku) => sku.id)

    // Soft delete SKUs not in the update list
    const skusToDelete = existingSKUs.filter((existingSku) => !skuIdsToKeep.includes(existingSku.id))

    if (skusToDelete.length > 0) {
      await tx.sku.updateMany({
        where: {
          id: { in: skusToDelete.map((sku) => sku.id) },
        },
        data: {
          deletedAt: new Date(),
          deletedById: user.id,
        },
      })
    }

    // Update existing SKUs
    for (const sku of skusToKeep) {
      const { id, ...skuData } = sku
      await tx.sku.update({
        where: { id },
        data: {
          ...skuData,
          updatedById: user.id,
        },
      })
    }

    // Create new SKUs
    if (skusToCreate.length > 0) {
      const product = await tx.product.findUnique({
        where: { id: productId },
      })

      const newSKUs = await this.generateSKUs(product, skusToCreate)
      await tx.sku.createMany({
        data: newSKUs.map((sku) => ({
          ...sku,
          productId,
          createdById: user.id,
        })),
      })
    }
  }

  private async checkProductAccess(productId: number, user: AuthUser) {
    const product = await this.productRepo.findUnique({
      where: { id: productId, deletedAt: null },
    })

    if (!product) {
      throw new NotFoundException('Product not found')
    }

    // Admins và Content Managers có full access
    if ([UserRole.ADMIN, UserRole.CONTENT_MANAGER].includes(user.role)) {
      return
    }

    // Creators có thể edit products của họ
    if (product.createdById === user.id) {
      return
    }

    throw new ForbiddenException('You do not have access to this product')
  }
}
```

---

## 5. Repository Pattern - ProductRepo

**File:** `src/routes/product/product.repo.ts`

**Code thực tế trích từ source:**

```typescript
@Injectable()
export class ProductRepo extends BaseRepo<Product> {
  constructor(prisma: PrismaService) {
    super(prisma, 'product')
  }

  async findMany(params: FindManyParams<Product>) {
    const { where, include, select, orderBy = { createdAt: 'desc' }, skip, take = 20 } = params

    const [items, total] = await Promise.all([
      this.prisma.product.findMany({
        where: this.buildWhereClause(where),
        include,
        select,
        orderBy,
        skip,
        take,
      }),
      this.prisma.product.count({
        where: this.buildWhereClause(where),
      }),
    ])

    return this.createPaginatedResult(items, total, skip || 0, take)
  }

  async findReviews(productId: number, query: FindManyReviewDto) {
    const { skip, take = 10, orderBy = { createdAt: 'desc' } } = query

    const where = {
      productId,
      isApproved: true,
      deletedAt: null,
    }

    const [items, total] = await Promise.all([
      this.prisma.review.findMany({
        where,
        include: {
          user: {
            select: {
              id: true,
              name: true,
              avatar: true,
            },
          },
        },
        orderBy,
        skip,
        take,
      }),
      this.prisma.review.count({ where }),
    ])

    // Calculate rating statistics
    const stats = await this.prisma.review.groupBy({
      by: ['rating'],
      where: { productId, isApproved: true, deletedAt: null },
      _count: { rating: true },
    })

    const ratingStats = {
      average: 0,
      total,
      distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
    }

    let totalRating = 0
    stats.forEach((stat) => {
      ratingStats.distribution[stat.rating] = stat._count.rating
      totalRating += stat.rating * stat._count.rating
    })

    ratingStats.average = total > 0 ? totalRating / total : 0

    return {
      data: items,
      meta: this.createPaginationMeta(total, skip || 0, take),
      stats: ratingStats,
    }
  }

  private buildWhereClause(where: any) {
    if (!where) return {}

    const clause: any = { ...where }

    // Handle search
    if (where.search) {
      clause.OR = [
        { name: { contains: where.search, mode: 'insensitive' } },
        {
          productTranslations: {
            some: {
              name: { contains: where.search, mode: 'insensitive' },
            },
          },
        },
        {
          brand: {
            name: { contains: where.search, mode: 'insensitive' },
          },
        },
      ]
      delete clause.search
    }

    // Handle price range
    if (where.priceFrom || where.priceTo) {
      clause.skus = {
        some: {
          price: {
            ...(where.priceFrom && { gte: where.priceFrom }),
            ...(where.priceTo && { lte: where.priceTo }),
          },
          deletedAt: null,
        },
      }
      delete clause.priceFrom
      delete clause.priceTo
    }

    // Handle category filter
    if (where.categoryIds && where.categoryIds.length > 0) {
      clause.categories = {
        some: {
          id: { in: where.categoryIds },
        },
      }
      delete clause.categoryIds
    }

    // Handle brand filter
    if (where.brandIds && where.brandIds.length > 0) {
      clause.brandId = { in: where.brandIds }
      delete clause.brandIds
    }

    // Handle stock filter
    if (where.inStock !== undefined) {
      clause.skus = {
        ...(clause.skus || {}),
        some: {
          ...(clause.skus?.some || {}),
          inventory: where.inStock ? { gt: 0 } : { lte: 0 },
          deletedAt: null,
        },
      }
      delete clause.inStock
    }

    return clause
  }
}
```

---

## 6. DTOs và Validation

### 6.1 CreateProductDto

**Code thực tế trích từ source:**

```typescript
export class CreateProductDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  name: string

  @IsNumber()
  @Min(0)
  basePrice: number

  @IsNumber()
  @Min(0)
  virtualPrice: number

  @IsInt()
  brandId: number

  @IsArray()
  @IsString({ each: true })
  images: string[]

  @IsArray()
  @IsInt({ each: true })
  @IsOptional()
  categories?: number[]

  @IsObject()
  variants: any

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateSKUDto)
  @IsOptional()
  skus?: CreateSKUDto[]

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CreateProductTranslationDto)
  @IsOptional()
  translations?: CreateProductTranslationDto[]
}
```

### 6.2 CreateSKUDto

**Code thực tế trích từ source:**

```typescript
export class CreateSKUDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(500)
  name: string

  @IsNumber()
  @Min(0)
  price: number

  @IsInt()
  @Min(0)
  inventory: number

  @IsNumber()
  @IsOptional()
  @Min(0)
  weight?: number

  @IsObject()
  variant: any
}
```

### 6.3 FindManyProductDto

**Code thực tế trích từ source:**

```typescript
export class FindManyProductDto extends PaginationDto {
  @IsString()
  @IsOptional()
  search?: string

  @Transform(({ value }) => {
    if (typeof value === 'string') {
      return value.split(',').map(Number)
    }
    return value
  })
  @IsArray()
  @IsInt({ each: true })
  @IsOptional()
  categoryIds?: number[]

  @Transform(({ value }) => {
    if (typeof value === 'string') {
      return value.split(',').map(Number)
    }
    return value
  })
  @IsArray()
  @IsInt({ each: true })
  @IsOptional()
  brandIds?: number[]

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  @Min(0)
  priceFrom?: number

  @Type(() => Number)
  @IsNumber()
  @IsOptional()
  @Min(0)
  priceTo?: number

  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  @IsOptional()
  inStock?: boolean
}
```

---

## 7. Key Features và Business Logic

### 7.1 SKU Generation System

Hệ thống tự động generate SKU codes:

```typescript
private generateSKUCode(productName: string, variant: any): string {
  // 1. Product prefix (3 chars từ tên sản phẩm)
  const productCode = productName
    .substring(0, 3)
    .toUpperCase()
    .replace(/[^A-Z]/g, '');

  // 2. Variant codes (2 chars mỗi variant value)
  const variantCode = Object.values(variant)
    .map((v: any) => v.substring(0, 2).toUpperCase())
    .join('');

  // 3. Timestamp suffix (4 digits cuối)
  const timestamp = Date.now().toString().slice(-4);

  return `${productCode}-${variantCode}-${timestamp}`;
}
```

**Ví dụ:**

- Product: "iPhone 15 Pro Max"
- Variant: { "Color": "Blue", "Storage": "256GB" }
- Result: "IPH-BL25-7834"

### 7.2 Publication Workflow

```typescript
async publish(id: number, user: AuthUser) {
  // 1. Verify access permissions
  await this.checkProductAccess(id, user);

  // 2. Load product với validations
  const product = await this.productRepo.findUnique({
    where: { id, deletedAt: null },
    include: {
      skus: { where: { deletedAt: null } }
    }
  });

  if (!product) {
    throw new NotFoundException('Product not found');
  }

  // 3. Business rules validation
  if (product.skus.length === 0) {
    throw new BadRequestException(
      'Cannot publish a product without any SKUs'
    );
  }

  // 4. Publish với timestamp
  return this.productRepo.update({
    where: { id },
    data: {
      publishedAt: new Date(),
      updatedById: user.id
    }
  });
}
```

### 7.3 Complex SKU Update Logic

**Code thực tế từ source:** Hệ thống phân loại operations cho SKUs:

```typescript
private async updateSKUs(tx: any, productId: number, skus: any[], user: AuthUser) {
  // Get existing SKUs
  const existingSKUs = await tx.sku.findMany({
    where: { productId, deletedAt: null },
  });

  const skusToKeep = skus.filter((sku) => sku.id);
  const skusToCreate = skus.filter((sku) => !sku.id);
  const skuIdsToKeep = skusToKeep.map((sku) => sku.id);

  // Soft delete SKUs not in the update list
  const skusToDelete = existingSKUs.filter(
    (existingSku) => !skuIdsToKeep.includes(existingSku.id),
  );

  if (skusToDelete.length > 0) {
    await tx.sku.updateMany({
      where: {
        id: { in: skusToDelete.map((sku) => sku.id) },
      },
      data: {
        deletedAt: new Date(),
        deletedById: user.id,
      },
    });
  }

  // Update existing SKUs
  for (const sku of skusToKeep) {
    const { id, ...skuData } = sku;
    await tx.sku.update({
      where: { id },
      data: {
        ...skuData,
        updatedById: user.id,
      },
    });
  }

  // Create new SKUs
  if (skusToCreate.length > 0) {
    const product = await tx.product.findUnique({
      where: { id: productId },
    });

    const newSKUs = await this.generateSKUs(product, skusToCreate);
    await tx.sku.createMany({
      data: newSKUs.map((sku) => ({
        ...sku,
        productId,
        createdById: user.id,
      })),
    });
  }
}
```

### 7.4 Advanced Search và Filtering

**Code thực tế từ source:**

```typescript
private buildWhereClause(where: any) {
  if (!where) return {};

  const clause: any = { ...where };

  // Handle search
  if (where.search) {
    clause.OR = [
      { name: { contains: where.search, mode: 'insensitive' } },
      {
        productTranslations: {
          some: {
            name: { contains: where.search, mode: 'insensitive' },
          },
        },
      },
      {
        brand: {
          name: { contains: where.search, mode: 'insensitive' },
        },
      },
    ];
    delete clause.search;
  }

  // Handle price range
  if (where.priceFrom || where.priceTo) {
    clause.skus = {
      some: {
        price: {
          ...(where.priceFrom && { gte: where.priceFrom }),
          ...(where.priceTo && { lte: where.priceTo }),
        },
        deletedAt: null,
      },
    };
    delete clause.priceFrom;
    delete clause.priceTo;
  }

  // Handle category filter
  if (where.categoryIds && where.categoryIds.length > 0) {
    clause.categories = {
      some: {
        id: { in: where.categoryIds },
      },
    };
    delete clause.categoryIds;
  }

  // Handle brand filter
  if (where.brandIds && where.brandIds.length > 0) {
    clause.brandId = { in: where.brandIds };
    delete clause.brandIds;
  }

  // Handle stock filter
  if (where.inStock !== undefined) {
    clause.skus = {
      ...(clause.skus || {}),
      some: {
        ...(clause.skus?.some || {}),
        inventory: where.inStock ? { gt: 0 } : { lte: 0 },
        deletedAt: null,
      },
    };
    delete clause.inStock;
  }

  return clause;
}
```

### 7.5 Review System Integration

**Code thực tế từ source:**

```typescript
async findReviews(productId: number, query: FindManyReviewDto) {
  const { skip, take = 10, orderBy = { createdAt: 'desc' } } = query;

  const where = {
    productId,
    isApproved: true,
    deletedAt: null,
  };

  const [items, total] = await Promise.all([
    this.prisma.review.findMany({
      where,
      include: {
        user: {
          select: {
            id: true,
            name: true,
            avatar: true,
          },
        },
      },
      orderBy,
      skip,
      take,
    }),
    this.prisma.review.count({ where }),
  ]);

  // Calculate rating statistics
  const stats = await this.prisma.review.groupBy({
    by: ['rating'],
    where: { productId, isApproved: true, deletedAt: null },
    _count: { rating: true },
  });

  const ratingStats = {
    average: 0,
    total,
    distribution: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
  };

  let totalRating = 0;
  stats.forEach((stat) => {
    ratingStats.distribution[stat.rating] = stat._count.rating;
    totalRating += stat.rating * stat._count.rating;
  });

  ratingStats.average = total > 0 ? totalRating / total : 0;

  return {
    data: items,
    meta: this.createPaginationMeta(total, skip || 0, take),
    stats: ratingStats,
  };
}
```

---

## 8. Security và Authorization

### 8.1 Role-based Access Control

**Code thực tế từ source:**

```typescript
// Trong ManageProductController
@Post()
@Roles(UserRole.ADMIN, UserRole.CONTENT_MANAGER)  // Chỉ admin và content manager
async create(@Body() dto: CreateProductDto, @User() user: AuthUser) {
  return this.manageProductService.create(dto, user);
}

@Put(':id')
@Roles(UserRole.ADMIN, UserRole.CONTENT_MANAGER)
async update(
  @Param('id', ParseIntPipe) id: number,
  @Body() dto: UpdateProductDto,
  @User() user: AuthUser
) {
  // Additional ownership check trong service
  return this.manageProductService.update(id, dto, user);
}
```

### 8.2 Ownership Verification

**Code thực tế từ source:**

```typescript
private async checkProductAccess(productId: number, user: AuthUser) {
  const product = await this.productRepo.findUnique({
    where: { id: productId, deletedAt: null },
  });

  if (!product) {
    throw new NotFoundException('Product not found');
  }

  // Admins và Content Managers có full access
  if ([UserRole.ADMIN, UserRole.CONTENT_MANAGER].includes(user.role)) {
    return;
  }

  // Creators có thể edit products của họ
  if (product.createdById === user.id) {
    return;
  }

  throw new ForbiddenException('You do not have access to this product');
}
```

### 8.3 Data Validation

**Code thực tế từ source:** Validation pipes được sử dụng ở controller level:

```typescript
@Post()
async create(
  @Body() createProductDto: CreateProductDto,  // Auto validation qua DTOs
  @User() user: AuthUser,
) {
  return this.manageProductService.create(createProductDto, user);
}
```

---

## 9. Performance Optimizations

### 9.1 Database Indexing

**Code thực tế từ source schema:**

```prisma
model Product {
  // ... other fields
  @@index([deletedAt])
}

model SKU {
  // ... other fields
  @@index([deletedAt])
}

model Review {
  // ... other fields
  @@index([productId, isApproved])
  @@index([userId])
  @@index([rating])
}
```

### 9.2 Query Optimization

**Code thực tế từ source:** Efficient loading với selective includes:

```typescript
// Public service chỉ load published products
async findMany(query: FindManyProductDto) {
  return this.productRepo.findMany({
    ...query,
    where: {
      ...query.where,
      publishedAt: {
        not: null,
      },
      deletedAt: null,
    },
    include: {
      brand: true,
      categories: true,
      skus: {
        where: {
          deletedAt: null,
        },
      },
      productTranslations: true,
    },
  });
}
```

---

## 10. Module Structure và Dependencies

### 10.1 Product Module

**Code thực tế trích từ source:**

```typescript
// File: src/routes/product/product.module.ts
@Module({
  controllers: [ProductController, ManageProductController],
  providers: [ProductService, ManageProductService, ProductRepo],
  exports: [ProductService, ProductRepo],
})
export class ProductModule {}
```

### 10.2 Dependencies

- **PrismaService**: Database operations
- **JwtGuard**: Authentication
- **Roles Guard**: Authorization
- **BaseRepo**: Common repository functionality
- **ValidationPipe**: Input validation

---

## 11. Kết luận và Best Practices

### 11.1 Ưu điểm của kiến trúc hiện tại

1. **Separation of Concerns**: Public và private APIs tách biệt rõ ràng
2. **Role-based Security**: Authorization chi tiết theo roles
3. **Audit Trail**: Đầy đủ thông tin creator/updater/deleter
4. **Soft Delete**: Không mất dữ liệu, có thể recover
5. **Complex Querying**: Repository pattern hỗ trợ advanced filtering
6. **SKU Management**: Flexible variant system với auto-generated codes
7. **Internationalization**: Multi-language support
8. **Publication Workflow**: Draft → Published states
9. **Transaction Support**: Data consistency với Prisma transactions
10. **Review System**: Integrated rating và approval system

### 11.2 Architecture Patterns được áp dụng

1. **Repository Pattern**: Abstraction layer cho database operations
2. **Service Layer Pattern**: Business logic separation
3. **DTO Pattern**: Input validation và type safety
4. **Dual Controller Pattern**: Public/private API separation
5. **Soft Delete Pattern**: Data preservation
6. **Audit Trail Pattern**: Change tracking
7. **Transaction Pattern**: Data consistency

### 11.3 Business Logic Highlights

1. **SKU Auto-generation**: Intelligent SKU code creation
2. **Complex SKU Updates**: Create/Update/Delete operations trong single transaction
3. **Publication Validation**: Business rules enforcement trước khi publish
4. **Advanced Search**: Multi-field search với relationship filtering
5. **Rating Statistics**: Real-time calculation của review stats
6. **Access Control**: Multi-level authorization (role + ownership)

### 11.4 Areas for Future Enhancement

1. **Caching Layer**: Redis integration cho performance
2. **Search Engine**: Elasticsearch cho advanced search
3. **Image Management**: CDN integration và optimization
4. **Analytics**: View tracking, popularity metrics
5. **Inventory Management**: Low stock alerts, reorder points
6. **Price History**: Track price changes over time
7. **Bulk Operations**: Mass import/export functionality
8. **Related Products**: AI-powered recommendations

Hệ thống Product Management này thể hiện một implementation mạnh mẽ và toàn diện của NestJS framework, với architecture patterns rõ ràng, security tốt, và business logic phức tạp được handle một cách elegant.
