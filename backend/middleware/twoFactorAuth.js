const User = require('../models/User');
const ApiError = require('../utils/error');
const crypto = require('crypto');
const asyncHandler = require('../utils/asyncHandler');
const telegramService = require('../services/telegramService');
const auditService = require('../services/auditService');
const redisClient = require('../config/redis');

/**
 * Tạo mã xác thực ngẫu nhiên
 * @private
 */
function generateVerificationCode() {
  // Tạo mã 6 chữ số
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Tạo và lưu mã xác thực vào Redis với thời gian hết hạn
 * @private
 */
async function storeVerificationCode(userId, purpose) {
  const code = generateVerificationCode();
  const key = `2fa:${purpose}:${userId}`;
  const ttl = 5 * 60; // 5 phút
  
  // Lưu mã vào Redis với thời gian hết hạn
  await redisClient.setEx(key, ttl, code);
  
  return code;
}

/**
 * Xác thực mã từ Redis
 * @private
 */
async function verifyCode(userId, purpose, code) {
  const key = `2fa:${purpose}:${userId}`;
  
  // Lấy mã từ Redis
  const storedCode = await redisClient.get(key);
  
  if (!storedCode || storedCode !== code) {
    return false;
  }
  
  // Xóa mã sau khi xác thực thành công để tránh sử dụng lại
  await redisClient.del(key);
  
  return true;
}

/**
 * Gửi mã xác thực qua Telegram
 * @route POST /api/auth/2fa/send-code
 * @access Private
 */
exports.sendVerificationCode = asyncHandler(async (req, res) => {
  const user = req.user || req.adminUser;
  const { purpose } = req.body;
  
  if (!user) {
    throw new ApiError('Không tìm thấy thông tin người dùng', 401);
  }
  
  if (!purpose) {
    throw new ApiError('Thiếu thông tin mục đích xác thực', 400);
  }
  
  // Lấy thông tin client để lưu vào log
  const clientIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  const userAgent = req.headers['user-agent'];
  
  // Giới hạn số lần gửi mã
  const rateKey = `2fa:rate:${user._id}`;
  const rateCount = await redisClient.get(rateKey);
  
  if (rateCount && parseInt(rateCount) >= 5) {
    throw new ApiError('Đã vượt quá giới hạn gửi mã xác thực. Vui lòng thử lại sau 15 phút', 429);
  }
  
  // Tạo và lưu mã xác thực
  const code = await storeVerificationCode(user._id, purpose);
  
  // Tăng bộ đếm giới hạn
  await redisClient.incr(rateKey);
  if (!rateCount) {
    await redisClient.expire(rateKey, 15 * 60); // 15 phút
  }
  
  // Gửi mã qua Telegram
  await telegramService.sendTwoFactorCode(user.telegramId, code, purpose);
  
  // Ghi log
  await auditService.logAction({
    userId: user._id,
    action: 'two_factor_code_sent',
    ipAddress: clientIp,
    deviceInfo: userAgent,
    targetId: user._id,
    targetType: 'User',
    details: {
      purpose,
      timestamp: new Date()
    }
  });
  
  res.status(200).json({
    success: true,
    message: 'Mã xác thực đã được gửi qua Telegram'
  });
});

/**
 * Xác thực hai lớp cho các hành động quan trọng
 * @middleware
 */
exports.requireTwoFactor = asyncHandler(async (req, res, next) => {
  const user = req.user || req.adminUser;
  const { twoFactorCode, purpose } = req.body;
  
  if (!user) {
    throw new ApiError('Không tìm thấy thông tin người dùng', 401);
  }
  
  if (!twoFactorCode) {
    throw new ApiError('Vui lòng cung cấp mã xác thực hai lớp', 400);
  }
  
  if (!purpose) {
    throw new ApiError('Thiếu thông tin mục đích xác thực', 400);
  }
  
  // Xác thực mã
  const isValid = await verifyCode(user._id, purpose, twoFactorCode);
  
  if (!isValid) {
    // Lấy thông tin client để lưu vào log
    const clientIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'];
    
    // Ghi log thất bại
    await auditService.logAction({
      userId: user._id,
      action: 'two_factor_failed',
      ipAddress: clientIp,
      deviceInfo: userAgent,
      targetId: user._id,
      targetType: 'User',
      details: {
        purpose,
        timestamp: new Date()
      }
    });
    
    throw new ApiError('Mã xác thực không hợp lệ hoặc đã hết hạn', 401);
  }
  
  // Lưu thông tin xác thực vào request để sử dụng ở middleware tiếp theo
  req.twoFactorVerified = true;
  req.twoFactorPurpose = purpose;
  
  next();
});

/**
 * Xác thực giao dịch lớn
 * @middleware
 */
exports.requireTransactionVerification = asyncHandler(async (req, res, next) => {
  const { amount } = req.body;
  
  // Nếu số tiền giao dịch lớn hơn ngưỡng, yêu cầu xác thực hai lớp
  if (amount && amount >= 1000000) {
    if (!req.twoFactorVerified || req.twoFactorPurpose !== 'transaction') {
      throw new ApiError('Giao dịch lớn yêu cầu xác thực hai lớp', 403);
    }
  }
  
  next();
});

/**
 * Xác thực QR code từ thiết bị thứ hai
 * @middleware
 */
exports.verifySecondDeviceQR = asyncHandler(async (req, res, next) => {
  const user = req.user || req.adminUser;
  const { qrToken } = req.body;
  
  if (!user) {
    throw new ApiError('Không tìm thấy thông tin người dùng', 401);
  }
  
  if (!qrToken) {
    throw new ApiError('Vui lòng cung cấp mã QR từ thiết bị thứ hai', 400);
  }
  
  // Xác thực QR token
  const qrKey = `qr:${user._id}:${qrToken}`;
  const isValid = await redisClient.get(qrKey);
  
  if (!isValid) {
    throw new ApiError('Mã QR không hợp lệ hoặc đã hết hạn', 401);
  }
  
  // Xóa token sau khi xác thực thành công
  await redisClient.del(qrKey);
  
  // Lưu thông tin xác thực vào request
  req.qrVerified = true;
  
  next();
});

/**
 * Tạo QR code cho thiết bị thứ hai
 * @route GET /api/auth/2fa/qr-code
 * @access Private
 */
exports.generateQRCode = asyncHandler(async (req, res) => {
  const user = req.user || req.adminUser;
  
  if (!user) {
    throw new ApiError('Không tìm thấy thông tin người dùng', 401);
  }
  
  // Tạo token ngẫu nhiên
  const qrToken = crypto.randomBytes(32).toString('hex');
  
  // Lưu token vào Redis với thời gian hết hạn 5 phút
  const qrKey = `qr:${user._id}:${qrToken}`;
  await redisClient.setEx(qrKey, 5 * 60, 'valid');
  
  // Tạo dữ liệu QR
  const qrData = {
    token: qrToken,
    userId: user._id.toString(),
    timestamp: Date.now(),
    type: 'second_device_auth'
  };
  
  res.status(200).json({
    success: true,
    qrData: JSON.stringify(qrData),
    expiresIn: 5 * 60 // 5 phút
  });
}); 