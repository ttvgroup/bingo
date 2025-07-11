const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const BetTierSchema = new Schema({
  name: {
    type: String,
    required: true,
    unique: true
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
  },
  description: {
    type: String
  },
  icon: {
    type: String
  },
  color: {
    type: String
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  },
  active: {
    type: Boolean,
    default: true
  }
});

// Đảm bảo cấp độ không chồng chéo
BetTierSchema.pre('save', function(next) {
  const BetTier = mongoose.model('BetTier');
  
  // Kiểm tra mức min và max không chồng chéo
  BetTier.findOne({
    _id: { $ne: this._id },
    $or: [
      // Kiểm tra nếu mức min của cấp độ mới nằm trong khoảng của cấp độ khác
      {
        minAmount: { $lte: this.minAmount },
        maxAmount: { $gt: this.minAmount }
      },
      // Kiểm tra nếu mức max của cấp độ mới nằm trong khoảng của cấp độ khác
      {
        minAmount: { $lt: this.maxAmount },
        maxAmount: { $gte: this.maxAmount }
      },
      // Kiểm tra nếu cấp độ mới bao trùm một cấp độ khác
      {
        minAmount: { $gte: this.minAmount },
        maxAmount: { $lte: this.maxAmount }
      }
    ]
  })
  .then(existingTier => {
    if (existingTier) {
      const error = new Error('Cấp độ cược chồng chéo với cấp độ hiện có');
      return next(error);
    }
    next();
  })
  .catch(err => next(err));
});

// Tạo các index
BetTierSchema.index({ minAmount: 1 });
BetTierSchema.index({ bonusPercentage: 1 });
BetTierSchema.index({ active: 1 });

// Phương thức tìm cấp độ dựa trên tổng số tiền cược
BetTierSchema.statics.findTierByAmount = function(amount) {
  return this.findOne({
    minAmount: { $lte: amount },
    maxAmount: { $gt: amount },
    active: true
  });
};

// Phương thức lấy tất cả các cấp độ theo thứ tự
BetTierSchema.statics.getAllTiers = function() {
  return this.find({ active: true }).sort({ minAmount: 1 });
};

module.exports = mongoose.model('BetTier', BetTierSchema); 