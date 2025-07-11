const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const crypto = require('crypto');
const helper = require('../utils/helper');

const BetSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  numbers: {
    type: String,
    required: true,
    validate: {
      validator: function(v) {
        // Kiểm tra dựa trên betType
        if (this.betType === '2D') return /^\d{2}$/.test(v);
        if (this.betType === '3D') return /^\d{3}$/.test(v);
        if (this.betType === '4D') return /^\d{4}$/.test(v);
        if (this.betType === 'Bao lô 2D') return /^\d{2}$/.test(v);
        if (this.betType === 'Bao lô 3D') return /^\d{3}$/.test(v);
        if (this.betType === 'Bao lô 4D') return /^\d{4}$/.test(v);
        return false;
      },
      message: props => `${props.value} không phải định dạng số hợp lệ cho loại cược ${props.betType}`
    }
  },
  betType: {
    type: String,
    required: true,
    enum: ['2D', '3D', '4D', 'Bao lô 2D', 'Bao lô 3D', 'Bao lô 4D']
  },
  amount: {
    type: Number,
    required: true,
    min: [1, 'Số tiền cược phải lớn hơn 0']
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  // Ngày cược (ngày/tháng/năm) dùng để so khớp với ngày kết quả
  betDate: {
    type: Date,
    required: true
  },
  // Ngày kết quả xổ số (được cập nhật khi xác định trúng/trượt)
  resultDate: {
    type: Date
  },
  resultId: {
    type: Schema.Types.ObjectId,
    ref: 'Result'
  },
  status: {
    type: String,
    enum: ['pending', 'won', 'lost'],
    default: 'pending'
  },
  // Trạng thái kiểm tra ngày, thể hiện sự khớp giữa ngày cược và ngày kết quả
  dateMatchStatus: {
    type: String,
    enum: ['matched', 'mismatched', 'not_checked'],
    default: 'not_checked'
  },
  provinceCode: {
    type: String,
    required: true
  },
  winAmount: {
    type: Number,
    default: 0
  },
  integrityHash: {
    type: String
  },
  ipAddress: {
    type: String
  },
  deviceInfo: {
    type: String
  },
  transactionTimestamp: {
    type: Date,
    default: Date.now
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'pending_approval', 'approved', 'rejected'],
    default: 'pending'
  },
  // Các trường cho hệ thống phần thưởng nâng cao
  dynamicOddsFactor: {
    type: Number,
    default: 1.0
  },
  rewardDetails: {
    baseWinAmount: {
      type: Number,
      default: 0
    },
    bonuses: [{
      type: {
        type: String,
        enum: ['special', 'jackpot']
      },
      name: String,
      percentage: Number,
      amount: Number
    }],
    totalBonusAmount: {
      type: Number,
      default: 0
    }
  },
  contributedToJackpot: {
    type: Boolean,
    default: false
  },
  jackpotContribution: {
    type: Number,
    default: 0
  }
});

// Tạo index để tối ưu truy vấn
BetSchema.index({ userId: 1, createdAt: -1 });
BetSchema.index({ status: 1, resultId: 1 });
BetSchema.index({ provinceCode: 1, status: 1, createdAt: -1 });
BetSchema.index({ userId: 1, status: 1 });
BetSchema.index({ numbers: 1, betType: 1, provinceCode: 1 });
BetSchema.index({ integrityHash: 1 });
BetSchema.index({ betDate: 1 });
BetSchema.index({ dateMatchStatus: 1 });

// Pre-save middleware để tạo hash toàn vẹn
BetSchema.pre('save', function(next) {
  if (this.isNew || this.isModified('numbers') || this.isModified('betType') || 
      this.isModified('amount') || this.isModified('provinceCode')) {
    
    // Tạo chuỗi dữ liệu quan trọng để hash
    const dataToHash = `${this.userId.toString()}-${this.numbers}-${this.betType}-${this.amount}-${this.provinceCode}-${this.transactionTimestamp.toISOString()}`;
    
    // Tạo hash để đảm bảo tính toàn vẹn của dữ liệu cược
    this.integrityHash = crypto
      .createHash('sha256')
      .update(dataToHash)
      .digest('hex');
    
    // Đặt betDate mặc định là ngày hiện tại theo GMT+7
    if (!this.betDate) {
      this.betDate = helper.getCurrentVietnamTime();
    }
  }
  next();
});

// Phương thức kiểm tra tính toàn vẹn của dữ liệu cược
BetSchema.methods.verifyIntegrity = function() {
  const dataToHash = `${this.userId.toString()}-${this.numbers}-${this.betType}-${this.amount}-${this.provinceCode}-${this.transactionTimestamp.toISOString()}`;
  
  const calculatedHash = crypto
    .createHash('sha256')
    .update(dataToHash)
    .digest('hex');
  
  return calculatedHash === this.integrityHash;
};

// Phương thức kiểm tra sự phù hợp giữa ngày đặt cược và ngày kết quả
BetSchema.methods.checkDateMatch = function(resultDate) {
  if (!resultDate) {
    this.dateMatchStatus = 'not_checked';
    return false;
  }
  
  this.resultDate = resultDate;
  
  // Kiểm tra sự phù hợp giữa ngày đặt cược và ngày kết quả
  const isMatched = helper.isSameDay(this.betDate, resultDate);
  this.dateMatchStatus = isMatched ? 'matched' : 'mismatched';
  
  return isMatched;
};

// Phương thức trả về thông tin cược với định dạng ngày/tháng/năm
BetSchema.methods.getFormattedInfo = function() {
  return {
    _id: this._id,
    userId: this.userId,
    numbers: this.numbers,
    betType: this.betType,
    amount: this.amount,
    betDate: helper.formatDate(this.betDate),
    resultDate: this.resultDate ? helper.formatDate(this.resultDate) : null,
    status: this.status,
    dateMatchStatus: this.dateMatchStatus,
    provinceCode: this.provinceCode,
    winAmount: this.winAmount,
    createdAt: helper.formatDateTime(this.createdAt)
  };
};

module.exports = mongoose.model('Bet', BetSchema);