const User = require('../models/User');
const ApiError = require('../utils/error');
const crypto = require('crypto');
const config = require('../config');

/**
 * Xác thực người dùng Telegram
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
exports.verifyTelegramAuth = async (req, res, next) => {
  try {
    const { hash, ...userData } = req.body.telegram || {};
    
    if (!hash) {
      throw new ApiError(401, 'Không có thông tin xác thực Telegram');
    }
    
    // Kiểm tra hash từ Telegram
    const checkHash = verifyTelegramHash(hash, userData);
    if (!checkHash) {
      throw new ApiError(401, 'Thông tin xác thực Telegram không hợp lệ');
    }
    
    // Thêm thông tin user vào request
    req.user = {
      id: userData.id,
      username: userData.username,
      first_name: userData.first_name,
      last_name: userData.last_name
    };
    
    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Hàm xác thực hash từ Telegram
 * @param {string} hash - Hash từ Telegram 
 * @param {Object} userData - Thông tin người dùng
 * @returns {boolean} - Hash có hợp lệ không
 */
function verifyTelegramHash(hash, userData) {
  // Bỏ hash khỏi data để verify
  const dataCheckArray = Object.keys(userData)
    .sort()
    .map(key => `${key}=${userData[key]}`);
  
  const dataCheckString = dataCheckArray.join('\n');
  const secretKey = crypto.createHmac('sha256', 'WebAppData')
    .update(config.telegramBotToken)
    .digest();
  
  const calculatedHash = crypto.createHmac('sha256', secretKey)
    .update(dataCheckString)
    .digest('hex');
  
  return calculatedHash === hash;
}

/**
 * Kiểm tra vai trò người dùng
 * @param {string[]} roles - Các vai trò được phép truy cập
 * @returns {Function} - Middleware function
 */
exports.restrictTo = (...roles) => {
  return async (req, res, next) => {
    try {
      const telegramId = req.user.id;
      const user = await User.findOne({ telegramId });
      
      if (!user) {
        throw new ApiError(404, 'Không tìm thấy người dùng');
      }
      
      if (!roles.includes(user.role)) {
        throw new ApiError(403, `Không có quyền truy cập: Yêu cầu một trong các vai trò ${roles.join(', ')}`);
      }
      
      req.userData = user;
      next();
    } catch (error) {
      next(error);
    }
  };
};