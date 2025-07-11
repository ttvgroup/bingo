const dotenv = require('dotenv');
const dateHelper = require('../utils/dateHelper');
dotenv.config();

const config = {
  MONGODB_URI: process.env.MONGO_URI || "mongodb://localhost:27017/telegram-lottery",
  PORT: process.env.PORT || 5000,
  REDIS_URL: process.env.REDIS_URL || "redis://localhost:6379",
  nodeEnv: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',
  allowedOrigins: process.env.ALLOWED_ORIGINS || '*',
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || 'your-telegram-bot-token',
  cacheExpiry: parseInt(process.env.CACHE_TTL_MEDIUM || '3600'),
  
  // Cấu hình thời gian đặt cược mặc định (sẽ được ghi đè bởi cấu hình từ database)
  bettingTime: {
    start: { hour: 0, minute: 1 },  // 00:01
    end: { hour: 15, minute: 30 }   // 15:30
  },
  
  // Định dạng ngày tháng mặc định
  dateFormat: 'DD/MM/YYYY',
  dateTimeFormat: 'DD/MM/YYYY HH:mm',
  timeZone: 'Asia/Ho_Chi_Minh', // GMT+7
  
  // Hàm lấy thời gian Việt Nam (GMT+7)
  getVietnamTime: () => {
    return dateHelper.getCurrentVietnamTime();
  },
  
  // Hàm định dạng ngày theo kiểu Việt Nam
  formatDateVN: (date) => {
    return dateHelper.formatDateVN(date);
  },
  
  // Hàm định dạng ngày giờ theo kiểu Việt Nam
  formatDateTimeVN: (date) => {
    return dateHelper.formatDateTimeVN(date);
  },
  
  // Hàm kiểm tra thời gian đặt cược (sẽ được ghi đè bởi configService)
  isWithinBettingHours: () => {
    const vietnamTime = dateHelper.getCurrentVietnamTime();
    const currentHour = vietnamTime.getUTCHours();
    const currentMinute = vietnamTime.getUTCMinutes();
    
    const startHour = config.bettingTime.start.hour;
    const startMinute = config.bettingTime.start.minute;
    const endHour = config.bettingTime.end.hour;
    const endMinute = config.bettingTime.end.minute;
    
    // Tính toán thời gian hiện tại, bắt đầu và kết thúc tính bằng phút
    const currentTimeInMinutes = currentHour * 60 + currentMinute;
    const startTimeInMinutes = startHour * 60 + startMinute;
    const endTimeInMinutes = endHour * 60 + endMinute;
    
    return currentTimeInMinutes >= startTimeInMinutes && currentTimeInMinutes <= endTimeInMinutes;
  }
};

// Hàm cập nhật cấu hình từ database
config.updateFromDatabase = async (configService) => {
  try {
    if (configService) {
      // Cập nhật thời gian đặt cược
      const bettingHours = await configService.getBettingHours();
      if (bettingHours) {
        config.bettingTime = bettingHours;
      }
      
      // Ghi đè hàm kiểm tra thời gian đặt cược
      const originalIsWithinBettingHours = config.isWithinBettingHours;
      config.isWithinBettingHours = async () => {
        return await configService.isWithinBettingHours();
      };
      
      // Giữ lại phiên bản đồng bộ cho khả năng tương thích ngược
      config.isWithinBettingHoursSynchronous = originalIsWithinBettingHours;
    }
  } catch (error) {
    console.error('Lỗi khi cập nhật cấu hình từ database:', error);
  }
};

module.exports = config;
