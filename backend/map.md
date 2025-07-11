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
  │   ├── userController.js  # Quản lý người dùng
  │   └── walletController.js # Quản lý ví điện tử với chức năng deposit, withdraw và transfer
  ├── data/                  # Dữ liệu tĩnh
  │   ├── bet_types.json     # Cấu hình loại cược
  │   └── weekly_kqxs.json   # Dữ liệu KQXS hàng tuần
  ├── docs/                  # Tài liệu dự án
  │   └── transfer-system-improvements.md # Tài liệu cải tiến hệ thống chuyển điểm
  ├── logs/                  # Thư mục chứa log
  │   ├── combined.log       # Log tổng hợp
  │   └── error.log          # Log lỗi
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
  │   ├── auditService.js    # Quản lý log kiểm toán
  │   ├── betService.js      # Xử lý cược với transaction
  │   ├── cacheService.js    # Quản lý cache
  │   ├── lotteryService.js  # Xử lý xổ số
  │   ├── resultService.js   # Xử lý kết quả với transaction
  │   ├── resultVerificationService.js # Xác minh kết quả xổ số
  │   └── telegramService.js # Tích hợp Telegram
  ├── utils/                 # Tiện ích
  │   ├── asyncHandler.js    # Xử lý bất đồng bộ
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
| - index.js   |      | - auditService  |      | - User.js           |
| - redis.js   |      | - betService.js |      | - Bet.js            |
+--------------+      | - cacheService  |      | - Result.js         |
        ^             | - resultService |      | - Transaction.js    |
        |             | - resultVerify  |      | - AuditLog.js       |
        |             | - telegramSvc   |      | - ResultHistory.js  |
        |             +-----------------+      +---------------------+
        |                     ^                
        |                     |                
+-------+---------+    +------+------+
| utils/          |    | data/       |
| - asyncHandler  |    | - bet_types |
| - error.js      |    | - weekly_kqxs|
| - helper.js     |    +-------------+
| - logger.js     |
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

### 5. Xác minh kết quả
- **services/resultVerificationService.js** - Đảm bảo tính minh bạch của kết quả:
  - Kiểm tra tính hợp lệ của kết quả
  - Xác minh kết quả theo nhiều nguồn
  - Lưu trữ lịch sử thay đổi kết quả
  - Tạo hash bảo mật cho kết quả

### 6. Quản lý ví điện tử với Transfer
- **controllers/walletController.js** - Quản lý các giao dịch ví:
  - Gửi yêu cầu nạp tiền và chờ admin xác nhận
  - Gửi yêu cầu rút tiền và chờ admin xử lý
  - Chuyển tiền trực tiếp đến người dùng khác thông qua Telegram ID
  - Admin có thể chuyển tiền cho người dùng bất kỳ
  - Sử dụng MongoDB transactions để đảm bảo tính nhất quán dữ liệu
  - Cập nhật số dư với atomic operations
  - Hiển thị lịch sử giao dịch theo hướng (gửi/nhận)
  - Cập nhật cache Redis khi số dư thay đổi

### 7. Graceful Shutdown
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

### Wallet và Transfer API
- `POST /api/wallet/deposit/request` - Gửi yêu cầu nạp tiền
- `POST /api/wallet/withdraw/request` - Gửi yêu cầu rút tiền
- `POST /api/wallet/transfer` - Chuyển điểm cho người khác
- `GET /api/wallet/transactions` - Lấy lịch sử giao dịch
- `POST /api/admin/wallet/deposit/approve` - Admin phê duyệt nạp tiền
- `POST /api/admin/wallet/withdraw/approve` - Admin phê duyệt rút tiền
- `POST /api/admin/wallet/transfer` - Admin chuyển điểm cho người dùng
- `POST /api/wallet/transfer/approve` - Xác nhận chuyển điểm bằng 2FA

## Cải Tiến Bảo Mật

1. **Xác thực thiết bị**: Thay thế IP restriction bằng xác thực thiết bị qua QR code
2. **Hash toàn vẹn**: Đảm bảo tính toàn vẹn dữ liệu cho cược, kết quả và giao dịch
3. **Xác thực hai lớp**: Kết hợp đăng nhập Telegram và xác thực thiết bị
4. **Xử lý transaction**: Sử dụng MongoDB transaction để đảm bảo tính nhất quán dữ liệu
5. **Atomic operations**: Sử dụng $inc, $set để tránh race condition
6. **Validation chặt chẽ**: Kiểm tra và làm sạch dữ liệu đầu vào
7. **Cache thông minh**: Quản lý cache với TTL và fallback
8. **Cải tiến hệ thống transfer**: Sử dụng distributed lock với Redis, xác thực 2FA và transaction an toàn

## Cải Tiến Hiệu Năng

1. **Indexing tối ưu**: Tạo index cho các trường thường xuyên truy vấn
2. **Compound index**: Tạo index kết hợp cho các truy vấn phức tạp
3. **Quản lý cache**: Chiến lược cache với TTL phù hợp cho từng loại dữ liệu
4. **Projection**: Chỉ lấy các trường cần thiết khi truy vấn
5. **Pagination**: Phân trang cho tất cả API trả về nhiều kết quả
6. **Graceful shutdown**: Đóng kết nối an toàn khi tắt server
7. **Xử lý bất đồng bộ**: Sử dụng asyncHandler để xử lý lỗi trong middleware
8. **Distributed locks**: Sử dụng Redis để đảm bảo các giao dịch không bị conflict

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
TRANSFER_MIN_AMOUNT=10
TRANSFER_LARGE_AMOUNT_THRESHOLD=1000
MONGO_WRITE_CONCERN=majority
MONGO_READ_CONCERN=majority
```

## Hướng Dẫn Cài Đặt và Cấu Hình

### Yêu Cầu Hệ Thống
- Node.js 18.x trở lên
- MongoDB 5.0 trở lên
- Redis 6.0 trở lên
- PM2 (để quản lý process)

### 1. Cài Đặt trên Windows

#### Cài đặt Node.js và npm
1. Tải và cài đặt Node.js từ trang chủ: https://nodejs.org/
2. Xác nhận cài đặt thành công:
   ```
   node -v
   npm -v
   ```

#### Cài đặt MongoDB (Cục bộ)
1. Tải và cài đặt MongoDB Community Edition từ trang chủ: https://www.mongodb.com/try/download/community
2. Theo hướng dẫn cài đặt, đảm bảo cài đặt MongoDB Compass
3. Tạo thư mục lưu dữ liệu: `C:\data\db`
4. Khởi động MongoDB:
   ```
   "C:\Program Files\MongoDB\Server\6.0\bin\mongod.exe" --dbpath="C:\data\db"
   ```

#### Cài đặt Redis (Cục bộ)
1. Tải Redis cho Windows từ Microsoft Archive: https://github.com/tporadowski/redis/releases
2. Giải nén và khởi động Redis:
   ```
   redis-server.exe
   ```

#### Cài đặt PM2
```
npm install -g pm2
```

#### Cấu hình Backend
1. Clone dự án: `git clone [URL_REPO] bingo`
2. Di chuyển vào thư mục backend: `cd bingo/backend`
3. Cài đặt dependencies: `npm install`
4. Tạo file .env với các biến môi trường cần thiết
5. Khởi động ứng dụng:
   - Development: `npm run dev`
   - Production: `pm2 start server.js --name "bingo-backend"`

#### Cấu hình Frontend
1. Di chuyển vào thư mục frontend: `cd ../frontend`
2. Cài đặt dependencies: `npm install`
3. Tạo file .env.local với cấu hình cần thiết
4. Khởi động ứng dụng:
   - Development: `npm start`
   - Production: `npm run build` và sau đó sử dụng một HTTP server như Nginx

### 2. Cài Đặt trên Ubuntu

#### Cài đặt Node.js và npm
```bash
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs
node -v
npm -v
```

#### Cài đặt MongoDB (Cục bộ)
```bash
# Import MongoDB public key
wget -qO - https://www.mongodb.org/static/pgp/server-6.0.asc | sudo apt-key add -

# Tạo file list cho MongoDB
echo "deb [ arch=amd64,arm64 ] https://repo.mongodb.org/apt/ubuntu $(lsb_release -cs)/mongodb-org/6.0 multiverse" | sudo tee /etc/apt/sources.list.d/mongodb-org-6.0.list

# Cập nhật package database
sudo apt-get update

# Cài đặt MongoDB
sudo apt-get install -y mongodb-org

# Khởi động MongoDB
sudo systemctl start mongod
sudo systemctl enable mongod

# Kiểm tra trạng thái
sudo systemctl status mongod
```

#### Cài đặt Redis (Cục bộ)
```bash
sudo apt update
sudo apt install redis-server

# Cấu hình Redis để chạy như một service
sudo sed -i 's/supervised no/supervised systemd/g' /etc/redis/redis.conf

# Khởi động lại Redis
sudo systemctl restart redis.service
sudo systemctl enable redis-server

# Kiểm tra trạng thái
sudo systemctl status redis
```

#### Cài đặt PM2
```bash
sudo npm install -g pm2
```

#### Cấu hình Backend
```bash
# Clone dự án
git clone [URL_REPO] bingo
cd bingo/backend

# Cài đặt dependencies
npm install

# Tạo và cấu hình file .env
cp .env.example .env
nano .env  # Cập nhật các biến môi trường

# Khởi động ứng dụng với PM2
pm2 start server.js --name "bingo-backend"
pm2 save
pm2 startup systemd
```

#### Cấu hình Frontend
```bash
cd ../frontend

# Cài đặt dependencies
npm install

# Tạo file .env.local
cp .env.example .env.local
nano .env.local  # Cập nhật cấu hình

# Build ứng dụng cho production
npm run build

# Cài đặt Nginx để phục vụ static files
sudo apt install nginx
sudo cp -r build/* /var/www/html/
```

#### Cấu hình Nginx cho Frontend
```bash
sudo nano /etc/nginx/sites-available/bingo-frontend

# Thêm nội dung sau
server {
    listen 80;
    server_name your_domain.com;
    root /var/www/html;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api {
        proxy_pass http://localhost:5000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}

# Kích hoạt site
sudo ln -s /etc/nginx/sites-available/bingo-frontend /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

### 3. Kết nối với MongoDB Atlas

1. **Đăng ký tài khoản MongoDB Atlas**: https://www.mongodb.com/cloud/atlas
2. **Tạo cluster mới**:
   - Chọn một nhà cung cấp đám mây (AWS, GCP, Azure)
   - Chọn vùng địa lý phù hợp với người dùng
   - Chọn tier M0 (miễn phí) hoặc tier cao hơn
3. **Cấu hình kết nối**:
   - Tạo user database
   - Thêm IP vào whitelist hoặc cho phép truy cập từ mọi nơi (0.0.0.0/0) cho môi trường phát triển
4. **Lấy connection string**:
   - Chọn "Connect" > "Connect your application"
   - Copy connection string và thay thế username, password
5. **Cập nhật file .env**:
   ```
   MONGO_URI=mongodb+srv://username:password@cluster0.example.mongodb.net/telegram-lottery-game?retryWrites=true&w=majority
   MONGO_WRITE_CONCERN=majority
   MONGO_READ_CONCERN=majority
   ```

### 4. Cấu hình Redis Cloud (RedisLabs)

1. **Đăng ký RedisLabs**: https://redis.com/try-free/
2. **Tạo database mới**:
   - Chọn Cloud Provider và Region
   - Chọn plan phù hợp (có free tier)
3. **Lấy thông tin kết nối**:
   - Copy endpoint URL
   - Sử dụng password được cung cấp
4. **Cập nhật file .env**:
   ```
   REDIS_URL=redis://default:password@endpoint.redis.cloud.redislabs.com:port
   ```

### 5. Cài Đặt và Cấu Hình Telegram Bot

1. **Tạo Telegram Bot**:
   - Trò chuyện với @BotFather trên Telegram
   - Sử dụng lệnh /newbot để tạo bot mới
   - Lưu lại token được cung cấp
2. **Cấu hình Webhook**:
   - Đảm bảo server có SSL (cần thiết cho webhook)
   - Cấu hình webhook: `https://api.telegram.org/bot<token>/setWebhook?url=<your_server_url>/api/webhook/telegram`
3. **Tạo Telegram Channel**:
   - Tạo kênh mới trên Telegram
   - Thêm bot vào kênh với quyền admin
   - Lấy ID kênh
4. **Cập nhật file .env**:
   ```
   TELEGRAM_BOT_TOKEN=your_bot_token
   TELEGRAM_CHANNEL_ID=your_channel_id
   ```

### 6. Cấu hình HTTPS với Let's Encrypt

#### Trên Ubuntu

```bash
sudo apt-get install certbot python3-certbot-nginx
sudo certbot --nginx -d your_domain.com
```

#### Tự động gia hạn chứng chỉ

```bash
sudo certbot renew --dry-run
# Nếu thành công, Let's Encrypt sẽ tự động gia hạn chứng chỉ
```

### 7. Backup và Phục Hồi Dữ Liệu

#### Backup MongoDB

```bash
# Backup cục bộ
mongodump --db telegram-lottery-game --out /path/to/backup

# Backup từ MongoDB Atlas
mongodump --uri "mongodb+srv://username:password@cluster0.example.mongodb.net/telegram-lottery-game" --out /path/to/backup
```

#### Phục Hồi MongoDB

```bash
# Phục hồi cục bộ
mongorestore --db telegram-lottery-game /path/to/backup/telegram-lottery-game

# Phục hồi đến MongoDB Atlas
mongorestore --uri "mongodb+srv://username:password@cluster0.example.mongodb.net" --db telegram-lottery-game /path/to/backup/telegram-lottery-game
```

### 8. Giám Sát Hệ Thống

#### Cài đặt PM2 Monitoring

```bash
pm2 install pm2-logrotate
pm2 set pm2-logrotate:max_size 10M
pm2 set pm2-logrotate:retain 7

# Giám sát trên web
pm2 install pm2-server-monit
pm2 plus  # Đăng ký PM2 Plus
```

#### Cài đặt Prometheus và Grafana (Ubuntu)

```bash
# Prometheus
wget https://github.com/prometheus/prometheus/releases/download/v2.42.0/prometheus-2.42.0.linux-amd64.tar.gz
tar xvfz prometheus-*.tar.gz
cd prometheus-*
./prometheus --config.file=prometheus.yml

# Grafana
sudo apt-get install -y apt-transport-https software-properties-common
wget -q -O - https://packages.grafana.com/gpg.key | sudo apt-key add -
echo "deb https://packages.grafana.com/oss/deb stable main" | sudo tee -a /etc/apt/sources.list.d/grafana.list
sudo apt-get update
sudo apt-get install grafana
sudo systemctl start grafana-server
sudo systemctl enable grafana-server
```

### 9. Khắc Phục Sự Cố Thường Gặp

#### MongoDB không khả dụng

1. Kiểm tra trạng thái: `sudo systemctl status mongod`
2. Khởi động lại: `sudo systemctl restart mongod`
3. Kiểm tra logs: `sudo cat /var/log/mongodb/mongod.log`
4. Xác minh kết nối: `mongo --eval "db.serverStatus()"`

#### Redis không khả dụng

1. Kiểm tra trạng thái: `sudo systemctl status redis`
2. Khởi động lại: `sudo systemctl restart redis`
3. Kiểm tra logs: `sudo cat /var/log/redis/redis-server.log`
4. Xác minh kết nối: `redis-cli ping`

#### Backend không khởi động

1. Kiểm tra logs: `pm2 logs bingo-backend`
2. Kiểm tra status: `pm2 status`
3. Khởi động lại: `pm2 restart bingo-backend`
4. Xác minh biến môi trường: `cat .env`

#### Frontend không hiển thị

1. Kiểm tra Nginx: `sudo systemctl status nginx`
2. Kiểm tra logs: `sudo cat /var/log/nginx/error.log`
3. Xác minh cấu hình: `sudo nginx -t`
4. Khởi động lại: `sudo systemctl restart nginx`
