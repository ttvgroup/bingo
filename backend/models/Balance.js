const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const BalanceSchema = new Schema({
  // ID của balance (có thể là 'system', 'pool', hoặc userId)
  balanceId: {
    type: String,
    required: true,
    unique: true
  },
  // Loại balance
  type: {
    type: String,
    enum: ['system', 'pool', 'user'],
    required: true
  },
  // Số dư P
  balance: {
    type: Number,
    default: 0,
    min: 0
  },
  // Tổng số P đã nhận
  totalReceived: {
    type: Number,
    default: 0
  },
  // Tổng số P đã chi
  totalSpent: {
    type: Number,
    default: 0
  },
  // Lịch sử giao dịch
  transactions: [{
    type: {
      type: String,
      enum: ['receive', 'spend', 'admin_grant', 'admin_deduct', 'daily_bonus', 'milestone_reward'],
      required: true
    },
    amount: {
      type: Number,
      required: true
    },
    description: {
      type: String,
      required: true
    },
    reference: {
      type: Schema.Types.ObjectId,
      refPath: 'transactions.referenceModel'
    },
    referenceModel: {
      type: String,
      enum: ['User', 'Bet', 'System', 'Coin']
    },
    processedBy: {
      type: String,
      ref: 'User'
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  }],
  // Cấu hình cho balance
  config: {
    dailyBonus: {
      type: Number,
      default: 0
    },
    lastDailyBonus: {
      type: Date
    },
    autoRecharge: {
      type: Boolean,
      default: false
    },
    rechargeAmount: {
      type: Number,
      default: 0
    },
    rechargeInterval: {
      type: Number, // Số giờ giữa các lần recharge
      default: 24
    }
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Index để tối ưu truy vấn
BalanceSchema.index({ balanceId: 1 });
BalanceSchema.index({ type: 1 });
BalanceSchema.index({ balance: -1 });
BalanceSchema.index({ 'transactions.createdAt': -1 });

// Pre-save middleware để cập nhật lastUpdated
BalanceSchema.pre('save', function(next) {
  this.lastUpdated = new Date();
  next();
});

// Phương thức nhận P
BalanceSchema.methods.receiveP = async function(amount, type, description, reference = null, referenceModel = null, processedBy = null) {
  this.balance += amount;
  this.totalReceived += amount;
  
  this.transactions.push({
    type: 'receive',
    amount: amount,
    description: description,
    reference: reference,
    referenceModel: referenceModel,
    processedBy: processedBy
  });
  
  return this.save();
};

// Phương thức chi P
BalanceSchema.methods.spendP = async function(amount, type, description, reference = null, referenceModel = null, processedBy = null) {
  if (this.balance < amount) {
    throw new Error('Không đủ P để thực hiện giao dịch');
  }
  
  this.balance -= amount;
  this.totalSpent += amount;
  
  this.transactions.push({
    type: 'spend',
    amount: amount,
    description: description,
    reference: reference,
    referenceModel: referenceModel,
    processedBy: processedBy
  });
  
  return this.save();
};

// Phương thức thêm daily bonus
BalanceSchema.methods.addDailyBonus = async function(amount, description) {
  await this.receiveP(amount, 'daily_bonus', description);
  this.config.lastDailyBonus = new Date();
  return this.save();
};

// Phương thức kiểm tra có thể nhận daily bonus không
BalanceSchema.methods.canReceiveDailyBonus = function() {
  if (!this.config.lastDailyBonus) return true;
  
  const now = new Date();
  const lastBonus = new Date(this.config.lastDailyBonus);
  const hoursDiff = (now - lastBonus) / (1000 * 60 * 60);
  
  return hoursDiff >= 24;
};

// Phương thức lấy lịch sử giao dịch
BalanceSchema.methods.getTransactionHistory = function(limit = 50) {
  return this.transactions
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit);
};

// Static method để tạo hoặc lấy balance
BalanceSchema.statics.getOrCreateBalance = async function(balanceId, type = 'user', initialBalance = 0) {
  let balance = await this.findOne({ balanceId });
  
  if (!balance) {
    balance = new this({
      balanceId: balanceId,
      type: type,
      balance: initialBalance,
      totalReceived: initialBalance,
      totalSpent: 0
    });
    await balance.save();
  }
  
  return balance;
};

// Static method để lấy system balance
BalanceSchema.statics.getSystemBalance = async function() {
  return this.getOrCreateBalance('system', 'system', 100000000); // 100M P ban đầu
};

// Static method để lấy pool balance
BalanceSchema.statics.getPoolBalance = async function() {
  return this.getOrCreateBalance('pool', 'pool', 0);
};

// Static method để lấy top P holders
BalanceSchema.statics.getTopPHolders = async function(limit = 10) {
  try {
    // Lấy top balances
    const topBalances = await this.find({ type: 'user' })
      .sort({ balance: -1 })
      .limit(limit);
    
    // Lấy thông tin user tương ứng
    const userIds = topBalances.map(balance => balance.balanceId);
    const users = await mongoose.model('User').find({ _id: { $in: userIds } }, 'telegramId username');
    
    // Map users vào kết quả
    const userMap = {};
    users.forEach(user => {
      userMap[user._id.toString()] = {
        telegramId: user.telegramId,
        username: user.username
      };
    });
    
    // Tạo kết quả
    return topBalances.map((balance, index) => {
      const user = userMap[balance.balanceId] || { telegramId: 'unknown', username: 'unknown' };
      return {
        rank: index + 1,
        userId: balance.balanceId,
        telegramId: user.telegramId,
        username: user.username,
        balance: balance.balance,
        totalReceived: balance.totalReceived,
        totalSpent: balance.totalSpent
      };
    });
  } catch (error) {
    console.error('Error getting top P holders:', error);
    return [];
  }
};

module.exports = mongoose.model('Balance', BalanceSchema); 