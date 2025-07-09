const dotenv = require('dotenv');

dotenv.config();

module.exports = {
  // Server configs
  port: process.env.PORT || 5000,
  nodeEnv: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',
  
  // Database configs
  mongoURI: process.env.MONGO_URI || 'mongodb://localhost/telegram-lottery-game',
  
  // Redis configs
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  cacheExpiry: parseInt(process.env.CACHE_EXPIRY) || 3600, // seconds
  
  // Telegram configs
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
  telegramChannelId: process.env.TELEGRAM_CHANNEL_ID,
  
  // Game configs
  payoutRatios: {
    '2D': parseFloat(process.env.PAYOUT_RATIO_2D) || 70,
    '3D': parseFloat(process.env.PAYOUT_RATIO_3D) || 600,
    '4D': parseFloat(process.env.PAYOUT_RATIO_4D) || 5000,
    'Bao lô 2D': parseFloat(process.env.PAYOUT_RATIO_BAO_LO_2D) || 70,
    'Bao lô 3D': parseFloat(process.env.PAYOUT_RATIO_BAO_LO_3D) || 600,
    'Bao lô 4D': parseFloat(process.env.PAYOUT_RATIO_BAO_LO_4D) || 5000,
  },
  
  // Số lượng lô cho mỗi loại bao lô
  baoLoQuantity: {
    'Bao lô 2D': 18, // 18 lô cho 1 đài
    'Bao lô 3D': 17, // 17 lô cho 1 đài
    'Bao lô 4D': 16, // 16 lô cho 1 đài
  },
  
  // Múi giờ và thời gian đặt cược (GMT+7 - Vietnam/Thailand)
  timeZone: 'Asia/Bangkok', // GMT+7
  
  // Thời gian đặt cược: 00:01 - 15:30 GMT+7
  bettingTime: {
    start: {
      hour: parseInt(process.env.BETTING_START_HOUR) || 0,
      minute: parseInt(process.env.BETTING_START_MINUTE) || 1
    },
    end: {
      hour: parseInt(process.env.BETTING_END_HOUR) || 15,
      minute: parseInt(process.env.BETTING_END_MINUTE) || 30
    }
  },
  
  // Giữ lại cho tương thích ngược - Deprecated
  bettingHoursStart: parseInt(process.env.BETTING_HOURS_START) || 0,
  bettingHoursEnd: parseInt(process.env.BETTING_HOURS_END) || 8,
  
  // Security configs
  allowedOrigins: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : ['http://localhost:3000'],
  rateLimiting: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW) || 15 * 60 * 1000, // 15 minutes
    max: parseInt(process.env.RATE_LIMIT_MAX) || 100, // 100 requests per window
    strict: {
      windowMs: 60 * 60 * 1000, // 1 hour
      max: parseInt(process.env.RATE_LIMIT_STRICT_MAX) || 20 // 20 requests per hour for sensitive endpoints
    },
    login: {
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: parseInt(process.env.RATE_LIMIT_LOGIN_MAX) || 5 // 5 login attempts
    }
  },
  
  // Payment verification configs
  paymentVerification: {
    requireDoubleConfirm: process.env.REQUIRE_DOUBLE_CONFIRM === 'true' || true,
    strictMode: process.env.PAYMENT_STRICT_MODE === 'true' || false
  },
  
  // Result verification configs
  resultVerification: {
    requiredExternalSources: parseInt(process.env.REQUIRED_EXTERNAL_SOURCES) || 1,
    externalSources: process.env.EXTERNAL_SOURCES ? process.env.EXTERNAL_SOURCES.split(',') : ['source1', 'source2'],
    autoVerify: process.env.AUTO_VERIFY_RESULTS === 'true' || false
  },
  
  // Audit logging configs
  auditLogging: {
    enabled: process.env.AUDIT_LOGGING === 'true' || true,
    detailedLogs: process.env.DETAILED_AUDIT_LOGS === 'true' || true,
    retentionDays: parseInt(process.env.AUDIT_LOGS_RETENTION_DAYS) || 90
  },
  
  // 2FA configs
  twoFactorAuth: {
    requiredForAdmin: process.env.REQUIRE_2FA_FOR_ADMIN === 'true' || true,
    backupCodesCount: parseInt(process.env.BACKUP_CODES_COUNT) || 5
  },
  
  // Timezone helper functions
  getVietnamTime: function() {
    // Trả về thời gian hiện tại theo múi giờ Việt Nam (GMT+7)
    const now = new Date();
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    return new Date(utc + (7 * 60 * 60000)); // GMT+7
  },
  
  isWithinBettingHours: function() {
    // Kiểm tra xem thời gian hiện tại có nằm trong giờ đặt cược không
    const now = this.getVietnamTime();
    const hour = now.getHours();
    const minute = now.getMinutes();
    
    const startHour = this.bettingTime.start.hour;
    const startMinute = this.bettingTime.start.minute;
    const endHour = this.bettingTime.end.hour;
    const endMinute = this.bettingTime.end.minute;
    
    // Chuyển đổi sang số phút trong ngày để dễ so sánh
    const currentMinutes = hour * 60 + minute;
    const startMinutes = startHour * 60 + startMinute;
    const endMinutes = endHour * 60 + endMinute;
    
    return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
  },
  
  formatVietnamDate: function(date) {
    // Format date theo định dạng Việt Nam
    const d = new Date(date);
    const utc = d.getTime() + (d.getTimezoneOffset() * 60000);
    const vietnamTime = new Date(utc + (7 * 60 * 60000));
    
    return vietnamTime.toLocaleDateString('vi-VN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  }
};