# Hệ Thống Tài Khoản Pool Cho Cược

## Giới thiệu

Tài liệu này mô tả cơ chế tài khoản Pool trong hệ thống cược, một cải tiến nhằm tăng tính minh bạch và bảo mật cho hệ thống. Tài khoản Pool hoạt động như một trung gian giữa người chơi và hệ thống, lưu trữ tất cả tiền đặt cược và thanh toán tiền thắng cược.

## Nguyên lý hoạt động

### 1. Tài khoản Pool

Tài khoản Pool là một tài khoản đặc biệt trong hệ thống với vai trò Admin, có các đặc điểm sau:
- **Telegram ID**: `system_betting_pool`
- **Tên hiển thị**: `System Betting Pool`
- **Vai trò**: `admin`
- **Mục đích**: Lưu trữ tiền đặt cược và thanh toán tiền thắng cược

### 2. Luồng giao dịch

#### 2.1. Khi người dùng đặt cược
1. Tiền cược được chuyển từ tài khoản người dùng sang tài khoản Pool
2. Hệ thống tạo hai giao dịch:
   - Giao dịch trừ tiền từ người dùng (type: `bet`)
   - Giao dịch cộng tiền cho tài khoản Pool (type: `bet_receive`)
3. Cả hai giao dịch được thực hiện trong cùng một transaction để đảm bảo tính nhất quán

#### 2.2. Khi người dùng thắng cược
1. Admin xác nhận thanh toán thông qua hàm `confirmPayouts`
2. Tiền thắng cược được chuyển từ tài khoản Pool sang tài khoản người dùng
3. Hệ thống tạo hai giao dịch:
   - Giao dịch trừ tiền từ tài khoản Pool (type: `win_payout`)
   - Giao dịch cộng tiền cho người dùng (type: `win`)
4. Cả hai giao dịch được thực hiện trong cùng một transaction để đảm bảo tính nhất quán

## Nguyên tắc bảo toàn điểm

Hệ thống áp dụng nguyên tắc bảo toàn điểm trong mọi giao dịch:

```
Tổng điểm trước giao dịch = Tổng điểm sau giao dịch
```

### Đặt cược
```
user.balance + pool.balance (trước) = user.balance + pool.balance (sau)
```

### Thanh toán tiền thắng
```
pool.balance + sum(users.balance) (trước) = pool.balance + sum(users.balance) (sau)
```

## Cơ chế đảm bảo tính toàn vẹn dữ liệu

1. **MongoDB Transactions**: Tất cả các thao tác đọc/ghi số dư được thực hiện trong một transaction
2. **Kiểm tra tổng điểm**: Lưu và kiểm tra tổng điểm trước và sau khi thực hiện giao dịch
3. **Atomic Operations**: Sử dụng `$inc` để cập nhật số dư một cách nguyên tử
4. **Ghi log đầy đủ**: Lưu chi tiết về số dư trước và sau khi thực hiện giao dịch
5. **Transaction Hash**: Tạo hash cho mỗi giao dịch để đảm bảo tính toàn vẹn

## Mã nguồn tham khảo

### Tạo hoặc lấy tài khoản Pool

```javascript
exports.getOrCreatePoolAccount = async () => {
  try {
    // Kiểm tra cache
    const cacheKey = getCacheKey('SYSTEM_POOL_ACCOUNT');
    const cachedData = await redisClient.get(cacheKey);
    
    if (cachedData) {
      return JSON.parse(cachedData);
    }
    
    // Tìm tài khoản Pool trong database
    let poolAccount = await User.findOne({ telegramId: POOL_TELEGRAM_ID });
    
    // Nếu không tồn tại, tạo mới
    if (!poolAccount) {
      poolAccount = await User.create({
        telegramId: POOL_TELEGRAM_ID,
        username: POOL_USERNAME,
        role: 'admin',
        balance: 0,
        twoFactorEnabled: false
      });
    }
    
    // Lưu vào cache
    await redisClient.setEx(cacheKey, 3600, JSON.stringify(poolAccount));
    
    return poolAccount;
  } catch (error) {
    throw new ApiError('Không thể lấy/tạo tài khoản Pool', 500);
  }
};
```

### Chuyển tiền từ người dùng đến Pool khi đặt cược

```javascript
// Lưu tổng điểm trước khi thực hiện giao dịch
const totalBalanceBefore = user.balance + poolAccount.balance;

// Cập nhật số dư người dùng
await User.findOneAndUpdate(
  { _id: userId, balance: { $gte: amount } },
  { $inc: { balance: -amount } },
  { new: true, session }
);

// Cập nhật số dư tài khoản Pool
await User.findOneAndUpdate(
  { _id: poolAccount._id },
  { $inc: { balance: amount } },
  { new: true, session }
);

// Kiểm tra tổng điểm sau khi thực hiện giao dịch
const totalBalanceAfter = updatedUser.balance + updatedPool.balance;

// Đảm bảo tổng điểm trước và sau khi chuyển là không đổi
if (totalBalanceBefore !== totalBalanceAfter) {
  throw new ApiError(`Lỗi toàn vẹn dữ liệu`, 500);
}
```

## Lợi ích của hệ thống Pool

1. **Minh bạch**: Tất cả tiền đặt cược và thanh toán đều được theo dõi qua tài khoản Pool
2. **Bảo mật**: Giảm thiểu rủi ro gian lận bằng cách áp dụng nguyên tắc bảo toàn điểm
3. **Kiểm toán**: Dễ dàng kiểm tra và đối soát số dư hệ thống
4. **Quản lý rủi ro**: Dễ dàng theo dõi tổng số tiền đặt cược và tiền thắng cược
5. **Phân quyền**: Tài khoản Pool có quyền Admin, có thể quản lý và giám sát tất cả giao dịch

## Quản lý tài khoản Pool

### Theo dõi số dư
Admin có thể theo dõi số dư tài khoản Pool thông qua giao diện quản trị hoặc API:
```
GET /api/admin/pool/balance
```

### Nạp tiền vào Pool
Khi số dư tài khoản Pool không đủ để thanh toán, Admin có thể nạp thêm tiền:
```
POST /api/admin/pool/deposit
{
  "amount": 1000000
}
```

### Báo cáo
Hệ thống cung cấp báo cáo chi tiết về hoạt động của tài khoản Pool:
```
GET /api/admin/pool/report
```

## Kết luận

Hệ thống tài khoản Pool cung cấp một cơ chế minh bạch và an toàn cho việc quản lý tiền đặt cược và thanh toán tiền thắng cược. Bằng cách áp dụng nguyên tắc bảo toàn điểm và sử dụng MongoDB Transactions, hệ thống đảm bảo tính toàn vẹn dữ liệu trong mọi giao dịch. 