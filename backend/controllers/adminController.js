const mongoose = require('mongoose');
const User = require('../models/User');
const Bet = require('../models/Bet');
const Result = require('../models/Result');
const Transaction = require('../models/Transaction');
const AuditLog = require('../models/AuditLog');
const ApiError = require('../utils/error');
const logger = require('../utils/logger');
const auditService = require('../services/auditService');
const resultVerificationService = require('../services/resultVerificationService');
const speakeasy = require('speakeasy'); // Cần cài đặt nếu chưa có
const qrcode = require('qrcode'); // Cần cài đặt nếu chưa có
const telegramService = require('../services/telegramService');
const crypto = require('crypto');
const { validationResult } = require('express-validator');
const resultService = require('../services/resultService');
const jwt = require('jsonwebtoken'); // Cần cài đặt nếu chưa có
const asyncHandler = require('../utils/asyncHandler');
const redisClient = require('../config/redis');
const userService = require('../services/userService');
const helper = require('../utils/helper');

/**
 * Controller quản lý các chức năng của admin
 * Bao gồm xác nhận thanh toán, kiểm tra kết quả, quản lý người dùng
 */

/**
 * Xác nhận thanh toán cho một cược
 * 
 * @route PUT /api/admin/bets/:id/approve-payment
 */
exports.approveBetPayment = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { note } = req.body;
    const userId = req.user._id;

    // Tìm cược
    const bet = await Bet.findById(id);
    if (!bet) {
      return next(new ApiError('Không tìm thấy cược', 404));
    }

    // Kiểm tra trạng thái hiện tại
    if (bet.paymentStatus !== 'pending') {
      return next(new ApiError(`Không thể xác nhận thanh toán cho cược có trạng thái ${bet.paymentStatus}`, 400));
    }

    // Lưu thông tin trước khi cập nhật để ghi nhật ký
    const previousState = {
      paymentStatus: bet.paymentStatus,
      paymentConfirmedBy: bet.paymentConfirmedBy,
      paymentConfirmedAt: bet.paymentConfirmedAt
    };

    // Cập nhật trạng thái
    bet.paymentStatus = 'approved';
    bet.paymentConfirmedBy = userId;
    bet.paymentConfirmedAt = new Date();
    
    if (note) {
      bet.paymentNote = note;
    }

    // Lưu cược
    await bet.save();

    // Ghi nhật ký kiểm toán
    await auditService.createAuditLog({
      action: 'update',
      resourceType: 'bet',
      resourceId: bet._id,
      userId: userId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      details: {
        changes: {
          previous: previousState,
          current: {
            paymentStatus: bet.paymentStatus,
            paymentConfirmedBy: bet.paymentConfirmedBy,
            paymentConfirmedAt: bet.paymentConfirmedAt
          }
        },
        note: note || 'Xác nhận thanh toán không có ghi chú'
      }
    });

    // Trả về kết quả
    res.status(200).json({
      status: 'success',
      data: {
        bet: {
          _id: bet._id,
          paymentStatus: bet.paymentStatus,
          paymentConfirmedAt: bet.paymentConfirmedAt,
          paymentNote: bet.paymentNote
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Từ chối thanh toán cho một cược
 * 
 * @route PUT /api/admin/bets/:id/reject-payment
 */
exports.rejectBetPayment = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { note } = req.body;
    const userId = req.user._id;

    // Validate
    if (!note) {
      return next(new ApiError('Vui lòng cung cấp lý do từ chối', 400));
    }

    // Tìm cược
    const bet = await Bet.findById(id);
    if (!bet) {
      return next(new ApiError('Không tìm thấy cược', 404));
    }

    // Kiểm tra trạng thái hiện tại
    if (bet.paymentStatus !== 'pending') {
      return next(new ApiError(`Không thể từ chối thanh toán cho cược có trạng thái ${bet.paymentStatus}`, 400));
    }

    // Lưu thông tin trước khi cập nhật để ghi nhật ký
    const previousState = {
      paymentStatus: bet.paymentStatus,
      paymentConfirmedBy: bet.paymentConfirmedBy,
      paymentConfirmedAt: bet.paymentConfirmedAt
    };

    // Cập nhật trạng thái
    bet.paymentStatus = 'rejected';
    bet.paymentConfirmedBy = userId;
    bet.paymentConfirmedAt = new Date();
    bet.paymentNote = note;

    // Lưu cược
    await bet.save();

    // Ghi nhật ký kiểm toán
    await auditService.createAuditLog({
      action: 'reject',
      resourceType: 'bet',
      resourceId: bet._id,
      userId: userId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      details: {
        changes: {
          previous: previousState,
          current: {
            paymentStatus: bet.paymentStatus,
            paymentConfirmedBy: bet.paymentConfirmedBy,
            paymentConfirmedAt: bet.paymentConfirmedAt
          }
        },
        note: note
      }
    });

    // Trả về kết quả
    res.status(200).json({
      status: 'success',
      data: {
        bet: {
          _id: bet._id,
          paymentStatus: bet.paymentStatus,
          paymentConfirmedAt: bet.paymentConfirmedAt,
          paymentNote: bet.paymentNote
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Yêu cầu xác nhận lần hai (double confirmation) cho thanh toán
 * 
 * @route PUT /api/admin/bets/:id/double-confirm-payment
 */
exports.doubleConfirmBetPayment = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    // Tìm cược
    const bet = await Bet.findById(id);
    if (!bet) {
      return next(new ApiError('Không tìm thấy cược', 404));
    }

    // Kiểm tra trạng thái hiện tại
    if (bet.paymentStatus !== 'approved' || bet.paymentDoubleConfirm) {
      return next(new ApiError('Cược không hợp lệ cho xác nhận lần hai', 400));
    }

    // Đảm bảo người xác nhận lần hai khác với người xác nhận lần đầu
    if (bet.paymentConfirmedBy.toString() === userId.toString()) {
      return next(new ApiError('Không thể tự xác nhận lần hai. Yêu cầu admin khác xác nhận.', 400));
    }

    // Cập nhật trạng thái
    bet.paymentDoubleConfirm = true;
    bet.paymentDoubleConfirmedBy = userId;
    bet.paymentDoubleConfirmedAt = new Date();

    // Lưu cược
    await bet.save();

    // Ghi nhật ký kiểm toán
    await auditService.createAuditLog({
      action: 'verify',
      resourceType: 'bet',
      resourceId: bet._id,
      userId: userId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      details: {
        changes: {
          paymentDoubleConfirm: true,
          paymentDoubleConfirmedBy: userId,
          paymentDoubleConfirmedAt: new Date()
        }
      }
    });

    // Trả về kết quả
    res.status(200).json({
      status: 'success',
      data: {
        bet: {
          _id: bet._id,
          paymentStatus: bet.paymentStatus,
          paymentDoubleConfirm: bet.paymentDoubleConfirm,
          paymentDoubleConfirmedAt: bet.paymentDoubleConfirmedAt
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Xác minh kết quả xổ số với các nguồn bên ngoài
 * 
 * @route POST /api/admin/results/:id/verify-external
 */
exports.verifyResultWithExternalSources = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { sources } = req.body;
    const userId = req.user._id;

    // Tìm kết quả
    const result = await Result.findById(id);
    if (!result) {
      return next(new ApiError('Không tìm thấy kết quả', 404));
    }

    // Thực hiện xác minh
    const verificationResult = await resultVerificationService.verifyResultWithExternalSources(
      result,
      {
        sources,
        userId,
        ipAddress: req.ip,
        userAgent: req.headers['user-agent'],
        requiredMatches: 1 // Yêu cầu ít nhất 1 nguồn xác nhận
      }
    );

    // Trả về kết quả
    res.status(200).json({
      status: 'success',
      data: {
        verification: verificationResult
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Phê duyệt kết quả xổ số
 * 
 * @route PUT /api/admin/results/:id/approve
 */
exports.approveResult = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user._id;

    // Phê duyệt kết quả
    const result = await resultVerificationService.approveResult(id, userId, {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent']
    });

    // Trả về kết quả
    res.status(200).json({
      status: 'success',
      data: {
        result: {
          _id: result._id,
          date: result.date,
          status: result.status,
          verifiedBy: result.verifiedBy,
          verifiedAt: result.verifiedAt
        }
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Tạo kết quả xổ số mới
 * @route POST /api/admin/results
 * @access Admin
 */
exports.createResult = async (req, res, next) => {
  try {
    const { date, weekday, region, provinces } = req.body;
    
    if (!date || !weekday || !region || !provinces || !Array.isArray(provinces) || provinces.length === 0) {
      return next(new ApiError('Dữ liệu kết quả không đầy đủ', 400));
    }
    
    const adminId = req.adminUser._id;
    
    // Sử dụng resultService để tạo kết quả
    const result = await resultService.createResult(
      { date, weekday, region, provinces },
      adminId
    );
    
    // Ghi log hành động
    await auditService.logAction(adminId, 'CREATE_RESULT', result._id, 'Result');
    
    res.status(201).json({
      success: true,
      data: result
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Thiết lập xác thực hai yếu tố (2FA) cho admin
 * 
 * @route POST /api/admin/setup-2fa
 */
exports.setup2FA = async (req, res, next) => {
  try {
    const userId = req.user._id;
    
    // Tìm người dùng
    const user = await User.findById(userId);
    if (!user) {
      return next(new ApiError('Không tìm thấy người dùng', 404));
    }
    
    // Kiểm tra nếu đã kích hoạt 2FA
    if (user.twoFactorEnabled) {
      return next(new ApiError('Xác thực hai yếu tố đã được kích hoạt', 400));
    }
    
    // Tạo secret mới
    const secret = speakeasy.generateSecret({
      length: 20,
      name: `TelegramBingo:${user.username || user.telegramId}`
    });
    
    // Lưu secret tạm thời
    user.twoFactorSecret = secret.base32;
    await user.save();
    
    // Tạo QR code
    const qrCodeUrl = await qrcode.toDataURL(secret.otpauth_url);
    
    // Trả về dữ liệu
    res.status(200).json({
      status: 'success',
      data: {
        secret: secret.base32,
        qrCode: qrCodeUrl
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Kích hoạt xác thực hai yếu tố (2FA)
 * 
 * @route POST /api/admin/activate-2fa
 */
exports.activate2FA = async (req, res, next) => {
  try {
    const { token } = req.body;
    const userId = req.user._id;
    
    if (!token) {
      return next(new ApiError('Vui lòng cung cấp token xác thực', 400));
    }
    
    // Tìm người dùng
    const user = await User.findById(userId);
    if (!user) {
      return next(new ApiError('Không tìm thấy người dùng', 404));
    }
    
    // Kiểm tra nếu đã kích hoạt 2FA
    if (user.twoFactorEnabled) {
      return next(new ApiError('Xác thực hai yếu tố đã được kích hoạt', 400));
    }
    
    // Xác thực token
    const verified = speakeasy.totp.verify({
      secret: user.twoFactorSecret,
      encoding: 'base32',
      token: token,
      window: 1 // Cho phép token trước và sau 30 giây
    });
    
    if (!verified) {
      return next(new ApiError('Mã xác thực không hợp lệ', 400));
    }
    
    // Kích hoạt 2FA
    user.twoFactorEnabled = true;
    
    // Tạo mã dự phòng
    const backupCodes = user.generateBackupCodes();
    
    // Lưu người dùng
    await user.save();
    
    // Ghi nhật ký
    await auditService.createAuditLog({
      action: 'update',
      resourceType: 'user',
      resourceId: user._id,
      userId: userId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      details: {
        changes: {
          twoFactorEnabled: true
        }
      }
    });
    
    // Trả về dữ liệu
    res.status(200).json({
      status: 'success',
      data: {
        twoFactorEnabled: true,
        backupCodes
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Quản lý IP được phép truy cập
 * 
 * @route PUT /api/admin/manage-allowed-ips
 */
exports.manageAllowedIps = async (req, res, next) => {
  try {
    const { allowedIps, requireIpVerification } = req.body;
    const userId = req.user._id;
    
    // Tìm người dùng
    const user = await User.findById(userId);
    if (!user) {
      return next(new ApiError('Không tìm thấy người dùng', 404));
    }
    
    // Cập nhật danh sách IP
    if (allowedIps) {
      user.allowedIps = allowedIps;
    }
    
    // Cập nhật yêu cầu xác thực IP
    if (typeof requireIpVerification === 'boolean') {
      if (!user.securitySettings) {
        user.securitySettings = {};
      }
      user.securitySettings.requireIpVerification = requireIpVerification;
    }
    
    // Lưu người dùng
    await user.save();
    
    // Ghi nhật ký
    await auditService.createAuditLog({
      action: 'update',
      resourceType: 'user',
      resourceId: user._id,
      userId: userId,
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      details: {
        changes: {
          allowedIps: user.allowedIps,
          requireIpVerification: user.securitySettings?.requireIpVerification
        }
      }
    });
    
    // Trả về dữ liệu
    res.status(200).json({
      status: 'success',
      data: {
        allowedIps: user.allowedIps,
        requireIpVerification: user.securitySettings?.requireIpVerification
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Lấy thông tin QR code đăng nhập
 * @route GET /api/admin/login/qr
 * @access Public
 */
exports.getLoginQR = async (req, res, next) => {
  try {
    res.status(200).json({
      success: true,
      data: {
        qrCode: req.qrCode,
        expiresIn: 300 // 5 phút
      }
    });
  } catch (error) {
    next(new ApiError(error.message, 500));
  }
};

/**
 * Gửi mã xác thực qua Telegram
 * @route POST /api/admin/login/telegram/send-code
 */
exports.sendTelegramCode = async (req, res, next) => {
  try {
    const { telegramId } = req.body;
    
    if (!telegramId) {
      return next(new ApiError('Thiếu Telegram ID', 400));
    }
    
    // Tìm admin theo Telegram ID
    const admin = await User.findOne({ telegramId, role: 'admin' });
    
    if (!admin) {
      return next(new ApiError('Không tìm thấy admin với Telegram ID này', 404));
    }
    
    // Tạo mã xác thực ngẫu nhiên
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    
    // Lưu mã xác thực và thời gian hết hạn (10 phút)
    admin.telegramAuthCode = {
      code,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000)
    };
    
    await admin.save();
    
    // Gửi mã xác thực qua Telegram
    await telegramService.sendMessage(telegramId, `Mã xác thực đăng nhập của bạn là: ${code}`);
    
    res.status(200).json({
      success: true,
      message: 'Mã xác thực đã được gửi qua Telegram'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Đăng nhập bằng mã xác thực Telegram
 * @route POST /api/admin/login/telegram
 */
exports.loginWithTelegram = async (req, res, next) => {
  try {
    // adminUser đã được đặt trong middleware verifyTelegramCode
    const admin = req.adminUser;
    
    // Tạo token JWT
    const token = jwt.sign(
      { id: admin.telegramId, role: admin.role },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '1d' }
    );
    
    res.status(200).json({
      success: true,
      token,
      admin: {
        telegramId: admin.telegramId,
        username: admin.username,
        role: admin.role
      }
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Tạo QR code để đăng nhập
 * @route GET /api/admin/login/qr
 */
exports.generateLoginQR = async (req, res, next) => {
  try {
    const { telegramId } = req.query;
    
    if (!telegramId) {
      return next(new ApiError('Thiếu Telegram ID', 400));
    }
    
    // Tìm admin theo Telegram ID
    const admin = await User.findOne({ telegramId, role: 'admin' });
    
    if (!admin) {
      return next(new ApiError('Không tìm thấy admin với Telegram ID này', 404));
    }
    
    // Tạo token QR ngẫu nhiên
    const token = crypto.randomBytes(32).toString('hex');
    
    // Lưu token QR và thời gian hết hạn (5 phút)
    admin.loginQrCode = {
      token,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000)
    };
    
    await admin.save();
    
    // Trả về token QR
    res.status(200).json({
      success: true,
      qrToken: token,
      expiresAt: admin.loginQrCode.expiresAt
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Đăng ký thiết bị mới
 * @route POST /api/admin/device/register
 */
exports.registerDevice = async (req, res, next) => {
  try {
    const admin = req.adminUser;
    const { deviceId, deviceName } = req.deviceInfo;
    
    // Kiểm tra xem thiết bị đã được đăng ký chưa
    const existingDevice = admin.devices.find(d => d.deviceId === deviceId);
    
    if (existingDevice) {
      // Nếu đã tồn tại, cập nhật thông tin
      existingDevice.deviceName = deviceName;
      existingDevice.lastLogin = new Date();
      existingDevice.isVerified = true;
    } else {
      // Nếu chưa tồn tại, thêm mới
      admin.devices.push({
        deviceId,
        deviceName,
        lastLogin: new Date(),
        isVerified: true
      });
    }
    
    // Xóa QR code sau khi đã sử dụng
    admin.loginQrCode = undefined;
    await admin.save();
    
    // Tạo token JWT
    const token = jwt.sign(
      { id: admin.telegramId, role: admin.role },
      process.env.JWT_SECRET || 'your-secret-key',
      { expiresIn: '30d' }
    );
    
    res.status(200).json({
      success: true,
      message: 'Thiết bị đã được đăng ký thành công',
      token,
      deviceId
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Lấy danh sách thiết bị đã đăng ký
 * @route GET /api/admin/devices
 */
exports.getRegisteredDevices = async (req, res, next) => {
  try {
    const admin = req.adminUser;
    
    res.status(200).json({
      success: true,
      devices: admin.devices
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Xóa thiết bị đã đăng ký
 * @route DELETE /api/admin/devices/:deviceId
 */
exports.removeDevice = async (req, res, next) => {
  try {
    const admin = req.adminUser;
    const { deviceId } = req.params;
    
    // Tìm vị trí của thiết bị trong mảng
    const deviceIndex = admin.devices.findIndex(d => d.deviceId === deviceId);
    
    if (deviceIndex === -1) {
      return next(new ApiError('Không tìm thấy thiết bị', 404));
    }
    
    // Xóa thiết bị khỏi mảng
    admin.devices.splice(deviceIndex, 1);
    await admin.save();
    
    res.status(200).json({
      success: true,
      message: 'Thiết bị đã được xóa thành công'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Lấy danh sách thanh toán đang chờ xử lý
 * @route GET /api/admin/payouts/pending
 */
exports.getPendingPayouts = async (req, res, next) => {
  try {
    const pendingPayouts = await Transaction.find({
      type: 'withdraw',
      status: 'pending'
    }).populate('userId', 'telegramId username');
    
    res.status(200).json({
      success: true,
      count: pendingPayouts.length,
      data: pendingPayouts
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Xác nhận thanh toán
 * @route POST /api/admin/payouts/confirm
 */
exports.confirmPayouts = async (req, res, next) => {
  try {
    const { transactionIds } = req.body;
    
    if (!transactionIds || !Array.isArray(transactionIds) || transactionIds.length === 0) {
      return next(new ApiError('Danh sách giao dịch không hợp lệ', 400));
    }
    
    const adminId = req.adminUser._id;
    
    // Cập nhật trạng thái các giao dịch
    const result = await Transaction.updateMany(
      {
        _id: { $in: transactionIds },
        type: 'withdraw',
        status: 'pending'
      },
      {
        $set: {
          status: 'completed',
          processedBy: adminId,
          processedAt: new Date()
        }
      }
    );
    
    res.status(200).json({
      success: true,
      message: `Đã xác nhận ${result.modifiedCount} giao dịch thanh toán`
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Kiểm tra trạng thái 2FA
 * @route GET /api/admin/2fa-status
 */
exports.check2FAStatus = async (req, res, next) => {
  try {
    const admin = req.adminUser;
    
    res.status(200).json({
      success: true,
      enabled: admin.twoFactorEnabled
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Thiết lập 2FA
 * @route POST /api/admin/setup-2fa
 */
exports.setup2FA = async (req, res, next) => {
  try {
    const admin = req.adminUser;
    
    // Tạo secret cho 2FA
    const secret = speakeasy.generateSecret({ length: 20 });
    
    // Tạo QR code
    const qrCodeUrl = await qrcode.toDataURL(secret.otpauth_url);
    
    // Lưu secret tạm thời
    admin.twoFactorTempSecret = secret.base32;
    await admin.save();
    
    res.status(200).json({
      success: true,
      secret: secret.base32,
      qrCode: qrCodeUrl
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Kích hoạt 2FA
 * @route POST /api/admin/activate-2fa
 */
exports.activate2FA = async (req, res, next) => {
  try {
    const admin = req.adminUser;
    const { token } = req.body;
    
    if (!token) {
      return next(new ApiError('Thiếu token xác thực', 400));
    }
    
    // Kiểm tra token
    const verified = speakeasy.totp.verify({
      secret: admin.twoFactorTempSecret,
      encoding: 'base32',
      token
    });
    
    if (!verified) {
      return next(new ApiError('Token không hợp lệ', 400));
    }
    
    // Kích hoạt 2FA
    admin.twoFactorSecret = admin.twoFactorTempSecret;
    admin.twoFactorEnabled = true;
    admin.twoFactorTempSecret = undefined;
    await admin.save();
    
    res.status(200).json({
      success: true,
      message: 'Xác thực hai lớp đã được kích hoạt'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Vô hiệu hóa 2FA
 * @route DELETE /api/admin/disable-2fa
 */
exports.disable2FA = async (req, res, next) => {
  try {
    const admin = req.adminUser;
    const { token } = req.body;
    
    if (!token) {
      return next(new ApiError('Thiếu token xác thực', 400));
    }
    
    // Kiểm tra token
    const verified = speakeasy.totp.verify({
      secret: admin.twoFactorSecret,
      encoding: 'base32',
      token
    });
    
    if (!verified) {
      return next(new ApiError('Token không hợp lệ', 400));
    }
    
    // Vô hiệu hóa 2FA
    admin.twoFactorEnabled = false;
    admin.twoFactorSecret = undefined;
    await admin.save();
    
    res.status(200).json({
      success: true,
      message: 'Xác thực hai lớp đã bị vô hiệu hóa'
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Xác thực kết quả với nguồn bên ngoài
 * @route POST /api/admin/results/:id/verify-external
 */
exports.verifyResultWithExternalSources = async (req, res, next) => {
  try {
    const { id } = req.params;
    
    // Tìm kết quả
    const result = await Result.findById(id);
    
    if (!result) {
      return next(new ApiError('Không tìm thấy kết quả', 404));
    }
    
    // Xác thực kết quả với nguồn bên ngoài
    const verification = await resultVerificationService.verifyResult(result);
    
    res.status(200).json({
      success: true,
      verification
    });
  } catch (error) {
    next(error);
  }
};

// Thêm chức năng tạo điểm (point creation) vào controller

/**
 * Tạo QR code cho xác thực từ thiết bị thứ hai
 * @route GET /api/admin/create-points/qr
 * @access Admin
 */
exports.generatePointCreationQR = asyncHandler(async (req, res, next) => {
  const admin = req.adminUser;
  
  // Tạo token QR
  const token = crypto.randomBytes(32).toString('hex');
  
  // Lưu token vào admin
  admin.loginQrCode = {
    token,
    expiresAt: new Date(Date.now() + 5 * 60 * 1000) // Có hiệu lực trong 5 phút
  };
  
  await admin.save();
  
  // Tạo QR code
  const qrData = JSON.stringify({
    token,
    adminId: admin._id.toString(),
    action: 'point_creation_auth',
    timestamp: Date.now()
  });
  
  // Tạo mã QR
  const qrImage = await qrcode.toDataURL(qrData);
  
  res.status(200).json({
    success: true,
    qrCode: qrImage,
    expiresAt: admin.loginQrCode.expiresAt
  });
});

/**
 * Tạo điểm trong hệ thống
 * @route POST /api/admin/create-points
 * @access Admin
 */
exports.createPoints = asyncHandler(async (req, res, next) => {
  const admin = req.adminUser;
  const { amount, targetUserIds, reason } = req.body;
  
  if (!amount || amount <= 0) {
    throw new ApiError('Số điểm cần tạo không hợp lệ', 400);
  }
  
  if (!Array.isArray(targetUserIds) || targetUserIds.length === 0) {
    throw new ApiError('Danh sách người dùng nhận điểm không hợp lệ', 400);
  }
  
  // Kiểm tra giới hạn tạo điểm hàng ngày (100 triệu điểm mỗi ngày)
  const DAILY_POINT_LIMIT = 100000000; // 100 triệu điểm
  
  // Tìm tổng số điểm đã tạo trong ngày
  const now = new Date();
  const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const endOfDay = new Date(startOfDay);
  endOfDay.setDate(endOfDay.getDate() + 1);
  
  const dailyCreated = await Transaction.aggregate([
    { 
      $match: { 
        userId: admin._id,
        type: 'point_creation',
        status: 'completed',
        createdAt: { $gte: startOfDay, $lt: endOfDay }
      } 
    },
    { 
      $group: { 
        _id: null, 
        total: { $sum: '$amount' } 
      } 
    }
  ]);
  
  const totalCreatedToday = dailyCreated.length > 0 ? dailyCreated[0].total : 0;
  
  // Kiểm tra số điểm định tạo trong request này
  const totalAmountToCreate = amount * targetUserIds.length;
  if (totalCreatedToday + totalAmountToCreate > DAILY_POINT_LIMIT) {
    throw new ApiError(
      `Vượt quá giới hạn tạo điểm hàng ngày (Đã tạo: ${totalCreatedToday}, Giới hạn: ${DAILY_POINT_LIMIT})`,
      400
    );
  }
  
  // Bắt đầu session MongoDB
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    // Tìm người dùng nhận điểm
    const targetUsers = await User.find({ _id: { $in: targetUserIds } }).session(session);
    
    if (targetUsers.length !== targetUserIds.length) {
      throw new ApiError('Một số người dùng không tồn tại', 404);
    }
    
    // Tạo giao dịch và cập nhật số dư cho từng người dùng
    const transactions = [];
    
    for (const user of targetUsers) {
      // Tạo giao dịch
      const transaction = new Transaction({
        userId: admin._id,
        receiverId: user._id,
        type: 'point_creation',
        amount,
        status: 'completed',
        description: reason || 'Admin tạo điểm',
        processedBy: admin._id,
        processedAt: now,
        metaData: {
          adminName: admin.username,
          adminTelegramId: admin.telegramId,
          receiverName: user.username,
          receiverTelegramId: user.telegramId,
          ipAddress: req.ip,
          userAgent: req.headers['user-agent'],
          createdAt: now
        }
      });
      
      await transaction.save({ session });
      transactions.push(transaction);
      
      // Cập nhật số dư người dùng
      await User.updateOne(
        { _id: user._id },
        { $inc: { balance: amount } }
      ).session(session);
      
      // Cập nhật cache Redis
      try {
        const userData = await User.findById(user._id).session(session);
        await redisClient.setEx(`user:${user.telegramId}`, 3600, JSON.stringify(userData));
      } catch (redisErr) {
        // Lỗi Redis không ảnh hưởng đến giao dịch
        console.error('Redis cache error:', redisErr);
      }
    }
    
    // Ghi nhật ký audit
    await auditService.createAuditLog({
      userId: admin._id,
      action: 'POINT_CREATION',
      targetType: 'User',
      details: {
        amount,
        targetUserIds,
        reason,
        totalAmount: totalAmountToCreate
      },
      ipAddress: req.ip,
      deviceInfo: req.headers['user-agent']
    }, session);
    
    // Commit transaction
    await session.commitTransaction();
    
    res.status(200).json({
      success: true,
      message: `Đã tạo ${amount} điểm cho ${targetUsers.length} người dùng`,
      transactions: transactions.map(t => ({
        id: t._id,
        receiverName: targetUsers.find(u => u._id.toString() === t.receiverId.toString())?.username,
        receiverTelegramId: targetUsers.find(u => u._id.toString() === t.receiverId.toString())?.telegramId,
        amount: t.amount
      })),
      dailyCreated: totalCreatedToday + totalAmountToCreate,
      dailyLimit: DAILY_POINT_LIMIT,
      remaining: DAILY_POINT_LIMIT - (totalCreatedToday + totalAmountToCreate)
    });
  } catch (error) {
    // Rollback transaction
    await session.abortTransaction();
    throw error;
  } finally {
    // End session
    session.endSession();
  }
});

/**
 * Tạo điểm cho tài khoản admin (giới hạn 100 triệu mỗi ngày)
 * @route POST /api/admin/points/create
 * @access Private (Admin + 2FA + Second Device QR)
 */
exports.createPoints = asyncHandler(async (req, res) => {
  const admin = req.adminUser;
  const { amount } = req.body;
  
  // Lấy thông tin client để lưu vào log
  const clientIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  const userAgent = req.headers['user-agent'];

  // Validate amount
  if (!amount || !Number.isInteger(amount) || amount <= 0) {
    throw new ApiError('Số điểm phải là số nguyên dương', 400);
  }

  if (amount > 100000000) {
    throw new ApiError('Số điểm tạo không được vượt quá 100 triệu', 400);
  }

  // Khởi tạo session với cấu hình bảo mật cao
  const session = await mongoose.startSession();
  session.startTransaction({
    readConcern: { level: 'snapshot' },
    writeConcern: { w: 'majority', j: true }
  });

  try {
    // Kiểm tra giới hạn hàng ngày
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    // Tính tổng điểm đã tạo trong ngày
    const dailyPointsCreated = await Transaction.aggregate([
      {
        $match: {
          userId: admin._id,
          type: 'point_creation',
          status: 'completed',
          createdAt: { $gte: today, $lt: tomorrow }
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$amount' }
        }
      }
    ]).session(session);

    const totalCreatedToday = dailyPointsCreated.length > 0 ? dailyPointsCreated[0].total : 0;
    
    if (totalCreatedToday + amount > 100000000) {
      throw new ApiError(`Đã vượt quá giới hạn 100 triệu điểm mỗi ngày. Đã tạo ${totalCreatedToday.toLocaleString('vi-VN')} điểm hôm nay.`, 400);
    }

    // Cập nhật số dư admin
    await User.updateOne(
      { _id: admin._id },
      { $inc: { balance: amount } }
    ).session(session);

    // Tạo giao dịch
    const transactionData = {
      userId: admin._id,
      type: 'point_creation',
      amount: amount,
      status: 'completed',
      description: `Admin tạo ${amount.toLocaleString('vi-VN')} điểm`,
      processedBy: admin._id,
      processedAt: new Date(),
      metaData: {
        adminId: admin._id,
        adminTelegramId: admin.telegramId,
        clientIp,
        userAgent,
        dailyLimit: 100000000,
        dailyUsed: totalCreatedToday + amount
      }
    };

    // Tạo hash cho giao dịch
    const dataToHash = `${admin._id.toString()}-${amount}-${Date.now()}`;
    transactionData.transactionHash = crypto.createHash('sha256').update(dataToHash).digest('hex');

    const transaction = await Transaction.create([transactionData], { session });

    // Ghi log kiểm toán
    await auditService.logFinancialTransaction(
      transaction[0],
      admin,
      clientIp,
      userAgent
    );

    // Commit transaction
    await session.commitTransaction();
    session.endSession();

    // Cập nhật cache Redis
    try {
      const adminData = await User.findById(admin._id);
      await redisClient.setEx(`user:${admin.telegramId}`, 3600, JSON.stringify(adminData));
    } catch (redisErr) {
      console.error('Không thể cập nhật cache Redis:', redisErr);
    }

    // Thông báo qua Telegram
    try {
      await telegramService.sendPointCreationNotification(
        admin.telegramId,
        amount,
        totalCreatedToday + amount,
        100000000
      );
    } catch (error) {
      console.error('Không thể gửi thông báo Telegram:', error);
    }

    res.status(200).json({
      success: true,
      message: `Đã tạo thành công ${amount.toLocaleString('vi-VN')} điểm`,
      transaction: transaction[0],
      dailyCreated: totalCreatedToday + amount,
      dailyLimit: 100000000,
      remainingToday: 100000000 - (totalCreatedToday + amount)
    });

  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    throw error;
  }
});

/**
 * Lấy thông tin tài khoản Pool
 * @route GET /api/admin/pool
 * @access Admin
 */
exports.getPoolAccount = asyncHandler(async (req, res) => {
  const poolAccount = await userService.getOrCreatePoolAccount();
  
  // Lấy thêm thông tin thống kê
  const stats = {
    totalBets: await Transaction.countDocuments({ 
      userId: poolAccount._id, 
      type: 'bet_receive' 
    }),
    totalPayouts: await Transaction.countDocuments({ 
      userId: poolAccount._id, 
      type: 'win_payout' 
    }),
    totalBetAmount: await Transaction.aggregate([
      { $match: { userId: poolAccount._id, type: 'bet_receive' } },
      { $group: { _id: null, total: { $sum: '$amount' } } }
    ]).then(result => (result.length > 0 ? result[0].total : 0)),
    totalPayoutAmount: await Transaction.aggregate([
      { $match: { userId: poolAccount._id, type: 'win_payout' } },
      { $group: { _id: null, total: { $sum: { $abs: '$amount' } } } }
    ]).then(result => (result.length > 0 ? result[0].total : 0))
  };
  
  res.status(200).json({
    success: true,
    data: {
      pool: {
        telegramId: poolAccount.telegramId,
        username: poolAccount.username,
        balance: poolAccount.balance,
        role: poolAccount.role,
        createdAt: poolAccount.createdAt
      },
      stats
    }
  });
});

/**
 * Lấy lịch sử giao dịch của tài khoản Pool
 * @route GET /api/admin/pool/transactions
 * @access Admin
 */
exports.getPoolTransactions = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, type, startDate, endDate } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);
  
  const poolAccount = await userService.getOrCreatePoolAccount();
  
  // Xây dựng query
  const query = { userId: poolAccount._id };
  
  // Lọc theo loại giao dịch
  if (type) {
    query.type = type;
  }
  
  // Lọc theo khoảng thời gian
  if (startDate || endDate) {
    query.createdAt = {};
    if (startDate) {
      query.createdAt.$gte = new Date(startDate);
    }
    if (endDate) {
      query.createdAt.$lte = new Date(endDate);
    }
  }
  
  // Thực hiện truy vấn
  const transactions = await Transaction.find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit))
    .populate('receiverId', 'telegramId username')
    .populate('reference');
  
  const total = await Transaction.countDocuments(query);
  
  res.status(200).json({
    success: true,
    data: {
      transactions,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    }
  });
});

/**
 * Nạp tiền vào tài khoản Pool
 * @route POST /api/admin/pool/deposit
 * @access Admin
 */
exports.depositToPool = asyncHandler(async (req, res) => {
  const { amount } = req.body;
  const adminId = req.adminUser._id;
  
  if (!amount || amount <= 0) {
    throw new ApiError('Số tiền không hợp lệ', 400);
  }
  
  const session = await mongoose.startSession();
  session.startTransaction({
    readConcern: { level: 'snapshot' },
    writeConcern: { w: 'majority' }
  });
  
  try {
    // Lấy tài khoản Pool
    const poolAccount = await userService.getOrCreatePoolAccount();
    
    // Lưu số dư trước khi nạp
    const balanceBefore = poolAccount.balance;
    
    // Cập nhật số dư tài khoản Pool
    const updatedPool = await mongoose.model('User').findOneAndUpdate(
      { _id: poolAccount._id },
      { $inc: { balance: amount } },
      { new: true, session }
    );
    
    if (!updatedPool) {
      throw new ApiError('Không thể cập nhật số dư tài khoản Pool', 500);
    }
    
    // Tạo transaction record
    const transactionHash = crypto
      .createHash('sha256')
      .update(`${adminId}-${poolAccount._id}-${amount}-${Date.now()}`)
      .digest('hex');
    
    const transaction = new Transaction({
      userId: poolAccount._id,
      type: 'point_creation',
      amount: amount,
      status: 'completed',
      description: `Admin nạp điểm vào tài khoản Pool`,
      processedBy: adminId,
      processedAt: new Date(),
      metaData: {
        adminId,
        poolBalanceBefore: balanceBefore,
        poolBalanceAfter: updatedPool.balance,
        adminCreated: true
      },
      transactionHash
    });
    
    await transaction.save({ session });
    
    // Xóa cache
    await mongoose.connection.db.collection('redis').deleteOne({ key: 'SYSTEM_POOL_ACCOUNT' });
    
    // Commit transaction
    await session.commitTransaction();
    
    res.status(200).json({
      success: true,
      message: `Đã nạp ${helper.formatCurrency(amount)} điểm vào tài khoản Pool`,
      data: {
        newBalance: updatedPool.balance,
        transaction: {
          id: transaction._id,
          amount,
          type: transaction.type,
          createdAt: transaction.createdAt
        }
      }
    });
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
});

/**
 * Lấy báo cáo tài khoản Pool
 * @route GET /api/admin/pool/report
 * @access Admin
 */
exports.getPoolReport = asyncHandler(async (req, res) => {
  const { startDate, endDate } = req.query;
  
  // Xác định khoảng thời gian
  const timeQuery = {};
  if (startDate) {
    timeQuery.$gte = new Date(startDate);
  }
  if (endDate) {
    timeQuery.$lte = new Date(endDate);
  }
  
  const poolAccount = await userService.getOrCreatePoolAccount();
  
  // Thống kê theo ngày
  const dailyStats = await Transaction.aggregate([
    { 
      $match: { 
        userId: poolAccount._id,
        ...(Object.keys(timeQuery).length > 0 ? { createdAt: timeQuery } : {})
      } 
    },
    {
      $addFields: {
        dateOnly: {
          $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
        }
      }
    },
    {
      $group: {
        _id: {
          date: '$dateOnly',
          type: '$type'
        },
        count: { $sum: 1 },
        amount: { $sum: '$amount' }
      }
    },
    {
      $group: {
        _id: '$_id.date',
        transactions: {
          $push: {
            type: '$_id.type',
            count: '$count',
            amount: '$amount'
          }
        },
        totalCount: { $sum: '$count' }
      }
    },
    { $sort: { _id: 1 } }
  ]);
  
  // Thống kê tổng hợp
  const summary = await Transaction.aggregate([
    { 
      $match: { 
        userId: poolAccount._id,
        ...(Object.keys(timeQuery).length > 0 ? { createdAt: timeQuery } : {})
      } 
    },
    {
      $group: {
        _id: '$type',
        count: { $sum: 1 },
        amount: { $sum: '$amount' }
      }
    }
  ]);
  
  // Tính toán lợi nhuận
  let profit = 0;
  let totalBetAmount = 0;
  let totalPayoutAmount = 0;
  
  summary.forEach(item => {
    if (item._id === 'bet_receive') {
      totalBetAmount = item.amount;
    } else if (item._id === 'win_payout') {
      totalPayoutAmount = Math.abs(item.amount);
    }
  });
  
  profit = totalBetAmount - totalPayoutAmount;
  
  res.status(200).json({
    success: true,
    data: {
      poolBalance: poolAccount.balance,
      dailyStats,
      summary,
      profit,
      profitRate: totalBetAmount > 0 ? (profit / totalBetAmount) * 100 : 0
    }
  });
});

/**
 * Khởi tạo tài khoản Pool
 * @route POST /api/admin/pool/initialize
 * @access Admin
 */
exports.initializePoolAccount = asyncHandler(async (req, res) => {
  const adminId = req.adminUser._id;
  
  try {
    const poolAccount = await userService.initializePoolAccount(adminId);
    
    res.status(201).json({
      success: true,
      message: 'Đã khởi tạo tài khoản Pool thành công',
      data: {
        telegramId: poolAccount.telegramId,
        username: poolAccount.username,
        balance: poolAccount.balance,
        createdAt: poolAccount.createdAt
      }
    });
  } catch (error) {
    if (error.message === 'Tài khoản Pool đã tồn tại') {
      res.status(400).json({
        success: false,
        message: 'Tài khoản Pool đã tồn tại',
        error: error.message
      });
    } else {
      throw error;
    }
  }
});