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

/**
 * Lấy thông tin người dùng theo _id
 * @param {String} id - _id của user
 * @returns {Object} - User
 */
exports.getUserById = async (id) => {
  const user = await User.findById(id);
  if (!user) throw new ApiError('Không tìm thấy người dùng', 404);
  return user;
};

/**
 * Lấy thông tin người dùng theo telegramId
 * @param {String} telegramId
 * @returns {Object} - User
 */
exports.getUserByTelegramId = async (telegramId) => {
  const user = await User.findOne({ telegramId });
  if (!user) throw new ApiError('Không tìm thấy người dùng', 404);
  return user;
};

/**
 * Lấy tất cả người dùng (có phân trang)
 * @param {Object} options - { page, limit, search }
 * @returns {Object} - { users, total, totalPages, currentPage }
 */
exports.getAllUsers = async (options = {}) => {
  const { page = 1, limit = 10, search = '' } = options;
  let query = {};
  if (search) {
    query = {
      $or: [
        { username: { $regex: search, $options: 'i' } },
        { telegramId: { $regex: search, $options: 'i' } }
      ]
    };
  }
  const users = await User.find(query)
    .select('-telegramAuthCode -loginQrCode')
    .sort({ createdAt: -1 })
    .skip((page - 1) * limit)
    .limit(limit);
  const total = await User.countDocuments(query);
  return {
    users,
    total,
    totalPages: Math.ceil(total / limit),
    currentPage: page
  };
};

/**
 * Tạo người dùng mới
 * @param {Object} data - { telegramId, username, balance, role }
 * @returns {Object} - User
 */
exports.createUser = async (data) => {
  if (!data.telegramId || !data.username) {
    throw new ApiError('Vui lòng cung cấp đầy đủ thông tin', 400);
  }
  let user = await User.findOne({ telegramId: data.telegramId });
  if (user) throw new ApiError('Người dùng đã tồn tại', 400);
  user = new User({
    _id: data.telegramId,
    telegramId: data.telegramId,
    username: data.username,
    balance: data.balance || 1000,
    role: data.role || 'user'
  });
  await user.save();
  return user;
};

/**
 * Cập nhật thông tin người dùng
 * @param {String} id - _id của user
 * @param {Object} data - Thông tin cập nhật
 * @returns {Object} - User
 */
exports.updateUser = async (id, data) => {
  const user = await User.findById(id);
  if (!user) throw new ApiError('Không tìm thấy người dùng', 404);
  Object.assign(user, data);
  await user.save();
  return user;
};

/**
 * Lấy profile người dùng (ẩn trường nhạy cảm)
 * @param {String} telegramId
 * @returns {Object} - User profile
 */
exports.getUserProfile = async (telegramId) => {
  const user = await User.findOne({ telegramId }).select('-telegramAuthCode -loginQrCode');
  if (!user) throw new ApiError('Không tìm thấy người dùng', 404);
  return user;
};

/**
 * Cập nhật số dư người dùng (atomic)
 * @param {String} telegramId
 * @param {Number} amount - Số tiền cộng/trừ
 * @returns {Object} - User
 */
exports.updateUserBalance = async (telegramId, amount) => {
  const user = await User.findOneAndUpdate(
    { telegramId, balance: { $gte: -amount } },
    { $inc: { balance: amount } },
    { new: true }
  );
  if (!user) throw new ApiError('Không tìm thấy người dùng hoặc số dư không đủ', 400);
  return user;
};

/**
 * Lấy thống kê người dùng
 * @param {String} userId
 * @returns {Object} - Thống kê
 */
exports.getUserStats = async (userId) => {
  // Có thể bổ sung logic thống kê chi tiết hơn nếu cần
  // Placeholder: trả về tổng số cược, tổng thắng, tổng thua, tổng số dư
  const user = await User.findById(userId);
  if (!user) throw new ApiError('Không tìm thấy người dùng', 404);
  // Thống kê khác có thể lấy từ Bet, Transaction...
  return {
    balance: user.balance,
    totalBetAmount: user.totalBetAmount || 0,
    loyaltyPoints: user.loyaltyPoints || 0,
    achievedMilestones: user.achievedMilestones || []
  };
};

/**
 * Lấy user theo affiliateCode
 * @param {String} code
 * @returns {Object} - User
 */
exports.getUserByAffiliateCode = async (code) => {
  const user = await User.findOne({ affiliateCode: code });
  if (!user) throw new ApiError('Không tìm thấy user với mã giới thiệu này', 404);
  return user;
};

/**
 * Lấy hoặc tạo user mới (dùng cho Telegram bot)
 * @param {String} telegramId
 * @param {String} username
 * @returns {Object} - User
 */
exports.getOrCreateUser = async (telegramId, username) => {
  let user = await User.findOne({ telegramId });
  if (!user) {
    user = new User({
      _id: telegramId,
      telegramId,
      username,
      balance: 0,
      role: 'user'
    });
    await user.save();
  }
  return user;
};

// Các hàm khác của userService... 