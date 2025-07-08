const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  telegramId: { type: String, required: true, unique: true },
  username: { type: String },
  balance: { type: Number, default: 1000 },
  role: { type: String, enum: ['user', 'admin', 'affiliate'], default: 'user' },
  affiliateCode: { type: String, unique: true, sparse: true },
  referredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  createdAt: { type: Date, default: Date.now },
});

// Indexes for performance
userSchema.index({ telegramId: 1 });
userSchema.index({ affiliateCode: 1 });

module.exports = mongoose.model('User', userSchema);