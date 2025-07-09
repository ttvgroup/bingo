const { createClient } = require('redis');
const config = require('./index');
const logger = require('../utils/logger');

let redisClient = null;

/**
 * Khởi tạo Redis client
 */
const initRedisClient = async () => {
  try {
    // Tạo Redis client
    redisClient = createClient({
      url: config.REDIS_URL || 'redis://localhost:6379'
    });

    // Xử lý sự kiện kết nối
    redisClient.on('connect', () => {
      logger.info('Redis client connected');
    });

    // Xử lý sự kiện lỗi
    redisClient.on('error', (err) => {
      logger.error(`Redis client error: ${err.message}`);
    });

    // Kết nối Redis
    await redisClient.connect();
    
    return true;
  } catch (error) {
    logger.error(`Redis connection error: ${error.message}`);
    redisClient = null;
    return false;
  }
};

/**
 * Lấy Redis client
 */
const getRedisClient = () => {
  return redisClient;
};

/**
 * Đóng kết nối Redis
 */
const closeRedisConnection = async () => {
  if (redisClient) {
    await redisClient.quit();
    logger.info('Redis connection closed');
  }
};

// Tạo mock Redis client nếu không thể kết nối
const createMockRedisClient = () => {
  const cache = new Map();
  
  return {
    isOpen: false,
    isMock: true,
    
    get: async (key) => {
      logger.debug(`[Mock Redis] GET ${key}`);
      return cache.get(key);
    },
    
    set: async (key, value) => {
      logger.debug(`[Mock Redis] SET ${key}`);
      cache.set(key, value);
      return 'OK';
    },
    
    setEx: async (key, ttl, value) => {
      logger.debug(`[Mock Redis] SETEX ${key} ${ttl}`);
      cache.set(key, value);
      setTimeout(() => cache.delete(key), ttl * 1000);
      return 'OK';
    },
    
    del: async (key) => {
      logger.debug(`[Mock Redis] DEL ${key}`);
      return cache.delete(key) ? 1 : 0;
    },
    
    quit: async () => {
      logger.debug('[Mock Redis] QUIT');
      cache.clear();
      return 'OK';
    }
  };
};

// Fallback nếu Redis không khả dụng
const getFallbackRedisClient = () => {
  if (!redisClient) {
    logger.warn('Redis not available, using mock implementation');
    return createMockRedisClient();
  }
  return redisClient;
};

module.exports = {
  initRedisClient,
  getRedisClient: getFallbackRedisClient,
  closeRedisConnection
};