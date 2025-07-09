const mongoose = require('mongoose');
const Schema = mongoose.Schema;

/**
 * Schema cho Audit Log - theo dõi các hoạt động quan trọng trong hệ thống
 */
const AuditLogSchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  action: {
    type: String,
    required: true,
    enum: [
      'LOGIN',
      'LOGOUT', 
      'CREATE_RESULT',
      'UPDATE_RESULT',
      'DELETE_RESULT',
      'PROCESS_TRANSACTION',
      'UPDATE_USER',
      'SYSTEM_ALERT'
    ]
  },
  ipAddress: {
    type: String
  },
  deviceInfo: {
    type: String
  },
  targetId: {
    type: Schema.Types.ObjectId
  },
  targetType: {
    type: String,
    enum: ['User', 'Result', 'Bet', 'Transaction']
  },
  details: {
    type: Schema.Types.Mixed
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Tạo index để tối ưu truy vấn
AuditLogSchema.index({ userId: 1, createdAt: -1 });
AuditLogSchema.index({ action: 1, createdAt: -1 });
AuditLogSchema.index({ targetId: 1, targetType: 1 });

module.exports = mongoose.model('AuditLog', AuditLogSchema); 