````markdown
# 🔒 So Sánh Các Cơ Chế Khóa (Lock) trong NestJS

## 📖 Giới Thiệu Tổng Quan

Trong ứng dụng NestJS, khi nhiều người dùng cùng truy cập và thay đổi dữ liệu một lúc, chúng ta cần sử dụng các cơ chế khóa (locking) để tránh xung đột. File này sẽ so sánh 3 loại khóa chính và hướng dẫn khi nào nên dùng loại nào.

### 🎯 Ba Loại Khóa Chính

| Loại Khóa                           | Cấp Độ   | Phạm Vi      | Dùng Khi Nào                        |
| ----------------------------------- | -------- | ------------ | ----------------------------------- |
| **Pessimistic Lock (Khóa Bi Quan)** | Database | 1 Server     | Dữ liệu quan trọng, ít người dùng   |
| **Optimistic Lock (Khóa Lạc Quan)** | Ứng dụng | 1 Server     | Nhiều người dùng, chấp nhận thử lại |
| **Redlock (Khóa Phân Tán)**         | Redis    | Nhiều Server | Hệ thống phân tán, đồng bộ toàn cục |

---

## 🎭 So Sánh Chi Tiết Từng Loại

### 1. 🏗️ Cách Hoạt Động & Triển Khai

| Đặc Điểm            | Pessimistic Lock      | Optimistic Lock                | Redlock                  |
| ------------------- | --------------------- | ------------------------------ | ------------------------ |
| **Cách Hoạt Động**  | Database tự động khóa | Kiểm tra version trước khi lưu | Redis làm trọng tài khóa |
| **Lưu Trữ Khóa**    | Trong database        | Cột version trong bảng         | Key trong Redis          |
| **Xử Lý Đồng Thời** | Chặn/Độc quyền        | Không chặn/Thử lại             | Đồng thuận giữa các node |
| **Độ Phức Tạp**     | Thấp                  | Trung bình                     | Cao                      |
| **Khó Cài Đặt**     | Rất dễ                | Dễ                             | Khó                      |

### 📝 Ví Dụ Code Minh Họa

#### 🔐 Pessimistic Lock - Khóa Bi Quan

```typescript
// Ví dụ: Chuyển tiền ngân hàng (PHẢI đảm bảo 100% chính xác)
async chuyenTienAnToan(tuTaiKhoan: string, denTaiKhoan: string, soTien: number) {
  return await this.dataSource.transaction(async manager => {
    // Database sẽ KHÓA tài khoản này, không ai khác được truy cập
    const taiKhoan = await manager.findOne(TaiKhoan, {
      where: { id: tuTaiKhoan },
      lock: { mode: 'pessimistic_write' } // Khóa cứng!
    })

    // Chỉ khi transaction này xong, người khác mới được phép truy cập
    return this.thucHienChuyenTien(taiKhoan, denTaiKhoan, soTien, manager)
  })
}
```

#### ⚡ Optimistic Lock - Khóa Lạc Quan

```typescript
// Ví dụ: Cập nhật profile user (có thể thử lại nếu bị conflict)
async capNhatProfile(userId: string, thongTinMoi: ProfileData) {
  const maxRetries = 3 // Thử tối đa 3 lần

  for (let lanThu = 0; lanThu < maxRetries; lanThu++) {
    try {
      // Lấy user cùng với version hiện tại
      const user = await this.userRepository.findOne({ where: { id: userId } })
      const versionCu = user.version

      // Cập nhật thông tin
      user.ten = thongTinMoi.ten
      user.email = thongTinMoi.email

      // Khi save, nếu version đã thay đổi (có người khác cập nhật) → báo lỗi
      await this.userRepository.save(user)
      return user

    } catch (error) {
      if (error instanceof OptimisticLockVersionMismatchError && lanThu < maxRetries - 1) {
        // Có conflict! Đợi một chút rồi thử lại
        await this.delay(100 * Math.pow(2, lanThu)) // Đợi 100ms, 200ms, 400ms...
        continue
      }
      throw error
    }
  }

  throw new Error('Không thể cập nhật sau nhiều lần thử')
}
```

#### 🌐 Redlock - Khóa Phân Tán

```typescript
// Ví dụ: Xử lý job định kỳ trên nhiều server (chỉ 1 server được chạy)
async xuLyBaoCaoHangGio() {
  const gioHienTai = new Date().getHours()
  const tenKhoa = `bao-cao-hang-gio:${gioHienTai}`

  return await this.distributedLockService.executeWithLock({
    resource: tenKhoa,
    operation: async () => {
      // Chỉ 1 server trong cả hệ thống được chạy code này
      console.log('Đang tạo báo cáo hàng giờ...')
      return this.tinhToanBaoCao()
    },
    options: {
      ttl: 30000, // Khóa trong 30 giây
      retryCount: 3 // Thử 3 lần nếu không lấy được khóa
    }
  })
}
```

### 2. ⚡ Hiệu Suất & Tốc Độ

| Chỉ Số                 | Pessimistic Lock        | Optimistic Lock     | Redlock                     |
| ---------------------- | ----------------------- | ------------------- | --------------------------- |
| **Thông Lượng**        | Thấp (bị chặn)          | Cao (không chặn)    | Trung bình (phụ thuộc mạng) |
| **Độ Trễ**             | Cao (phải đợi)          | Thấp (không đợi)    | Trung bình (gọi Redis)      |
| **Sử Dụng Tài Nguyên** | Trung bình (kết nối DB) | Thấp (CPU để retry) | Trung bình (bộ nhớ Redis)   |
| **Khả Năng Mở Rộng**   | Hạn chế bởi DB          | Cao trong 1 server  | Mở rộng được nhiều server   |
| **Tải Mạng**           | Không có                | Không có            | Cao (Redis cluster)         |

---

## 📊 Tổng Kết So Sánh Hiệu Suất

### ⚡ So Sánh Thông Lượng Theo Tình Huống

| Tình Huống                  | Pessimistic | Optimistic | Redlock    |
| --------------------------- | ----------- | ---------- | ---------- |
| **Ít Người Dùng (1-10)**    | ⭐⭐⭐⭐    | ⭐⭐⭐⭐⭐ | ⭐⭐⭐     |
| **Trung Bình (10-100)**     | ⭐⭐        | ⭐⭐⭐⭐⭐ | ⭐⭐⭐     |
| **Nhiều Người Dùng (100+)** | ⭐          | ⭐⭐⭐⭐   | ⭐⭐⭐     |
| **Triển Khai Nhiều Server** | ❌          | ⭐⭐       | ⭐⭐⭐⭐⭐ |

### 🎯 Đảm Bảo Tính Nhất Quán

| Khía Cạnh               | Pessimistic | Optimistic | Redlock  |
| ----------------------- | ----------- | ---------- | -------- |
| **Toàn Vẹn Dữ Liệu**    | 100%        | 95-99%     | 98-99%   |
| **Ngăn Race Condition** | Hoàn Hảo    | Tốt        | Rất Tốt  |
| **Nhất Quán Phân Tán**  | Không có    | Kém        | Xuất Sắc |
| **Giải Quyết Xung Đột** | Tự động     | Thủ công   | Tự động  |

### 🚀 Khả Năng Mở Rộng

| Yếu Tố                   | Pessimistic | Optimistic | Redlock    |
| ------------------------ | ----------- | ---------- | ---------- |
| **Mở Rộng Ngang**        | Kém         | Tốt        | Xuất Sắc   |
| **Sử Dụng Tài Nguyên**   | Cao         | Thấp       | Trung Bình |
| **Phụ Thuộc Mạng**       | Không       | Không      | Cao        |
| **Độ Phức Tạp Vận Hành** | Thấp        | Trung Bình | Cao        |

---

## 🎯 Khuyến Nghị Cuối Cùng

### 📋 Hướng Dẫn Chọn Nhanh

**🔐 Dùng Pessimistic Lock khi:**

- ✅ Giao dịch tài chính hoặc dữ liệu siêu quan trọng
- ✅ Yêu cầu đồng thời thấp (< 20 người dùng)
- ✅ Triển khai trên 1 server duy nhất
- ✅ Không chấp nhận sai số dữ liệu (0% tolerance)
- ✅ Muốn implementation đơn giản

**⚡ Dùng Optimistic Lock khi:**

- ✅ Ứng dụng đồng thời cao (50+ người dùng)
- ✅ Cập nhật do user điều khiển (profile, content)
- ✅ Chấp nhận logic retry khi có xung đột
- ✅ Cần thời gian phản hồi nhanh
- ✅ Triển khai trên 1 server

**🌐 Dùng Redlock khi:**

- ✅ Triển khai trên nhiều server/instance
- ✅ Cần đồng bộ job định kỳ
- ✅ Ngăn chặn thao tác trùng lặp
- ✅ Quản lý tài nguyên toàn cục
- ✅ Đồng bộ giữa các service

### 🛠️ Checklist Triển Khai

**📋 Trước Khi Triển Khai:**

- [ ] Phân tích pattern đồng thời của ứng dụng
- [ ] Đo baseline hiệu suất hiện tại
- [ ] Xác định thao tác quan trọng vs thông thường
- [ ] Lập kế hoạch xử lý lỗi
- [ ] Thiết kế monitoring và alerting

**⚙️ Trong Quá Trình Triển Khai:**

- [ ] Implement xử lý timeout đúng cách
- [ ] Thêm logging chi tiết
- [ ] Tạo performance metrics
- [ ] Test với tải thực tế
- [ ] Validate đảm bảo tính nhất quán

**📈 Sau Khi Triển Khai:**

- [ ] Monitor hiệu suất lock
- [ ] Theo dõi tỷ lệ lỗi và pattern
- [ ] Phân tích bottleneck
- [ ] Tối ưu dựa trên metrics thực tế
- [ ] Lập kế hoạch scaling trong tương lai

### 💡 Tips Thực Tế

1. **Bắt đầu với Optimistic** - Phù hợp với 80% trường hợp
2. **Chuyển sang Pessimistic** khi thực sự cần tính nhất quán tuyệt đối
3. **Dùng Redlock** chỉ khi hệ thống phân tán thực sự cần thiết
4. **Kết hợp các loại** cho các hệ thống phức tạp
5. **Monitor liên tục** để điều chỉnh chiến lược phù hợp

---

**🎊 Chọn đúng cơ chế khóa sẽ giúp cân bằng tối ưu giữa hiệu suất, tính nhất quán và độ phức tạp cho ứng dụng NestJS của bạn!**
````

### 3. 🎯 Tính Nhất Quán & Độ Tin Cậy

| Khía Cạnh             | Pessimistic Lock     | Optimistic Lock      | Redlock                   |
| --------------------- | -------------------- | -------------------- | ------------------------- |
| **Mức Độ Nhất Quán**  | Mạnh (Strong)        | Cuối cùng (Eventual) | Mạnh (với đa số)          |
| **Toàn Vẹn Dữ Liệu**  | Đảm bảo 100%         | Cao (với retry)      | Cao (dựa trên đồng thuận) |
| **Nguy Cơ Deadlock**  | Cao                  | Không có             | Thấp                      |
| **Xử Lý Timeout**     | Database quản lý     | Application quản lý  | TTL tự động               |
| **Khôi Phục Khi Lỗi** | Transaction rollback | Cơ chế retry         | Lock tự hết hạn           |

### 💡 Ví Dụ Về Tính Nhất Quán

#### 🔒 Tính Nhất Quán Mạnh - Pessimistic Lock

```typescript
// Ví dụ: Cập nhật kho hàng (KHÔNG được phép bán quá số lượng có)
async capNhatKhoHangAnToan(sanPhamId: string, soLuongBan: number) {
  return await this.dataSource.transaction(async manager => {
    // KHÓA CỨNG - đảm bảo không có race condition
    const sanPham = await manager.findOne(SanPham, {
      where: { id: sanPhamId },
      lock: { mode: 'pessimistic_write' } // Khóa độc quyền
    })

    if (sanPham.tonKho < soLuongBan) {
      throw new Error('Không đủ hàng trong kho')
    }

    sanPham.tonKho -= soLuongBan
    await manager.save(sanPham)
    // 🎯 Đảm bảo 100% - không bao giờ bán quá số lượng có

    return sanPham
  })
}
```

#### ⚡ Tính Nhất Quán Cuối Cùng - Optimistic Lock

```typescript
// Ví dụ: Cập nhật kho hàng (có thể retry nếu conflict)
async capNhatKhoHangNhanh(sanPhamId: string, soLuongBan: number) {
  const maxRetries = 5

  for (let lanThu = 0; lanThu < maxRetries; lanThu++) {
    try {
      const sanPham = await this.sanPhamRepository.findOne({ where: { id: sanPhamId } })

      if (sanPham.tonKho < soLuongBan) {
        throw new Error('Không đủ hàng trong kho')
      }

      sanPham.tonKho -= soLuongBan
      await this.sanPhamRepository.save(sanPham) // Tự động check version
      return sanPham

    } catch (error) {
      if (error instanceof OptimisticLockVersionMismatchError) {
        // 🔄 Có conflict - ai đó đã cập nhật trước, thử lại
        console.log(`Conflict detected, retry ${lanThu + 1}/${maxRetries}`)
        await this.delay(50 * lanThu) // Đợi 0ms, 50ms, 100ms, 150ms, 200ms
        continue
      }
      throw error
    }
  }

  throw new Error('Không thể cập nhật sau nhiều lần thử')
}
```

#### 🌐 Tính Nhất Quán Phân Tán - Redlock

```typescript
// Ví dụ: Cập nhật kho hàng trên nhiều server
async capNhatKhoHangPhanTan(sanPhamId: string, soLuongBan: number) {
  return await this.distributedLockService.executeWithLock({
    resource: `inventory:${sanPhamId}`,
    operation: async () => {
      // 🌐 Đồng bộ trên TẤT CẢ các server
      const sanPham = await this.sanPhamRepository.findOne({ where: { id: sanPhamId } })

      if (sanPham.tonKho < soLuongBan) {
        throw new Error('Không đủ hàng trong kho')
      }

      sanPham.tonKho -= soLuongBan
      await this.sanPhamRepository.save(sanPham)

      // 🎯 Nhất quán trên toàn bộ hệ thống phân tán
      return sanPham
    },
    options: { ttl: 10000 } // Khóa trong 10 giây
  })
}
```

### 4. 🚨 Xử Lý Lỗi & Khôi Phục

| Loại Lỗi         | Pessimistic Lock        | Optimistic Lock     | Redlock                |
| ---------------- | ----------------------- | ------------------- | ---------------------- |
| **Lock Timeout** | Database báo exception  | Không áp dụng       | Không lấy được lock    |
| **Mất Kết Nối**  | Transaction tự rollback | Operation tiếp tục  | Lock không thể release |
| **Deadlock**     | Database tự phát hiện   | Không thể xảy ra    | Timeout tự giải quyết  |
| **System Crash** | Tự khôi phục            | Có thể gây conflict | TTL tự hết hạn         |
| **Mạng Bị Đứt**  | Single point failure    | Không ảnh hưởng     | Cần đa số node         |

### 🛠️ Chiến Lược Xử Lý Lỗi

```typescript
// Xử lý lỗi cho Pessimistic Lock
async xuLyLoiPessimistic<T>(thaoTac: () => Promise<T>): Promise<T> {
  try {
    return await thaoTac()
  } catch (error) {
    if (error.code === 'LOCK_TIMEOUT') {
      throw new ServiceUnavailableException('Tài nguyên đang bị khóa tạm thời')
    }
    if (error.code === 'DEADLOCK_DETECTED') {
      // Database đã tự động rollback
      throw new ConflictException('Phát hiện deadlock, vui lòng thử lại')
    }
    throw error
  }
}

// Xử lý lỗi cho Optimistic Lock
async xuLyLoiOptimistic<T>(thaoTac: () => Promise<T>, maxRetries = 3): Promise<T> {
  for (let lanThu = 0; lanThu < maxRetries; lanThu++) {
    try {
      return await thaoTac()
    } catch (error) {
      if (error instanceof OptimisticLockVersionMismatchError) {
        if (lanThu === maxRetries - 1) {
          throw new ConflictException('Tài nguyên đã bị thay đổi bởi process khác')
        }
        // Exponential backoff - đợi 100ms, 200ms, 400ms...
        await this.delay(100 * Math.pow(2, lanThu))
        continue
      }
      throw error
    }
  }
}

// Xử lý lỗi cho Redlock
async xuLyLoiRedlock<T>(thaoTac: () => Promise<T>): Promise<T> {
  try {
    return await thaoTac()
  } catch (error) {
    if (error.message.includes('Failed to acquire lock')) {
      throw new ServiceUnavailableException('Dịch vụ tạm thời không khả dụng')
    }
    if (error.message.includes('Lock extended failed')) {
      throw new RequestTimeoutException('Thao tác mất quá nhiều thời gian')
    }
    if (error.message.includes('Redis cluster')) {
      throw new ServiceUnavailableException('Dịch vụ lock phân tán không khả dụng')
    }
    throw error
  }
}
```

---

## 🎪 Hướng Dẫn Chọn Loại Khóa Phù Hợp

### 📊 Bảng Quyết Định Nhanh

```typescript
// Dịch vụ hỗ trợ quyết định loại khóa
@Injectable()
export class DichVuQuyetDinhKhoa {
  chonLoaiKhoa(tieuChi: TieuChiKhoa): KetQuaKhuyenNghi {
    const { mucDoDongThoi, yeuCauNhatQuan, soLuongServer, thoiGianThaoTac, doTreeMang, dungLuongDuLieu, chapNhanLoi } =
      tieuChi

    // Logic quyết định
    if (soLuongServer > 1) {
      return this.danhGiaKhoaPhanTan(tieuChi)
    }

    if (mucDoDongThoi === 'thap' && yeuCauNhatQuan === 'manh') {
      return {
        loaiKhoa: 'pessimistic',
        doTinCay: 'cao',
        lyDo: 'Ít người dùng đồng thời nhưng cần tính nhất quán mạnh',
        viDu: 'Giao dịch ngân hàng, thanh toán',
      }
    }

    if (mucDoDongThoi === 'cao' && chapNhanLoi === 'cao') {
      return {
        loaiKhoa: 'optimistic',
        doTinCay: 'cao',
        lyDo: 'Nhiều người dùng đồng thời và chấp nhận retry',
        viDu: 'Cập nhật profile, bình luận, like/share',
      }
    }

    return this.danhGiaKetHop(tieuChi)
  }

  private danhGiaKhoaPhanTan(tieuChi: TieuChiKhoa): KetQuaKhuyenNghi {
    if (tieuChi.yeuCauNhatQuan === 'cuoiCung') {
      return {
        loaiKhoa: 'optimistic',
        doTinCay: 'trungBinh',
        lyDo: 'Chấp nhận tính nhất quán cuối cùng, tránh phức tạp phân tán',
        viDu: 'Cập nhật thống kê, metrics',
      }
    }

    return {
      loaiKhoa: 'redlock',
      doTinCay: 'cao',
      lyDo: 'Triển khai nhiều server cần đồng bộ phân tán',
      viDu: 'Scheduled jobs, xử lý file, sync data',
    }
  }
}

interface TieuChiKhoa {
  mucDoDongThoi: 'thap' | 'trungBinh' | 'cao' // < 10, 10-100, 100+ users
  yeuCauNhatQuan: 'cuoiCung' | 'manh' | 'nghiemNgat' // eventual, strong, strict
  soLuongServer: number // 1, 2-5, 5+
  thoiGianThaoTac: number // milliseconds
  doTreeMang: number // milliseconds
  dungLuongDuLieu: 'nho' | 'trungBinh' | 'lon' // small, medium, large
  chapNhanLoi: 'thap' | 'trungBinh' | 'cao' // low, medium, high
}
```

### 🎯 Các Trường Hợp Sử Dụng Cụ Thể

| Trường Hợp                   | Loại Khóa Khuyến Nghị | Lý Do                                              |
| ---------------------------- | --------------------- | -------------------------------------------------- |
| **💰 Chuyển Tiền Ngân Hàng** | Pessimistic           | Không chấp nhận sai số, dữ liệu tài chính          |
| **📦 Quản Lý Kho Hàng**      | Optimistic            | Đồng thời cao, thỉnh thoảng có conflict            |
| **👤 Cập Nhật Profile User** | Optimistic            | Do user tự cập nhật, có thể retry                  |
| **⏰ Scheduled Jobs**        | Redlock               | Đồng bộ nhiều server, tránh trùng lặp              |
| **🔄 Làm Mới Cache**         | Redlock               | Tránh nhiều server cùng làm việc trùng lặp         |
| **📁 Xử Lý File**            | Redlock               | Queue phân tán, xử lý từng file một lần            |
| **⚙️ Cập Nhật Cấu Hình**     | Pessimistic           | Thay đổi quan trọng của hệ thống                   |
| **📊 Tổng Hợp Analytics**    | Optimistic            | Khối lượng lớn, chấp nhận tính nhất quán cuối cùng |
| **🛒 Xử Lý Đơn Hàng**        | Pessimistic           | Giao dịch thương mại quan trọng                    |
| **📝 Xuất Bản Nội Dung**     | Optimistic            | Do user điều khiển, chấp nhận retry                |

### 🛠️ Ví Dụ Thực Tế Từng Ngành

```typescript
// 1. Hệ Thống E-commerce
@Injectable()
export class DichVuXuLyDonHang {
  // Dùng Pessimistic cho thanh toán (tiền bạc)
  async xuLyThanhToan(donHangId: string) {
    return await this.dataSource.transaction(async (manager) => {
      const donHang = await manager.findOne(DonHang, {
        where: { id: donHangId },
        lock: { mode: 'pessimistic_write' }, // Khóa cứng
      })

      // Quan trọng: Không được phép có race condition
      return this.thucHienThanhToan(donHang, manager)
    })
  }

  // Dùng Optimistic cho cập nhật kho (có thể retry)
  async capNhatKhoHang(sanPhamId: string, soLuong: number) {
    return await this.dichVuKhoHang.capNhatVoiOptimisticLock(sanPhamId, soLuong)
  }

  // Dùng Redlock cho đồng bộ trạng thái đơn hàng (nhiều server)
  async dongBoTrangThaiDonHang(donHangId: string) {
    return await this.distributedLockService.executeWithLock({
      resource: `don-hang-sync:${donHangId}`,
      operation: () => this.thucHienDongBo(donHangId),
    })
  }
}

// 2. Hệ Thống Quản Lý Nội Dung (CMS)
@Injectable()
export class DichVuNoiDung {
  // Dùng Optimistic cho chỉnh sửa nội dung (nhiều editor)
  async capNhatNoiDung(noiDungId: string, capNhat: CapNhatNoiDung) {
    return await this.optimisticLockService.executeWithRetry({
      operation: () => this.noiDungRepository.capNhatVoiVersion(noiDungId, capNhat),
      maxRetries: 5,
    })
  }

  // Dùng Redlock cho xuất bản nội dung (tránh publish trùng lặp)
  async xuatBanNoiDung(noiDungId: string) {
    return await this.distributedLockService.executeWithLock({
      resource: `noi-dung-publish:${noiDungId}`,
      operation: () => this.thucHienXuatBan(noiDungId),
      options: { ttl: 60000 }, // Khóa trong 1 phút
    })
  }
}

// 3. Hệ Thống Phân Tích (Analytics)
@Injectable()
export class DichVuPhanTich {
  // Dùng Redlock cho job phân tích phân tán
  async xuLyPhanTichTheoGio() {
    const gio = new Date().getHours()

    return await this.distributedLockService.executeWithLock({
      resource: `phan-tich-hang-gio:${gio}`,
      operation: () => this.thucHienPhanTichTheoGio(),
      options: { ttl: 3600000 }, // Khóa trong 1 giờ
    })
  }

  // Dùng Optimistic cho cập nhật metrics user
  async capNhatMetricsUser(userId: string, metrics: UserMetrics) {
    return await this.userMetricsService.capNhatVoiOptimisticLock(userId, metrics)
  }
}
```

---

## 🏛️ Phương Pháp Kết Hợp (Hybrid)

### 1. 🔄 Khóa Đa Cấp

```typescript
// Kết hợp nhiều cơ chế khóa để tối ưu hiệu suất
@Injectable()
export class DichVuKhoaKetHop {
  constructor(
    private pessimisticLockService: PessimisticLockService,
    private optimisticLockService: OptimisticLockService,
    private distributedLockService: DistributedLockService,
  ) {}

  // Cấp 1: Khóa phân tán để đồng bộ giữa các server
  // Cấp 2: Khóa pessimistic cục bộ cho dữ liệu quan trọng
  async xuLyDonHangVoiKhoaKetHop(donHangId: string) {
    // Đầu tiên: Khóa phân tán để đồng bộ giữa các server
    return await this.distributedLockService.executeWithLock({
      resource: `xu-ly-don-hang:${donHangId}`,
      operation: async () => {
        // Thứ hai: Khóa pessimistic cục bộ cho dữ liệu quan trọng
        return await this.pessimisticLockService.executeWithLock({
          resource: `don-hang:${donHangId}`,
          operation: () => this.thucHienXuLyDonHang(donHangId),
        })
      },
      options: { ttl: 30000 }, // Khóa trong 30 giây
    })
  }

  // Optimistic với distributed fallback
  async capNhatVoiFallback<T>(resource: string, thaoTac: () => Promise<T>): Promise<T> {
    try {
      // Thử optimistic trước (nhanh nhất)
      return await this.optimisticLockService.executeWithRetry({
        operation: thaoTac,
        maxRetries: 3,
      })
    } catch (error) {
      if (error instanceof OptimisticLockVersionMismatchError) {
        // Fallback sang distributed lock
        console.log('Optimistic lock failed, switching to distributed lock')
        return await this.distributedLockService.executeWithLock({
          resource,
          operation: thaoTac,
          options: { ttl: 10000 },
        })
      }
      throw error
    }
  }
}
```

### 2. 📈 Chiến Lược Khóa Thích Ứng

```typescript
// Tự động chọn chiến lược khóa dựa trên tình hình thực tế
@Injectable()
export class DichVuKhoaThichUng {
  private metrics = new Map<string, ThongSoKhoa>()

  async thucHienVoiKhoaThichUng<T>(resource: string, thaoTac: () => Promise<T>): Promise<T> {
    const chienLuoc = this.xacDinhChienLuocKhoa(resource)

    switch (chienLuoc) {
      case 'pessimistic':
        return this.pessimisticLockService.executeWithLock({ resource, operation: thaoTac })

      case 'optimistic':
        return this.optimisticLockService.executeWithRetry({ operation: thaoTac })

      case 'distributed':
        return this.distributedLockService.executeWithLock({
          resource,
          operation: thaoTac,
          options: { ttl: 30000 },
        })

      default:
        throw new Error('Không xác định được chiến lược khóa')
    }
  }

  private xacDinhChienLuocKhoa(resource: string): ChienLuocKhoa {
    const thongSo = this.metrics.get(resource)

    if (!thongSo) {
      return 'optimistic' // Mặc định dùng optimistic cho resource mới
    }

    // Xung đột cao -> dùng pessimistic
    if (thongSo.tyLeXungDot > 0.3) {
      return 'pessimistic'
    }

    // Có xung đột giữa các instance -> dùng distributed
    if (thongSo.xungDotGiuaInstance > 0) {
      return 'distributed'
    }

    // Xung đột thấp -> dùng optimistic
    return 'optimistic'
  }

  // Theo dõi và điều chỉnh chiến lược dựa trên hiệu suất
  @Cron('*/5 * * * *') // Mỗi 5 phút
  async dieuChinhChienLuocKhoa() {
    for (const [resource, thongSo] of this.metrics.entries()) {
      if (thongSo.doTreTrungBinh > 1000 && thongSo.chienLuoc === 'pessimistic') {
        // Chuyển sang optimistic nếu pessimistic quá chậm
        console.log(`Switching ${resource} from pessimistic to optimistic due to high latency`)
        this.capNhatChienLuoc(resource, 'optimistic')
      }

      if (thongSo.tyLeXungDot > 0.5 && thongSo.chienLuoc === 'optimistic') {
        // Chuyển sang pessimistic nếu quá nhiều conflict
        console.log(`Switching ${resource} from optimistic to pessimistic due to high conflict rate`)
        this.capNhatChienLuoc(resource, 'pessimistic')
      }
    }
  }

  private capNhatChienLuoc(resource: string, chienLuocMoi: ChienLuocKhoa) {
    const thongSo = this.metrics.get(resource)
    if (thongSo) {
      thongSo.chienLuoc = chienLuocMoi
      this.metrics.set(resource, thongSo)
    }
  }
}

interface ThongSoKhoa {
  tyLeXungDot: number // 0.0 - 1.0
  doTreTrungBinh: number // milliseconds
  xungDotGiuaInstance: number // count
  chienLuoc: ChienLuocKhoa
}

type ChienLuocKhoa = 'pessimistic' | 'optimistic' | 'distributed'
```

---

## 📊 Performance Comparison Summary

### ⚡ Throughput Comparison

| Scenario                              | Pessimistic | Optimistic | Redlock    |
| ------------------------------------- | ----------- | ---------- | ---------- |
| **Low Concurrency (1-10 users)**      | ⭐⭐⭐      | ⭐⭐⭐⭐⭐ | ⭐⭐⭐     |
| **Medium Concurrency (10-100 users)** | ⭐⭐        | ⭐⭐⭐⭐⭐ | ⭐⭐⭐     |
| **High Concurrency (100+ users)**     | ⭐          | ⭐⭐⭐⭐   | ⭐⭐⭐     |
| **Multi-Instance Deployment**         | ❌          | ⭐⭐       | ⭐⭐⭐⭐⭐ |

### 🎯 Consistency Guarantees

| Aspect                        | Pessimistic | Optimistic | Redlock   |
| ----------------------------- | ----------- | ---------- | --------- |
| **Data Integrity**            | 100%        | 95-99%     | 98-99%    |
| **Race Condition Prevention** | Perfect     | Good       | Very Good |
| **Distributed Consistency**   | N/A         | Poor       | Excellent |
| **Conflict Resolution**       | Automatic   | Manual     | Automatic |

### 🚀 Scalability Factors

| Factor                     | Pessimistic | Optimistic | Redlock   |
| -------------------------- | ----------- | ---------- | --------- |
| **Horizontal Scaling**     | Poor        | Good       | Excellent |
| **Resource Utilization**   | High        | Low        | Medium    |
| **Network Dependencies**   | None        | None       | High      |
| **Operational Complexity** | Low         | Medium     | High      |

---

## 🎯 Final Recommendations

### 📋 Quick Decision Guide

**Use Pessimistic Lock when:**

- ✅ Financial transactions or critical data
- ✅ Low concurrency requirements
- ✅ Single-instance deployment
- ✅ Zero tolerance for data inconsistency
- ✅ Simple implementation preferred

**Use Optimistic Lock when:**

- ✅ High-concurrency applications
- ✅ User-driven updates (profiles, content)
- ✅ Acceptable retry logic
- ✅ Fast response time critical
- ✅ Single-instance deployment

**Use Redlock when:**

- ✅ Multi-instance deployments
- ✅ Distributed job coordination
- ✅ Preventing duplicate operations
- ✅ Global resource management
- ✅ Cross-service coordination

### 🛠️ Implementation Checklist

**Before Implementation:**

- [ ] Analyze concurrency patterns
- [ ] Measure current performance baselines
- [ ] Identify critical vs non-critical operations
- [ ] Plan error handling strategies
- [ ] Design monitoring and alerting

**During Implementation:**

- [ ] Implement proper timeout handling
- [ ] Add comprehensive logging
- [ ] Create performance metrics
- [ ] Test with realistic load
- [ ] Validate consistency guarantees

**After Implementation:**

- [ ] Monitor lock performance
- [ ] Track error rates and patterns
- [ ] Analyze bottlenecks
- [ ] Optimize based on metrics
- [ ] Plan for scaling needs

---

**🎊 Choose the right locking mechanism để balance performance, consistency, và complexity cho your specific NestJS application needs!**
