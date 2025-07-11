# Cơ Chế Đảm Bảo Tính Toàn Vẹn Dữ Liệu Trong Hệ Thống Chuyển Điểm

## Giới thiệu

Tài liệu này mô tả cơ chế đảm bảo tính toàn vẹn dữ liệu trong hệ thống chuyển điểm của ứng dụng. Nguyên tắc cốt lõi là: **Tổng điểm của hai người dùng trước và sau khi thực hiện giao dịch chuyển điểm phải bằng nhau**.

## Nguyên tắc bảo toàn điểm

Trong mọi giao dịch chuyển điểm giữa hai người dùng A và B, hệ thống đảm bảo:

```
Balance(A) + Balance(B) trước giao dịch = Balance(A) + Balance(B) sau giao dịch
```

Điều này đảm bảo không có điểm nào bị "tạo ra" hoặc "mất đi" trong quá trình chuyển điểm.

## Cơ chế thực hiện

### 1. Sử dụng MongoDB Transactions

- Tất cả các thao tác đọc/ghi số dư được thực hiện trong một transaction
- Cấu hình transaction với readConcern và writeConcern mạnh để đảm bảo tính nhất quán
- Nếu có bất kỳ lỗi nào, toàn bộ transaction sẽ được rollback

### 2. Kiểm tra trước và sau khi chuyển điểm

- Lưu tổng điểm của hai người dùng trước khi thực hiện giao dịch
- Sau khi cập nhật số dư, đọc lại dữ liệu từ database để tính tổng điểm mới
- So sánh tổng điểm trước và sau, nếu không bằng nhau thì rollback transaction

### 3. Atomic Operations

- Sử dụng $inc để cập nhật số dư một cách nguyên tử
- Kết hợp với điều kiện kiểm tra số dư để tránh số dư âm

```javascript
// Ví dụ:
await User.updateOne(
  { _id: sender._id, balance: { $gte: amount } }, // Điều kiện kiểm tra
  { $inc: { balance: -amount } } // Atomic operation
);
```

### 4. Ghi log kiểm toán

- Ghi lại đầy đủ thông tin về số dư trước và sau khi chuyển
- Tạo log kiểm tra tính toàn vẹn dữ liệu riêng biệt
- Lưu hash giao dịch để đảm bảo không bị sửa đổi

### 5. Xử lý lỗi

- Nếu phát hiện tổng điểm không khớp, giao dịch sẽ bị hủy bỏ
- Ghi log chi tiết về lỗi để điều tra
- Thông báo cho admin về vấn đề toàn vẹn dữ liệu

## Mã nguồn tham khảo

### Kiểm tra tổng điểm trong giao dịch chuyển điểm

```javascript
// Lưu tổng điểm trước khi thực hiện giao dịch
const totalBalanceBefore = sender.balance + receiver.balance;

// Cập nhật số dư người gửi và người nhận
// ...

// Kiểm tra tổng điểm sau khi thực hiện giao dịch
const updatedSender = await User.findOne({ _id: sender._id }).session(session);
const updatedReceiver = await User.findOne({ _id: receiver._id }).session(session);
const totalBalanceAfter = updatedSender.balance + updatedReceiver.balance;

// Đảm bảo tổng điểm trước và sau khi chuyển là không đổi
if (totalBalanceBefore !== totalBalanceAfter) {
  throw new ApiError(`Lỗi toàn vẹn dữ liệu: Tổng điểm trước (${totalBalanceBefore}) và sau (${totalBalanceAfter}) không khớp`, 500);
}
```

### Ghi log kiểm tra tính toàn vẹn

```javascript
await auditService.logBalanceIntegrityCheck(
  transaction,
  {
    totalBalanceBefore,
    totalBalanceAfter,
    senderBalanceBefore: sender.balance,
    senderBalanceAfter: updatedSender.balance,
    receiverBalanceBefore: receiver.balance,
    receiverBalanceAfter: updatedReceiver.balance
  },
  clientIp,
  userAgent
);
```

## Trường hợp đặc biệt: Admin chuyển điểm

Khi admin chuyển điểm cho người dùng, không áp dụng nguyên tắc bảo toàn tổng điểm, vì đây là trường hợp "tạo điểm" hợp lệ. Tuy nhiên, hệ thống vẫn kiểm tra:

```
receiverBalanceAfter = receiverBalanceBefore + amount
```

## Kết luận

Cơ chế này đảm bảo tính toàn vẹn dữ liệu trong hệ thống chuyển điểm, ngăn chặn các lỗi có thể dẫn đến mất mát hoặc tạo điểm không hợp lệ. Việc kết hợp MongoDB transactions, atomic operations và kiểm tra tổng điểm tạo nên một hệ thống đáng tin cậy và an toàn. 