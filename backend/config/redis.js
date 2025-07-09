const redis = require('redis');
const { promisify } = require('util');
const config = require('./index');
const logger = require('../utils/logger');

// Cấu hình Redis
const redisConfig = {
  url: config.redisUrl || 'redis://localhost:6379',
  socket: {
    reconnectStrategy: (retries) => {
      if (retries > 10) {
        logger.error('Redis reconnect failed after 10 attempts');
        return new Error('Redis reconnect failed after 10 attempts');
      }
      return Math.min(retries * 100, 3000); // Tăng dần thời gian reconnect, tối đa 3s
    },
    connectTimeout: 10000 // 10 seconds
  }
};

// Tạo Redis client
let redisClient;

// Khởi tạo và kết nối Redis client
const initRedisClient = async () => {
  try {
    redisClient = redis.createClient(redisConfig);

    // Xử lý sự kiện kết nối
    redisClient.on('connect', () => {
      logger.info('Redis client connected');
    });

    // Xử lý sự kiện lỗi
    redisClient.on('error', (err) => {
      logger.error(`Redis client error: ${err.message}`);
    });

    // Xử lý sự kiện kết nối lại
    redisClient.on('reconnecting', () => {
      logger.info('Redis client reconnecting');
    });

    // Xử lý sự kiện kết nối lại thành công
    redisClient.on('ready', () => {
      logger.info('Redis client ready');
    });

    // Kết nối Redis
    await redisClient.connect();

    // Ping để kiểm tra kết nối
    const pingResult = await redisClient.ping();
    logger.info(`Redis ping result: ${pingResult}`);

    return redisClient;
  } catch (error) {
    logger.error(`Error initializing Redis client: ${error.message}`, { stack: error.stack });
    // Không throw lỗi để ứng dụng vẫn có thể chạy mà không có Redis
    return null;
  }
};

// Cấu hình cache
const CACHE_TTL = {
  SHORT: 60, // 1 phút
  MEDIUM: 300, // 5 phút
  LONG: 3600, // 1 giờ
  VERY_LONG: 86400, // 1 ngày
  PERMANENT: -1 // Không hết hạn
};

// Export Redis client và các hàm tiện ích
module.exports = {
  initRedisClient,
  getRedisClient: () => redisClient,
  CACHE_TTL,
  isConnected: () => redisClient && redisClient.isOpen
};