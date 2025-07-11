const mongoose = require('mongoose');

const SystemConfigSchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    unique: true,
    index: true
  },
  value: {
    type: mongoose.Schema.Types.Mixed,
    required: true
  },
  description: {
    type: String
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Các key cấu hình hệ thống
SystemConfigSchema.statics.KEYS = {
  BETTING_ENABLED: 'betting_enabled',
  BETTING_HOURS_START: 'betting_hours_start',
  BETTING_HOURS_END: 'betting_hours_end',
  DAILY_BET_LIMIT: 'daily_bet_limit',
  PAYOUT_RATIO_2D: 'payout_ratio_2d',
  PAYOUT_RATIO_3D: 'payout_ratio_3d',
  PAYOUT_RATIO_4D: 'payout_ratio_4d',
  MAINTENANCE_MODE: 'maintenance_mode'
};

// Phương thức để lấy cấu hình theo key
SystemConfigSchema.statics.getConfig = async function(key, defaultValue = null) {
  const config = await this.findOne({ key });
  return config ? config.value : defaultValue;
};

// Phương thức để cập nhật hoặc tạo mới cấu hình
SystemConfigSchema.statics.setConfig = async function(key, value, description = '', updatedBy = null) {
  const update = {
    value,
    updatedAt: new Date()
  };
  
  if (description) update.description = description;
  if (updatedBy) update.updatedBy = updatedBy;
  
  return await this.findOneAndUpdate(
    { key },
    update,
    { upsert: true, new: true }
  );
};

// Phương thức để lấy nhiều cấu hình cùng lúc
SystemConfigSchema.statics.getMultipleConfigs = async function(keys, defaultValues = {}) {
  const configs = await this.find({ key: { $in: keys } });
  
  const result = {};
  keys.forEach(key => {
    const config = configs.find(c => c.key === key);
    result[key] = config ? config.value : (defaultValues[key] !== undefined ? defaultValues[key] : null);
  });
  
  return result;
};

// Phương thức để lấy tất cả cấu hình
SystemConfigSchema.statics.getAllConfigs = async function() {
  const configs = await this.find({});
  const result = {};
  
  configs.forEach(config => {
    result[config.key] = config.value;
  });
  
  return result;
};

const SystemConfig = mongoose.model('SystemConfig', SystemConfigSchema);

module.exports = SystemConfig; 