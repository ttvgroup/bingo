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
  
  bettingHoursStart: parseInt(process.env.BETTING_HOURS_START) || 0, // UTC hour to start (00:00)
  bettingHoursEnd: parseInt(process.env.BETTING_HOURS_END) || 8, // UTC hour to end (08:00)
  
  // Security configs
  allowedOrigins: process.env.ALLOWED_ORIGINS ? process.env.ALLOWED_ORIGINS.split(',') : ['http://localhost:3000'],
  rateLimiting: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW) || 15 * 60 * 1000, // 15 minutes
    max: parseInt(process.env.RATE_LIMIT_MAX) || 100 // 100 requests per window
  }
};