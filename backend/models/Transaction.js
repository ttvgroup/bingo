const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const TransactionSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  type: {
    type: String,
    enum: ['deposit', 'withdraw', 'win', 'bet', 'referral'],
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'completed', 'failed', 'cancelled'],
    default: 'pending'
  },
  description: {
    type: String
  },
  reference: {
    type: Schema.Types.ObjectId,
    refPath: 'referenceModel'
  },
  referenceModel: {
    type: String,
    enum: ['Bet', 'User']
  },
  processedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  processedAt: {
    type: Date
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  metaData: {
    type: Schema.Types.Mixed
  },
  transactionHash: {
    type: String
  }
});

// Tạo index để tối ưu truy vấn
TransactionSchema.index({ userId: 1, createdAt: -1 });
TransactionSchema.index({ status: 1, createdAt: -1 });
TransactionSchema.index({ type: 1, status: 1 });
TransactionSchema.index({ userId: 1, type: 1, status: 1 });
TransactionSchema.index({ reference: 1, referenceModel: 1 });
TransactionSchema.index({ processedBy: 1, processedAt: -1 });

// Pre-save middleware để tạo hash giao dịch
TransactionSchema.pre('save', function(next) {
  if (this.isNew || this.isModified('amount') || this.isModified('type') || this.isModified('userId')) {
    const crypto = require('crypto');
    const dataToHash = `${this.userId.toString()}-${this.type}-${this.amount}-${Date.now()}`;
    
    this.transactionHash = crypto
      .createHash('sha256')
      .update(dataToHash)
      .digest('hex');
  }
  next();
});

module.exports = mongoose.model('Transaction', TransactionSchema);