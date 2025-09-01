# Hướng dẫn setup Prisma với dự án NestJS

## 1. Cài đặt Prisma CLI và @prisma/client

```bash
npm install prisma --save-dev
npm install @prisma/client
```

## 2. Khởi tạo Prisma

```bash
npx prisma init
```

Lệnh này sẽ tạo thư mục `prisma/` và file `schema.prisma`.

## 3. Cấu hình database

- Mở file `prisma/schema.prisma` và chỉnh sửa datasource `db` với biến môi trường `DATABASE_URL`.
- Thêm biến môi trường `DATABASE_URL` vào file `.env` (ví dụ cho PostgreSQL):

```
DATABASE_URL="postgresql://USER:PASSWORD@HOST:PORT/DATABASE"
```

## 4. Định nghĩa models

- Thêm các model vào file `prisma/schema.prisma`.

## 5. Tạo migration và migrate database

```bash
npx prisma migrate dev --name init
```

## 6. Sinh Prisma Client

```bash
npx prisma generate
```

## 7. Các cách sử dụng Prisma Client trong NestJS

### Cách 1: Khởi tạo PrismaClient trực tiếp

Dùng cho các script nhỏ, hoặc khi không cần quản lý vòng đời qua DI:

```ts
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany();
  console.log(users);
}
main();
```

> **Lưu ý:** Cách này không tận dụng được Dependency Injection của NestJS, không phù hợp cho dự án lớn.

---

### Cách 2: Tích hợp Prisma qua DI (chuẩn NestJS)

#### a. Tạo PrismaService

Tạo file `src/prisma.service.ts`:

```ts
import { Injectable } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient {
  constructor() {
    super();
  }

  // Ví dụ: lấy tất cả user
  async getAllUsers() {
    return this.user.findMany();
  }
}
```

#### b. Sử dụng PrismaService trong AppService

```ts
import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';

@Injectable()
export class AppService {
  constructor(private readonly prisma: PrismaService) {}

  async getUsers() {
    return this.prisma.getAllUsers();
  }
}
```

#### c. Thêm PrismaService vào providers trong AppModule

```ts
import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaService } from './prisma.service';

@Module({
  imports: [],
  controllers: [AppController],
  providers: [AppService, PrismaService],
})
export class AppModule {}
```

#### d. Gọi API để lấy danh sách user (ví dụ controller)

```ts
import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';

@Controller('users')
export class UserController {
  constructor(private readonly appService: AppService) {}

  @Get()
  async getUsers() {
    return this.appService.getUsers();
  }
}
```

## 8. Tài liệu tham khảo

- [Prisma Docs](https://www.prisma.io/docs/)
- [NestJS + Prisma](https://docs.nestjs.com/recipes/prisma)
