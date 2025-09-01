# 🎨 Database Design Thinking trong NestJS

## 🔍 Database Design Thinking là gì?

Database Design Thinking là phương pháp tiếp cận có hệ thống để thiết kế cơ sở dữ liệu hiệu quả, có khả năng mở rộng và bảo trì tốt. Đây không chỉ là việc tạo bảng và quan hệ, mà còn bao gồm:

- **🎯 Performance Optimization**: Thiết kế để tối ưu hóa hiệu suất truy vấn
- **📈 Scalability Planning**: Chuẩn bị cho việc mở rộng trong tương lai
- **🔒 Data Integrity**: Đảm bảo tính toàn vẹn và nhất quán của dữ liệu
- **🛡️ Security Considerations**: Bảo mật dữ liệu và kiểm soát truy cập
- **🔄 Evolution Strategy**: Chiến lược phát triển và migration

### Vai trò trong NestJS Ecosystem

```typescript
// Database Design ảnh hưởng đến toàn bộ application stack
┌─────────────────┐
│   Controllers   │ ← API Design phụ thuộc vào Data Structure
├─────────────────┤
│    Services     │ ← Business Logic phụ thuộc vào Data Flow
├─────────────────┤
│  Repositories   │ ← Query Patterns phụ thuộc vào Schema Design
├─────────────────┤
│   Database      │ ← Foundation của toàn bộ system
└─────────────────┘
```

## 🎯 Lifecycle của Database Design Process

### 1. Analysis Phase (Phân tích)

```typescript
// 🔍 Domain Analysis
interface UserDomain {
  // Identify entities
  entities: ['User', 'Profile', 'Post', 'Comment', 'Like']

  // Define relationships
  relationships: {
    'User -> Profile': 'One-to-One'
    'User -> Post': 'One-to-Many'
    'Post -> Comment': 'One-to-Many'
    'User -> Like': 'Many-to-Many'
  }

  // Business rules
  rules: [
    'User must have unique email',
    'Post must belong to a user',
    'Comment cannot be empty',
    'User can like a post only once',
  ]
}
```

### 2. Conceptual Design

```typescript
// 📝 Entity-Relationship Modeling
interface ConceptualModel {
  // Core entities
  User: {
    attributes: ['id', 'email', 'username', 'createdAt']
    constraints: ['email UNIQUE', 'username UNIQUE']
  }

  Post: {
    attributes: ['id', 'title', 'content', 'authorId', 'publishedAt']
    relationships: ['belongsTo: User']
  }

  // Junction tables for many-to-many
  UserPostLike: {
    attributes: ['userId', 'postId', 'likedAt']
    primaryKey: ['userId', 'postId']
  }
}
```

### 3. Logical Design

```prisma
// schema.prisma - Logical database schema
model User {
  id        String   @id @default(cuid())
  email     String   @unique
  username  String   @unique
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  // Relationships
  profile   Profile?
  posts     Post[]
  likes     Like[]
  comments  Comment[]

  @@map("users")
  @@index([email])
  @@index([username])
}

model Post {
  id          String   @id @default(cuid())
  title       String
  content     String   @db.Text
  published   Boolean  @default(false)
  authorId    String
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  // Relationships
  author      User      @relation(fields: [authorId], references: [id], onDelete: Cascade)
  comments    Comment[]
  likes       Like[]

  @@map("posts")
  @@index([authorId])
  @@index([published, createdAt])
  @@index([createdAt])
}
```

### 4. Physical Design & Implementation

```typescript
// user.repository.ts - Repository pattern implementation
@Injectable()
export class UserRepository extends BaseRepository<User> {
  constructor(private prisma: PrismaService) {
    super(prisma.user)
  }

  // Optimized queries based on access patterns
  async findUserWithStats(userId: string): Promise<UserWithStats> {
    return this.prisma.user.findUnique({
      where: { id: userId },
      include: {
        _count: {
          select: {
            posts: { where: { published: true } },
            likes: true,
            comments: true,
          },
        },
        profile: true,
      },
    })
  }

  // Pagination with cursor-based approach for large datasets
  async findUsersWithPagination(params: PaginationParams) {
    const { cursor, take = 20, orderBy = { createdAt: 'desc' } } = params

    return this.prisma.user.findMany({
      take: take + 1, // +1 để check hasNextPage
      cursor: cursor ? { id: cursor } : undefined,
      orderBy,
      include: {
        profile: true,
        _count: {
          select: { posts: true, likes: true },
        },
      },
    })
  }
}
```

## 💡 Design Patterns và Implementation Strategies

### 1. Single Table Inheritance (STI)

```prisma
// Khi có các entities tương tự nhau
model Content {
  id          String      @id @default(cuid())
  type        ContentType // 'POST' | 'ARTICLE' | 'VIDEO'
  title       String
  body        String?     @db.Text
  videoUrl    String?     // Chỉ cho VIDEO type
  excerpt     String?     // Chỉ cho ARTICLE type
  authorId    String
  createdAt   DateTime    @default(now())

  author      User        @relation(fields: [authorId], references: [id])

  @@map("contents")
  @@index([type, createdAt])
}

enum ContentType {
  POST
  ARTICLE
  VIDEO
}
```

```typescript
// content.service.ts
@Injectable()
export class ContentService {
  // Factory pattern để xử lý different content types
  async createContent(data: CreateContentDto): Promise<Content> {
    const contentData = this.buildContentData(data)

    return this.prisma.content.create({
      data: contentData,
      include: this.getContentIncludes(data.type),
    })
  }

  private buildContentData(data: CreateContentDto) {
    const baseData = {
      type: data.type,
      title: data.title,
      authorId: data.authorId,
    }

    switch (data.type) {
      case ContentType.POST:
        return { ...baseData, body: data.body }

      case ContentType.ARTICLE:
        return {
          ...baseData,
          body: data.body,
          excerpt: data.excerpt,
        }

      case ContentType.VIDEO:
        return {
          ...baseData,
          videoUrl: data.videoUrl,
          body: data.description,
        }
    }
  }
}
```

### 2. Polymorphic Associations

```prisma
// Likeable pattern - một entity có thể like nhiều loại content
model Like {
  id           String    @id @default(cuid())
  userId       String
  likeableId   String    // ID của object được like
  likeableType String    // Type của object: 'POST', 'COMMENT', 'PHOTO'
  createdAt    DateTime  @default(now())

  user         User      @relation(fields: [userId], references: [id])

  @@unique([userId, likeableId, likeableType])
  @@map("likes")
  @@index([likeableType, likeableId])
}
```

```typescript
// like.service.ts
@Injectable()
export class LikeService {
  async toggleLike(userId: string, likeableId: string, likeableType: string) {
    const existingLike = await this.prisma.like.findUnique({
      where: {
        userId_likeableId_likeableType: {
          userId,
          likeableId,
          likeableType,
        },
      },
    })

    if (existingLike) {
      // Unlike
      await this.prisma.like.delete({
        where: { id: existingLike.id },
      })
      return { action: 'unliked', likeCount: await this.getLikeCount(likeableId, likeableType) }
    } else {
      // Like
      await this.prisma.like.create({
        data: { userId, likeableId, likeableType },
      })
      return { action: 'liked', likeCount: await this.getLikeCount(likeableId, likeableType) }
    }
  }

  private async getLikeCount(likeableId: string, likeableType: string): Promise<number> {
    return this.prisma.like.count({
      where: { likeableId, likeableType },
    })
  }
}
```

### 3. Event Sourcing Pattern

```prisma
// Store all events that happen to entities
model UserEvent {
  id          String    @id @default(cuid())
  userId      String
  eventType   String    // 'USER_CREATED', 'PROFILE_UPDATED', 'POST_PUBLISHED'
  eventData   Json      // Serialize event payload
  version     Int       // Event version for ordering
  createdAt   DateTime  @default(now())

  user        User      @relation(fields: [userId], references: [id])

  @@map("user_events")
  @@index([userId, version])
  @@index([eventType, createdAt])
}
```

```typescript
// event-store.service.ts
@Injectable()
export class EventStoreService {
  async appendEvent(userId: string, eventType: string, eventData: any) {
    const lastVersion = await this.getLastVersion(userId)

    return this.prisma.userEvent.create({
      data: {
        userId,
        eventType,
        eventData,
        version: lastVersion + 1,
      },
    })
  }

  async getEventHistory(userId: string, fromVersion = 0): Promise<UserEvent[]> {
    return this.prisma.userEvent.findMany({
      where: {
        userId,
        version: { gt: fromVersion },
      },
      orderBy: { version: 'asc' },
    })
  }

  // Rebuild entity state from events
  async rebuildUserState(userId: string): Promise<UserState> {
    const events = await this.getEventHistory(userId)

    return events.reduce((state, event) => {
      return this.applyEvent(state, event)
    }, this.getInitialState())
  }
}
```

## 🔧 Advanced Database Patterns

### 1. Read/Write Separation

```typescript
// database.config.ts
@Injectable()
export class DatabaseConfig {
  readonly writeDb: PrismaClient
  readonly readDb: PrismaClient

  constructor() {
    this.writeDb = new PrismaClient({
      datasources: {
        db: { url: process.env.WRITE_DATABASE_URL },
      },
    })

    this.readDb = new PrismaClient({
      datasources: {
        db: { url: process.env.READ_DATABASE_URL },
      },
    })
  }
}

// base.repository.ts
export abstract class BaseRepository<T> {
  constructor(
    protected readonly writeDb: PrismaClient,
    protected readonly readDb: PrismaClient,
    protected readonly modelName: string,
  ) {}

  // Write operations sử dụng write database
  async create(data: any): Promise<T> {
    return this.writeDb[this.modelName].create({ data })
  }

  async update(where: any, data: any): Promise<T> {
    return this.writeDb[this.modelName].update({ where, data })
  }

  // Read operations sử dụng read replica
  async findMany(params: any): Promise<T[]> {
    return this.readDb[this.modelName].findMany(params)
  }

  async findUnique(where: any): Promise<T | null> {
    return this.readDb[this.modelName].findUnique({ where })
  }
}
```

### 2. Database Sharding Strategy

```typescript
// shard.service.ts
@Injectable()
export class ShardService {
  private readonly shards: Map<string, PrismaClient> = new Map()

  constructor() {
    // Initialize multiple database connections
    for (let i = 0; i < 4; i++) {
      this.shards.set(
        `shard_${i}`,
        new PrismaClient({
          datasources: {
            db: { url: process.env[`SHARD_${i}_DATABASE_URL`] },
          },
        }),
      )
    }
  }

  // Determine shard based on user ID
  getShardForUser(userId: string): PrismaClient {
    const shardKey = this.hashUserId(userId) % this.shards.size
    return this.shards.get(`shard_${shardKey}`)!
  }

  private hashUserId(userId: string): number {
    // Simple hash function - use better one in production
    return userId.split('').reduce((acc, char) => {
      return acc + char.charCodeAt(0)
    }, 0)
  }
}

// user.repository.ts with sharding
@Injectable()
export class UserRepository {
  constructor(private shardService: ShardService) {}

  async findUser(userId: string): Promise<User | null> {
    const shard = this.shardService.getShardForUser(userId)
    return shard.user.findUnique({ where: { id: userId } })
  }

  async createUser(userData: CreateUserData): Promise<User> {
    const shard = this.shardService.getShardForUser(userData.id)
    return shard.user.create({ data: userData })
  }
}
```

### 3. CQRS (Command Query Responsibility Segregation)

```typescript
// commands/create-user.command.ts
export class CreateUserCommand {
  constructor(
    public readonly email: string,
    public readonly username: string,
    public readonly password: string,
  ) {}
}

// command-handlers/create-user.handler.ts
@CommandHandler(CreateUserCommand)
export class CreateUserHandler implements ICommandHandler<CreateUserCommand> {
  constructor(
    private userRepository: UserRepository,
    private eventBus: EventBus,
  ) {}

  async execute(command: CreateUserCommand): Promise<string> {
    const hashedPassword = await bcrypt.hash(command.password, 10)

    const user = await this.userRepository.create({
      email: command.email,
      username: command.username,
      password: hashedPassword,
    })

    // Publish event for read model updates
    this.eventBus.publish(new UserCreatedEvent(user.id, user.email))

    return user.id
  }
}

// queries/get-user-profile.query.ts
export class GetUserProfileQuery {
  constructor(public readonly userId: string) {}
}

// query-handlers/get-user-profile.handler.ts
@QueryHandler(GetUserProfileQuery)
export class GetUserProfileHandler implements IQueryHandler<GetUserProfileQuery> {
  constructor(private userReadModel: UserReadModelRepository) {}

  async execute(query: GetUserProfileQuery): Promise<UserProfileView> {
    // Read from optimized read model
    return this.userReadModel.getUserProfile(query.userId)
  }
}
```

## ⚠️ Common Database Design Issues và Solutions

### 1. N+1 Query Problem

```typescript
// ❌ BAD: N+1 queries
async getBadUserPosts(userId: string) {
  const user = await this.prisma.user.findUnique({
    where: { id: userId }
  });

  const posts = await this.prisma.post.findMany({
    where: { authorId: userId }
  });

  // N+1: Mỗi post sẽ trigger thêm query để lấy comments
  for (const post of posts) {
    post.comments = await this.prisma.comment.findMany({
      where: { postId: post.id }
    });
  }

  return { user, posts };
}

// ✅ GOOD: Single query với includes
async getGoodUserPosts(userId: string) {
  return this.prisma.user.findUnique({
    where: { id: userId },
    include: {
      posts: {
        include: {
          comments: {
            include: {
              author: {
                select: { id: true, username: true, avatar: true }
              }
            }
          },
          _count: {
            select: { likes: true }
          }
        }
      }
    }
  });
}
```

### 2. Missing Database Indexes

```prisma
// ❌ BAD: No indexes on frequently queried fields
model Post {
  id        String   @id @default(cuid())
  title     String
  content   String
  authorId  String
  published Boolean  @default(false)
  createdAt DateTime @default(now())

  author    User     @relation(fields: [authorId], references: [id])
  // Missing indexes!
}

// ✅ GOOD: Proper indexing strategy
model Post {
  id        String   @id @default(cuid())
  title     String
  content   String   @db.Text
  authorId  String
  published Boolean  @default(false)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  author    User     @relation(fields: [authorId], references: [id])

  // Strategic indexes based on query patterns
  @@index([authorId])                    // For author's posts
  @@index([published, createdAt])        // For published posts timeline
  @@index([createdAt])                   // For general timeline
  @@index([title])                       // For search by title
  @@fulltext([title, content])          // For full-text search
}
```

### 3. Inefficient Pagination

```typescript
// ❌ BAD: OFFSET-based pagination (slow for large datasets)
async getBadPagination(page: number, limit: number) {
  const offset = (page - 1) * limit;

  const [posts, total] = await Promise.all([
    this.prisma.post.findMany({
      skip: offset,      // ⚠️ Becomes very slow with large offsets
      take: limit,
      orderBy: { createdAt: 'desc' }
    }),
    this.prisma.post.count() // ⚠️ COUNT(*) on large table is expensive
  ]);

  return {
    posts,
    pagination: {
      page,
      limit,
      total,
      hasNext: offset + limit < total
    }
  };
}

// ✅ GOOD: Cursor-based pagination
async getGoodPagination(cursor?: string, limit = 20) {
  const posts = await this.prisma.post.findMany({
    take: limit + 1,   // +1 để check hasNext
    cursor: cursor ? { id: cursor } : undefined,
    orderBy: { createdAt: 'desc' },
    include: {
      author: {
        select: { id: true, username: true, avatar: true }
      },
      _count: {
        select: { likes: true, comments: true }
      }
    }
  });

  const hasNext = posts.length > limit;
  if (hasNext) posts.pop(); // Remove extra item

  return {
    posts,
    pagination: {
      hasNext,
      nextCursor: hasNext ? posts[posts.length - 1].id : null
    }
  };
}
```

### 4. Database Transaction Handling

```typescript
// ❌ BAD: No transaction for related operations
async badCreateUserWithProfile(userData: CreateUserDto) {
  const user = await this.prisma.user.create({
    data: { email: userData.email, username: userData.username }
  });

  // ⚠️ If this fails, user is created but profile is not!
  const profile = await this.prisma.profile.create({
    data: { userId: user.id, displayName: userData.displayName }
  });

  return { user, profile };
}

// ✅ GOOD: Proper transaction handling
async goodCreateUserWithProfile(userData: CreateUserDto) {
  return this.prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: {
        email: userData.email,
        username: userData.username
      }
    });

    const profile = await tx.profile.create({
      data: {
        userId: user.id,
        displayName: userData.displayName,
        bio: userData.bio || '',
        avatar: userData.avatar
      }
    });

    // Both operations succeed or both fail
    return { user, profile };
  });
}

// Advanced transaction with retry mechanism
async createUserWithRetry(userData: CreateUserDto, maxRetries = 3) {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await this.goodCreateUserWithProfile(userData);
    } catch (error) {
      if (attempt === maxRetries) {
        throw error;
      }

      // Wait before retry (exponential backoff)
      await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt) * 1000));
    }
  }
}
```

## 📝 Database Design Best Practices

### 1. Schema Evolution Strategy

```typescript
// migration-strategy.service.ts
@Injectable()
export class MigrationStrategy {
  // ✅ Safe column addition
  async addNullableColumn() {
    // Step 1: Add nullable column
    await this.prisma.$executeRaw`
      ALTER TABLE users ADD COLUMN middle_name VARCHAR(100) NULL;
    `

    // Step 2: Populate with default values (optional)
    await this.prisma.$executeRaw`
      UPDATE users SET middle_name = '' WHERE middle_name IS NULL;
    `

    // Step 3: Make NOT NULL if needed (in next deployment)
    // await this.prisma.$executeRaw`
    //   ALTER TABLE users ALTER COLUMN middle_name SET NOT NULL;
    // `;
  }

  // ✅ Safe column removal (Blue-Green deployment)
  async removeColumnSafely() {
    // Phase 1: Stop writing to the column (deploy new code)
    // Phase 2: Verify column is not used
    // Phase 3: Drop column
    await this.prisma.$executeRaw`
      ALTER TABLE users DROP COLUMN deprecated_field;
    `
  }

  // ✅ Safe index creation
  async createIndexConcurrently() {
    // PostgreSQL: Create index without locking
    await this.prisma.$executeRaw`
      CREATE INDEX CONCURRENTLY idx_users_email_verified 
      ON users(email, email_verified_at) 
      WHERE email_verified_at IS NOT NULL;
    `
  }
}
```

### 2. Data Archiving Strategy

```typescript
// data-archival.service.ts
@Injectable()
export class DataArchivalService {
  // Archive old data to separate tables
  async archiveOldPosts(olderThanDays = 365) {
    const cutoffDate = new Date()
    cutoffDate.setDate(cutoffDate.getDate() - olderThanDays)

    return this.prisma.$transaction(async (tx) => {
      // Move old posts to archive table
      const archivedPosts = await tx.post.findMany({
        where: {
          createdAt: { lt: cutoffDate },
          published: false, // Only archive unpublished posts
        },
      })

      // Insert into archive table
      await tx.postArchive.createMany({
        data: archivedPosts.map((post) => ({
          originalId: post.id,
          title: post.title,
          content: post.content,
          authorId: post.authorId,
          createdAt: post.createdAt,
          archivedAt: new Date(),
        })),
      })

      // Delete from main table
      await tx.post.deleteMany({
        where: {
          id: { in: archivedPosts.map((p) => p.id) },
        },
      })

      return { archivedCount: archivedPosts.length }
    })
  }
}
```

### 3. Database Health Monitoring

```typescript
// database-health.service.ts
@Injectable()
export class DatabaseHealthService {
  async getHealthMetrics() {
    const [tableStats, indexUsage, slowQueries, connectionCount] = await Promise.all([
      this.getTableStatistics(),
      this.getIndexUsageStats(),
      this.getSlowQueries(),
      this.getConnectionCount(),
    ])

    return {
      tableStats,
      indexUsage,
      slowQueries,
      connectionCount,
      timestamp: new Date(),
    }
  }

  private async getTableStatistics() {
    // PostgreSQL specific query
    return this.prisma.$queryRaw`
      SELECT 
        schemaname,
        tablename,
        n_tup_ins as inserts,
        n_tup_upd as updates,
        n_tup_del as deletes,
        n_live_tup as live_rows,
        n_dead_tup as dead_rows
      FROM pg_stat_user_tables
      ORDER BY n_live_tup DESC;
    `
  }

  private async getIndexUsageStats() {
    return this.prisma.$queryRaw`
      SELECT 
        schemaname,
        tablename,
        indexname,
        idx_scan as times_used,
        idx_tup_read as tuples_read,
        idx_tup_fetch as tuples_fetched
      FROM pg_stat_user_indexes
      WHERE idx_scan = 0  -- Unused indexes
      ORDER BY schemaname, tablename;
    `
  }

  private async getSlowQueries() {
    return this.prisma.$queryRaw`
      SELECT 
        query,
        calls,
        total_time,
        mean_time,
        rows
      FROM pg_stat_statements
      WHERE mean_time > 1000  -- Queries slower than 1 second
      ORDER BY mean_time DESC
      LIMIT 10;
    `
  }
}
```

## 🚨 Security và Data Protection

### 1. Row Level Security (RLS)

```sql
-- Enable RLS on sensitive tables
ALTER TABLE user_profiles ENABLE ROW LEVEL SECURITY;

-- Users can only see their own profile
CREATE POLICY user_profiles_select_policy ON user_profiles
  FOR SELECT
  USING (user_id = current_setting('app.current_user_id')::uuid);

-- Users can only update their own profile
CREATE POLICY user_profiles_update_policy ON user_profiles
  FOR UPDATE
  USING (user_id = current_setting('app.current_user_id')::uuid);
```

```typescript
// Implement RLS in NestJS
@Injectable()
export class SecureUserService {
  async getUserProfile(userId: string, requestingUserId: string) {
    // Set current user context for RLS
    await this.prisma.$executeRaw`
      SELECT set_config('app.current_user_id', ${requestingUserId}, true);
    `

    // Query will automatically apply RLS policies
    return this.prisma.userProfile.findUnique({
      where: { userId },
    })
  }
}
```

### 2. Data Encryption

```typescript
// encryption.service.ts
@Injectable()
export class EncryptionService {
  private readonly algorithm = 'aes-256-gcm'
  private readonly key = crypto.scryptSync(process.env.ENCRYPTION_KEY!, 'salt', 32)

  encrypt(text: string): string {
    const iv = crypto.randomBytes(16)
    const cipher = crypto.createCipher(this.algorithm, this.key)
    cipher.setAAD(Buffer.from('additional-data'))

    let encrypted = cipher.update(text, 'utf8', 'hex')
    encrypted += cipher.final('hex')

    const authTag = cipher.getAuthTag()

    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`
  }

  decrypt(encryptedText: string): string {
    const [ivHex, authTagHex, encrypted] = encryptedText.split(':')

    const iv = Buffer.from(ivHex, 'hex')
    const authTag = Buffer.from(authTagHex, 'hex')

    const decipher = crypto.createDecipher(this.algorithm, this.key)
    decipher.setAAD(Buffer.from('additional-data'))
    decipher.setAuthTag(authTag)

    let decrypted = decipher.update(encrypted, 'hex', 'utf8')
    decrypted += decipher.final('utf8')

    return decrypted
  }
}

// Prisma middleware for automatic encryption
export function createEncryptionMiddleware(encryptionService: EncryptionService) {
  return async (params: any, next: any) => {
    // Encrypt sensitive fields before write
    if (params.action === 'create' || params.action === 'update') {
      if (params.model === 'User' && params.args.data.ssn) {
        params.args.data.ssn = encryptionService.encrypt(params.args.data.ssn)
      }
    }

    const result = await next(params)

    // Decrypt sensitive fields after read
    if (params.action === 'findUnique' || params.action === 'findMany') {
      if (params.model === 'User' && result) {
        const users = Array.isArray(result) ? result : [result]
        users.forEach((user) => {
          if (user.ssn) {
            user.ssn = encryptionService.decrypt(user.ssn)
          }
        })
      }
    }

    return result
  }
}
```

### 3. Audit Trail Implementation

```prisma
// Audit trail model
model AuditLog {
  id          String    @id @default(cuid())
  tableName   String
  recordId    String
  action      String    // 'CREATE', 'UPDATE', 'DELETE'
  oldValues   Json?     // Previous state
  newValues   Json?     // New state
  changedBy   String    // User ID
  changedAt   DateTime  @default(now())
  ipAddress   String?
  userAgent   String?

  @@map("audit_logs")
  @@index([tableName, recordId])
  @@index([changedBy, changedAt])
}
```

```typescript
// audit.interceptor.ts
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private auditService: AuditService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest()
    const user = request.user

    return next.handle().pipe(
      tap(async (result) => {
        const auditData = {
          action: this.getActionFromContext(context),
          changedBy: user?.id,
          ipAddress: request.ip,
          userAgent: request.get('User-Agent'),
          timestamp: new Date(),
        }

        await this.auditService.logChange(auditData, result)
      }),
    )
  }
}
```

## 📋 Performance Optimization Checklist

### 1. Query Optimization

```typescript
// query-optimizer.service.ts
@Injectable()
export class QueryOptimizer {
  // ✅ Use SELECT only needed fields
  async getOptimizedUserList() {
    return this.prisma.user.findMany({
      select: {
        id: true,
        username: true,
        email: true,
        profile: {
          select: {
            displayName: true,
            avatar: true,
          },
        },
        _count: {
          select: { posts: true },
        },
      },
      take: 20,
    })
  }

  // ✅ Use database-level aggregations
  async getUserStatistics(userId: string) {
    return this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        _count: {
          select: {
            posts: { where: { published: true } },
            comments: true,
            likes: true,
          },
        },
      },
    })
  }

  // ✅ Batch operations instead of individual queries
  async createMultipleUsers(usersData: CreateUserDto[]) {
    return this.prisma.user.createMany({
      data: usersData,
      skipDuplicates: true,
    })
  }
}
```

### 2. Connection Pool Configuration

```typescript
// database.config.ts
export const databaseConfig = {
  // Connection pool settings
  datasources: {
    db: {
      url: process.env.DATABASE_URL,
    },
  },

  // Prisma specific settings
  log: ['query', 'info', 'warn', 'error'],

  // Connection pool configuration
  connectionLimit: 20, // Max connections
  poolTimeout: 30000, // 30 seconds
  idleTimeout: 600000, // 10 minutes

  // Query timeout
  transactionOptions: {
    maxWait: 5000, // 5 seconds
    timeout: 10000, // 10 seconds
  },
}
```

### 3. Database Monitoring và Alerting

```typescript
// monitoring.service.ts
@Injectable()
export class DatabaseMonitoringService {
  @Cron('*/5 * * * *') // Every 5 minutes
  async checkDatabaseHealth() {
    const metrics = await this.collectMetrics()

    // Check connection count
    if (metrics.connectionCount > 80) {
      await this.sendAlert('High connection count', metrics)
    }

    // Check slow queries
    if (metrics.slowQueryCount > 10) {
      await this.sendAlert('Too many slow queries', metrics)
    }

    // Check table sizes
    if (metrics.largestTableSize > 10_000_000) {
      await this.sendAlert('Large table detected', metrics)
    }
  }

  private async collectMetrics() {
    const [connectionCount, slowQueries, tableSizes] = await Promise.all([
      this.getConnectionCount(),
      this.getSlowQueryCount(),
      this.getTableSizes(),
    ])

    return {
      connectionCount,
      slowQueryCount: slowQueries.length,
      largestTableSize: Math.max(...tableSizes.map((t) => t.size)),
      timestamp: new Date(),
    }
  }
}
```

## 🎨 Integration với Other Components

### 1. Cache Layer Integration

```typescript
// cached-repository.ts
@Injectable()
export class CachedUserRepository extends UserRepository {
  constructor(
    prisma: PrismaService,
    private cacheService: CacheService,
  ) {
    super(prisma)
  }

  async findById(id: string): Promise<User | null> {
    const cacheKey = `user:${id}`

    // Try cache first
    const cached = await this.cacheService.get<User>(cacheKey)
    if (cached) {
      return cached
    }

    // Fallback to database
    const user = await super.findById(id)
    if (user) {
      await this.cacheService.set(cacheKey, user, 300) // 5 minutes TTL
    }

    return user
  }

  async update(id: string, data: UpdateUserDto): Promise<User> {
    const user = await super.update(id, data)

    // Invalidate cache
    await this.cacheService.del(`user:${id}`)

    return user
  }
}
```

### 2. Event-Driven Architecture

```typescript
// user.service.ts
@Injectable()
export class UserService {
  constructor(
    private userRepository: UserRepository,
    private eventEmitter: EventEmitter2,
  ) {}

  async createUser(userData: CreateUserDto): Promise<User> {
    const user = await this.userRepository.create(userData)

    // Emit event for other services
    this.eventEmitter.emit('user.created', {
      userId: user.id,
      email: user.email,
      timestamp: new Date(),
    })

    return user
  }
}

// email.service.ts - Listen to user events
@Injectable()
export class EmailService {
  @OnEvent('user.created')
  async handleUserCreated(payload: UserCreatedEvent) {
    await this.sendWelcomeEmail(payload.email)
  }

  @OnEvent('user.profile.updated')
  async handleProfileUpdated(payload: ProfileUpdatedEvent) {
    if (payload.emailChanged) {
      await this.sendEmailChangeNotification(payload.oldEmail, payload.newEmail)
    }
  }
}
```

### 3. Background Job Integration

```typescript
// user.service.ts với background jobs
@Injectable()
export class UserService {
  constructor(
    private userRepository: UserRepository,
    @InjectQueue('user-processing') private userQueue: Queue,
  ) {}

  async createUser(userData: CreateUserDto): Promise<User> {
    const user = await this.userRepository.create(userData)

    // Add background jobs
    await Promise.all([
      this.userQueue.add('send-welcome-email', {
        userId: user.id,
        email: user.email,
      }),
      this.userQueue.add('setup-default-preferences', {
        userId: user.id,
      }),
      this.userQueue.add('notify-admin', {
        action: 'user-created',
        userId: user.id,
      }),
    ])

    return user
  }
}

// user.processor.ts
@Processor('user-processing')
export class UserProcessor {
  @Process('send-welcome-email')
  async sendWelcomeEmail(job: Job<{ userId: string; email: string }>) {
    const { userId, email } = job.data

    try {
      await this.emailService.sendWelcomeEmail(email)

      // Update user record
      await this.userRepository.update(userId, {
        welcomeEmailSent: true,
        welcomeEmailSentAt: new Date(),
      })
    } catch (error) {
      // Job will be retried automatically
      throw new Error(`Failed to send welcome email: ${error.message}`)
    }
  }
}
```

## 📋 Tóm tắt Database Design Thinking

### 🎯 Key Takeaways

1. **📊 Data-First Approach**: Thiết kế database trước khi code application logic
2. **🔄 Evolution Strategy**: Plan cho việc schema changes và migrations
3. **⚡ Performance Focus**: Index strategy và query optimization từ đầu
4. **🛡️ Security by Design**: RLS, encryption, và audit trails
5. **📈 Scalability Planning**: Sharding, read replicas, và caching strategy

### 🎨 When to Use Different Patterns

- **Single Table Inheritance**: Khi có entities tương tự nhau với ít differences
- **Polymorphic Associations**: Khi một entity relate với multiple types
- **Event Sourcing**: Khi cần audit trail chi tiết hoặc temporal queries
- **CQRS**: Khi read và write patterns khác nhau hoàn toàn
- **Sharding**: Khi data size vượt quá capacity của single database

### ⚠️ Common Anti-Patterns to Avoid

```typescript
// ❌ DON'T: Generic "data" JSON columns everywhere
model FlexibleEntity {
  id   String @id
  data Json   // Avoid this! No type safety, hard to query
}

// ✅ DO: Structured, typed columns
model User {
  id       String @id
  email    String @unique
  profile  Profile?
  settings UserSettings?
}

// ❌ DON'T: Storing arrays in single column
model Post {
  id   String @id
  tags String // "tag1,tag2,tag3" - Hard to query!
}

// ✅ DO: Proper many-to-many relationship
model Post {
  id   String @id
  tags PostTag[]
}

model PostTag {
  postId String
  tagId  String
  post   Post @relation(fields: [postId], references: [id])
  tag    Tag  @relation(fields: [tagId], references: [id])

  @@id([postId, tagId])
}
```

> 💡 **Remember**: Database design is about finding the right balance between normalization, performance, và maintainability. Start simple, measure performance, và optimize based on real usage patterns!
