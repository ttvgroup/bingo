# Cải Tiến Hệ Thống Tính Thưởng

## Tổng quan

Tài liệu này mô tả cải tiến hệ thống tính thưởng cho người chơi trong hệ thống cược xổ số. Sau khi nghiên cứu và phân tích các hệ thống cược thể thao phổ biến toàn cầu, chúng tôi đề xuất một số phương pháp nâng cao trải nghiệm người dùng và tăng tính cạnh tranh của hệ thống.

## Hệ thống hiện tại

Hiện tại, hệ thống sử dụng cách tính thưởng đơn giản với tỷ lệ cố định cho từng loại cược:

- **2D**: Tỷ lệ 1:70 (thắng 70 lần tiền cược)
- **3D**: Tỷ lệ 1:600 (thắng 600 lần tiền cược)
- **4D**: Tỷ lệ 1:5000 (thắng 5000 lần tiền cược)
- **Bao lô 2D**: Tỷ lệ 1:70 (thắng 70 lần tiền cược cho mỗi lô)
- **Bao lô 3D**: Tỷ lệ 1:600 (thắng 600 lần tiền cược cho mỗi lô)
- **Bao lô 4D**: Tỷ lệ 1:5000 (thắng 5000 lần tiền cược cho mỗi lô)

Hạn chế của hệ thống hiện tại:
1. Tỷ lệ thưởng cố định không thay đổi theo mức cược
2. Không có hệ thống khuyến khích người chơi đặt cược nhiều hơn
3. Thiếu đa dạng về loại cược và phương thức tính thưởng
4. Không có hệ thống thưởng tích lũy hoặc thưởng trung thành

## Đề xuất cải tiến

### 1. Hệ thống tỷ lệ thưởng động (Dynamic Odds)

Tỷ lệ thưởng sẽ điều chỉnh linh hoạt dựa trên các yếu tố:

- **Số tiền đặt cược**: Cược càng lớn, tỷ lệ thưởng càng hấp dẫn
- **Số lượng người đặt cược trên cùng số**: Khi nhiều người chơi cùng chọn một số, tỷ lệ thưởng giảm xuống
- **Thời gian đặt cược**: Đặt cược sớm được hưởng tỷ lệ thưởng tốt hơn

```javascript
// Ví dụ code tính tỷ lệ thưởng động
function calculateDynamicOdds(baseOdds, betAmount, betCount, timeUntilResult) {
  // Hệ số dựa trên số tiền cược
  const betAmountFactor = Math.min(1.2, 1 + (betAmount / 10000) * 0.2);
  
  // Hệ số dựa trên số người đặt cược
  const popularityFactor = Math.max(0.8, 1 - (betCount / 100) * 0.2);
  
  // Hệ số dựa trên thời gian
  const timeFactor = Math.min(1.1, 1 + (timeUntilResult / 86400) * 0.1);
  
  return baseOdds * betAmountFactor * popularityFactor * timeFactor;
}
```

### 2. Thưởng theo cấp độ cược (Bet Tier Bonuses)

Phân chia người chơi theo cấp độ dựa trên tổng số tiền đặt cược:

| Cấp độ | Tổng cược tích lũy | Thưởng thêm |
|--------|-------------------|------------|
| Bạc    | 1,000,000 đến 5,000,000 | +5% vào tiền thắng |
| Vàng   | 5,000,000 đến 20,000,000 | +10% vào tiền thắng |
| Bạch kim | 20,000,000 đến 50,000,000 | +15% vào tiền thắng |
| Kim cương | Trên 50,000,000 | +20% vào tiền thắng |

### 3. Hệ thống cược kết hợp (Parlay/Combo Bets)

Cho phép người chơi kết hợp nhiều cược lại với nhau để nhận tỷ lệ thưởng cao hơn:

- **Double**: Kết hợp 2 cược, nhân hệ số thưởng với 1.1
- **Triple**: Kết hợp 3 cược, nhân hệ số thưởng với 1.2
- **Quadruple**: Kết hợp 4 cược, nhân hệ số thưởng với 1.3

```javascript
// Ví dụ code tính tiền thắng cho cược kết hợp
function calculateParlay(bets) {
  let totalOdds = 1;
  let bonusFactor = 1 + (bets.length - 1) * 0.1;
  
  bets.forEach(bet => {
    totalOdds *= bet.odds;
  });
  
  return totalOdds * bonusFactor;
}
```

### 4. Tiền thưởng khuyến khích (Incentive Bonuses)

- **First-time Bonus**: Thưởng thêm 10% cho lần thắng đầu tiên của người chơi mới
- **Comeback Bonus**: Thưởng thêm 5% nếu người chơi thắng sau chuỗi thua 5 lần liên tiếp
- **Big Win Bonus**: Thưởng thêm 3% cho các khoản thắng lớn (trên 10,000,000)
- **Daily Streak Bonus**: Thưởng thêm 1% mỗi ngày liên tiếp đặt cược, tối đa 7%

### 5. Thưởng đặc biệt (Special Rewards)

- **Lucky Number**: Mỗi ngày hệ thống sẽ chọn ngẫu nhiên một số "may mắn", nếu người chơi đặt cược vào số này và thắng, sẽ được nhân đôi tiền thưởng
- **Birthday Bonus**: Tăng 20% tiền thưởng cho các cược thắng vào ngày sinh nhật người chơi
- **Milestone Rewards**: Thưởng đặc biệt khi đạt các cột mốc: lần cược thứ 100, 500, 1000...

### 6. Cược Jackpot tích lũy (Progressive Jackpot)

Mỗi cược sẽ đóng góp một phần nhỏ (0.5%) vào quỹ Jackpot. Người chơi có thể thắng Jackpot khi:

- Đặt cược tối thiểu 100,000 đồng
- Chọn đúng số đặc biệt
- Cộng thêm một điều kiện phụ (như đặt cược trong khung giờ vàng)

### 7. Hệ thống điểm thưởng (Loyalty Points)

Người chơi tích lũy điểm thưởng dựa trên hoạt động đặt cược:

- Mỗi 10,000 đồng đặt cược = 1 điểm thưởng
- Điểm thưởng có thể đổi thành:
  - Cược miễn phí
  - Tăng tỷ lệ thắng cược
  - Các vật phẩm ảo hoặc thật
  - Tiền thưởng

## Các yêu cầu kỹ thuật

### 1. Thay đổi cấu trúc cơ sở dữ liệu

```javascript
// Model BetTier
const BetTierSchema = new Schema({
  name: {
    type: String,
    required: true
  },
  minAmount: {
    type: Number,
    required: true
  },
  maxAmount: {
    type: Number,
    required: true
  },
  bonusPercentage: {
    type: Number,
    required: true
  }
});

// Cập nhật User Model
const UserSchema = new Schema({
  // Các trường hiện có
  // ...
  totalBetAmount: {
    type: Number,
    default: 0
  },
  currentTier: {
    type: String,
    default: 'Standard'
  },
  loyaltyPoints: {
    type: Number,
    default: 0
  },
  consecutiveBetDays: {
    type: Number,
    default: 0
  },
  lastBetDate: {
    type: Date
  }
});
```

### 2. Cập nhật hệ thống tính thưởng

```javascript
// Trong lotteryService.js
async function calculateWinAmount(bet, result) {
  let baseAmount = 0;
  
  // Tính tiền thắng cơ bản
  switch(bet.betType) {
    case '2D':
      baseAmount = bet.amount * config.payoutRatios['2D'];
      break;
    case '3D':
      baseAmount = bet.amount * config.payoutRatios['3D'];
      break;
    // Thêm các loại cược khác
  }
  
  // Áp dụng tỷ lệ thưởng động
  const dynamicFactor = await calculateDynamicOddsFactor(bet);
  baseAmount *= dynamicFactor;
  
  // Áp dụng thưởng theo cấp độ người chơi
  const user = await User.findById(bet.userId);
  const tierBonus = await calculateTierBonus(user);
  baseAmount *= (1 + tierBonus);
  
  // Áp dụng các loại thưởng đặc biệt
  const specialBonuses = await calculateSpecialBonuses(bet, user);
  baseAmount *= (1 + specialBonuses);
  
  // Làm tròn và trả về kết quả
  return Math.floor(baseAmount);
}
```

### 3. API Endpoint mới

```javascript
// Trong routes/api.js
router.get('/bet-tiers', authMiddleware, userController.getBetTiers);
router.get('/loyalty-points', authMiddleware, userController.getLoyaltyPoints);
router.post('/redeem-points', authMiddleware, userController.redeemLoyaltyPoints);
router.get('/jackpot', betController.getCurrentJackpot);
```

## Kế hoạch triển khai

### Giai đoạn 1: Thiết kế và chuẩn bị (2 tuần)
- Thiết kế chi tiết các tính năng mới
- Cập nhật schema cơ sở dữ liệu
- Cập nhật tài liệu API

### Giai đoạn 2: Phát triển (4 tuần)
- Phát triển hệ thống tỷ lệ thưởng động
- Xây dựng hệ thống phân cấp người chơi
- Triển khai hệ thống điểm thưởng
- Phát triển cược kết hợp

### Giai đoạn 3: Kiểm thử (2 tuần)
- Kiểm thử đơn vị và tích hợp
- Kiểm thử hiệu năng
- Kiểm thử chấp nhận người dùng

### Giai đoạn 4: Ra mắt (1 tuần)
- Triển khai lên môi trường staging
- Kiểm tra cuối cùng
- Triển khai lên production
- Theo dõi và hỗ trợ

## Kết luận

Các cải tiến này sẽ giúp:
- Tăng sự hấp dẫn của hệ thống đối với người chơi
- Khuyến khích người chơi đặt cược nhiều hơn và thường xuyên hơn
- Tạo ra lợi thế cạnh tranh so với các nền tảng cược khác
- Tăng doanh thu và lợi nhuận cho hệ thống

Với việc áp dụng các phương pháp tính thưởng hiện đại từ các nền tảng cược thể thao toàn cầu, hệ thống của chúng ta sẽ trở nên hấp dẫn hơn và có khả năng cạnh tranh cao hơn trên thị trường. 