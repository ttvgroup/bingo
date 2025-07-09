const User = require('../models/User');
const ApiError = require('../utils/error');
const crypto = require('crypto');
const config = require('../config');
const asyncHandler = require('../utils/asyncHandler');
const jwt = require('jsonwebtoken');

/**
 * Xác thực người dùng qua Telegram
 */
exports.verifyTelegramAuth = asyncHandler(async (req, res, next) => {
  // Lấy auth data từ header hoặc body
  let authData = req.headers['x-telegram-auth'] || req.body.auth || req.query.auth;
  
  if (!authData) {
    return next(new ApiError('Authentication required', 401));
  }
  
  // Parse auth data nếu là string
  if (typeof authData === 'string') {
    try {
      authData = JSON.parse(authData);
    } catch (e) {
      return next(new ApiError('Invalid authentication data format', 401));
    }
  }
  
  // Kiểm tra dữ liệu xác thực
  if (!authData.id || !authData.hash || !authData.auth_date) {
    return next(new ApiError('Incomplete authentication data', 401));
  }
  
  // Kiểm tra thời gian xác thực (không quá 1 giờ)
  const authTimestamp = parseInt(authData.auth_date);
  const currentTime = Math.floor(Date.now() / 1000);
  
  if (currentTime - authTimestamp > 3600) {
    return next(new ApiError('Authentication expired', 401));
  }
  
  // Xác thực hash
  const secretKey = crypto
    .createHash('sha256')
    .update(config.telegramBotToken)
    .digest();
  
  const dataCheckString = Object.keys(authData)
    .filter(key => key !== 'hash')
    .sort()
    .map(key => `${key}=${authData[key]}`)
    .join('\n');
  
  const hash = crypto
    .createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');
  
  if (hash !== authData.hash) {
    return next(new ApiError('Invalid authentication hash', 401));
  }
  
  // Tìm hoặc tạo user
  let user = await User.findOne({ telegramId: authData.id });
  
  if (!user) {
    // Nếu không tìm thấy user, tạo mới với vai trò mặc định
    user = await User.create({
      telegramId: authData.id,
      username: authData.username || `user${authData.id}`,
      balance: 1000 // Số dư mặc định
    });
  }
  
  // Lưu thông tin user vào request
  req.user = {
    _id: user._id,
    telegramId: user.telegramId,
    username: user.username,
    role: user.role,
    balance: user.balance
  };
  
  next();
});

/**
 * Xác thực người dùng thông thường (dùng cho các route cần đăng nhập)
 */
exports.verifyUser = asyncHandler(async (req, res, next) => {
  // Kiểm tra xem có token trong header không
  if (!req.headers.authorization || !req.headers.authorization.startsWith('Bearer ')) {
    return next(new ApiError('Không có token xác thực', 401));
  }
  
  // Lấy token từ header
  const token = req.headers.authorization.split(' ')[1];
  
  // Giải mã token
  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
  } catch (err) {
    return next(new ApiError('Token không hợp lệ hoặc đã hết hạn', 401));
  }
  
  // Kiểm tra xem người dùng có tồn tại không
  const user = await User.findOne({ telegramId: decoded.id });
  
  if (!user) {
    return next(new ApiError('Người dùng không tồn tại', 401));
  }
  
  // Lưu thông tin user vào request
  req.user = {
    _id: user._id,
    telegramId: user.telegramId,
    username: user.username,
    role: user.role,
    balance: user.balance
  };
  
  next();
});

/**
 * Giới hạn truy cập theo vai trò
 * @param  {...String} roles - Các vai trò được phép truy cập
 */
exports.restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return next(new ApiError('Authentication required', 401));
    }
    
    if (!roles.includes(req.user.role)) {
      return next(new ApiError('Unauthorized - Insufficient permissions', 403));
    }
    
    next();
  };
};