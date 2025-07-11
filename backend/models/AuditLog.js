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
      // Đăng nhập/Xác thực
      'login_success',
      'login_failed',
      'logout',
      'device_registered',
      'device_removed',
      'two_factor_enabled',
      'two_factor_disabled',
      
      // Giao dịch tài chính
      'transfer_funds',
      'deposit_request',
      'withdraw_request',
      'place_bet',
      'win_payout',
      'create_points',
      'transaction',
      
      // Quản lý kết quả
      'result_create',
      'result_update',
      'result_delete',
      'result_verify',
      
      // Quản lý người dùng
      'user_create',
      'user_update',
      'user_delete',
      'user_role_change',
      
      // Hệ thống
      'config_change',
      'system_alert',
      'system_error',
      'system_maintenance'
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
    enum: ['User', 'Result', 'Bet', 'Transaction', 'Config', 'System']
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
AuditLogSchema.index({ createdAt: -1 }); // Index cho truy vấn theo thời gian
AuditLogSchema.index({ ipAddress: 1 }); // Index cho truy vấn theo IP

module.exports = mongoose.model('AuditLog', AuditLogSchema); 