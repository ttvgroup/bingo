const User = require('../models/User');
const ApiError = require('../utils/error');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const config = require('../config');
const qrcode = require('qrcode');
const asyncHandler = require('../utils/asyncHandler');

/**
 * Xác thực admin thông qua Telegram
 */
exports.verifyAdmin = asyncHandler(async (req, res, next) => {
  // Kiểm tra xem có token trong header không
  if (!req.headers.authorization || !req.headers.authorization.startsWith('Bearer ')) {
    throw new ApiError('Không có token xác thực', 401);
  }
  
  // Lấy token từ header
  const token = req.headers.authorization.split(' ')[1];
  
  // Giải mã token
  let decoded;
  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
  } catch (err) {
    throw new ApiError('Token không hợp lệ hoặc đã hết hạn', 401);
  }
  
  // Kiểm tra xem người dùng có tồn tại không
  const admin = await User.findOne({ telegramId: decoded.id, role: 'admin' });
  
  if (!admin) {
    throw new ApiError('Người dùng không có quyền admin', 403);
  }
  
  // Lưu thông tin admin vào request
  req.adminUser = admin;
  next();
});

/**
 * Xác thực admin qua thiết bị đã đăng ký
 */
exports.verifyAdminDevice = asyncHandler(async (req, res, next) => {
  // Đầu tiên xác thực admin bình thường
  await exports.verifyAdmin(req, res, () => {});
  
  // Lấy deviceId từ header
  const deviceId = req.headers['x-device-id'];
  
  if (!deviceId) {
    throw new ApiError('Không có ID thiết bị', 401);
  }
  
  const admin = req.adminUser;
  
  // Kiểm tra xem thiết bị có trong danh sách đã đăng ký không
  const device = admin.devices.find(d => d.deviceId === deviceId && d.isVerified);
  
  if (!device) {
    throw new ApiError('Thiết bị chưa được xác thực', 403);
  }
  
  // Cập nhật thời gian đăng nhập gần nhất
  device.lastLogin = new Date();
  await admin.save();
  
  next();
});

/**
 * Tạo mã QR đăng nhập
 */
exports.generateLoginQR = asyncHandler(async (req, res, next) => {
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
});

/**
 * Xác thực mã Telegram
 */
exports.verifyTelegramCode = asyncHandler(async (req, res, next) => {
  const { telegramId, code } = req.body;
  
  if (!telegramId || !code) {
    throw new ApiError('Thiếu thông tin xác thực', 400);
  }
  
  const user = await User.findOne({ 
    telegramId,
    role: 'admin',
    'telegramAuthCode.code': code,
    'telegramAuthCode.expiresAt': { $gt: new Date() }
  });
  
  if (!user) {
    throw new ApiError('Mã xác thực không hợp lệ hoặc đã hết hạn', 401);
  }
  
  // Xóa mã xác thực sau khi đã sử dụng
  user.telegramAuthCode = undefined;
  await user.save();
  
  // Lưu thông tin admin vào request
  req.adminUser = user;
  next();
});

/**
 * Đăng ký thiết bị mới
 */
exports.registerNewDevice = asyncHandler(async (req, res, next) => {
  const { telegramId, deviceId, deviceName, qrToken } = req.body;
  
  if (!telegramId || !deviceId || !deviceName || !qrToken) {
    throw new ApiError('Thiếu thông tin đăng ký thiết bị', 400);
  }
  
  const admin = await User.findOne({
    telegramId,
    role: 'admin',
    'loginQrCode.token': qrToken,
    'loginQrCode.expiresAt': { $gt: new Date() }
  });
  
  if (!admin) {
    throw new ApiError('QR code không hợp lệ hoặc đã hết hạn', 401);
  }
  
  // Lưu thông tin admin vào request
  req.adminUser = admin;
  req.deviceInfo = { deviceId, deviceName };
  next();
});