# Sơ Đồ Mã Nguồn Backend

## Cấu Trúc Thư Mục

```
backend/
  ├── config/                # Cấu hình hệ thống
  │   ├── index.js           # Cấu hình chính
  │   └── redis.js           # Cấu hình Redis nâng cao với khả năng phục hồi
  ├── controllers/           # Xử lý logic điều khiển
  │   ├── adminController.js # Quản lý admin với xác thực QR và Telegram
  │   ├── betController.js   # Quản lý đặt cược với xử lý transaction
  │   ├── resultController.js# Quản lý kết quả
  │   ├── statsController.js # Quản lý thống kê
  │   ├── transactionController.js # Quản lý giao dịch
  │   └── userController.js  # Quản lý người dùng
  ├── data/                  # Dữ liệu tĩnh
  │   ├── bet_types.json     # Cấu hình loại cược
  │   └── weekly_kqxs.json   # Dữ liệu KQXS hàng tuần
  ├── logs/                  # Thư mục chứa log
  ├── middleware/            # Middleware
  │   ├── adminAuth.js       # Xác thực admin với quản lý thiết bị và QR code
  │   ├── auth.js            # Xác thực người dùng qua Telegram
  │   ├── roleAuth.js        # Phân quyền
  │   ├── validation.js      # Xác thực và làm sạch dữ liệu đầu vào
  │   ├── twoFactorAuth.js   # Xác thực hai lớp
  │   └── rateLimit.js       # Giới hạn tốc độ truy cập
  ├── models/                # Định nghĩa dữ liệu
  │   ├── AuditLog.js        # Model ghi log hành động
  │   ├── Bet.js             # Model cược với toàn vẹn dữ liệu
  │   ├── Result.js          # Model kết quả với bảo mật nâng cao
  │   ├── ResultHistory.js   # Model lịch sử thay đổi kết quả
  │   ├── Transaction.js     # Model giao dịch
  │   └── User.js            # Model người dùng với quản lý thiết bị
  ├── routes/                # Định tuyến
  │   ├── api.js             # API chính với xác thực thiết bị
  │   └── userRoutes.js      # Routes người dùng
  ├── services/              # Logic nghiệp vụ
  │   ├── betService.js      # Xử lý cược với transaction
  │   ├── cacheService.js    # Quản lý cache
  │   ├── lotteryService.js  # Xử lý xổ số
  │   ├── resultService.js   # Xử lý kết quả với transaction
  │   └── telegramService.js # Tích hợp Telegram
  ├── utils/                 # Tiện ích
  │   ├── error.js           # Xử lý lỗi
  │   ├── helper.js          # Hàm trợ giúp
  │   └── logger.js          # Ghi log
  ├── server.js              # Điểm vào ứng dụng với graceful shutdown
  └── package.json           # Thông tin dự án
```

## Luồng Xử Lý Chính

1. **Khởi Động Ứng Dụng**: 
   - `server.js` khởi tạo Express, kết nối MongoDB và Redis
   - Cấu hình graceful shutdown để đóng kết nối an toàn
   - Xử lý lỗi toàn cục

2. **Định Tuyến**: 
   - Các routes trong `/routes` định nghĩa các API endpoints
   - Tích hợp middleware xác thực thiết bị cho admin

3. **Middleware**: 
   - Xác thực người dùng Telegram thông qua `verifyTelegramAuth()`
   - Xác thực thiết bị admin qua QR code và Telegram
   - Phân quyền dựa trên vai trò người dùng
   - Xác thực và làm sạch dữ liệu đầu vào
   - Giới hạn tốc độ truy cập API

4. **Controllers**: 
   - Xử lý các request, gọi services và trả về response
   - Kiểm tra dữ liệu đầu vào và xác thực quyền truy cập

5. **Services**: 
   - Chứa logic nghiệp vụ chính, tương tác với models
   - Sử dụng MongoDB transactions để đảm bảo tính nhất quán dữ liệu
   - Quản lý cache với Redis và TTL linh hoạt
   - Atomic operations để tránh race conditions

6. **Models**: 
   - Định nghĩa cấu trúc dữ liệu và tương tác với database
   - Tích hợp các hàm kiểm tra tính toàn vẹn dữ liệu
   - Indexing tối ưu để cải thiện hiệu năng truy vấn

## Mối Quan Hệ Giữa Các Module

```
+-------------------+      +---------------+      +---------------+
| routes/           |----->| middleware/   |----->| controllers/  |
| - api.js          |      | - auth.js     |      | - userCtrl    |
| - userRoutes.js   |      | - adminAuth.js|      | - betCtrl     |
+-------------------+      | - roleAuth.js |      | - resultCtrl  |
                           | - validation.js|      | - etc...      |
                           +---------------+      +-------+-------+
                                                          |
                                                          v
+--------------+      +-----------------+      +----------+----------+
| config/      |<-----| services/       |<---->| models/             |
| - index.js   |      | - betService.js |      | - User.js           |
| - redis.js   |      | - cacheService  |      | - Bet.js            |
+--------------+      | - resultService |      | - Result.js         |
        ^             | - telegramSvc   |      | - Transaction.js    |
        |             +-----------------+      | - AuditLog.js       |
        |                     ^                | - ResultHistory.js  |
        |                     |                +---------------------+
+-------+---------+    +------+------+
| utils/          |    | data/       |
| - error.js      |    | - bet_types |
| - helper.js     |    | - weekly_kqxs|
| - logger.js     |    +-------------+
+-----------------+
```

## Mô Hình Dữ Liệu

### User (Người Dùng)
```javascript
{
  telegramId: String,         // ID Telegram (required, unique)
  username: String,           // Tên người dùng
  balance: Number,            // Số dư (mặc định: 1000)
  role: String,               // Vai trò (user, admin, affiliate)
  affiliateCode: String,      // Mã giới thiệu (unique, sparse)
  referredBy: ObjectId,       // ID người giới thiệu
  devices: [{                 // Danh sách thiết bị đã xác thực
    deviceId: String,         // ID thiết bị
    deviceName: String,       // Tên thiết bị
    lastLogin: Date,          // Thời gian đăng nhập gần nhất
    isVerified: Boolean       // Trạng thái xác thực
  }],
  twoFactorEnabled: Boolean,  // Bật xác thực hai lớp
  telegramAuthCode: {         // Mã xác thực Telegram
    code: String,             // Mã xác thực
    expiresAt: Date           // Thời gian hết hạn
  },
  loginQrCode: {              // QR code đăng nhập
    token: String,            // Token QR
    expiresAt: Date           // Thời gian hết hạn
  },
  createdAt: Date             // Ngày tạo
}
```

### Bet (Cược)
```javascript
{
  userId: ObjectId,           // ID người dùng (tham chiếu đến User)
  numbers: String,            // Số cược (ví dụ: "23", "345")
  betType: String,            // Loại cược (2D, 3D, 4D, Bao lô 2D, Bao lô 3D, Bao lô 4D)
  amount: Number,             // Số tiền cược
  createdAt: Date,            // Ngày tạo cược
  resultId: ObjectId,         // ID kết quả (tham chiếu đến Result)
  status: String,             // Trạng thái (pending, won, lost)
  provinceCode: String,       // Mã tỉnh đặt cược
  winAmount: Number,          // Số tiền thắng (nếu trúng)
  integrityHash: String,      // Hash đảm bảo tính toàn vẹn
  ipAddress: String,          // Địa chỉ IP khi đặt cược
  deviceInfo: String,         // Thông tin thiết bị
  transactionTimestamp: Date  // Thời gian giao dịch
}
```

### Result (Kết Quả)
```javascript
{
  date: Date,                 // Ngày xổ số
  weekday: String,            // Thứ trong tuần
  region: String,             // Khu vực (Miền Nam, Miền Trung, Miền Bắc)
  provinces: [{               // Danh sách tỉnh
    name: String,             // Tên tỉnh/thành
    code: String,             // Mã tỉnh/thành
    info: String,             // Thông tin thêm
    results: {
      eighth: String,         // Giải 8 (2 số)
      seventh: String,        // Giải 7 (3 số)
      sixth: [String],        // Giải 6 (4 số)
      fifth: String,          // Giải 5 (4 số)
      fourth: [String],       // Giải 4 (5 số)
      third: [String],        // Giải 3 (5 số)
      second: String,         // Giải nhì (5 số)
      first: String,          // Giải nhất (5 số)
      special: String         // Giải đặc biệt (6 số)
    }
  }],
  createdBy: ObjectId,        // Admin tạo kết quả
  updatedBy: ObjectId,        // Admin cập nhật kết quả
  createdAt: Date,            // Ngày tạo bản ghi
  updatedAt: Date,            // Ngày cập nhật
  securityHash: String        // Hash bảo mật kết quả
}
```

### Transaction (Giao Dịch)
```javascript
{
  userId: ObjectId,           // ID người dùng (tham chiếu đến User)
  type: String,               // Loại giao dịch (deposit, withdraw, win, bet, referral)
  amount: Number,             // Số tiền giao dịch
  status: String,             // Trạng thái (pending, completed, failed, cancelled)
  description: String,        // Mô tả giao dịch
  reference: ObjectId,        // Tham chiếu đến đối tượng liên quan
  referenceModel: String,     // Loại đối tượng tham chiếu
  processedBy: ObjectId,      // Admin xử lý giao dịch
  processedAt: Date,          // Thời gian xử lý
  createdAt: Date,            // Ngày tạo giao dịch
  metaData: Mixed,            // Dữ liệu bổ sung
  transactionHash: String     // Hash bảo mật giao dịch
}
```

### AuditLog (Nhật Ký Kiểm Toán)
```javascript
{
  userId: ObjectId,           // ID người dùng thực hiện hành động
  action: String,             // Loại hành động
  ipAddress: String,          // Địa chỉ IP
  deviceInfo: String,         // Thông tin thiết bị
  targetId: ObjectId,         // ID đối tượng liên quan
  targetType: String,         // Loại đối tượng
  details: Mixed,             // Chi tiết hành động
  createdAt: Date             // Ngày tạo
}
```

### ResultHistory (Lịch Sử Kết Quả)
```javascript
{
  resultId: ObjectId,         // ID kết quả
  userId: ObjectId,           // ID người thực hiện thay đổi
  action: String,             // Loại hành động
  changeDetails: Mixed,       // Chi tiết thay đổi
  previousState: Mixed,       // Trạng thái trước
  newState: Mixed,            // Trạng thái sau
  ipAddress: String,          // Địa chỉ IP
  deviceInfo: String,         // Thông tin thiết bị
  timestamp: Date,            // Thời gian thực hiện
  securityHash: String        // Hash bảo mật
}
```

## Luồng Xử Lý Chính

### 1. Xác thực người dùng với thiết bị
- **middleware/auth.js** - Xác thực người dùng Telegram qua `verifyTelegramAuth()`
- **middleware/adminAuth.js** - Xác thực admin qua thiết bị và QR code
- Quản lý thiết bị đã xác thực và mã xác thực Telegram
- Phân quyền người dùng qua middleware `restrictTo()`

### 2. Đặt cược với transaction
- **controllers/betController.js** - Nhận request từ client
- **services/betService.js** - Xử lý logic đặt cược:
  - Khởi tạo MongoDB transaction
  - Kiểm tra thời gian đặt cược (GMT+7)
  - Kiểm tra định dạng số
  - Kiểm tra số dư người dùng
  - Tạo cược và cập nhật số dư với atomic operations
  - Tạo transaction record
  - Xóa cache liên quan
  - Commit hoặc rollback transaction

### 3. Xử lý kết quả với transaction
- **controllers/resultController.js** - Quản lý kết quả xổ số
- **services/resultService.js** - Kiểm tra kết quả và trả thưởng:
  - Khởi tạo MongoDB transaction
  - Tìm các cược đang chờ kết quả
  - Xác định người thắng và tính toán tiền thưởng
  - Cập nhật số dư người dùng với atomic operations
  - Tạo transaction record
  - Xóa cache liên quan
  - Commit hoặc rollback transaction
  - Gửi thông báo qua Telegram

### 4. Quản lý cache thông minh
- **services/cacheService.js** - Quản lý cache với Redis:
  - Định nghĩa các khóa cache chuẩn
  - Quản lý TTL cho từng loại dữ liệu
  - Fallback khi Redis không khả dụng
  - Xóa cache thông minh khi dữ liệu thay đổi
  - Cache các truy vấn phổ biến

### 5. Graceful Shutdown
- **server.js** - Xử lý tắt server an toàn:
  - Đóng kết nối HTTP server
  - Đóng kết nối Redis
  - Đóng kết nối MongoDB
  - Ghi log quá trình shutdown

## API Endpoints Mới

### Admin Authentication API
- `POST /api/admin/login/telegram/send-code` - Gửi mã xác thực qua Telegram
- `POST /api/admin/login/telegram` - Đăng nhập bằng mã xác thực Telegram
- `GET /api/admin/login/qr` - Lấy QR code để đăng nhập
- `POST /api/admin/device/register` - Đăng ký thiết bị mới
- `GET /api/admin/devices` - Lấy danh sách thiết bị đã đăng ký
- `DELETE /api/admin/devices/:deviceId` - Xóa thiết bị đã đăng ký

## Cải Tiến Bảo Mật

1. **Xác thực thiết bị**: Thay thế IP restriction bằng xác thực thiết bị qua QR code
2. **Hash toàn vẹn**: Đảm bảo tính toàn vẹn dữ liệu cho cược, kết quả và giao dịch
3. **Xác thực hai lớp**: Kết hợp đăng nhập Telegram và xác thực thiết bị
4. **Xử lý transaction**: Sử dụng MongoDB transaction để đảm bảo tính nhất quán dữ liệu
5. **Atomic operations**: Sử dụng $inc, $set để tránh race condition
6. **Validation chặt chẽ**: Kiểm tra và làm sạch dữ liệu đầu vào
7. **Cache thông minh**: Quản lý cache với TTL và fallback

## Cải Tiến Hiệu Năng

1. **Indexing tối ưu**: Tạo index cho các trường thường xuyên truy vấn
2. **Compound index**: Tạo index kết hợp cho các truy vấn phức tạp
3. **Quản lý cache**: Chiến lược cache với TTL phù hợp cho từng loại dữ liệu
4. **Projection**: Chỉ lấy các trường cần thiết khi truy vấn
5. **Pagination**: Phân trang cho tất cả API trả về nhiều kết quả
6. **Graceful shutdown**: Đóng kết nối an toàn khi tắt server

## Biến Môi Trường Cập Nhật
```
PORT=5000
NODE_ENV=development
LOG_LEVEL=info
MONGO_URI=mongodb://localhost/telegram-lottery-game
REDIS_URL=redis://localhost:6379
CACHE_TTL_SHORT=60
CACHE_TTL_MEDIUM=300
CACHE_TTL_LONG=3600
CACHE_TTL_VERY_LONG=86400
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHANNEL_ID=your_channel_id
PAYOUT_RATIO_2D=70
PAYOUT_RATIO_3D=600
PAYOUT_RATIO_4D=5000
PAYOUT_RATIO_BAO_LO_2D=70
PAYOUT_RATIO_BAO_LO_3D=600
PAYOUT_RATIO_BAO_LO_4D=5000
BETTING_HOURS_START=0
BETTING_HOURS_END=15.5
ALLOWED_ORIGINS=http://localhost:3000
RATE_LIMIT_WINDOW=900000
RATE_LIMIT_MAX=100
```

## Khởi động và Triển khai

1. Cài đặt Node.js và npm
2. Cài đặt MongoDB và Redis
3. Cài đặt các dependencies: `npm install`
4. Thiết lập biến môi trường (.env)
5. Chạy ứng dụng: `npm start`
6. Để phát triển: `npm run dev`
