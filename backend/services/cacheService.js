const redisClient = require('../config/redis').getRedisClient();
const logger = require('../utils/logger');
const config = require('../config');

// Định nghĩa các khóa cache
const CACHE_KEYS = {
  // Người dùng
  USER_PROFILE: 'user:profile:',
  USER_BETS: 'user:bets:',
  USER_TRANSACTIONS: 'user:transactions:',
  USER_STATS: 'user:stats:',
  
  // Cược
  BET_DETAIL: 'bet:detail:',
  BET_TYPES: 'bet:types',
  
  // Kết quả
  RESULT_LATEST: 'result:latest',
  RESULT_BY_ID: 'result:id:',
  RESULT_BY_DATE: 'result:date:',
  RESULT_FILTER: 'result:filter:',
  
  // Thống kê
  STATS_PUBLIC: 'stats:public',
  STATS_FREQUENCY: 'stats:frequency:',
  
  // Cấu hình
  CONFIG: 'config:',
  
  // Khác
  SYSTEM: 'system:'
};

// Lấy khóa cache đầy đủ
exports.getCacheKey = (key, suffix = '') => {
  if (!CACHE_KEYS[key]) {
    throw new Error(`Invalid cache key: ${key}`);
  }
  
  return `${config.nodeEnv || 'development'}:${CACHE_KEYS[key]}${suffix}`;
};

/**
 * Lấy dữ liệu từ cache
 * @param {String} key - Khóa cache
 * @param {String} suffix - Hậu tố cho khóa
 * @returns {Promise<any>} - Dữ liệu từ cache
 */
exports.getCache = async (key, suffix = '') => {
  try {
    if (!redisClient || !redisClient.isOpen) {
      logger.warn('Redis client not available, skipping cache get');
      return null;
    }
    
    const cacheKey = exports.getCacheKey(key, suffix);
    const data = await redisClient.get(cacheKey);
    
    return data ? JSON.parse(data) : null;
  } catch (error) {
    logger.error(`Error getting cache for key ${key}: ${error.message}`, { stack: error.stack });
    return null;
  }
};

/**
 * Lưu dữ liệu vào cache
 * @param {String} key - Khóa cache
 * @param {String} suffix - Hậu tố cho khóa
 * @param {any} data - Dữ liệu cần lưu
 * @param {Number} ttl - Thời gian sống (giây)
 * @returns {Promise<Boolean>} - Kết quả lưu cache
 */
exports.setCache = async (key, suffix = '', data, ttl = 300) => {
  try {
    if (!redisClient || !redisClient.isOpen) {
      logger.warn('Redis client not available, skipping cache set');
      return false;
    }
    
    const cacheKey = exports.getCacheKey(key, suffix);
    const serializedData = JSON.stringify(data);
    
    if (ttl > 0) {
      await redisClient.setEx(cacheKey, ttl, serializedData);
    } else {
      await redisClient.set(cacheKey, serializedData);
    }
    
    return true;
  } catch (error) {
    logger.error(`Error setting cache for key ${key}: ${error.message}`, { stack: error.stack });
    return false;
  }
};

/**
 * Xóa dữ liệu từ cache
 * @param {String} key - Khóa cache
 * @param {String} suffix - Hậu tố cho khóa
 * @returns {Promise<Boolean>} - Kết quả xóa cache
 */
exports.deleteCache = async (key, suffix = '') => {
  try {
    if (!redisClient || !redisClient.isOpen) {
      logger.warn('Redis client not available, skipping cache delete');
      return false;
    }
    
    const cacheKey = exports.getCacheKey(key, suffix);
    await redisClient.del(cacheKey);
    
    return true;
  } catch (error) {
    logger.error(`Error deleting cache for key ${key}: ${error.message}`, { stack: error.stack });
    return false;
  }
};

/**
 * Xóa nhiều cache theo pattern
 * @param {String} pattern - Mẫu khóa cache
 * @returns {Promise<Boolean>} - Kết quả xóa cache
 */
exports.deleteByPattern = async (pattern) => {
  try {
    if (!redisClient || !redisClient.isOpen) {
      logger.warn('Redis client not available, skipping pattern delete');
      return false;
    }
    
    const fullPattern = `${config.nodeEnv || 'development'}:${pattern}*`;
    const keys = await redisClient.keys(fullPattern);
    
    if (keys.length > 0) {
      await redisClient.del(keys);
      logger.info(`Deleted ${keys.length} keys matching pattern: ${pattern}*`);
    }
    
    return true;
  } catch (error) {
    logger.error(`Error deleting cache by pattern ${pattern}: ${error.message}`, { stack: error.stack });
    return false;
  }
};

/**
 * Lấy dữ liệu từ cache hoặc hàm fallback
 * @param {String} key - Khóa cache
 * @param {String} suffix - Hậu tố cho khóa
 * @param {Function} fallbackFn - Hàm fallback nếu không có cache
 * @param {Number} ttl - Thời gian sống (giây)
 * @returns {Promise<any>} - Dữ liệu từ cache hoặc fallback
 */
exports.getOrSetCache = async (key, suffix, fallbackFn, ttl = 300) => {
  try {
    // Thử lấy từ cache trước
    const cachedData = await exports.getCache(key, suffix);
    
    if (cachedData !== null) {
      return cachedData;
    }
    
    // Nếu không có cache, gọi hàm fallback
    const data = await fallbackFn();
    
    // Lưu kết quả vào cache
    await exports.setCache(key, suffix, data, ttl);
    
    return data;
  } catch (error) {
    logger.error(`Error in getOrSetCache for key ${key}: ${error.message}`, { stack: error.stack });
    
    // Nếu có lỗi, gọi fallback mà không lưu cache
    return await fallbackFn();
  }
}; 