const User = require('../models/User');
const ApiError = require('../utils/error');
const speakeasy = require('speakeasy'); // Cần cài đặt nếu chưa có

/**
 * Middleware kiểm tra xác thực hai yếu tố (2FA) cho tài khoản admin
 * Yêu cầu admin đã bật 2FA phải cung cấp token OTP trong header X-2FA-Token
 */
exports.require2FA = async (req, res, next) => {
  try {
    // Chỉ kiểm tra cho admin
    if (!req.user || req.user.role !== 'admin') {
      return next(new ApiError('Không có quyền truy cập', 403));
    }

    // Kiểm tra xem admin có bật 2FA không
    const user = await User.findById(req.user._id);
    if (!user) {
      return next(new ApiError('Không tìm thấy người dùng', 404));
    }

    // Nếu chưa bật 2FA, bỏ qua
    if (!user.twoFactorEnabled) {
      return next();
    }

    // Lấy token 2FA từ header
    const token = req.headers['x-2fa-token'];
    if (!token) {
      return next(new ApiError('Yêu cầu xác thực hai yếu tố (2FA). Vui lòng cung cấp token.', 401));
    }

    // Kiểm tra backup code
    if (user.twoFactorBackupCodes && user.twoFactorBackupCodes.includes(token)) {
      // Nếu là backup code hợp lệ, xóa backup code này và cho phép truy cập
      user.twoFactorBackupCodes = user.twoFactorBackupCodes.filter(code => code !== token);
      await user.save();
      return next();
    }

    // Xác thực token OTP
    try {
      const verified = speakeasy.totp.verify({
        secret: user.twoFactorSecret,
        encoding: 'base32',
        token: token,
        window: 1 // Cho phép token trước và sau 30 giây
      });

      if (!verified) {
        return next(new ApiError('Mã xác thực 2FA không hợp lệ hoặc đã hết hạn', 401));
      }

      next();
    } catch (error) {
      return next(new ApiError('Lỗi xác thực 2FA: ' + error.message, 500));
    }
  } catch (error) {
    next(error);
  }
};

/**
 * Middleware kiểm tra hạn chế IP cho admin
 */
exports.ipRestriction = async (req, res, next) => {
  try {
    // Chỉ kiểm tra cho admin
    if (!req.user || req.user.role !== 'admin') {
      return next(new ApiError('Không có quyền truy cập', 403));
    }

    const user = await User.findById(req.user._id);
    if (!user) {
      return next(new ApiError('Không tìm thấy người dùng', 404));
    }

    // Nếu admin không bật tính năng này hoặc không có danh sách IP cho phép, bỏ qua
    if (!user.securitySettings?.requireIpVerification || !user.allowedIps || user.allowedIps.length === 0) {
      return next();
    }

    // Lấy IP của người dùng
    const ip = req.ip || 
               req.connection.remoteAddress || 
               req.socket.remoteAddress || 
               req.headers['x-forwarded-for'];

    // Kiểm tra IP có trong danh sách cho phép không
    if (!user.allowedIps.includes(ip)) {
      // Ghi log về việc truy cập bị từ chối
      console.error(`Admin access denied from unauthorized IP: ${ip} for user: ${user.username || user.telegramId}`);
      
      return next(new ApiError('Địa chỉ IP của bạn không được phép truy cập. Vui lòng liên hệ quản trị viên.', 403));
    }

    next();
  } catch (error) {
    next(error);
  }
}; 