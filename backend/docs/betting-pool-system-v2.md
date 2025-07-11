# Hệ Thống Tài Khoản Pool và Phê Duyệt Thanh Toán

## 1. Giới thiệu

Tài liệu này mô tả hệ thống tài khoản Pool và quy trình phê duyệt thanh toán mới trong hệ thống cược. Hệ thống được thiết kế để tăng tính minh bạch, bảo mật và kiểm soát trong việc quản lý tiền cược và thanh toán tiền thắng cược.

## 2. Tài khoản Pool

### 2.1. Định nghĩa

Tài khoản Pool là một tài khoản đặc biệt trong hệ thống, được quản lý bởi Admin nhưng không có quyền Admin. Tài khoản này đóng vai trò như một "két tiền" để lưu trữ tiền đặt cược của người chơi.

### 2.2. Đặc điểm

- **Telegram ID**: `system_betting_pool`
- **Tên hiển thị**: `System Betting Pool`
- **Vai trò**: `user` (không có quyền Admin)
- **Mục đích**: Lưu trữ tiền đặt cược của người dùng
- **Quản lý**: Chỉ Admin mới có thể khởi tạo và quản lý tài khoản Pool

### 2.3. Khởi tạo

Tài khoản Pool phải được khởi tạo bởi Admin thông qua API:

```
POST /api/admin/pool/initialize
```

Khi khởi tạo, hệ thống sẽ tạo một mã bảo mật ngẫu nhiên và lưu thông tin người tạo để đảm bảo tính minh bạch.

## 3. Quy trình đặt cược

### 3.1. Luồng xử lý

1. Người dùng đặt cược thông qua API
2. Hệ thống kiểm tra thời gian đặt cược, số dư và các điều kiện khác
3. Tiền cược được chuyển từ tài khoản người dùng sang tài khoản Pool
4. Hệ thống tạo hai giao dịch:
   - Giao dịch trừ tiền từ người dùng (type: `bet`)
   - Giao dịch cộng tiền cho tài khoản Pool (type: `bet_receive`)
5. Cả hai giao dịch được thực hiện trong cùng một transaction để đảm bảo tính nhất quán

### 3.2. Nguyên tắc bảo toàn điểm

Hệ thống áp dụng nguyên tắc bảo toàn điểm trong mọi giao dịch:

```
Tổng điểm trước giao dịch = Tổng điểm sau giao dịch
```

Cụ thể:

```
user.balance + pool.balance (trước) = user.balance + pool.balance (sau)
```

## 4. Quy trình phê duyệt thanh toán

### 4.1. Luồng xử lý

1. Hệ thống xác định người thắng cược (không tự động thanh toán)
2. Admin xem danh sách cược đã thắng chờ phê duyệt
3. Admin tạo yêu cầu phê duyệt thanh toán cho một nhóm cược
4. Admin phê duyệt hoặc từ chối yêu cầu thanh toán
5. Khi phê duyệt, tiền thắng cược được chuyển trực tiếp từ Admin đến người dùng
6. Hệ thống tạo hai giao dịch:
   - Giao dịch trừ tiền từ Admin (type: `win_payout`)
   - Giao dịch cộng tiền cho người dùng (type: `win`)

### 4.2. Trạng thái cược

- `pending`: Đang chờ kết quả
- `won`: Đã thắng, chờ thanh toán
- `lost`: Đã thua
- `cancelled`: Đã hủy

### 4.3. Trạng thái thanh toán

- `pending`: Chờ xử lý
- `pending_approval`: Đang chờ phê duyệt
- `approved`: Đã phê duyệt và thanh toán
- `rejected`: Đã từ chối thanh toán

## 5. Yêu cầu phê duyệt thanh toán

### 5.1. Cấu trúc dữ liệu

```javascript
{
  betIds: [ObjectId],       // Danh sách ID cược cần phê duyệt
  totalAmount: Number,      // Tổng số tiền cần thanh toán
  status: String,           // Trạng thái: pending, approved, rejected, cancelled
  createdAt: Date,          // Thời gian tạo yêu cầu
  processedBy: ObjectId,    // Admin xử lý yêu cầu
  processedAt: Date,        // Thời gian xử lý
  userCount: Number,        // Số lượng người dùng
  betCount: Number,         // Số lượng cược
  summary: Object,          // Thông tin tổng hợp sau khi xử lý
  notes: String             // Ghi chú (lý do từ chối...)
}
```

### 5.2. API quản lý

- `GET /api/admin/payouts/pending-bets`: Lấy danh sách cược đã thắng chờ phê duyệt
- `POST /api/admin/payouts/requests`: Tạo yêu cầu phê duyệt thanh toán
- `GET /api/admin/payouts/requests`: Lấy danh sách yêu cầu phê duyệt
- `GET /api/admin/payouts/requests/:id`: Lấy chi tiết yêu cầu phê duyệt
- `POST /api/admin/payouts/requests/:id/approve`: Phê duyệt yêu cầu thanh toán
- `POST /api/admin/payouts/requests/:id/reject`: Từ chối yêu cầu thanh toán

## 6. Lợi ích của hệ thống mới

### 6.1. Tăng tính minh bạch

- Tiền cược được lưu trữ trong tài khoản Pool riêng biệt
- Mọi giao dịch đều được ghi log đầy đủ
- Admin có thể theo dõi tổng tiền cược và tiền thắng

### 6.2. Tăng tính kiểm soát

- Admin phải phê duyệt mọi khoản thanh toán
- Có thể từ chối thanh toán trong trường hợp phát hiện gian lận
- Quy trình phê duyệt nhiều bước giảm thiểu rủi ro

### 6.3. Bảo mật cao hơn

- Tài khoản Pool không có quyền Admin
- Áp dụng nguyên tắc bảo toàn điểm trong mọi giao dịch
- Sử dụng MongoDB Transactions để đảm bảo tính nhất quán dữ liệu

## 7. Mã nguồn tham khảo

### 7.1. Khởi tạo tài khoản Pool

```javascript
exports.initializePoolAccount = async (adminId) => {
  // Kiểm tra xem tài khoản Pool đã tồn tại chưa
  let poolAccount = await User.findOne({ telegramId: POOL_TELEGRAM_ID });
  
  if (poolAccount) {
    throw new ApiError('Tài khoản Pool đã tồn tại', 400);
  }
  
  // Tạo mã bảo mật ngẫu nhiên
  const securityToken = crypto.randomBytes(32).toString('hex');
  
  // Tạo tài khoản Pool mới (không có quyền Admin)
  poolAccount = await User.create({
    telegramId: POOL_TELEGRAM_ID,
    username: POOL_USERNAME,
    role: 'user', // Không có quyền Admin
    balance: 0,
    twoFactorEnabled: false,
    metaData: {
      isPoolAccount: true,
      createdBy: adminId,
      createdAt: new Date(),
      securityToken
    }
  });
  
  return poolAccount;
};
```

### 7.2. Tạo yêu cầu phê duyệt thanh toán

```javascript
exports.createPayoutRequest = async (betIds) => {
  // Lấy danh sách cược
  const bets = await Bet.find({
    _id: { $in: betIds },
    status: 'won',
    paymentStatus: { $ne: 'approved' },
    winAmount: { $gt: 0 }
  }).populate('userId');
  
  // Tạo yêu cầu phê duyệt
  const payoutRequest = new PayoutRequest({
    betIds: bets.map(bet => bet._id),
    totalAmount: bets.reduce((sum, bet) => sum + bet.winAmount, 0),
    status: 'pending',
    userCount: [...new Set(bets.map(bet => bet.userId._id.toString()))].length,
    betCount: bets.length
  });
  
  await payoutRequest.save();
  
  // Cập nhật trạng thái cược
  await Bet.updateMany(
    { _id: { $in: betIds } },
    { paymentStatus: 'pending_approval' }
  );
  
  return payoutRequest;
};
```

### 7.3. Phê duyệt thanh toán

```javascript
exports.approvePayoutRequest = async (requestId, adminId) => {
  // Tìm yêu cầu phê duyệt
  const payoutRequest = await PayoutRequest.findById(requestId);
  
  // Lấy danh sách cược cần phê duyệt
  const bets = await Bet.find({
    _id: { $in: payoutRequest.betIds },
    status: 'won',
    paymentStatus: { $ne: 'approved' }
  }).populate('userId');
  
  // Xử lý từng cược
  for (const bet of bets) {
    // Cập nhật số dư người dùng
    await User.updateOne(
      { _id: bet.userId._id },
      { $inc: { balance: bet.winAmount } }
    );
    
    // Tạo transaction record
    // ...
    
    // Cập nhật trạng thái thanh toán của cược
    bet.paymentStatus = 'approved';
    bet.paymentConfirmedBy = adminId;
    bet.paymentConfirmedAt = new Date();
    await bet.save();
  }
  
  // Cập nhật trạng thái yêu cầu phê duyệt
  payoutRequest.status = 'approved';
  payoutRequest.processedBy = adminId;
  payoutRequest.processedAt = new Date();
  await payoutRequest.save();
};
```

## 8. Kết luận

Hệ thống tài khoản Pool và phê duyệt thanh toán mới cung cấp một cơ chế minh bạch, an toàn và có kiểm soát cho việc quản lý tiền đặt cược và thanh toán tiền thắng cược. Bằng cách tách biệt việc lưu trữ tiền cược và quy trình phê duyệt thanh toán, hệ thống giảm thiểu rủi ro và tăng tính minh bạch trong hoạt động. 