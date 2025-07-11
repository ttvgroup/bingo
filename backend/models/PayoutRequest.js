const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const PayoutRequestSchema = new Schema({
  betIds: [{
    type: Schema.Types.ObjectId,
    ref: 'Bet',
    required: true
  }],
  totalAmount: {
    type: Number,
    required: true
  },
  status: {
    type: String,
    enum: ['pending', 'approved', 'rejected', 'cancelled'],
    default: 'pending'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  processedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  processedAt: {
    type: Date
  },
  userCount: {
    type: Number,
    required: true
  },
  betCount: {
    type: Number,
    required: true
  },
  summary: {
    type: Schema.Types.Mixed
  },
  notes: {
    type: String
  }
});

// Tạo index để tối ưu truy vấn
PayoutRequestSchema.index({ status: 1, createdAt: -1 });
PayoutRequestSchema.index({ processedBy: 1 });

module.exports = mongoose.model('PayoutRequest', PayoutRequestSchema); 