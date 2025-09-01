# 🔍 Pagination, Filter, Sort & Search API trong NestJS

## 🔍 Pagination, Filter, Sort & Search là gì?

Pagination, Filter, Sort & Search (PFSS) là tập hợp các kỹ thuật xử lý và tối ưu hóa data retrieval trong APIs:

- **Vai trò chính**: Cải thiện performance, user experience và bandwidth optimization
- **Cách hoạt động**: Client gửi query parameters → Server xử lý và filter data → Return optimized dataset
- **Execution order**: Request Parsing → Validation → Query Building → Database Execution → Response Formatting
- **Lifecycle**: Parameter extraction → Query construction → Database query → Data transformation → Response serialization

> 💡 **Tại sao cần PFSS?**
> Một API không có pagination có thể return 100,000 records (500MB response), trong khi với pagination chỉ cần 20 records (50KB response) - giảm 99.99% bandwidth usage.

## 🎯 Cách implement Pagination, Filter, Sort & Search

### Basic Implementation

#### 1. Basic DTOs và Types

```typescript
// src/shared/dtos/pagination.dto.ts
import { Type } from 'class-transformer'
import { IsOptional, IsPositive, Min, Max, IsEnum, IsString } from 'class-validator'

export class PaginationDto {
  @IsOptional()
  @Type(() => Number)
  @IsPositive()
  @Min(1)
  page?: number = 1

  @IsOptional()
  @Type(() => Number)
  @IsPositive()
  @Min(1)
  @Max(100) // Prevent abuse
  limit?: number = 10

  @IsOptional()
  @Type(() => Number)
  @Min(0)
  offset?: number
}

export enum SortOrder {
  ASC = 'asc',
  DESC = 'desc',
}

export class SortDto {
  @IsOptional()
  @IsString()
  sortBy?: string = 'createdAt'

  @IsOptional()
  @IsEnum(SortOrder)
  sortOrder?: SortOrder = SortOrder.DESC
}

export class SearchDto {
  @IsOptional()
  @IsString()
  search?: string

  @IsOptional()
  @IsString()
  searchFields?: string // Comma-separated fields: "name,email,description"
}

// Combined query DTO
export class QueryDto extends PaginationDto {
  @IsOptional()
  @IsString()
  sortBy?: string = 'createdAt'

  @IsOptional()
  @IsEnum(SortOrder)
  sortOrder?: SortOrder = SortOrder.DESC

  @IsOptional()
  @IsString()
  search?: string

  @IsOptional()
  @IsString()
  searchFields?: string
}
```

#### 2. Response Interface

```typescript
// src/shared/interfaces/paginated-response.interface.ts
export interface PaginatedResponse<T> {
  data: T[]
  meta: {
    total: number
    page: number
    limit: number
    totalPages: number
    hasNextPage: boolean
    hasPreviousPage: boolean
  }
  links?: {
    first: string
    previous?: string
    next?: string
    last: string
  }
}

export interface FilterMeta {
  appliedFilters: Record<string, any>
  availableFilters: Record<string, any>
}

export interface SearchMeta {
  query: string
  searchFields: string[]
  totalMatches: number
  searchTime: number // milliseconds
}
```

#### 3. Base Repository với PFSS Support

```typescript
// src/shared/repositories/base-query.repository.ts
import { Injectable } from '@nestjs/common'
import { PrismaService } from '../services/prisma.service'
import { QueryDto } from '../dtos/pagination.dto'
import { PaginatedResponse } from '../interfaces/paginated-response.interface'

@Injectable()
export abstract class BaseQueryRepository<T> {
  constructor(protected prisma: PrismaService) {}

  // Abstract method to be implemented by each repository
  protected abstract getEntityName(): string
  protected abstract getSearchableFields(): string[]
  protected abstract getFilterableFields(): string[]
  protected abstract getSortableFields(): string[]

  // Build pagination query
  protected buildPaginationQuery(query: QueryDto) {
    const page = query.page || 1
    const limit = Math.min(query.limit || 10, 100) // Cap at 100
    const offset = query.offset !== undefined ? query.offset : (page - 1) * limit

    return {
      skip: offset,
      take: limit,
      page,
      limit,
    }
  }

  // Build sort query
  protected buildSortQuery(query: QueryDto) {
    const sortBy = query.sortBy || 'createdAt'
    const sortOrder = query.sortOrder || 'desc'

    // Validate sortable fields
    const allowedFields = this.getSortableFields()
    if (!allowedFields.includes(sortBy)) {
      throw new Error(`Invalid sort field: ${sortBy}. Allowed: ${allowedFields.join(', ')}`)
    }

    return {
      orderBy: {
        [sortBy]: sortOrder,
      },
    }
  }

  // Build search query
  protected buildSearchQuery(query: QueryDto) {
    if (!query.search) return {}

    const searchFields = query.searchFields
      ? query.searchFields.split(',').map((f) => f.trim())
      : this.getSearchableFields()

    // Validate search fields
    const allowedFields = this.getSearchableFields()
    const invalidFields = searchFields.filter((field) => !allowedFields.includes(field))
    if (invalidFields.length > 0) {
      throw new Error(`Invalid search fields: ${invalidFields.join(', ')}`)
    }

    // Build OR condition for multiple fields
    const searchConditions = searchFields.map((field) => ({
      [field]: {
        contains: query.search,
        mode: 'insensitive' as const,
      },
    }))

    return {
      OR: searchConditions,
    }
  }

  // Build filter query (to be overridden by specific repositories)
  protected buildFilterQuery(filters: Record<string, any>) {
    const allowedFields = this.getFilterableFields()
    const where: Record<string, any> = {}

    Object.entries(filters).forEach(([key, value]) => {
      if (allowedFields.includes(key) && value !== undefined && value !== '') {
        where[key] = value
      }
    })

    return where
  }

  // Main query method
  async findManyWithQuery(query: QueryDto, customFilters: Record<string, any> = {}): Promise<PaginatedResponse<T>> {
    const startTime = Date.now()

    // Build query parts
    const paginationQuery = this.buildPaginationQuery(query)
    const sortQuery = this.buildSortQuery(query)
    const searchQuery = this.buildSearchQuery(query)
    const filterQuery = this.buildFilterQuery(customFilters)

    // Combine where conditions
    const where = {
      ...filterQuery,
      ...searchQuery,
    }

    // Get entity delegate (to be implemented by child classes)
    const entityDelegate = this.getEntityDelegate()

    // Execute queries in parallel
    const [data, total] = await Promise.all([
      entityDelegate.findMany({
        where,
        ...sortQuery,
        skip: paginationQuery.skip,
        take: paginationQuery.take,
      }),
      entityDelegate.count({ where }),
    ])

    const searchTime = Date.now() - startTime
    const totalPages = Math.ceil(total / paginationQuery.limit)

    return {
      data: data as T[],
      meta: {
        total,
        page: paginationQuery.page,
        limit: paginationQuery.limit,
        totalPages,
        hasNextPage: paginationQuery.page < totalPages,
        hasPreviousPage: paginationQuery.page > 1,
      },
    }
  }

  // Abstract method to get Prisma delegate
  protected abstract getEntityDelegate(): any
}
```

### Advanced Implementation

#### 1. Enhanced Product Repository

```typescript
// src/products/products.repository.ts
import { Injectable } from '@nestjs/common'
import { BaseQueryRepository } from '../shared/repositories/base-query.repository'
import { Product, Prisma } from '@prisma/client'

@Injectable()
export class ProductsRepository extends BaseQueryRepository<Product> {
  protected getEntityName(): string {
    return 'product'
  }

  protected getSearchableFields(): string[] {
    return ['name', 'description', 'sku', 'brand']
  }

  protected getFilterableFields(): string[] {
    return ['categoryId', 'brand', 'status', 'priceMin', 'priceMax', 'inStock']
  }

  protected getSortableFields(): string[] {
    return ['name', 'price', 'createdAt', 'updatedAt', 'popularity', 'rating']
  }

  protected getEntityDelegate() {
    return this.prisma.product
  }

  // Enhanced filter building with complex conditions
  protected buildFilterQuery(filters: Record<string, any>) {
    const where: Prisma.ProductWhereInput = {}

    // Basic string filters
    if (filters.categoryId) {
      where.categoryId = filters.categoryId
    }

    if (filters.brand) {
      where.brand = {
        in: Array.isArray(filters.brand) ? filters.brand : [filters.brand],
      }
    }

    if (filters.status) {
      where.status = filters.status
    }

    // Range filters
    if (filters.priceMin || filters.priceMax) {
      where.price = {}
      if (filters.priceMin) where.price.gte = parseFloat(filters.priceMin)
      if (filters.priceMax) where.price.lte = parseFloat(filters.priceMax)
    }

    // Boolean filters
    if (filters.inStock !== undefined) {
      where.stock = filters.inStock === 'true' ? { gt: 0 } : { lte: 0 }
    }

    // Date range filters
    if (filters.createdAfter || filters.createdBefore) {
      where.createdAt = {}
      if (filters.createdAfter) where.createdAt.gte = new Date(filters.createdAfter)
      if (filters.createdBefore) where.createdAt.lte = new Date(filters.createdBefore)
    }

    // Rating filter
    if (filters.minRating) {
      where.rating = { gte: parseFloat(filters.minRating) }
    }

    return where
  }

  // Advanced search with full-text search simulation
  async searchProductsAdvanced(
    query: string,
    options: {
      fuzzy?: boolean
      exact?: boolean
      category?: string
      limit?: number
    } = {},
  ) {
    const searchTerms = query
      .toLowerCase()
      .split(' ')
      .filter((term) => term.length > 2)

    const searchConditions: Prisma.ProductWhereInput[] = []

    // Exact match (highest priority)
    if (options.exact !== false) {
      searchConditions.push({
        OR: [
          { name: { contains: query, mode: 'insensitive' } },
          { description: { contains: query, mode: 'insensitive' } },
          { sku: { equals: query, mode: 'insensitive' } },
        ],
      })
    }

    // Fuzzy match for individual terms
    if (options.fuzzy !== false) {
      searchTerms.forEach((term) => {
        searchConditions.push({
          OR: [
            { name: { contains: term, mode: 'insensitive' } },
            { description: { contains: term, mode: 'insensitive' } },
            { brand: { contains: term, mode: 'insensitive' } },
          ],
        })
      })
    }

    const where: Prisma.ProductWhereInput = {
      AND: searchConditions,
    }

    if (options.category) {
      where.categoryId = options.category
    }

    return this.prisma.product.findMany({
      where,
      take: options.limit || 50,
      orderBy: [{ popularity: 'desc' }, { rating: 'desc' }, { createdAt: 'desc' }],
      include: {
        category: true,
        reviews: {
          take: 3,
          orderBy: { rating: 'desc' },
        },
      },
    })
  }

  // Faceted search for filters
  async getFacets(baseFilters: Record<string, any> = {}) {
    const baseWhere = this.buildFilterQuery(baseFilters)

    const [brands, categories, priceRange, ratings] = await Promise.all([
      // Get available brands
      this.prisma.product.groupBy({
        by: ['brand'],
        where: baseWhere,
        _count: { brand: true },
        orderBy: { _count: { brand: 'desc' } },
      }),

      // Get available categories
      this.prisma.product.groupBy({
        by: ['categoryId'],
        where: baseWhere,
        _count: { categoryId: true },
        include: {
          category: { select: { name: true } },
        },
      }),

      // Get price range
      this.prisma.product.aggregate({
        where: baseWhere,
        _min: { price: true },
        _max: { price: true },
        _avg: { price: true },
      }),

      // Get rating distribution
      this.prisma.product.groupBy({
        by: ['rating'],
        where: baseWhere,
        _count: { rating: true },
      }),
    ])

    return {
      brands: brands.map((b) => ({ value: b.brand, count: b._count.brand })),
      categories: categories.map((c) => ({
        value: c.categoryId,
        count: c._count.categoryId,
      })),
      priceRange: {
        min: priceRange._min.price,
        max: priceRange._max.price,
        avg: priceRange._avg.price,
      },
      ratings: ratings.map((r) => ({ value: r.rating, count: r._count.rating })),
    }
  }
}
```

#### 2. Enhanced Controller với Advanced Features

```typescript
// src/products/products.controller.ts
import { Controller, Get, Query, ParseArrayPipe, DefaultValuePipe } from '@nestjs/common'
import { ApiOperation, ApiQuery, ApiResponse } from '@nestjs/swagger'
import { ProductsService } from './products.service'
import { QueryDto } from '../shared/dtos/pagination.dto'

// Advanced Product Query DTO
export class ProductQueryDto extends QueryDto {
  @IsOptional()
  @IsString()
  categoryId?: string

  @IsOptional()
  brand?: string | string[]

  @IsOptional()
  @Transform(({ value }) => parseFloat(value))
  @IsNumber()
  priceMin?: number

  @IsOptional()
  @Transform(({ value }) => parseFloat(value))
  @IsNumber()
  priceMax?: number

  @IsOptional()
  @Transform(({ value }) => value === 'true')
  @IsBoolean()
  inStock?: boolean

  @IsOptional()
  @Transform(({ value }) => parseFloat(value))
  @IsNumber()
  @Min(1)
  @Max(5)
  minRating?: number

  @IsOptional()
  @IsDateString()
  createdAfter?: string

  @IsOptional()
  @IsDateString()
  createdBefore?: string
}

@Controller('products')
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Get()
  @ApiOperation({ summary: 'Get products with advanced filtering, sorting, and pagination' })
  @ApiQuery({ name: 'page', required: false, example: 1 })
  @ApiQuery({ name: 'limit', required: false, example: 10 })
  @ApiQuery({ name: 'sortBy', required: false, example: 'createdAt' })
  @ApiQuery({ name: 'sortOrder', required: false, enum: ['asc', 'desc'] })
  @ApiQuery({ name: 'search', required: false, example: 'iPhone' })
  @ApiQuery({ name: 'categoryId', required: false })
  @ApiQuery({ name: 'brand', required: false, isArray: true })
  @ApiQuery({ name: 'priceMin', required: false, type: Number })
  @ApiQuery({ name: 'priceMax', required: false, type: Number })
  @ApiQuery({ name: 'inStock', required: false, type: Boolean })
  @ApiResponse({ status: 200, description: 'Products retrieved successfully' })
  async findAll(@Query() query: ProductQueryDto) {
    return this.productsService.findAllWithQuery(query)
  }

  @Get('search')
  @ApiOperation({ summary: 'Advanced product search with AI-like features' })
  async searchAdvanced(
    @Query('q') query: string,
    @Query('category') category?: string,
    @Query('fuzzy', new DefaultValuePipe(true)) fuzzy?: boolean,
    @Query('exact', new DefaultValuePipe(true)) exact?: boolean,
    @Query('limit', new DefaultValuePipe(20)) limit?: number,
  ) {
    return this.productsService.searchAdvanced(query, {
      category,
      fuzzy,
      exact,
      limit,
    })
  }

  @Get('facets')
  @ApiOperation({ summary: 'Get available filters for current search/filter context' })
  async getFacets(@Query() filters: Record<string, any>) {
    return this.productsService.getFacets(filters)
  }

  @Get('autocomplete')
  @ApiOperation({ summary: 'Get search suggestions' })
  async getAutocomplete(@Query('q') query: string, @Query('limit', new DefaultValuePipe(10)) limit?: number) {
    return this.productsService.getAutocompletesuggestions(query, limit)
  }
}
```

## 💡 Các cách sử dụng thông dụng

### 1. Basic Pagination

```typescript
// Client request
GET /products?page=2&limit=20

// Service implementation
@Injectable()
export class ProductsService {
  constructor(private productsRepository: ProductsRepository) {}

  async findAllWithQuery(query: ProductQueryDto) {
    return this.productsRepository.findManyWithQuery(query, {
      categoryId: query.categoryId,
      brand: query.brand,
      priceMin: query.priceMin,
      priceMax: query.priceMax,
      inStock: query.inStock,
      minRating: query.minRating,
      createdAfter: query.createdAfter,
      createdBefore: query.createdBefore,
    })
  }
}
```

**Input/Output Example:**

```bash
# Request
GET /products?page=2&limit=5&sortBy=price&sortOrder=asc

# Response
{
  "data": [
    { "id": "6", "name": "Product 6", "price": 29.99 },
    { "id": "7", "name": "Product 7", "price": 34.99 },
    { "id": "8", "name": "Product 8", "price": 39.99 },
    { "id": "9", "name": "Product 9", "price": 44.99 },
    { "id": "10", "name": "Product 10", "price": 49.99 }
  ],
  "meta": {
    "total": 100,
    "page": 2,
    "limit": 5,
    "totalPages": 20,
    "hasNextPage": true,
    "hasPreviousPage": true
  }
}
```

### 2. Advanced Filtering

```typescript
// Complex filtering example
@Get('advanced-filter')
async getProductsWithAdvancedFilter(@Query() query: any) {
  const filters = {
    // Multiple brands
    brand: query.brands ? query.brands.split(',') : undefined,

    // Price range
    priceMin: query.priceMin ? parseFloat(query.priceMin) : undefined,
    priceMax: query.priceMax ? parseFloat(query.priceMax) : undefined,

    // Stock status
    inStock: query.inStock === 'true',

    // Rating threshold
    minRating: query.minRating ? parseFloat(query.minRating) : undefined,

    // Date range
    createdAfter: query.createdAfter ? new Date(query.createdAfter) : undefined,
    createdBefore: query.createdBefore ? new Date(query.createdBefore) : undefined,
  }

  return this.productsService.findAllWithQuery({
    ...query,
    ...filters,
  })
}
```

**Input/Output Example:**

```bash
# Request
GET /products/advanced-filter?brands=Apple,Samsung&priceMin=100&priceMax=1000&inStock=true&minRating=4

# Response với filtered data
{
  "data": [
    {
      "id": "1",
      "name": "iPhone 15",
      "brand": "Apple",
      "price": 999,
      "rating": 4.8,
      "stock": 50
    },
    {
      "id": "2",
      "name": "Galaxy S24",
      "brand": "Samsung",
      "price": 899,
      "rating": 4.6,
      "stock": 30
    }
  ],
  "meta": {
    "total": 12,
    "appliedFilters": {
      "brands": ["Apple", "Samsung"],
      "priceRange": { "min": 100, "max": 1000 },
      "inStock": true,
      "minRating": 4
    }
  }
}
```

### 3. Full-Text Search Implementation

```typescript
// src/shared/services/search.service.ts
import { Injectable } from '@nestjs/common'
import { PrismaService } from './prisma.service'

@Injectable()
export class SearchService {
  constructor(private prisma: PrismaService) {}

  async searchProducts(
    query: string,
    options: {
      fields?: string[]
      category?: string
      limit?: number
      fuzzy?: boolean
    } = {},
  ) {
    const startTime = Date.now()

    // Prepare search terms
    const searchTerms = this.prepareSearchTerms(query)
    const searchFields = options.fields || ['name', 'description', 'brand']

    // Build search conditions
    const searchConditions = this.buildSearchConditions(searchTerms, searchFields, options.fuzzy)

    // Execute search
    const results = await this.prisma.product.findMany({
      where: {
        AND: [...searchConditions, ...(options.category ? [{ categoryId: options.category }] : [])],
      },
      take: options.limit || 20,
      orderBy: [
        // Relevance scoring (simplified)
        { popularity: 'desc' },
        { rating: 'desc' },
        { createdAt: 'desc' },
      ],
      include: {
        category: true,
      },
    })

    const searchTime = Date.now() - startTime

    return {
      results,
      meta: {
        query,
        searchTerms,
        totalResults: results.length,
        searchTime,
        searchFields,
      },
    }
  }

  private prepareSearchTerms(query: string): string[] {
    return query
      .toLowerCase()
      .split(/\s+/)
      .filter((term) => term.length > 2)
      .slice(0, 10) // Limit to 10 terms for performance
  }

  private buildSearchConditions(terms: string[], fields: string[], fuzzy: boolean = true): any[] {
    const conditions = []

    // Exact phrase match (highest priority)
    const exactMatch = {
      OR: fields.map((field) => ({
        [field]: { contains: terms.join(' '), mode: 'insensitive' as const },
      })),
    }
    conditions.push(exactMatch)

    // Individual term matches
    if (fuzzy) {
      terms.forEach((term) => {
        conditions.push({
          OR: fields.map((field) => ({
            [field]: { contains: term, mode: 'insensitive' as const },
          })),
        })
      })
    }

    return conditions
  }

  // Autocomplete suggestions
  async getAutocompletesuggestions(query: string, limit: number = 10) {
    const suggestions = await this.prisma.product.findMany({
      where: {
        OR: [
          { name: { startsWith: query, mode: 'insensitive' } },
          { brand: { startsWith: query, mode: 'insensitive' } },
        ],
      },
      select: {
        name: true,
        brand: true,
      },
      take: limit,
    })

    // Extract unique suggestions
    const uniqueSuggestions = new Set<string>()

    suggestions.forEach((product) => {
      if (product.name.toLowerCase().startsWith(query.toLowerCase())) {
        uniqueSuggestions.add(product.name)
      }
      if (product.brand.toLowerCase().startsWith(query.toLowerCase())) {
        uniqueSuggestions.add(product.brand)
      }
    })

    return Array.from(uniqueSuggestions).slice(0, limit)
  }
}
```

### 4. Real-time Filtering Frontend Integration

```typescript
// Frontend React example (for context)
const useProductFilters = () => {
  const [filters, setFilters] = useState({
    page: 1,
    limit: 20,
    search: '',
    sortBy: 'createdAt',
    sortOrder: 'desc',
    categoryId: '',
    brands: [],
    priceMin: '',
    priceMax: '',
    inStock: null,
    minRating: '',
  })

  const [products, setProducts] = useState([])
  const [meta, setMeta] = useState({})
  const [loading, setLoading] = useState(false)

  const fetchProducts = useCallback(async () => {
    setLoading(true)
    try {
      const queryParams = new URLSearchParams()

      Object.entries(filters).forEach(([key, value]) => {
        if (value !== '' && value !== null && value !== undefined) {
          if (Array.isArray(value)) {
            value.forEach((v) => queryParams.append(key, v))
          } else {
            queryParams.append(key, value.toString())
          }
        }
      })

      const response = await fetch(`/api/products?${queryParams}`)
      const data = await response.json()

      setProducts(data.data)
      setMeta(data.meta)
    } catch (error) {
      console.error('Failed to fetch products:', error)
    } finally {
      setLoading(false)
    }
  }, [filters])

  // Debounced search
  const debouncedSearch = useDebounce(filters.search, 300)

  useEffect(() => {
    fetchProducts()
  }, [debouncedSearch, filters.page, filters.sortBy, filters.sortOrder])

  const updateFilter = (key: string, value: any) => {
    setFilters((prev) => ({
      ...prev,
      [key]: value,
      page: key !== 'page' ? 1 : value, // Reset page when filters change
    }))
  }

  return {
    filters,
    products,
    meta,
    loading,
    updateFilter,
    fetchProducts,
  }
}
```

## ⚠️ Các vấn đề thường gặp

### 1. N+1 Query Problem với Relations

**Problem:** Lấy products với categories gây ra nhiều queries không cần thiết

```typescript
// ❌ Problematic: N+1 queries
async getProductsWithCategories() {
  const products = await this.prisma.product.findMany({
    take: 10,
  })

  // This creates N additional queries!
  for (const product of products) {
    product.category = await this.prisma.category.findUnique({
      where: { id: product.categoryId },
    })
  }

  return products
}

// ✅ Solution: Use include hoặc select
async getProductsWithCategories() {
  return this.prisma.product.findMany({
    take: 10,
    include: {
      category: true,
      reviews: {
        take: 3,
        orderBy: { rating: 'desc' },
      },
    },
  })
}
```

### 2. Memory Issues với Large Result Sets

**Problem:** Fetching quá nhiều records cùng lúc

```typescript
// ❌ Problematic: No pagination limits
@Get('all')
async getAllProducts() {
  // This could return millions of records!
  return this.prisma.product.findMany()
}

// ✅ Solution: Always implement pagination limits
@Get('all')
async getAllProducts(@Query() query: QueryDto) {
  const limit = Math.min(query.limit || 20, 100) // Cap at 100

  return this.prisma.product.findMany({
    take: limit,
    skip: (query.page - 1) * limit,
  })
}
```

### 3. SQL Injection trong Dynamic Queries

**Problem:** User input được sử dụng trực tiếp trong queries

```typescript
// ❌ Problematic: Direct string interpolation
async searchProducts(searchTerm: string) {
  // NEVER do this - vulnerable to SQL injection!
  return this.prisma.$queryRaw`
    SELECT * FROM products
    WHERE name LIKE '%${searchTerm}%'
  `
}

// ✅ Solution: Use parameterized queries
async searchProducts(searchTerm: string) {
  return this.prisma.product.findMany({
    where: {
      name: {
        contains: searchTerm,
        mode: 'insensitive',
      },
    },
  })
}
```

### 4. Performance Issues với Complex Filters

**Problem:** Slow queries với multiple conditions

```typescript
// ❌ Problematic: Unoptimized complex query
async getProductsWithComplexFilter(filters: any) {
  return this.prisma.product.findMany({
    where: {
      AND: [
        { price: { gte: filters.priceMin, lte: filters.priceMax } },
        { category: { name: { contains: filters.categoryName } } },
        { reviews: { some: { rating: { gte: filters.minRating } } } },
        { tags: { some: { name: { in: filters.tags } } } },
      ],
    },
    include: {
      category: true,
      reviews: true,
      tags: true,
    },
  })
}

// ✅ Solution: Optimize with indexes và strategic querying
async getProductsWithComplexFilter(filters: any) {
  // Pre-filter with indexed fields first
  const baseQuery: Prisma.ProductWhereInput = {}

  if (filters.priceMin || filters.priceMax) {
    baseQuery.price = {}
    if (filters.priceMin) baseQuery.price.gte = filters.priceMin
    if (filters.priceMax) baseQuery.price.lte = filters.priceMax
  }

  if (filters.categoryId) {
    baseQuery.categoryId = filters.categoryId // Use ID instead of name
  }

  return this.prisma.product.findMany({
    where: baseQuery,
    include: {
      category: { select: { id: true, name: true } }, // Limit selected fields
      _count: { select: { reviews: true } }, // Use count instead of full relations
    },
    take: 50, // Always limit
  })
}
```

## 🔧 Advanced Patterns

### 1. Cursor-based Pagination

```typescript
// src/shared/dtos/cursor-pagination.dto.ts
export class CursorPaginationDto {
  @IsOptional()
  @IsString()
  cursor?: string // Base64 encoded cursor

  @IsOptional()
  @Type(() => Number)
  @IsPositive()
  @Max(100)
  limit?: number = 20

  @IsOptional()
  @IsEnum(['forward', 'backward'])
  direction?: 'forward' | 'backward' = 'forward'
}

// Implementation
@Injectable()
export class CursorPaginationService {
  constructor(private prisma: PrismaService) {}

  async getProductsWithCursor(dto: CursorPaginationDto) {
    const decodedCursor = dto.cursor ? this.decodeCursor(dto.cursor) : null
    const limit = dto.limit || 20

    const products = await this.prisma.product.findMany({
      take: limit + 1, // Take one extra to check if there's a next page
      ...(decodedCursor && {
        cursor: { id: decodedCursor.id },
        skip: 1, // Skip the cursor record itself
      }),
      orderBy: { createdAt: dto.direction === 'backward' ? 'asc' : 'desc' },
    })

    const hasMore = products.length > limit
    const data = hasMore ? products.slice(0, -1) : products

    return {
      data,
      pageInfo: {
        hasNextPage: hasMore && dto.direction === 'forward',
        hasPreviousPage: hasMore && dto.direction === 'backward',
        startCursor: data.length > 0 ? this.encodeCursor(data[0]) : null,
        endCursor: data.length > 0 ? this.encodeCursor(data[data.length - 1]) : null,
      },
    }
  }

  private encodeCursor(record: any): string {
    const cursor = {
      id: record.id,
      createdAt: record.createdAt.toISOString(),
    }
    return Buffer.from(JSON.stringify(cursor)).toString('base64')
  }

  private decodeCursor(cursor: string): any {
    return JSON.parse(Buffer.from(cursor, 'base64').toString())
  }
}
```

### 2. Elasticsearch Integration cho Advanced Search

```typescript
// src/shared/services/elasticsearch.service.ts
import { Injectable } from '@nestjs/common'
import { Client } from '@elastic/elasticsearch'

@Injectable()
export class ElasticsearchService {
  private client: Client

  constructor() {
    this.client = new Client({
      node: process.env.ELASTICSEARCH_URL || 'http://localhost:9200',
    })
  }

  async searchProducts(query: string, filters: any = {}, options: any = {}) {
    const searchQuery = {
      index: 'products',
      body: {
        query: {
          bool: {
            must: [
              {
                multi_match: {
                  query,
                  fields: ['name^3', 'description^2', 'brand^2', 'tags'],
                  type: 'best_fields',
                  fuzziness: 'AUTO',
                  operator: 'or',
                },
              },
            ],
            filter: this.buildElasticFilters(filters),
          },
        },
        sort: this.buildElasticSort(options.sortBy, options.sortOrder),
        size: options.limit || 20,
        from: ((options.page || 1) - 1) * (options.limit || 20),
        highlight: {
          fields: {
            name: {},
            description: {},
          },
        },
        aggs: {
          categories: {
            terms: { field: 'categoryId.keyword', size: 10 },
          },
          brands: {
            terms: { field: 'brand.keyword', size: 10 },
          },
          price_ranges: {
            range: {
              field: 'price',
              ranges: [{ to: 50 }, { from: 50, to: 100 }, { from: 100, to: 500 }, { from: 500 }],
            },
          },
        },
      },
    }

    const response = await this.client.search(searchQuery)

    return {
      hits: response.body.hits.hits.map((hit) => ({
        ...hit._source,
        _score: hit._score,
        highlight: hit.highlight,
      })),
      total: response.body.hits.total.value,
      aggregations: response.body.aggregations,
      took: response.body.took,
    }
  }

  private buildElasticFilters(filters: any) {
    const filterQueries = []

    if (filters.categoryId) {
      filterQueries.push({ term: { 'categoryId.keyword': filters.categoryId } })
    }

    if (filters.brand) {
      const brands = Array.isArray(filters.brand) ? filters.brand : [filters.brand]
      filterQueries.push({ terms: { 'brand.keyword': brands } })
    }

    if (filters.priceMin || filters.priceMax) {
      const priceRange: any = {}
      if (filters.priceMin) priceRange.gte = filters.priceMin
      if (filters.priceMax) priceRange.lte = filters.priceMax
      filterQueries.push({ range: { price: priceRange } })
    }

    if (filters.inStock) {
      filterQueries.push({ range: { stock: { gt: 0 } } })
    }

    return filterQueries
  }

  private buildElasticSort(sortBy: string = 'relevance', sortOrder: string = 'desc') {
    if (sortBy === 'relevance') {
      return [{ _score: { order: 'desc' } }]
    }

    const sortField = this.mapSortField(sortBy)
    return [{ [sortField]: { order: sortOrder } }]
  }

  private mapSortField(field: string): string {
    const fieldMap = {
      name: 'name.keyword',
      price: 'price',
      rating: 'rating',
      createdAt: 'createdAt',
      popularity: 'popularity',
    }
    return fieldMap[field] || 'createdAt'
  }

  // Sync product to Elasticsearch
  async indexProduct(product: any) {
    await this.client.index({
      index: 'products',
      id: product.id,
      body: {
        ...product,
        indexedAt: new Date().toISOString(),
      },
    })
  }

  // Bulk sync products
  async bulkIndexProducts(products: any[]) {
    const body = products.flatMap((product) => [
      { index: { _index: 'products', _id: product.id } },
      { ...product, indexedAt: new Date().toISOString() },
    ])

    return this.client.bulk({ body })
  }
}
```

### 3. GraphQL Integration với DataLoader

```typescript
// src/shared/dataloaders/products.dataloader.ts
import { Injectable } from '@nestjs/common'
import DataLoader from 'dataloader'
import { PrismaService } from '../services/prisma.service'

@Injectable()
export class ProductDataLoader {
  constructor(private prisma: PrismaService) {}

  // Batch load products by IDs
  createProductLoader() {
    return new DataLoader<string, any>(async (ids: readonly string[]) => {
      const products = await this.prisma.product.findMany({
        where: { id: { in: [...ids] } },
        include: {
          category: true,
          reviews: {
            take: 5,
            orderBy: { rating: 'desc' },
          },
        },
      })

      // Maintain order of requested IDs
      const productMap = new Map(products.map((p) => [p.id, p]))
      return ids.map((id) => productMap.get(id) || null)
    })
  }

  // Batch load products by category
  createProductsByCategoryLoader() {
    return new DataLoader<string, any[]>(async (categoryIds: readonly string[]) => {
      const products = await this.prisma.product.findMany({
        where: { categoryId: { in: [...categoryIds] } },
        orderBy: { popularity: 'desc' },
        take: 20,
      })

      // Group by category ID
      const productsByCategory = new Map<string, any[]>()
      categoryIds.forEach((id) => productsByCategory.set(id, []))

      products.forEach((product) => {
        const categoryProducts = productsByCategory.get(product.categoryId) || []
        categoryProducts.push(product)
        productsByCategory.set(product.categoryId, categoryProducts)
      })

      return categoryIds.map((id) => productsByCategory.get(id) || [])
    })
  }
}

// GraphQL Resolver với DataLoader
@Resolver(() => Product)
export class ProductResolver {
  constructor(
    private productService: ProductsService,
    private productDataLoader: ProductDataLoader,
  ) {}

  @Query(() => [Product])
  async products(@Args('input') input: ProductQueryInput, @Context('dataloaders') dataloaders: any) {
    return this.productService.findAllWithQuery(input)
  }

  @ResolveField(() => Category)
  async category(@Parent() product: Product, @Context('dataloaders') dataloaders: any) {
    return dataloaders.category.load(product.categoryId)
  }

  @ResolveField(() => [Review])
  async reviews(@Parent() product: Product, @Context('dataloaders') dataloaders: any) {
    return dataloaders.reviewsByProduct.load(product.id)
  }
}
```

## 📝 Best Practices

### DO's ✅

1. **Always implement pagination limits**

```typescript
// Good - Reasonable limits
@Get()
async getProducts(@Query() query: QueryDto) {
  const limit = Math.min(query.limit || 20, 100) // Cap at 100
  return this.productsService.findMany({
    ...query,
    limit,
  })
}
```

2. **Use database indexes appropriately**

```sql
-- Good - Strategic indexes
CREATE INDEX idx_products_category_price ON products(category_id, price);
CREATE INDEX idx_products_search ON products USING gin(to_tsvector('english', name || ' ' || description));
CREATE INDEX idx_products_created_at ON products(created_at DESC);
```

3. **Validate and sanitize all inputs**

```typescript
// Good - Proper validation
export class ProductQueryDto {
  @IsOptional()
  @IsString()
  @Length(1, 100)
  search?: string

  @IsOptional()
  @IsIn(['name', 'price', 'createdAt', 'rating'])
  sortBy?: string

  @IsOptional()
  @IsEnum(SortOrder)
  sortOrder?: SortOrder
}
```

4. **Implement proper error handling**

```typescript
// Good - Graceful error handling
async findProductsWithQuery(query: QueryDto) {
  try {
    return await this.repository.findManyWithQuery(query)
  } catch (error) {
    if (error.code === 'P2001') {
      throw new NotFoundException('Products not found')
    }

    this.logger.error('Database query failed', error)
    throw new InternalServerErrorException('Failed to fetch products')
  }
}
```

5. **Cache expensive queries**

```typescript
// Good - Strategic caching
@Cacheable('products-search', 300) // 5 minutes
async searchProducts(query: string, filters: any) {
  return this.performExpensiveSearch(query, filters)
}
```

### DON'T's ❌

1. **Đừng expose internal database structure**

```typescript
// Bad - Exposing database fields directly
@Get()
async getProducts(@Query('raw') rawQuery: any) {
  return this.prisma.product.findMany({
    where: rawQuery, // Direct exposure!
  })
}

// Good - Use DTOs để control input
@Get()
async getProducts(@Query() query: ProductQueryDto) {
  return this.productsService.findAllWithQuery(query)
}
```

2. **Đừng allow unlimited result sets**

```typescript
// Bad - No limits
@Get('export')
async exportAllProducts() {
  return this.prisma.product.findMany() // Could be millions!
}

// Good - Implement streaming hoặc chunked processing
@Get('export')
async exportProducts(@Query('cursor') cursor?: string) {
  const limit = 1000
  return this.prisma.product.findMany({
    take: limit,
    ...(cursor && { cursor: { id: cursor }, skip: 1 }),
  })
}
```

3. **Đừng ignore database performance**

```typescript
// Bad - Inefficient query
async getProductsWithReviews() {
  const products = await this.prisma.product.findMany()

  // N+1 query problem!
  for (const product of products) {
    product.reviews = await this.prisma.review.findMany({
      where: { productId: product.id },
    })
  }

  return products
}

// Good - Use includes/joins
async getProductsWithReviews() {
  return this.prisma.product.findMany({
    include: {
      reviews: {
        take: 5,
        orderBy: { rating: 'desc' },
      },
    },
  })
}
```

## 🚨 Common Pitfalls

### 1. Race Conditions trong Concurrent Requests

```typescript
// ❌ Pitfall: Race condition trong counter updates
async incrementProductViews(productId: string) {
  const product = await this.prisma.product.findUnique({
    where: { id: productId },
  })

  // Race condition: Multiple concurrent requests could read same value
  await this.prisma.product.update({
    where: { id: productId },
    data: { views: product.views + 1 },
  })
}

// ✅ Solution: Atomic operations
async incrementProductViews(productId: string) {
  await this.prisma.product.update({
    where: { id: productId },
    data: { views: { increment: 1 } }, // Atomic increment
  })
}
```

### 2. Memory Leaks từ Large Responses

```typescript
// ❌ Pitfall: Loading too much data into memory
async getProductsWithAllData() {
  return this.prisma.product.findMany({
    include: {
      reviews: true, // Could be thousands per product
      images: true,  // Large binary data
      variants: {
        include: {
          inventory: true,
        },
      },
    },
  })
}

// ✅ Solution: Selective loading và pagination
async getProductsOptimized(query: QueryDto) {
  return this.prisma.product.findMany({
    take: query.limit || 20,
    skip: ((query.page || 1) - 1) * (query.limit || 20),
    select: {
      id: true,
      name: true,
      price: true,
      thumbnail: true, // Only small image
      _count: {
        select: {
          reviews: true,
          variants: true,
        },
      },
    },
  })
}
```

### 3. SQL Injection qua Dynamic Sorting

```typescript
// ❌ Pitfall: Direct user input trong sorting
async getProducts(sortBy: string, sortOrder: string) {
  // Vulnerable to injection!
  return this.prisma.$queryRaw`
    SELECT * FROM products
    ORDER BY ${sortBy} ${sortOrder}
  `
}

// ✅ Solution: Whitelist allowed fields
const ALLOWED_SORT_FIELDS = ['name', 'price', 'createdAt', 'rating']
const ALLOWED_SORT_ORDERS = ['asc', 'desc']

async getProducts(sortBy: string, sortOrder: string) {
  if (!ALLOWED_SORT_FIELDS.includes(sortBy)) {
    throw new BadRequestException('Invalid sort field')
  }

  if (!ALLOWED_SORT_ORDERS.includes(sortOrder)) {
    throw new BadRequestException('Invalid sort order')
  }

  return this.prisma.product.findMany({
    orderBy: {
      [sortBy]: sortOrder as 'asc' | 'desc',
    },
  })
}
```

## 🔗 Integration với Other Components

### 1. Integration với Authentication & Authorization

```typescript
// src/shared/decorators/query-permissions.decorator.ts
import { SetMetadata } from '@nestjs/common'

export interface QueryPermissions {
  canSort?: string[]
  canFilter?: string[]
  canSearch?: string[]
  maxLimit?: number
}

export const QueryPermissions = (permissions: QueryPermissions) => SetMetadata('queryPermissions', permissions)

// Usage trong controller
@Controller('products')
export class ProductsController {
  @Get()
  @QueryPermissions({
    canSort: ['name', 'price', 'createdAt'],
    canFilter: ['categoryId', 'brand'],
    canSearch: ['name', 'description'],
    maxLimit: 50,
  })
  async findAll(@Query() query: ProductQueryDto, @CurrentUser() user: User) {
    // Guard sẽ validate permissions trước khi reach controller
    return this.productsService.findAllWithQuery(query, user)
  }

  @Get('admin')
  @Roles('admin')
  @QueryPermissions({
    canSort: ['*'], // Admin có thể sort theo bất kỳ field nào
    canFilter: ['*'],
    canSearch: ['*'],
    maxLimit: 1000,
  })
  async findAllAdmin(@Query() query: ProductQueryDto) {
    return this.productsService.findAllWithQuery(query)
  }
}

// Guard để enforce permissions
@Injectable()
export class QueryPermissionsGuard implements CanActivate {
  constructor(private reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const permissions = this.reflector.get<QueryPermissions>('queryPermissions', context.getHandler())

    if (!permissions) return true

    const request = context.switchToHttp().getRequest()
    const query = request.query

    // Validate sort permissions
    if (query.sortBy && !this.canSort(query.sortBy, permissions.canSort)) {
      throw new ForbiddenException(`Cannot sort by field: ${query.sortBy}`)
    }

    // Validate filter permissions
    Object.keys(query).forEach((key) => {
      if (this.isFilterField(key) && !this.canFilter(key, permissions.canFilter)) {
        throw new ForbiddenException(`Cannot filter by field: ${key}`)
      }
    })

    // Validate limit
    if (query.limit > permissions.maxLimit) {
      throw new ForbiddenException(`Limit exceeds maximum: ${permissions.maxLimit}`)
    }

    return true
  }

  private canSort(field: string, allowedFields: string[]): boolean {
    return allowedFields.includes('*') || allowedFields.includes(field)
  }

  private canFilter(field: string, allowedFields: string[]): boolean {
    return allowedFields.includes('*') || allowedFields.includes(field)
  }

  private isFilterField(key: string): boolean {
    return !['page', 'limit', 'sortBy', 'sortOrder', 'search'].includes(key)
  }
}
```

### 2. Integration với Caching Layer

```typescript
// src/shared/interceptors/query-cache.interceptor.ts
import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common'
import { Observable } from 'rxjs'
import { tap } from 'rxjs/operators'
import { CacheService } from '../services/cache.service'
import { createHash } from 'crypto'

@Injectable()
export class QueryCacheInterceptor implements NestInterceptor {
  constructor(private cacheService: CacheService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest()
    const cacheKey = this.generateCacheKey(request)

    return new Observable((observer) => {
      // Try to get from cache first
      this.cacheService.get(cacheKey).then((cachedResult) => {
        if (cachedResult) {
          observer.next(cachedResult)
          observer.complete()
          return
        }

        // Execute original handler
        next
          .handle()
          .pipe(
            tap((result) => {
              // Cache the result
              const ttl = this.determineTTL(request.query)
              this.cacheService.set(cacheKey, result, ttl)
            }),
          )
          .subscribe(observer)
      })
    })
  }

  private generateCacheKey(request: any): string {
    const { url, query, user } = request
    const cacheData = {
      url: url.split('?')[0], // Remove query params from URL
      query: this.normalizeQuery(query),
      userId: user?.id, // Include user context if needed
    }

    return `query:${createHash('md5').update(JSON.stringify(cacheData)).digest('hex')}`
  }

  private normalizeQuery(query: any): any {
    // Sort keys để ensure consistent cache keys
    const normalized = {}
    Object.keys(query)
      .sort()
      .forEach((key) => {
        normalized[key] = query[key]
      })
    return normalized
  }

  private determineTTL(query: any): number {
    // Different TTLs based on query type
    if (query.search) return 300 // 5 minutes for search
    if (query.page > 1) return 600 // 10 minutes for pagination
    return 900 // 15 minutes for general queries
  }
}
```

### 3. Integration với Logging & Monitoring

```typescript
// src/shared/interceptors/query-logging.interceptor.ts
import { Injectable, NestInterceptor, ExecutionContext, CallHandler, Logger } from '@nestjs/common'
import { Observable } from 'rxjs'
import { tap } from 'rxjs/operators'

@Injectable()
export class QueryLoggingInterceptor implements NestInterceptor {
  private readonly logger = new Logger(QueryLoggingInterceptor.name)

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest()
    const startTime = Date.now()

    const queryInfo = {
      method: request.method,
      url: request.url,
      query: request.query,
      userAgent: request.headers['user-agent'],
      ip: request.ip,
      userId: request.user?.id,
    }

    return next.handle().pipe(
      tap({
        next: (response) => {
          const duration = Date.now() - startTime

          this.logger.log({
            message: 'Query executed successfully',
            ...queryInfo,
            duration,
            resultCount: Array.isArray(response?.data) ? response.data.length : 1,
            totalCount: response?.meta?.total,
          })

          // Send metrics to monitoring service
          this.sendMetrics(queryInfo, duration, response)
        },
        error: (error) => {
          const duration = Date.now() - startTime

          this.logger.error({
            message: 'Query execution failed',
            ...queryInfo,
            duration,
            error: error.message,
            stack: error.stack,
          })
        },
      }),
    )
  }

  private sendMetrics(queryInfo: any, duration: number, response: any) {
    // Integration với monitoring service (Prometheus, DataDog, etc.)
    // metrics.counter('api_requests_total').increment({
    //   method: queryInfo.method,
    //   endpoint: queryInfo.url.split('?')[0],
    //   status: 'success',
    // })
    // metrics.histogram('api_request_duration').observe(duration, {
    //   method: queryInfo.method,
    //   endpoint: queryInfo.url.split('?')[0],
    // })
  }
}
```

## 📋 Tóm tắt

### Key Takeaways

1. **Performance Optimization**: Proper pagination có thể giảm response time từ 2s xuống 100ms và bandwidth usage 99%
2. **Security**: Always validate và sanitize inputs để prevent SQL injection và data exposure
3. **Scalability**: Implement cursor-based pagination cho large datasets và real-time applications
4. **User Experience**: Combine pagination, filtering, sorting, và search để create powerful data browsing experiences

### When to Use Different Approaches

✅ **Offset-based Pagination:**

- Small to medium datasets (<10M records)
- Simple UI requirements
- Traditional web applications

✅ **Cursor-based Pagination:**

- Large datasets (>10M records)
- Real-time feeds
- Mobile applications
- APIs với high concurrency

✅ **Elasticsearch/Full-text Search:**

- Complex search requirements
- Faceted navigation
- Autocomplete functionality
- Analytics và reporting

❌ **Avoid when:**

- Simple CRUD operations
- Internal APIs với trusted data
- Small datasets (<1000 records)

### Performance Guidelines

```typescript
const PERFORMANCE_LIMITS = {
  maxPageSize: 100, // Prevent large page abuse
  maxSearchTerms: 10, // Limit search complexity
  maxFilters: 20, // Prevent filter abuse
  defaultPageSize: 20, // Reasonable default
  searchCacheTTL: 300, // 5 minutes
  dataCacheTTL: 900, // 15 minutes
}
```

### Monitoring Metrics

```typescript
// Key metrics to track
const METRICS_TO_MONITOR = {
  queryDuration: 'Average query execution time',
  cacheHitRate: 'Percentage of cache hits',
  errorRate: 'Query error percentage',
  popularSearchTerms: 'Most searched terms',
  slowQueries: 'Queries taking >1s',
  largeResults: 'Queries returning >1000 records',
}
```

> 💡 **Remember**: Effective PFSS implementation requires balancing between performance, security, và user experience. Always profile your queries và monitor real-world usage patterns để optimize accordingly.
