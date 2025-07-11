const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const CoinSchema = new Schema({
  userId: {
    type: String,
    ref: 'User',
    required: true,
    unique: true
  },
  balance: {
    type: Number,
    default: 0,
    min: 0
  },
  totalEarned: {
    type: Number,
    default: 0
  },
  totalSpent: {
    type: Number,
    default: 0
  },
  lastUpdated: {
    type: Date,
    default: Date.now
  },
  // Lịch sử giao dịch coin
  transactions: [{
    type: {
      type: String,
      enum: ['earn', 'spend', 'milestone', 'admin_grant', 'admin_deduct'],
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
      enum: ['Bet', 'User', 'System']
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
  // Theo dõi các mốc đã đạt được
  achievedMilestones: {
    type: [Number],
    default: []
  }
}, {
  timestamps: true
});

// Index để tối ưu truy vấn
CoinSchema.index({ userId: 1 });
CoinSchema.index({ balance: -1 });
CoinSchema.index({ 'transactions.createdAt': -1 });

// Pre-save middleware để cập nhật lastUpdated
CoinSchema.pre('save', function(next) {
  this.lastUpdated = new Date();
  next();
});

// Phương thức thêm coin
CoinSchema.methods.addCoins = async function(amount, type, description, reference = null, referenceModel = null, processedBy = null) {
  this.balance += amount;
  this.totalEarned += amount;
  
  this.transactions.push({
    type: 'earn',
    amount: amount,
    description: description,
    reference: reference,
    referenceModel: referenceModel,
    processedBy: processedBy
  });
  
  return this.save();
};

// Phương thức trừ coin
CoinSchema.methods.spendCoins = async function(amount, type, description, reference = null, referenceModel = null, processedBy = null) {
  if (this.balance < amount) {
    throw new Error('Không đủ coin để thực hiện giao dịch');
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

// Phương thức thêm mốc đạt được
CoinSchema.methods.addMilestone = async function(milestone, coinReward, description) {
  if (!this.achievedMilestones.includes(milestone)) {
    this.achievedMilestones.push(milestone);
    await this.addCoins(coinReward, 'milestone', description);
  }
  return this;
};

// Phương thức kiểm tra mốc đã đạt
CoinSchema.methods.hasAchievedMilestone = function(milestone) {
  return this.achievedMilestones.includes(milestone);
};

// Phương thức lấy lịch sử giao dịch
CoinSchema.methods.getTransactionHistory = function(limit = 50) {
  return this.transactions
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit);
};

// Static method để tạo hoặc lấy coin balance cho user
CoinSchema.statics.getOrCreateCoinBalance = async function(userId) {
  let coinBalance = await this.findOne({ userId });
  
  if (!coinBalance) {
    coinBalance = new this({
      userId: userId,
      balance: 0,
      totalEarned: 0,
      totalSpent: 0
    });
    await coinBalance.save();
  }
  
  return coinBalance;
};

// Static method để lấy top coin holders
CoinSchema.statics.getTopCoinHolders = async function(limit = 10) {
  try {
    // Lấy top coin balances
    const topCoins = await this.find({})
      .sort({ balance: -1 })
      .limit(limit);
    
    // Lấy thông tin user tương ứng
    const userIds = topCoins.map(coin => coin.userId);
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
    return topCoins.map((coin, index) => {
      const user = userMap[coin.userId.toString()] || { telegramId: 'unknown', username: 'unknown' };
      return {
        rank: index + 1,
        userId: coin.userId,
        telegramId: user.telegramId,
        username: user.username,
        balance: coin.balance,
        totalEarned: coin.totalEarned,
        totalSpent: coin.totalSpent
      };
    });
  } catch (error) {
    console.error('Error getting top coin holders:', error);
    return [];
  }
};

module.exports = mongoose.model('Coin', CoinSchema); 