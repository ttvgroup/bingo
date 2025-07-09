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
 * Gửi mã xác thực đăng nhập qua Telegram
 * @route POST /api/admin/login/telegram/send-code
 * @access Public
 */
exports.sendTelegramCode = async (req, res, next) => {
  try {
    const { telegramId } = req.body;
    
    if (!telegramId) {
      return next(new ApiError('Telegram ID is required', 400));
    }
    
    // Kiểm tra xem có phải admin không
    const user = await User.findOne({ telegramId, role: 'admin' });
    
    if (!user) {
      return next(new ApiError('User not found or not an admin', 404));
    }
    
    // Gửi mã xác thực
    const sent = await telegramService.sendAuthCode(telegramId);
    
    if (!sent) {
      return next(new ApiError('Failed to send authentication code', 500));
    }
    
    res.status(200).json({
      success: true,
      message: 'Authentication code sent successfully'
    });
  } catch (error) {
    next(new ApiError(error.message, 500));
  }
};

/**
 * Đăng nhập bằng mã xác thực Telegram
 * @route POST /api/admin/login/telegram
 * @access Public
 */
exports.loginWithTelegram = async (req, res, next) => {
  try {
    // Validation đã được thực hiện trong middleware
    
    // Tạo token đăng nhập
    const token = crypto.randomBytes(32).toString('hex');
    
    // Cập nhật thông tin thiết bị
    const { deviceId, deviceName } = req.body;
    
    // Kiểm tra xem thiết bị đã tồn tại chưa
    const existingDevice = req.adminUser.devices.find(device => device.deviceId === deviceId);
    
    if (!existingDevice) {
      req.adminUser.devices.push({
        deviceId,
        deviceName: deviceName || 'Unknown device',
        lastLogin: new Date(),
        isVerified: true
      });
      
      await req.adminUser.save();
      
      // Thông báo đăng nhập từ thiết bị mới
      telegramService.notifyNewDeviceLogin(req.adminUser.telegramId, {
        deviceName: deviceName || 'Unknown device'
      }).catch(err => console.error('Error sending login notification:', err));
    } else {
      existingDevice.lastLogin = new Date();
      await req.adminUser.save();
    }
    
    res.status(200).json({
      success: true,
      token,
      user: {
        id: req.adminUser._id,
        telegramId: req.adminUser.telegramId,
        username: req.adminUser.username,
        role: req.adminUser.role
      }
    });
  } catch (error) {
    next(new ApiError(error.message, 500));
  }
};

/**
 * Đăng ký thiết bị mới qua QR code
 * @route POST /api/admin/device/register
 * @access Public
 */
exports.registerDevice = async (req, res, next) => {
  try {
    // Validation và xử lý đã được thực hiện trong middleware
    
    res.status(200).json({
      success: true,
      message: 'Device registered successfully',
      user: {
        id: req.adminUser._id,
        telegramId: req.adminUser.telegramId,
        username: req.adminUser.username,
        role: req.adminUser.role
      }
    });
  } catch (error) {
    next(new ApiError(error.message, 500));
  }
};

/**
 * Lấy danh sách thiết bị đã đăng ký
 * @route GET /api/admin/devices
 * @access Admin
 */
exports.getRegisteredDevices = async (req, res, next) => {
  try {
    const devices = req.adminUser.devices.map(device => ({
      deviceId: device.deviceId,
      deviceName: device.deviceName,
      lastLogin: device.lastLogin,
      isVerified: device.isVerified
    }));
    
    res.status(200).json({
      success: true,
      count: devices.length,
      data: devices
    });
  } catch (error) {
    next(new ApiError(error.message, 500));
  }
};

/**
 * Xóa thiết bị đã đăng ký
 * @route DELETE /api/admin/devices/:deviceId
 * @access Admin
 */
exports.removeDevice = async (req, res, next) => {
  try {
    const { deviceId } = req.params;
    
    if (!deviceId) {
      return next(new ApiError('Device ID is required', 400));
    }
    
    // Tìm index của thiết bị
    const deviceIndex = req.adminUser.devices.findIndex(device => device.deviceId === deviceId);
    
    if (deviceIndex === -1) {
      return next(new ApiError('Device not found', 404));
    }
    
    // Xóa thiết bị
    req.adminUser.devices.splice(deviceIndex, 1);
    await req.adminUser.save();
    
    res.status(200).json({
      success: true,
      message: 'Device removed successfully'
    });
  } catch (error) {
    next(new ApiError(error.message, 500));
  }
};