const AuditLog = require('../models/AuditLog');
const mongoose = require('mongoose');

/**
 * Ghi log kiểm toán chi tiết
 * @param {Object} data - Dữ liệu log
 * @param {String} data.userId - ID người dùng thực hiện hành động
 * @param {String} data.action - Loại hành động
 * @param {String} data.ipAddress - Địa chỉ IP
 * @param {String} data.deviceInfo - Thông tin thiết bị
 * @param {String} data.targetId - ID đối tượng liên quan
 * @param {String} data.targetType - Loại đối tượng
 * @param {Object} data.details - Chi tiết hành động
 * @returns {Promise<AuditLog>}
 */
exports.logAction = async (data) => {
  try {
    const auditLog = new AuditLog({
      userId: data.userId,
      action: data.action,
      ipAddress: data.ipAddress || 'unknown',
      deviceInfo: data.deviceInfo || 'unknown',
      targetId: data.targetId,
      targetType: data.targetType,
      details: data.details
    });

    return await auditLog.save();
  } catch (error) {
    console.error('Không thể ghi log kiểm toán:', error);
    // Không throw lỗi để không ảnh hưởng đến luồng chính
    return null;
  }
};

/**
 * Ghi log giao dịch tài chính
 * @param {Object} transaction - Thông tin giao dịch
 * @param {Object} user - Thông tin người dùng
 * @param {String} ipAddress - Địa chỉ IP
 * @param {String} deviceInfo - Thông tin thiết bị
 * @returns {Promise<AuditLog>}
 */
exports.logFinancialTransaction = async (transaction, user, ipAddress, deviceInfo) => {
  try {
    let action = 'transaction';
    switch (transaction.type) {
      case 'transfer':
        action = 'transfer_funds';
        break;
      case 'deposit':
        action = 'deposit_request';
        break;
      case 'withdraw':
        action = 'withdraw_request';
        break;
      case 'bet':
        action = 'place_bet';
        break;
      case 'win':
        action = 'win_payout';
        break;
      case 'point_creation':
        action = 'create_points';
        break;
    }

    return await this.logAction({
      userId: user._id,
      action,
      ipAddress,
      deviceInfo,
      targetId: transaction._id,
      targetType: 'Transaction',
      details: {
        transactionType: transaction.type,
        amount: transaction.amount,
        status: transaction.status,
        receiverId: transaction.receiverId,
        description: transaction.description,
        balanceBefore: transaction.metaData?.senderBalanceBefore,
        balanceAfter: transaction.metaData?.senderBalanceAfter,
        timestamp: new Date()
      }
    });
  } catch (error) {
    console.error('Không thể ghi log giao dịch tài chính:', error);
    return null;
  }
};

/**
 * Ghi log thay đổi kết quả
 * @param {Object} result - Thông tin kết quả
 * @param {Object} user - Thông tin người dùng
 * @param {String} action - Loại hành động (create, update, delete)
 * @param {Object} previousState - Trạng thái trước khi thay đổi
 * @param {Object} newState - Trạng thái sau khi thay đổi
 * @param {String} ipAddress - Địa chỉ IP
 * @param {String} deviceInfo - Thông tin thiết bị
 * @returns {Promise<AuditLog>}
 */
exports.logResultChange = async (result, user, action, previousState, newState, ipAddress, deviceInfo) => {
  try {
    return await this.logAction({
      userId: user._id,
      action: `result_${action}`,
      ipAddress,
      deviceInfo,
      targetId: result._id,
      targetType: 'Result',
      details: {
        date: result.date,
        region: result.region,
        provinces: result.provinces.map(p => p.name),
        previousState,
        newState,
        timestamp: new Date()
      }
    });
  } catch (error) {
    console.error('Không thể ghi log thay đổi kết quả:', error);
    return null;
  }
};

/**
 * Ghi log hoạt động đăng nhập
 * @param {Object} user - Thông tin người dùng
 * @param {Boolean} success - Đăng nhập thành công hay không
 * @param {String} ipAddress - Địa chỉ IP
 * @param {String} deviceInfo - Thông tin thiết bị
 * @param {String} reason - Lý do thất bại (nếu có)
 * @returns {Promise<AuditLog>}
 */
exports.logLogin = async (user, success, ipAddress, deviceInfo, reason = null) => {
  try {
    return await this.logAction({
      userId: user._id,
      action: success ? 'login_success' : 'login_failed',
      ipAddress,
      deviceInfo,
      targetId: user._id,
      targetType: 'User',
      details: {
        telegramId: user.telegramId,
        username: user.username,
        role: user.role,
        failureReason: reason,
        timestamp: new Date()
      }
    });
  } catch (error) {
    console.error('Không thể ghi log đăng nhập:', error);
    return null;
  }
};

/**
 * Ghi log thay đổi cấu hình hệ thống
 * @param {Object} user - Thông tin người dùng
 * @param {String} configType - Loại cấu hình
 * @param {Object} previousConfig - Cấu hình trước khi thay đổi
 * @param {Object} newConfig - Cấu hình sau khi thay đổi
 * @param {String} ipAddress - Địa chỉ IP
 * @param {String} deviceInfo - Thông tin thiết bị
 * @returns {Promise<AuditLog>}
 */
exports.logConfigChange = async (user, configType, previousConfig, newConfig, ipAddress, deviceInfo) => {
  try {
    return await this.logAction({
      userId: user._id,
      action: 'config_change',
      ipAddress,
      deviceInfo,
      targetType: 'Config',
      details: {
        configType,
        previousConfig,
        newConfig,
        timestamp: new Date()
      }
    });
  } catch (error) {
    console.error('Không thể ghi log thay đổi cấu hình:', error);
    return null;
  }
};

/**
 * Ghi log kiểm tra tính toàn vẹn số dư
 * @param {Object} transaction - Thông tin giao dịch
 * @param {Object} balanceData - Dữ liệu về số dư
 * @param {String} ipAddress - Địa chỉ IP
 * @param {String} deviceInfo - Thông tin thiết bị
 * @returns {Promise<AuditLog>}
 */
exports.logBalanceIntegrityCheck = async (transaction, balanceData, ipAddress, deviceInfo) => {
  try {
    return await this.logAction({
      userId: transaction.userId,
      action: 'balance_integrity_check',
      ipAddress,
      deviceInfo,
      targetId: transaction._id,
      targetType: 'Transaction',
      details: {
        transactionType: transaction.type,
        amount: transaction.amount,
        totalBalanceBefore: balanceData.totalBalanceBefore,
        totalBalanceAfter: balanceData.totalBalanceAfter,
        isIntegrityMaintained: balanceData.totalBalanceBefore === balanceData.totalBalanceAfter,
        senderBalanceBefore: balanceData.senderBalanceBefore,
        senderBalanceAfter: balanceData.senderBalanceAfter,
        receiverBalanceBefore: balanceData.receiverBalanceBefore,
        receiverBalanceAfter: balanceData.receiverBalanceAfter,
        timestamp: new Date()
      }
    });
  } catch (error) {
    console.error('Không thể ghi log kiểm tra tính toàn vẹn số dư:', error);
    return null;
  }
};

/**
 * Ghi log hành động tài chính của admin
 * @param {ObjectId} adminId - ID của admin
 * @param {String} action - Loại hành động
 * @param {Object} details - Chi tiết hành động
 * @param {String} ipAddress - Địa chỉ IP
 * @param {String} deviceInfo - Thông tin thiết bị
 * @returns {Promise<AuditLog>}
 */
exports.logAdminFinancialAction = async (adminId, action, details, ipAddress, deviceInfo) => {
  try {
    return await this.logAction({
      userId: adminId,
      action,
      ipAddress,
      deviceInfo,
      targetId: details.transactionId || details.receiverId,
      targetType: 'Transaction',
      details: {
        ...details,
        timestamp: new Date()
      }
    });
  } catch (error) {
    console.error('Không thể ghi log hành động tài chính của admin:', error);
    return null;
  }
};

/**
 * Tìm kiếm log kiểm toán
 * @param {Object} filter - Điều kiện lọc
 * @param {Object} options - Tùy chọn phân trang
 * @returns {Promise<Object>} - Kết quả tìm kiếm
 */
exports.searchAuditLogs = async (filter = {}, options = { page: 1, limit: 10 }) => {
  try {
    const page = parseInt(options.page, 10) || 1;
    const limit = parseInt(options.limit, 10) || 10;
    const skip = (page - 1) * limit;

    const query = {};
    
    if (filter.userId) query.userId = mongoose.Types.ObjectId(filter.userId);
    if (filter.action) query.action = filter.action;
    if (filter.targetType) query.targetType = filter.targetType;
    if (filter.startDate || filter.endDate) {
      query.createdAt = {};
      if (filter.startDate) query.createdAt.$gte = new Date(filter.startDate);
      if (filter.endDate) query.createdAt.$lte = new Date(filter.endDate);
    }
    if (filter.ipAddress) query.ipAddress = { $regex: filter.ipAddress, $options: 'i' };

    const logs = await AuditLog.find(query)
      .populate('userId', 'telegramId username')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit);

    const total = await AuditLog.countDocuments(query);

    return {
      logs,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      }
    };
  } catch (error) {
    console.error('Không thể tìm kiếm log kiểm toán:', error);
    throw error;
  }
}; 