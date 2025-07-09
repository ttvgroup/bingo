module.exports = { 
  MONGODB_URI: "mongodb://localhost:27017/telegram-lottery", 
  PORT: 5000,
  REDIS_URL: "redis://localhost:6379",
  nodeEnv: process.env.NODE_ENV || 'development',
  logLevel: process.env.LOG_LEVEL || 'info',
  allowedOrigins: process.env.ALLOWED_ORIGINS || '*',
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN || 'your-telegram-bot-token',
  cacheExpiry: 3600
};
