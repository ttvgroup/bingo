const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const JackpotSchema = new Schema({
  amount: {
    type: Number,
    default: 0,
    required: true
  },
  specialNumber: {
    type: String,
    required: true
  },
  startDate: {
    type: Date,
    default: Date.now,
    required: true
  },
  endDate: {
    type: Date
  },
  isActive: {
    type: Boolean,
    default: true
  },
  winners: [{
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    betId: {
      type: Schema.Types.ObjectId,
      ref: 'Bet'
    },
    amount: Number,
    winDate: {
      type: Date,
      default: Date.now
    }
  }],
  history: [{
    date: {
      type: Date,
      default: Date.now
    },
    action: {
      type: String,
      enum: ['create', 'contribution', 'win', 'reset', 'adjust'],
      required: true
    },
    amount: {
      type: Number,
      required: true
    },
    prevAmount: {
      type: Number
    },
    newAmount: {
      type: Number
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    betId: {
      type: Schema.Types.ObjectId,
      ref: 'Bet'
    },
    adminId: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    note: String
  }],
  settings: {
    contributionPercentage: {
      type: Number,
      default: 0.005 // 0.5%
    },
    minBetAmount: {
      type: Number,
      default: 100000
    },
    initialAmount: {
      type: Number,
      default: 1000000
    },
    specialTimeStart: {
      type: Number, // Giờ trong ngày (0-23)
      default: 12
    },
    specialTimeEnd: {
      type: Number, // Giờ trong ngày (0-23)
      default: 14
    }
  }
});

// Phương thức tạo số đặc biệt mới
JackpotSchema.statics.generateSpecialNumber = function() {
  const randomNum = Math.floor(Math.random() * 100); // Sinh số ngẫu nhiên từ 0-99
  return randomNum.toString().padStart(2, '0'); // Đảm bảo luôn có 2 chữ số
};

// Phương thức đóng góp vào jackpot
JackpotSchema.statics.contribute = async function(betId, userId, betAmount, note = '') {
  const jackpot = await this.findOne({ isActive: true });
  
  if (!jackpot) {
    throw new Error('Không tìm thấy jackpot đang hoạt động');
  }
  
  const contributionPercentage = jackpot.settings.contributionPercentage;
  const contribution = Math.floor(betAmount * contributionPercentage);
  const prevAmount = jackpot.amount;
  const newAmount = prevAmount + contribution;
  
  // Cập nhật số tiền jackpot
  jackpot.amount = newAmount;
  
  // Ghi lại lịch sử
  jackpot.history.push({
    date: new Date(),
    action: 'contribution',
    amount: contribution,
    prevAmount: prevAmount,
    newAmount: newAmount,
    userId: userId,
    betId: betId,
    note: note || 'Đóng góp jackpot từ cược'
  });
  
  await jackpot.save();
  return contribution;
};

// Phương thức xử lý khi có người trúng jackpot
JackpotSchema.statics.processWinner = async function(userId, betId, note = '') {
  const jackpot = await this.findOne({ isActive: true });
  
  if (!jackpot) {
    throw new Error('Không tìm thấy jackpot đang hoạt động');
  }
  
  const winAmount = jackpot.amount;
  const prevAmount = winAmount;
  
  // Ghi lại thông tin người trúng
  jackpot.winners.push({
    userId: userId,
    betId: betId,
    amount: winAmount,
    winDate: new Date()
  });
  
  // Ghi lại lịch sử
  jackpot.history.push({
    date: new Date(),
    action: 'win',
    amount: winAmount,
    prevAmount: prevAmount,
    newAmount: 0,
    userId: userId,
    betId: betId,
    note: note || 'Trúng jackpot'
  });
  
  // Reset jackpot và tạo mới
  jackpot.amount = 0;
  jackpot.isActive = false;
  jackpot.endDate = new Date();
  
  await jackpot.save();
  
  // Tạo jackpot mới
  return this.createNew();
};

// Phương thức tạo jackpot mới
JackpotSchema.statics.createNew = async function(initialAmount) {
  const settings = {
    contributionPercentage: 0.005,
    minBetAmount: 100000,
    initialAmount: initialAmount || 1000000,
    specialTimeStart: 12,
    specialTimeEnd: 14
  };
  
  // Tắt jackpot hiện tại nếu có
  await this.updateMany(
    { isActive: true },
    { $set: { isActive: false, endDate: new Date() } }
  );
  
  // Tạo jackpot mới
  const newJackpot = new this({
    amount: settings.initialAmount,
    specialNumber: this.generateSpecialNumber(),
    startDate: new Date(),
    isActive: true,
    settings: settings
  });
  
  // Ghi lại lịch sử
  newJackpot.history.push({
    date: new Date(),
    action: 'create',
    amount: settings.initialAmount,
    prevAmount: 0,
    newAmount: settings.initialAmount,
    note: 'Tạo jackpot mới'
  });
  
  return newJackpot.save();
};

// Tạo các index
JackpotSchema.index({ isActive: 1 });
JackpotSchema.index({ 'winners.userId': 1 });
JackpotSchema.index({ 'winners.winDate': 1 });
JackpotSchema.index({ 'history.date': 1 });

module.exports = mongoose.model('Jackpot', JackpotSchema); 