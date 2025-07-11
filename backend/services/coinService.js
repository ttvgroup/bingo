const mongoose = require('mongoose');
const Coin = require('../models/Coin');
const Balance = require('../models/Balance');
const User = require('../models/User');
const ApiError = require('../utils/error');
const logger = require('../utils/logger');

/**
 * Dịch vụ quản lý hệ thống Coin và Balance P
 */

/**
 * Lấy thông tin coin balance của user
 * @param {String} userId - ID người dùng
 * @returns {Object} - Thông tin coin balance
 */
exports.getUserCoinBalance = async (userId) => {
  try {
    const coinBalance = await Coin.getOrCreateCoinBalance(userId);
    const user = await User.findById(userId);
    
    return {
      userId: userId,
      username: user?.username,
      telegramId: user?.telegramId,
      balance: coinBalance.balance,
      totalEarned: coinBalance.totalEarned,
      totalSpent: coinBalance.totalSpent,
      achievedMilestones: coinBalance.achievedMilestones,
      lastUpdated: coinBalance.lastUpdated
    };
  } catch (error) {
    logger.error(`Error getting user coin balance: ${error.message}`, { stack: error.stack });
    throw new ApiError('Không thể lấy thông tin coin balance', 500);
  }
};

/**
 * Lấy thông tin P balance của user
 * @param {String} userId - ID người dùng
 * @returns {Object} - Thông tin P balance
 */
exports.getUserPBalance = async (userId) => {
  try {
    const pBalance = await Balance.getOrCreateBalance(userId, 'user');
    const user = await User.findById(userId);
    
    return {
      userId: userId,
      username: user?.username,
      telegramId: user?.telegramId,
      balance: pBalance.balance,
      totalReceived: pBalance.totalReceived,
      totalSpent: pBalance.totalSpent,
      lastUpdated: pBalance.lastUpdated
    };
  } catch (error) {
    logger.error(`Error getting user P balance: ${error.message}`, { stack: error.stack });
    throw new ApiError('Không thể lấy thông tin P balance', 500);
  }
};

/**
 * Lấy lịch sử giao dịch coin của user
 * @param {String} userId - ID người dùng
 * @param {Number} limit - Số lượng giao dịch tối đa
 * @returns {Array} - Lịch sử giao dịch
 */
exports.getUserCoinHistory = async (userId, limit = 50) => {
  try {
    const coinBalance = await Coin.getOrCreateCoinBalance(userId);
    return coinBalance.getTransactionHistory(limit);
  } catch (error) {
    logger.error(`Error getting user coin history: ${error.message}`, { stack: error.stack });
    throw new ApiError('Không thể lấy lịch sử giao dịch coin', 500);
  }
};

/**
 * Lấy lịch sử giao dịch P của user
 * @param {String} userId - ID người dùng
 * @param {Number} limit - Số lượng giao dịch tối đa
 * @returns {Array} - Lịch sử giao dịch
 */
exports.getUserPHistory = async (userId, limit = 50) => {
  try {
    const pBalance = await Balance.getOrCreateBalance(userId, 'user');
    return pBalance.getTransactionHistory(limit);
  } catch (error) {
    logger.error(`Error getting user P history: ${error.message}`, { stack: error.stack });
    throw new ApiError('Không thể lấy lịch sử giao dịch P', 500);
  }
};

/**
 * Admin cấp coin cho user
 * @param {String} userId - ID người dùng
 * @param {Number} amount - Số lượng coin
 * @param {String} reason - Lý do cấp
 * @param {String} adminId - ID admin
 * @returns {Object} - Kết quả
 */
exports.adminGrantCoins = async (userId, amount, reason, adminId) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const coinBalance = await Coin.getOrCreateCoinBalance(userId);
    
    await coinBalance.addCoins(
      amount,
      'admin_grant',
      `Admin cấp: ${reason}`,
      null,
      'System',
      adminId
    );
    
    await session.commitTransaction();
    
    logger.info(`Admin ${adminId} đã cấp ${amount} coin cho user ${userId}: ${reason}`);
    
    return {
      success: true,
      message: `Đã cấp ${amount} coin cho user`,
      newBalance: coinBalance.balance
    };
  } catch (error) {
    await session.abortTransaction();
    logger.error(`Error admin granting coins: ${error.message}`, { stack: error.stack });
    throw new ApiError('Không thể cấp coin', 500);
  } finally {
    session.endSession();
  }
};

/**
 * Admin trừ coin của user
 * @param {String} userId - ID người dùng
 * @param {Number} amount - Số lượng coin
 * @param {String} reason - Lý do trừ
 * @param {String} adminId - ID admin
 * @returns {Object} - Kết quả
 */
exports.adminDeductCoins = async (userId, amount, reason, adminId) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const coinBalance = await Coin.getOrCreateCoinBalance(userId);
    
    if (coinBalance.balance < amount) {
      throw new ApiError('Số coin của user không đủ để trừ', 400);
    }
    
    await coinBalance.spendCoins(
      amount,
      'admin_deduct',
      `Admin trừ: ${reason}`,
      null,
      'System',
      adminId
    );
    
    await session.commitTransaction();
    
    logger.info(`Admin ${adminId} đã trừ ${amount} coin của user ${userId}: ${reason}`);
    
    return {
      success: true,
      message: `Đã trừ ${amount} coin của user`,
      newBalance: coinBalance.balance
    };
  } catch (error) {
    await session.abortTransaction();
    logger.error(`Error admin deducting coins: ${error.message}`, { stack: error.stack });
    throw new ApiError('Không thể trừ coin', 500);
  } finally {
    session.endSession();
  }
};

/**
 * Admin cấp P cho user
 * @param {String} userId - ID người dùng
 * @param {Number} amount - Số lượng P
 * @param {String} reason - Lý do cấp
 * @param {String} adminId - ID admin
 * @returns {Object} - Kết quả
 */
exports.adminGrantP = async (userId, amount, reason, adminId) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const pBalance = await Balance.getOrCreateBalance(userId, 'user');
    
    await pBalance.receiveP(
      amount,
      'admin_grant',
      `Admin cấp: ${reason}`,
      null,
      'System',
      adminId
    );
    
    await session.commitTransaction();
    
    logger.info(`Admin ${adminId} đã cấp ${amount} P cho user ${userId}: ${reason}`);
    
    return {
      success: true,
      message: `Đã cấp ${amount} P cho user`,
      newBalance: pBalance.balance
    };
  } catch (error) {
    await session.abortTransaction();
    logger.error(`Error admin granting P: ${error.message}`, { stack: error.stack });
    throw new ApiError('Không thể cấp P', 500);
  } finally {
    session.endSession();
  }
};

/**
 * Admin trừ P của user
 * @param {String} userId - ID người dùng
 * @param {Number} amount - Số lượng P
 * @param {String} reason - Lý do trừ
 * @param {String} adminId - ID admin
 * @returns {Object} - Kết quả
 */
exports.adminDeductP = async (userId, amount, reason, adminId) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const pBalance = await Balance.getOrCreateBalance(userId, 'user');
    
    if (pBalance.balance < amount) {
      throw new ApiError('Số P của user không đủ để trừ', 400);
    }
    
    await pBalance.spendP(
      amount,
      'admin_deduct',
      `Admin trừ: ${reason}`,
      null,
      'System',
      adminId
    );
    
    await session.commitTransaction();
    
    logger.info(`Admin ${adminId} đã trừ ${amount} P của user ${userId}: ${reason}`);
    
    return {
      success: true,
      message: `Đã trừ ${amount} P của user`,
      newBalance: pBalance.balance
    };
  } catch (error) {
    await session.abortTransaction();
    logger.error(`Error admin deducting P: ${error.message}`, { stack: error.stack });
    throw new ApiError('Không thể trừ P', 500);
  } finally {
    session.endSession();
  }
};

/**
 * Lấy top coin holders
 * @param {Number} limit - Số lượng tối đa
 * @returns {Array} - Danh sách top coin holders
 */
exports.getTopCoinHolders = async (limit = 10) => {
  try {
    const topHolders = await Coin.getTopCoinHolders(parseInt(limit) || 10);
    
    // Chỉ trả về thông tin công khai
    return topHolders.map(holder => ({
      rank: holder.rank,
      username: holder.username || 'Người dùng ẩn danh',
      telegramId: holder.telegramId,
      balance: holder.balance || 0
    }));
  } catch (error) {
    logger.error(`Error getting top coin holders: ${error.message}`, { stack: error.stack });
    return [];
  }
};

/**
 * Lấy top P holders
 * @param {Number} limit - Số lượng tối đa
 * @returns {Array} - Danh sách top P holders
 */
exports.getTopPHolders = async (limit = 10) => {
  try {
    const topHolders = await Balance.getTopPHolders(parseInt(limit) || 10);
    
    // Chỉ trả về thông tin công khai
    return topHolders.map(holder => ({
      rank: holder.rank,
      username: holder.username || 'Người dùng ẩn danh',
      telegramId: holder.telegramId,
      balance: holder.balance || 0
    }));
  } catch (error) {
    logger.error(`Error getting top P holders: ${error.message}`, { stack: error.stack });
    return [];
  }
};

/**
 * Lấy thống kê hệ thống
 * @returns {Object} - Thống kê hệ thống
 */
exports.getSystemStats = async () => {
  try {
    const [totalCoins, totalP, totalUsers] = await Promise.all([
      Coin.aggregate([
        {
          $group: {
            _id: null,
            totalBalance: { $sum: '$balance' },
            totalEarned: { $sum: '$totalEarned' },
            totalSpent: { $sum: '$totalSpent' }
          }
        }
      ]),
      Balance.aggregate([
        {
          $group: {
            _id: null,
            totalBalance: { $sum: '$balance' },
            totalReceived: { $sum: '$totalReceived' },
            totalSpent: { $sum: '$totalSpent' }
          }
        }
      ]),
      User.countDocuments()
    ]);
    
    return {
      coins: totalCoins[0] || { totalBalance: 0, totalEarned: 0, totalSpent: 0 },
      p: totalP[0] || { totalBalance: 0, totalReceived: 0, totalSpent: 0 },
      totalUsers: totalUsers
    };
  } catch (error) {
    logger.error(`Error getting system stats: ${error.message}`, { stack: error.stack });
    throw new ApiError('Không thể lấy thống kê hệ thống', 500);
  }
};

/**
 * Khởi tạo daily bonus cho admin balance
 * @param {String} adminId - ID của admin
 * @returns {Object} - Kết quả
 */
exports.initializeDailyBonus = async (adminId) => {
  try {
    // Kiểm tra xem người dùng có phải là admin không
    const admin = await User.findById(adminId);
    if (!admin || admin.role !== 'admin') {
      throw new ApiError('Chỉ admin mới có thể khởi tạo daily bonus', 403);
    }
    
    // Kiểm tra xác thực bổ sung cho admin
    if (!admin.twoFactorEnabled) {
      throw new ApiError('Admin cần bật xác thực hai lớp để thực hiện thao tác này', 403);
    }
    
    // Lấy hoặc tạo balance P cho admin
    const adminBalance = await Balance.getOrCreateBalance(adminId, 'user');
    
    // Kiểm tra xem đã tạo daily bonus trong ngày chưa
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    
    // Tìm tổng số P đã mint trong ngày
    const dailyMintedP = await Balance.aggregate([
      {
        $unwind: '$transactions'
      },
      {
        $match: {
          'transactions.type': 'daily_bonus',
          'transactions.createdAt': { $gte: today, $lt: tomorrow }
        }
      },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: '$transactions.amount' }
        }
      }
    ]);
    
    const dailyMintedAmount = dailyMintedP.length > 0 ? dailyMintedP[0].totalAmount : 0;
    const maxDailyAmount = 100000000; // 100M P
    
    if (dailyMintedAmount >= maxDailyAmount) {
      return {
        success: false,
        message: 'Đã đạt giới hạn tạo P trong ngày (100M P)',
        dailyMintedAmount,
        maxDailyAmount
      };
    }
    
    // Tính số P có thể tạo thêm
    const remainingAmount = maxDailyAmount - dailyMintedAmount;
    
    // Thêm P vào balance của admin
    await adminBalance.receiveP(
      remainingAmount,
      'daily_bonus',
      `Admin daily bonus (${remainingAmount} P)`
    );
    
    // Ghi log hành động này
    const auditService = require('./auditService');
    await auditService.logAction(
      adminId,
      'admin_daily_bonus',
      'Balance',
      adminBalance._id,
      {
        amount: remainingAmount,
        dailyMintedAmount: dailyMintedAmount + remainingAmount,
        maxDailyAmount
      }
    );
    
    logger.info(`Admin ${admin.telegramId} đã nhận ${remainingAmount} P daily bonus`);
    
    return {
      success: true,
      message: `Đã tạo thành công ${remainingAmount} P cho admin`,
      amount: remainingAmount,
      dailyMintedAmount: dailyMintedAmount + remainingAmount,
      maxDailyAmount
    };
  } catch (error) {
    logger.error(`Error initializing daily bonus: ${error.message}`, { stack: error.stack });
    throw error;
  }
}; 