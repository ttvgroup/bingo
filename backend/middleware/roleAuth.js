const User = require('../models/User');
const ApiError = require('../utils/error');
const asyncHandler = require('../utils/asyncHandler');

/**
 * Kiểm tra vai trò người dùng
 * @param {string[]} roles - Các vai trò được phép truy cập
 * @returns {Function} - Middleware function
 */
module.exports = (...roles) => {
  return asyncHandler(async (req, res, next) => {
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
  });
}; 