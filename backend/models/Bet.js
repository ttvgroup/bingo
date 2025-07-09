const mongoose = require('mongoose');
const Schema = mongoose.Schema;
const crypto = require('crypto');

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
  resultId: {
    type: Schema.Types.ObjectId,
    ref: 'Result'
  },
  status: {
    type: String,
    enum: ['pending', 'won', 'lost'],
    default: 'pending'
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
  }
});

// Tạo index để tối ưu truy vấn
BetSchema.index({ userId: 1, createdAt: -1 });
BetSchema.index({ status: 1, resultId: 1 });
BetSchema.index({ provinceCode: 1, status: 1, createdAt: -1 });
BetSchema.index({ userId: 1, status: 1 });
BetSchema.index({ numbers: 1, betType: 1, provinceCode: 1 });
BetSchema.index({ integrityHash: 1 });

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

module.exports = mongoose.model('Bet', BetSchema);