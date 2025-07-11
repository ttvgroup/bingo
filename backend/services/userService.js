const User = require('../models/User');
const ApiError = require('../utils/error');
const mongoose = require('mongoose');
const redisClient = require('../config/redis');
const logger = require('../utils/logger');
const { getCacheKey } = require('./cacheService');
const crypto = require('crypto');

// Định nghĩa ID và tên cho tài khoản Pool
const POOL_TELEGRAM_ID = 'system_betting_pool';
const POOL_USERNAME = 'System Betting Pool';

/**
 * Lấy tài khoản Pool của hệ thống
 * Tài khoản này sẽ giữ tiền đặt cược của người dùng
 * @returns {Object} Tài khoản Pool
 */
exports.getPoolAccount = async () => {
  try {
    // Kiểm tra cache
    const cacheKey = getCacheKey('SYSTEM_POOL_ACCOUNT');
    const cachedData = await redisClient.get(cacheKey);
    
    if (cachedData) {
      return JSON.parse(cachedData);
    }
    
    // Tìm tài khoản Pool trong database
    const poolAccount = await User.findOne({ telegramId: POOL_TELEGRAM_ID });
    
    if (!poolAccount) {
      throw new ApiError('Tài khoản Pool chưa được tạo. Vui lòng liên hệ Admin để thiết lập.', 500);
    }
    
    // Lưu vào cache
    await redisClient.setEx(cacheKey, 3600, JSON.stringify(poolAccount));
    
    return poolAccount;
  } catch (error) {
    logger.error(`Lỗi khi lấy tài khoản Pool: ${error.message}`, { stack: error.stack });
    throw new ApiError('Không thể lấy tài khoản Pool', 500);
  }
};

/**
 * Khởi tạo tài khoản Pool (chỉ Admin mới có thể gọi)
 * @param {String} adminId - ID của admin thực hiện
 * @returns {Object} Tài khoản Pool đã tạo
 */
exports.initializePoolAccount = async (adminId) => {
  try {
    // Kiểm tra xem tài khoản Pool đã tồn tại chưa
    let poolAccount = await User.findOne({ telegramId: POOL_TELEGRAM_ID });
    
    if (poolAccount) {
      throw new ApiError('Tài khoản Pool đã tồn tại', 400);
    }
    
    // Tạo mã bảo mật ngẫu nhiên
    const securityToken = crypto.randomBytes(32).toString('hex');
    
    // Tạo tài khoản Pool mới (không có quyền Admin)
    poolAccount = await User.create({
      telegramId: POOL_TELEGRAM_ID,
      username: POOL_USERNAME,
      role: 'user', // Không có quyền Admin
      balance: 0,
      twoFactorEnabled: false,
      metaData: {
        isPoolAccount: true,
        createdBy: adminId,
        createdAt: new Date(),
        securityToken
      }
    });
    
    logger.info(`Admin ${adminId} đã tạo tài khoản Pool: ${POOL_TELEGRAM_ID}`);
    
    // Lưu vào cache
    const cacheKey = getCacheKey('SYSTEM_POOL_ACCOUNT');
    await redisClient.setEx(cacheKey, 3600, JSON.stringify(poolAccount));
    
    return poolAccount;
  } catch (error) {
    logger.error(`Lỗi khi tạo tài khoản Pool: ${error.message}`, { stack: error.stack });
    throw error;
  }
};

// Các hàm khác của userService... 