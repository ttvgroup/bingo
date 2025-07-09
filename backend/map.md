# Sơ Đồ Mã Nguồn Backend

## Cấu Trúc Thư Mục

```
backend/
  ├── config/                # Cấu hình hệ thống
  │   ├── index.js           # Cấu hình chính
  │   └── redis.js           # Cấu hình Redis
  ├── controllers/           # Xử lý logic điều khiển
  │   ├── adminController.js # Quản lý admin
  │   ├── betController.js   # Quản lý đặt cược
  │   ├── resultController.js# Quản lý kết quả
  │   ├── statsController.js # Quản lý thống kê
  │   ├── transactionController.js # Quản lý giao dịch
  │   └── userController.js  # Quản lý người dùng
  ├── data/                  # Dữ liệu tĩnh
  │   ├── bet_types.json     # Cấu hình loại cược
  │   └── weekly_kqxs.json   # Dữ liệu KQXS hàng tuần
  ├── logs/                  # Thư mục chứa log
  ├── middleware/            # Middleware
  │   ├── adminAuth.js       # Xác thực admin
  │   ├── auth.js            # Xác thực người dùng
  │   └── roleAuth.js        # Phân quyền
  ├── models/                # Định nghĩa dữ liệu
  │   ├── Bet.js             # Model cược
  │   ├── Result.js          # Model kết quả
  │   ├── Transaction.js     # Model giao dịch
  │   └── User.js            # Model người dùng
  ├── routes/                # Định tuyến
  │   ├── api.js             # API chính
  │   └── userRoutes.js      # Routes người dùng
  ├── services/              # Logic nghiệp vụ
  │   ├── betService.js      # Xử lý cược
  │   ├── lotteryService.js  # Xử lý xổ số
  │   ├── resultService.js   # Xử lý kết quả
  │   └── telegramService.js # Tích hợp Telegram
  ├── utils/                 # Tiện ích
  │   ├── error.js           # Xử lý lỗi
  │   ├── helper.js          # Hàm trợ giúp
  │   └── logger.js          # Ghi log
  ├── server.js              # Điểm vào ứng dụng
  └── package.json           # Thông tin dự án
```

## Luồng Xử Lý Chính

1. **Khởi Động Ứng Dụng**: `server.js` khởi tạo Express, kết nối MongoDB và Redis
2. **Định Tuyến**: Các routes trong `/routes` định nghĩa các API endpoints
3. **Middleware**: Kiểm tra xác thực và phân quyền trước khi xử lý request
4. **Controllers**: Xử lý các request, gọi services và trả về response
5. **Services**: Chứa logic nghiệp vụ chính, tương tác với models
6. **Models**: Định nghĩa cấu trúc dữ liệu và tương tác với database

## Mối Quan Hệ Giữa Các Module

```
+-------------------+      +---------------+      +---------------+
| routes/           |----->| middleware/   |----->| controllers/  |
| - api.js          |      | - auth.js     |      | - userCtrl    |
| - userRoutes.js   |      | - adminAuth.js|      | - betCtrl     |
+-------------------+      | - roleAuth.js |      | - resultCtrl  |
                           +---------------+      | - etc...      |
                                                  +-------+-------+
                                                          |
                                                          v
+--------------+      +-----------------+      +----------+----------+
| config/      |<-----| services/       |<---->| models/             |
| - index.js   |      | - betService.js |      | - User.js           |
| - redis.js   |      | - lotteryService|      | - Bet.js            |
+--------------+      | - resultService |      | - Result.js         |
        ^             | - telegramSvc   |      | - Transaction.js    |
        |             +-----------------+      +---------------------+
        |                     ^
        |                     |
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
  winAmount: Number           // Số tiền thắng (nếu trúng)
}
```

### Result (Kết Quả)
```javascript
{
  date: Date,                 // Ngày xổ số
  weekday: String,            // Thứ trong tuần
  region: String,             // Khu vực (Miền Nam, Miền Trung, Miền Bắc)
  provinces: [{
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
  createdAt: Date             // Ngày tạo bản ghi
}
```

### Transaction (Giao Dịch)
```javascript
{
  userId: ObjectId,           // ID người dùng (tham chiếu đến User)
  type: String,               // Loại giao dịch (deposit, withdraw)
  amount: Number,             // Số tiền giao dịch
  status: String,             // Trạng thái (pending, completed, failed)
  createdAt: Date             // Ngày tạo giao dịch
}
```

## Luồng Xử Lý Chính

### 1. Xác thực người dùng
- **middleware/auth.js** - Xác thực người dùng Telegram qua `verifyTelegramAuth()`
- Kiểm tra hash từ Telegram để đảm bảo tính hợp lệ
- Phân quyền người dùng qua middleware `restrictTo()`

### 2. Đặt cược
- **controllers/betController.js** - Nhận request từ client
- **services/betService.js** - Xử lý logic đặt cược:
  - Kiểm tra thời gian đặt cược
  - Kiểm tra định dạng số
  - Kiểm tra số dư người dùng
  - Tạo cược và cập nhật số dư

### 3. Xử lý kết quả
- **controllers/resultController.js** - Quản lý kết quả xổ số
- **services/lotteryService.js** - Kiểm tra kết quả và trả thưởng:
  - Trích xuất các số từ kết quả
  - So sánh với các cược đang chờ
  - Xác định người thắng và cập nhật số dư
  - Gửi thông báo qua Telegram

### 4. Lọc và thống kê
- **services/resultService.js** - Cung cấp các chức năng lọc:
  - Lọc theo chữ số cuối
  - Lọc theo nhiều chữ số cuối
  - Thống kê tần suất xuất hiện

## Import/Export Quan Trọng

### server.js
```javascript
// Import
const express = require('express');
const mongoose = require('mongoose');
const redis = require('redis');
const helmet = require('helmet');
const cors = require('cors');
const config = require('./config');
const apiRoutes = require('./routes/api');
const logger = require('./utils/logger');

// Export
module.exports = { app, redisClient };
```

### config/index.js
```javascript
// Import
const dotenv = require('dotenv');

// Export
module.exports = {
  port, nodeEnv, logLevel,
  mongoURI, redisUrl, cacheExpiry,
  telegramBotToken, telegramChannelId,
  payoutRatios, baoLoQuantity,
  bettingHoursStart, bettingHoursEnd,
  allowedOrigins, rateLimiting
};
```

### routes/api.js
```javascript
// Import
const express = require('express');
const userController = require('../controllers/userController');
const betController = require('../controllers/betController');
const resultController = require('../controllers/resultController');
const statsController = require('../controllers/statsController');
const transactionController = require('../controllers/transactionController');
const adminController = require('../controllers/adminController');
const auth = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');
const roleAuth = require('../middleware/roleAuth');

// Export
module.exports = router;
```

### controllers/userController.js
```javascript
// Import
const User = require('../models/User');
const redisClient = require('../config/redis');
const ApiError = require('../utils/error');

// Export
exports.register = async (req, res, next) => {...};
exports.login = async (req, res, next) => {...};
exports.getProfile = async (req, res, next) => {...};
exports.updateProfile = async (req, res, next) => {...};
exports.getUser = async (req, res, next) => {...};
exports.createUser = async (req, res, next) => {...};
```

### middleware/auth.js
```javascript
// Import
const User = require('../models/User');
const ApiError = require('../utils/error');
const crypto = require('crypto');
const config = require('../config');

// Export
exports.verifyTelegramAuth = async (req, res, next) => {...};
exports.restrictTo = (...roles) => {...};
```

### services/betService.js
```javascript
// Import
const User = require('../models/User');
const Bet = require('../models/Bet');
const redisClient = require('../config/redis');
const ApiError = require('../utils/error');
const config = require('../config');
const logger = require('../utils/logger');

// Export
exports.placeBet = async (telegramId, numbers, betType, amount, provinceCode) => {...};
exports.getUserBets = async (telegramId) => {...};
exports.getBetById = async (betId, telegramId) => {...};
exports.getBetTypes = async () => {...};
```

### services/telegramService.js
```javascript
// Import
const TelegramBot = require('node-telegram-bot-api');

// Export
exports.sendMessage = async (chatId, message) => {...};
exports.notifyWinners = async (winners, result) => {...};
```

## API Endpoints

### User API
- `POST /api/users/register` - Đăng ký người dùng mới
- `POST /api/users/login` - Đăng nhập
- `GET /api/users/me` - Lấy thông tin cá nhân
- `PUT /api/users/me` - Cập nhật thông tin cá nhân
- `GET /api/:id` - Lấy thông tin người dùng theo ID
- `POST /api/` - Tạo người dùng mới

### Bet API
- `POST /api/bets` - Đặt cược mới
- `GET /api/bets` - Lấy danh sách cược của người dùng
- `GET /api/bets/:id` - Lấy thông tin cược theo ID
- `GET /api/bet-types` - Lấy danh sách các loại cược

### Result API
- `GET /api/results/latest` - Lấy kết quả mới nhất
- `GET /api/results/:id` - Lấy kết quả theo ID
- `GET /api/results/date/:date` - Lấy kết quả theo ngày
- `GET /api/results/:resultId/filter` - Lọc kết quả theo chữ số cuối
- `GET /api/results/:resultId/filter-multi` - Lọc kết quả theo nhiều chữ số cuối
- `GET /api/results/statistics/frequency` - Thống kê tần suất chữ số cuối

### Transaction API
- `GET /api/transactions` - Lấy danh sách giao dịch của người dùng
- `POST /api/transactions/deposit` - Tạo giao dịch nạp tiền
- `POST /api/transactions/withdraw` - Tạo giao dịch rút tiền

### Stats API
- `GET /api/stats/user` - Lấy thống kê người dùng
- `GET /api/stats/public` - Lấy thống kê công khai

### Admin API
- `POST /api/admin/results` - Tạo kết quả mới
- `PUT /api/admin/results/:id` - Cập nhật kết quả
- `DELETE /api/admin/results/:id` - Xóa kết quả
- `GET /api/admin/users` - Lấy danh sách người dùng
- `GET /api/admin/bets` - Lấy danh sách cược
- `GET /api/admin/transactions` - Lấy danh sách giao dịch
- `PUT /api/admin/users/:id` - Cập nhật thông tin người dùng
- `PUT /api/admin/transactions/:id/approve` - Phê duyệt giao dịch
- `PUT /api/admin/transactions/:id/reject` - Từ chối giao dịch

## Cấu Hình Hệ Thống

### Môi Trường
- Node.js, Express
- MongoDB (database)
- Redis (cache)
- Telegram Bot API

### Các Biến Môi Trường Cần Thiết
```
PORT=5000
NODE_ENV=development
LOG_LEVEL=info
MONGO_URI=mongodb://localhost/telegram-lottery-game
REDIS_URL=redis://localhost:6379
CACHE_EXPIRY=3600
TELEGRAM_BOT_TOKEN=your_bot_token
TELEGRAM_CHANNEL_ID=your_channel_id
PAYOUT_RATIO_2D=70
PAYOUT_RATIO_3D=600
PAYOUT_RATIO_4D=5000
PAYOUT_RATIO_BAO_LO_2D=70
PAYOUT_RATIO_BAO_LO_3D=600
PAYOUT_RATIO_BAO_LO_4D=5000
BETTING_HOURS_START=0
BETTING_HOURS_END=8
ALLOWED_ORIGINS=http://localhost:3000
RATE_LIMIT_WINDOW=900000
RATE_LIMIT_MAX=100
```

## Tiện Ích

### logger.js
Module ghi log sử dụng Winston:
- Ghi log theo cấp độ: error, warn, info, debug
- Lưu log vào file và hiển thị trên console

### error.js
Lớp ApiError để xử lý lỗi chuẩn hóa:
- Định nghĩa các loại lỗi với mã HTTP tương ứng
- Hỗ trợ phân loại lỗi hệ thống và lỗi nghiệp vụ

### helper.js
Các hàm trợ giúp chung:
- Định dạng ngày tháng
- Xử lý chuỗi
- Các hàm tiện ích khác

## Security

1. **Xác Thực**: Middleware auth.js kiểm tra tính hợp lệ của người dùng Telegram
2. **Phân Quyền**: Middleware roleAuth.js kiểm tra vai trò người dùng
3. **Admin**: Middleware adminAuth.js kiểm tra quyền admin
4. **API Security**: Helmet, CORS protection
5. **Rate Limiting**: Giới hạn số lượng request

## Quy Trình Chính

### 1. Đặt Cược
1. Người dùng gửi request đặt cược với số cược và số tiền
2. Hệ thống kiểm tra thời gian và định dạng cược
3. Hệ thống kiểm tra số dư người dùng
4. Trừ tiền từ tài khoản và lưu thông tin cược

### 2. Xổ Số
1. Admin tạo kết quả xổ số mới
2. Hệ thống kiểm tra tất cả các cược chưa giải quyết
3. Xác định người thắng và tính toán tiền thưởng
4. Cập nhật số dư người dùng và trạng thái cược
5. Thông báo kết quả qua Telegram

### 3. Giao Dịch
1. Người dùng yêu cầu nạp/rút tiền
2. Hệ thống tạo giao dịch với trạng thái "pending"
3. Admin xem xét và phê duyệt/từ chối
4. Hệ thống cập nhật số dư người dùng (nếu được phê duyệt)
5. Thông báo kết quả cho người dùng

## Cách Triển Khai

1. Cài đặt Node.js và npm
2. Cài đặt MongoDB và Redis
3. Cài đặt các dependencies: `npm install`
4. Thiết lập biến môi trường (.env)
5. Chạy ứng dụng: `npm start`
