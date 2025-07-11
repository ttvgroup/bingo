# Hướng Dẫn Định Dạng Ngày/Tháng/Năm GMT+7 và Kiểm Tra Vé Cược

## 1. Định Dạng Ngày Tháng

Hệ thống sử dụng định dạng ngày/tháng/năm theo múi giờ GMT+7 (Việt Nam) cho tất cả các chức năng liên quan đến thời gian. Cụ thể:

- **Định dạng hiển thị**: `DD/MM/YYYY` (Ví dụ: 15/08/2023)
- **Định dạng hiển thị có giờ**: `DD/MM/YYYY HH:mm` (Ví dụ: 15/08/2023 14:30)
- **Múi giờ**: GMT+7 (Việt Nam, Bangkok, Jakarta)

## 2. Ngày Đặt Cược và Ngày Kết Quả

### 2.1. Ngày đặt cược

Khi đặt cược, người chơi có thể chỉ định ngày xổ số mà họ muốn tham gia, hoặc hệ thống sẽ sử dụng ngày hiện tại (theo GMT+7) làm ngày đặt cược mặc định. Ngày đặt cược phải tuân theo các quy tắc sau:

- **Định dạng**: DD/MM/YYYY
- **Phạm vi hợp lệ**: Chỉ đặt cược cho ngày hiện tại hoặc tương lai (trong phạm vi quy định)
- **Thời gian đặt cược**: Tuân thủ theo quy định thời gian đặt cược trong ngày (hiện tại là 00:01 - 15:30 GMT+7)

### 2.2. Ngày kết quả

Ngày kết quả xổ số được xác định khi admin nhập kết quả vào hệ thống. Hệ thống sẽ tự động so khớp ngày kết quả với ngày đặt cược để xác định vé trúng thưởng.

## 3. Quy Tắc Kiểm Tra Vé Cược

### 3.1. Điều kiện để vé cược được xem xét trúng thưởng

Một vé cược chỉ được xem xét trúng thưởng khi đáp ứng TẤT CẢ các điều kiện sau:

1. **Số cược trùng khớp** với số trong kết quả xổ số (tùy theo loại cược)
2. **Ngày đặt cược trùng khớp** với ngày kết quả xổ số (theo định dạng ngày/tháng/năm GMT+7)
3. **Mã tỉnh** của cược trùng khớp với mã tỉnh trong kết quả xổ số

### 3.2. Trạng thái kiểm tra ngày tháng

Mỗi vé cược sẽ có một trạng thái kiểm tra ngày tháng sau khi được xử lý:

- **matched**: Ngày đặt cược khớp với ngày kết quả
- **mismatched**: Ngày đặt cược không khớp với ngày kết quả
- **not_checked**: Chưa kiểm tra (vé chưa được xử lý)

### 3.3. Trường hợp ngày không khớp

Nếu ngày đặt cược không khớp với ngày kết quả, vé cược sẽ được đánh dấu là "thua" ngay cả khi số cược trùng khớp với kết quả. Hệ thống sẽ thông báo cho người chơi về tình trạng này.

## 4. Cách Sử Dụng Trong API

### 4.1. Đặt cược với ngày cụ thể

```
POST /api/bets
{
  "numbers": "23",
  "betType": "2D",
  "amount": 10000,
  "provinceCode": "HCM",
  "betDate": "15/08/2023"  // Tùy chọn, nếu không cung cấp sẽ dùng ngày hiện tại
}
```

### 4.2. Xem thông tin vé cược

```
GET /api/bets/123456

Kết quả:
{
  "success": true,
  "data": {
    "id": "123456",
    "numbers": "23",
    "betType": "2D",
    "amount": 10000,
    "provinceCode": "HCM",
    "betDate": "15/08/2023",
    "resultDate": "15/08/2023",
    "dateMatchStatus": "matched",
    "status": "won",
    "winAmount": 700000,
    "createdAt": "15/08/2023 10:30"
  }
}
```

## 5. Lưu ý Quan Trọng

- **Khớp ngày chính xác**: Vé cược chỉ được xem xét trúng thưởng khi ngày cược và ngày kết quả trùng khớp chính xác (DD/MM/YYYY).
- **Kiểm tra múi giờ**: Tất cả thao tác liên quan đến ngày tháng đều được xử lý theo múi giờ GMT+7.
- **Độ chính xác**: Hệ thống sẽ so sánh ngày mà không xem xét thời gian cụ thể trong ngày.
- **Thông báo**: Người chơi sẽ luôn được thông báo về trạng thái khớp ngày tháng của vé cược. 