const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const UserSchema = new Schema({
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
    default: 1000
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
    type: Schema.Types.ObjectId,
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
  }
});

module.exports = mongoose.model('User', UserSchema);