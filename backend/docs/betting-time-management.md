# Quản Lý Thời Gian Đặt Cược

Tài liệu này mô tả cách sử dụng chức năng quản lý thời gian đặt cược trong hệ thống. Admin có thể bật/tắt chức năng đặt cược và điều chỉnh khung giờ cho phép đặt cược.

## Tổng Quan

Hệ thống cung cấp hai cơ chế kiểm soát đặt cược:

1. **Bật/Tắt Đặt Cược**: Admin có thể bật hoặc tắt hoàn toàn chức năng đặt cược, bất kể thời gian hiện tại.
2. **Khung Giờ Đặt Cược**: Admin có thể cấu hình thời gian bắt đầu và kết thúc cho phép đặt cược mỗi ngày.

Khi người dùng đặt cược, hệ thống sẽ kiểm tra cả hai điều kiện:
- Chức năng đặt cược phải được bật
- Thời gian hiện tại phải nằm trong khung giờ cho phép

## API Endpoints

### 1. Lấy Trạng Thái Đặt Cược Hiện Tại

```
GET /api/admin/config/betting/status
```

**Quyền truy cập**: Admin

**Phản hồi**:
```json
{
  "success": true,
  "data": {
    "enabled": true,
    "hours": {
      "start": { "hour": 0, "minute": 1 },
      "end": { "hour": 15, "minute": 30 }
    },
    "isWithinHours": true,
    "currentStatus": "active",
    "statusText": "Đang mở"
  }
}
```

### 2. Bật/Tắt Chức Năng Đặt Cược

```
PUT /api/admin/config/betting/toggle
```

**Quyền truy cập**: Admin (xác thực thiết bị)

**Dữ liệu gửi đi**:
```json
{
  "enabled": true
}
```

**Phản hồi**:
```json
{
  "success": true,
  "message": "Đã bật chức năng đặt cược thành công",
  "data": {
    "key": "betting_enabled",
    "value": true
  }
}
```

### 3. Cập Nhật Khung Giờ Đặt Cược

```
PUT /api/admin/config/betting/hours
```

**Quyền truy cập**: Admin (xác thực thiết bị)

**Dữ liệu gửi đi**:
```json
{
  "startHour": 0,
  "startMinute": 1,
  "endHour": 15,
  "endMinute": 30
}
```

**Phản hồi**:
```json
{
  "success": true,
  "message": "Đã cập nhật thời gian đặt cược: 00:01 - 15:30",
  "data": {
    "start": { "hour": 0, "minute": 1 },
    "end": { "hour": 15, "minute": 30 }
  }
}
```

## Sử Dụng Trong Thực Tế

### Kịch Bản 1: Tạm Khóa Đặt Cược Để Bảo Trì

1. Admin truy cập vào hệ thống quản trị
2. Chọn "Cấu hình hệ thống" > "Quản lý đặt cược"
3. Chuyển trạng thái đặt cược sang "Tắt"
4. Hệ thống sẽ hiển thị thông báo xác nhận
5. Sau khi xác nhận, tất cả người dùng sẽ không thể đặt cược
6. Khi hoàn tất bảo trì, Admin chuyển trạng thái đặt cược sang "Bật"

### Kịch Bản 2: Điều Chỉnh Khung Giờ Đặt Cược

1. Admin truy cập vào hệ thống quản trị
2. Chọn "Cấu hình hệ thống" > "Quản lý đặt cược"
3. Điều chỉnh thời gian bắt đầu và kết thúc
4. Hệ thống sẽ hiển thị thông báo xác nhận
5. Sau khi xác nhận, khung giờ đặt cược mới sẽ được áp dụng ngay lập tức

### Kịch Bản 3: Khóa Đặt Cược Khẩn Cấp

Trong trường hợp khẩn cấp (ví dụ: phát hiện gian lận):

1. Admin truy cập vào hệ thống quản trị
2. Chọn "Cấu hình hệ thống" > "Quản lý đặt cược"
3. Nhấn nút "Khóa khẩn cấp" (tắt chức năng đặt cược)
4. Hệ thống sẽ hiển thị thông báo xác nhận
5. Sau khi xác nhận, tất cả người dùng sẽ không thể đặt cược ngay lập tức

## Ghi Log và Kiểm Toán

Mọi thay đổi đối với cấu hình đặt cược đều được ghi lại trong hệ thống kiểm toán với các thông tin:

- Admin thực hiện thay đổi
- Thời gian thay đổi
- Giá trị cũ
- Giá trị mới
- IP và thông tin thiết bị

Các log này có thể được xem trong phần "Nhật ký hệ thống" của trang quản trị.

## Lưu Ý Quan Trọng

1. Việc tắt chức năng đặt cược không ảnh hưởng đến các cược đã đặt trước đó.
2. Khi thay đổi khung giờ đặt cược, cần thông báo trước cho người dùng nếu có thể.
3. Khuyến nghị không thay đổi khung giờ đặt cược quá thường xuyên để tránh gây nhầm lẫn cho người dùng.
4. Nếu cả hai điều kiện (bật/tắt và khung giờ) mâu thuẫn nhau, hệ thống sẽ ưu tiên trạng thái bật/tắt.

## Cấu Hình Mặc Định

- Trạng thái đặt cược: Bật
- Thời gian bắt đầu: 00:01 (GMT+7)
- Thời gian kết thúc: 15:30 (GMT+7) 