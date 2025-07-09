const User = require('../models/User');
const ApiError = require('../utils/error');
const config = require('../config');
const crypto = require('crypto');
const qrcode = require('qrcode');

/**
 * Kiểm tra xem người dùng có phải là admin
 */
exports.isAdmin = async (req, res, next) => {
  try {
    const user = await User.findOne({ telegramId: req.user.telegramId });

    if (!user || user.role !== 'admin') {
      return next(new ApiError('Unauthorized - Admin access required', 403));
    }

    req.adminUser = user;
    next();
  } catch (error) {
    next(new ApiError('Error verifying admin status', 500));
  }
};

/**
 * Xác thực thiết bị quản trị
 */
exports.verifyAdminDevice = async (req, res, next) => {
  try {
    const { deviceId } = req.body;
    
    if (!deviceId) {
      return next(new ApiError('Device ID is required', 400));
    }
    
    const user = req.adminUser;
    
    // Kiểm tra xem thiết bị đã được xác thực chưa
    const verifiedDevice = user.devices.find(
      device => device.deviceId === deviceId && device.isVerified === true
    );
    
    if (!verifiedDevice) {
      return next(new ApiError('Unauthorized device', 403));
    }
    
    // Cập nhật thời gian đăng nhập mới nhất
    verifiedDevice.lastLogin = new Date();
    await user.save();
    
    next();
  } catch (error) {
    next(new ApiError('Error verifying admin device', 500));
  }
};

/**
 * Tạo mã QR đăng nhập
 */
exports.generateLoginQR = async (req, res, next) => {
  try {
    const user = req.adminUser;
    
    // Tạo token ngẫu nhiên
    const token = crypto.randomBytes(32).toString('hex');
    
    // Lưu token vào user
    user.loginQrCode = {
      token,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000) // 5 phút
    };
    
    await user.save();
    
    // Tạo mã QR
    const qrData = JSON.stringify({
      token,
      userId: user._id.toString(),
      action: 'admin_login'
    });
    
    const qrImage = await qrcode.toDataURL(qrData);
    
    req.qrCode = qrImage;
    next();
  } catch (error) {
    next(new ApiError('Error generating QR code', 500));
  }
};

/**
 * Xác thực từ Telegram web login
 */
exports.verifyTelegramCode = async (req, res, next) => {
  try {
    const { telegramId, authCode } = req.body;
    
    if (!telegramId || !authCode) {
      return next(new ApiError('Telegram ID and auth code are required', 400));
    }
    
    const user = await User.findOne({ telegramId });
    
    if (!user || user.role !== 'admin') {
      return next(new ApiError('Unauthorized - Admin access required', 403));
    }
    
    if (!user.telegramAuthCode || 
        user.telegramAuthCode.code !== authCode || 
        user.telegramAuthCode.expiresAt < new Date()) {
      return next(new ApiError('Invalid or expired authentication code', 401));
    }
    
    // Xóa mã xác thực sau khi sử dụng
    user.telegramAuthCode = undefined;
    await user.save();
    
    req.adminUser = user;
    next();
  } catch (error) {
    next(new ApiError('Error verifying Telegram code', 500));
  }
};

/**
 * Đăng ký thiết bị mới
 */
exports.registerNewDevice = async (req, res, next) => {
  try {
    const { deviceId, deviceName, qrToken } = req.body;
    
    if (!deviceId || !deviceName || !qrToken) {
      return next(new ApiError('Device ID, name and QR token are required', 400));
    }
    
    const user = await User.findOne({
      'loginQrCode.token': qrToken,
      'loginQrCode.expiresAt': { $gt: new Date() }
    });
    
    if (!user || user.role !== 'admin') {
      return next(new ApiError('Invalid or expired QR code', 401));
    }
    
    // Kiểm tra xem thiết bị đã tồn tại chưa
    const existingDevice = user.devices.find(device => device.deviceId === deviceId);
    
    if (existingDevice) {
      existingDevice.isVerified = true;
      existingDevice.lastLogin = new Date();
      existingDevice.deviceName = deviceName;
    } else {
      user.devices.push({
        deviceId,
        deviceName,
        lastLogin: new Date(),
        isVerified: true
      });
    }
    
    // Xóa mã QR sau khi sử dụng
    user.loginQrCode = undefined;
    await user.save();
    
    req.adminUser = user;
    next();
  } catch (error) {
    next(new ApiError('Error registering device', 500));
  }
};