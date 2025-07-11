const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const SystemConfigSchema = new Schema({
  key: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  value: {
    type: Schema.Types.Mixed,
    required: true
  },
  description: {
    type: String,
    default: ''
  },
  updatedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

// Các khóa cấu hình hệ thống
SystemConfigSchema.statics.KEYS = {
  BETTING_ENABLED: 'betting_enabled',
  BETTING_HOURS_START: 'betting_hours_start',
  BETTING_HOURS_END: 'betting_hours_end',
  DAILY_BET_LIMIT: 'daily_bet_limit',
  PAYOUT_RATIO_2D: 'payout_ratio_2d',
  PAYOUT_RATIO_3D: 'payout_ratio_3d',
  PAYOUT_RATIO_4D: 'payout_ratio_4d',
  MAINTENANCE_MODE: 'maintenance_mode',
  // Thêm các key cho hệ thống quota
  QUOTA_ENABLED: 'quota_enabled',
  QUOTA_2D: 'quota_2d',
  QUOTA_3D: 'quota_3d',
  QUOTA_4D: 'quota_4d',
  QUOTA_BAO_LO_2D: 'quota_bao_lo_2d',
  QUOTA_BAO_LO_3D: 'quota_bao_lo_3d',
  QUOTA_BAO_LO_4D: 'quota_bao_lo_4d',
  QUOTA_DEFAULT_PER_NUMBER: 'quota_default_per_number',
  QUOTA_PER_NUMBER: 'quota_per_number',
  QUOTA_NOTIFICATION_THRESHOLD: 'quota_notification_threshold'
};

// Phương thức lấy tất cả cấu hình
SystemConfigSchema.statics.getAllConfigs = async function() {
  const configs = await this.find();
  const result = {};
  
  configs.forEach(config => {
    result[config.key] = config.value;
  });
  
  return result;
};

// Phương thức lấy một cấu hình theo key
SystemConfigSchema.statics.getConfig = async function(key, defaultValue = null) {
  const config = await this.findOne({ key });
  return config ? config.value : defaultValue;
};

// Phương thức cập nhật hoặc tạo mới một cấu hình
SystemConfigSchema.statics.setConfig = async function(key, value, description = '', updatedBy = null) {
  return await this.findOneAndUpdate(
    { key },
    { 
      value,
      description: description || '',
      updatedBy,
      updatedAt: new Date()
    },
    { new: true, upsert: true }
  );
};

module.exports = mongoose.model('SystemConfig', SystemConfigSchema); 