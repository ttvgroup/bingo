const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const UserSchema = new Schema({
  _id: {
    type: String,
    default: function() {
      return this.telegramId;
    }
  },
  telegramId: {
    type: String,
    required: true,
    unique: true
  },
  username: {
    type: String
  },
  balance: {
    type: Number,
    default: 0
  },
  role: {
    type: String,
    enum: ['user', 'admin', 'affiliate'],
    default: 'user'
  },
  affiliateCode: {
    type: String,
    unique: true,
    sparse: true
  },
  referredBy: {
    type: String,
    ref: 'User'
  },
  devices: [{
    deviceId: String,
    deviceName: String,
    lastLogin: Date,
    isVerified: Boolean
  }],
  twoFactorEnabled: {
    type: Boolean,
    default: function() {
      return this.role === 'admin';
    }
  },
  telegramAuthCode: {
    code: String,
    expiresAt: Date
  },
  loginQrCode: {
    token: String,
    expiresAt: Date
  },
  createdAt: {
    type: Date,
    default: Date.now
  },

  // Các trường cho hệ thống tính thưởng nâng cao
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
  },
  dateOfBirth: {
    type: Date
  },
  bonusSettings: {
    birthdayBonus: {
      type: Boolean,
      default: true
    },
    specialBonusEnabled: {
      type: Boolean,
      default: true
    },
    dynamicOddsEnabled: {
      type: Boolean,
      default: true
    }
  },
  rewardHistory: [{
    rewardType: {
      type: String,
      enum: ['free_bet', 'odds_boost', 'cash', 'special_bonus', 'jackpot']
    },
    amount: Number,
    description: String,
    createdAt: {
      type: Date,
      default: Date.now
    },
    expiresAt: Date,
    usedAt: Date,
    status: {
      type: String,
      enum: ['active', 'used', 'expired'],
      default: 'active'
    },
    reference: {
      type: Schema.Types.ObjectId,
      refPath: 'rewardHistory.referenceModel'
    },
    referenceModel: {
      type: String,
      enum: ['Bet', 'Transaction']
    }
  }]
}, {
  _id: false // Cho phép sử dụng _id tùy chỉnh
});

module.exports = mongoose.model('User', UserSchema);