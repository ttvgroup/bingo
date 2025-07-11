const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * Schema theo dõi lịch sử thay đổi kết quả xổ số
 */
const ResultHistorySchema = new Schema({
  resultId: {
    type: Schema.Types.ObjectId,
    ref: 'Result',
    required: true
  },
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  action: {
    type: String,
    required: true,
    enum: ['CREATE', 'UPDATE', 'DELETE']
  },
  changeDetails: {
    type: Schema.Types.Mixed,
    required: true
  },
  previousState: {
    type: Schema.Types.Mixed
  },
  newState: {
    type: Schema.Types.Mixed
  },
  ipAddress: {
    type: String
  },
  deviceInfo: {
    type: String
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  securityHash: {
    type: String
  }
});

// Tạo index để tối ưu truy vấn
ResultHistorySchema.index({ resultId: 1, timestamp: -1 });
ResultHistorySchema.index({ userId: 1, timestamp: -1 });

module.exports = mongoose.model('ResultHistory', ResultHistorySchema); 