const User = require('../models/User');
const Bet = require('../models/Bet');
const Transaction = require('../models/Transaction');
const mongoose = require('mongoose');
const ApiError = require('../utils/error');
const redisClient = require('../config/redis');
const config = require('../config');
const logger = require('../utils/logger');
const { getCacheKey } = require('./cacheService');
const configService = require('./configService');
const dateHelper = require('../utils/dateHelper');
const userService = require('./userService');
const crypto = require('crypto');

/**
 * Kiểm tra thời gian đặt cược theo múi giờ GMT+7 (Việt Nam/Thái Lan)
 * @returns {boolean} - Kết quả kiểm tra
 */
const checkBettingTime = async () => {
  try {
    // Kiểm tra trạng thái bật/tắt đặt cược
    const bettingEnabled = await configService.isBettingEnabled();
    if (!bettingEnabled) {
      throw new ApiError('Hệ thống đặt cược hiện đang tạm khóa. Vui lòng thử lại sau.', 403);
    }
    
    // Kiểm tra thời gian đặt cược
    const isWithinHours = await configService.isWithinBettingHours();
    if (!isWithinHours) {
      const bettingHours = await configService.getBettingHours();
      const startHour = bettingHours.start.hour.toString().padStart(2, '0');
      const startMinute = bettingHours.start.minute.toString().padStart(2, '0');
      const endHour = bettingHours.end.hour.toString().padStart(2, '0');
      const endMinute = bettingHours.end.minute.toString().padStart(2, '0');
      
      throw new ApiError(`Giờ đặt cược là từ ${startHour}:${startMinute} đến ${endHour}:${endMinute} (GMT+7)`, 400);
    }
    
    return true;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    logger.error('Lỗi khi kiểm tra thời gian đặt cược:', error);
    throw new ApiError('Không thể kiểm tra thời gian đặt cược. Vui lòng thử lại sau.', 500);
  }
};

/**
 * Kiểm tra quota cho số và loại cược
 * @param {String} numbers - Số cược
 * @param {String} betType - Loại cược
 * @param {Number} amount - Số tiền cược
 * @param {String} provinceCode - Mã tỉnh
 * @param {Date} betDate - Ngày đặt cược
 * @returns {boolean} - Kết quả kiểm tra
 */
const checkBetQuota = async (numbers, betType, amount, provinceCode, betDate) => {
  try {
    // Kiểm tra xem hệ thống quota có được bật không
    const quotaEnabled = await configService.isQuotaEnabled();
    if (!quotaEnabled) {
      return true; // Nếu hệ thống quota không được bật, luôn cho phép đặt cược
    }
    
    // Lấy quota cho loại cược này
    const betTypeQuota = await configService.getQuotaForBetType(betType);
    
    // Lấy quota cho số cụ thể này
    const numberQuota = await configService.getQuotaForNumber(numbers, betType);
    
    // Tính tổng số tiền đã đặt cược cho loại cược này trong ngày
    const startOfDay = new Date(betDate);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(betDate);
    endOfDay.setHours(23, 59, 59, 999);
    
    // Tổng số tiền đã đặt cược cho loại cược này
    const totalBetTypeAmount = await Bet.aggregate([
      {
        $match: {
          betType,
          betDate: { $gte: startOfDay, $lte: endOfDay },
          provinceCode
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$amount' }
        }
      }
    ]);
    
    // Tổng số tiền đã đặt cược cho số cụ thể này
    const totalNumberAmount = await Bet.aggregate([
      {
        $match: {
          numbers,
          betType,
          betDate: { $gte: startOfDay, $lte: endOfDay },
          provinceCode
        }
      },
      {
        $group: {
          _id: null,
          total: { $sum: '$amount' }
        }
      }
    ]);
    
    // Lấy tổng số tiền đã đặt cược hoặc 0 nếu chưa có cược nào
    const currentBetTypeTotal = totalBetTypeAmount.length > 0 ? totalBetTypeAmount[0].total : 0;
    const currentNumberTotal = totalNumberAmount.length > 0 ? totalNumberAmount[0].total : 0;
    
    // Kiểm tra xem có vượt quá quota không
    if (currentBetTypeTotal + amount > betTypeQuota) {
      throw new ApiError(`Số tiền đặt cược cho loại ${betType} đã đạt giới hạn (${betTypeQuota.toLocaleString('vi-VN')}đ). Vui lòng chọn loại cược khác.`, 400);
    }
    
    if (currentNumberTotal + amount > numberQuota) {
      throw new ApiError(`Số tiền đặt cược cho số "${numbers}" đã đạt giới hạn (${numberQuota.toLocaleString('vi-VN')}đ). Vui lòng chọn số khác.`, 400);
    }
    
    // Kiểm tra ngưỡng thông báo
    const notificationThreshold = await configService.getQuotaNotificationThreshold();
    const betTypeThresholdReached = (currentBetTypeTotal + amount) >= (betTypeQuota * notificationThreshold / 100);
    const numberThresholdReached = (currentNumberTotal + amount) >= (numberQuota * notificationThreshold / 100);
    
    // Trả về kết quả kiểm tra và thông tin cảnh báo
    return {
      allowed: true,
      warnings: {
        betTypeThresholdReached,
        numberThresholdReached,
        betTypeRemaining: betTypeQuota - currentBetTypeTotal - amount,
        numberRemaining: numberQuota - currentNumberTotal - amount,
        betTypeQuota,
        numberQuota
      }
    };
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    logger.error('Lỗi khi kiểm tra quota đặt cược:', error);
    throw new ApiError('Không thể kiểm tra quota đặt cược. Vui lòng thử lại sau.', 500);
  }
};

/**
 * Kiểm tra quota cho số cược
 * @param {String} numbers - Số cược
 * @param {String} betType - Loại cược
 * @param {Number} amount - Số tiền cược
 * @returns {Promise<Boolean>} - true nếu còn đủ quota, false nếu đã hết quota
 */
exports.checkBetQuota = async (numbers, betType, amount) => {
  const configService = require('./configService');
  
  // Kiểm tra xem hệ thống quota có được bật không
  const quotaEnabled = await configService.isQuotaEnabled();
  if (!quotaEnabled) {
    return true; // Nếu không bật quota, luôn cho phép đặt cược
  }
  
  try {
    // Thử sử dụng Redis nếu có
    const redis = await configService.getRedisClient();
    if (redis) {
      // Sử dụng Redis để kiểm tra quota nhanh hơn
      const isAllowed = await configService.checkQuotaWithRedis(numbers, betType, amount);
      if (!isAllowed) {
        const quota = await configService.getQuotaForNumber(numbers, betType);
        throw new ApiError(`Số tiền đặt cược cho số "${numbers}" đã đạt giới hạn (${quota.toLocaleString('vi-VN')}đ). Vui lòng chọn số khác.`, 400);
      }
      
      // Cập nhật số tiền đã đặt cược trong Redis
      await configService.updateBetAmountInRedis(numbers, betType, amount);
      
      // Kiểm tra các hành vi bất thường
      const anomalyCheck = await configService.detectAnomalies(numbers, betType, amount);
      if (anomalyCheck.isAnomaly) {
        // Ghi log nhưng vẫn cho phép đặt cược
        console.warn(`Phát hiện hành vi bất thường: ${numbers}, ${betType}, ${amount}, ${anomalyCheck.reason}`);
        
        // Gửi thông báo cho admin nếu cần
        const telegramService = require('./telegramService');
        await telegramService.sendAdminAlert(`⚠️ Phát hiện hành vi bất thường: Số ${numbers}, loại ${betType}, số tiền ${amount.toLocaleString('vi-VN')}đ, lý do: ${anomalyCheck.reason}`);
      }
      
      return true;
    }
    
    // Fallback to MongoDB if Redis is not available
    // Lấy thống kê số tiền đặt cược cho số này
    const Bet = require('../models/Bet');
    
    // Lấy ngày hiện tại (giờ GMT+7)
    const now = new Date();
    const vietnamTime = new Date(now.getTime() + (7 * 60 * 60 * 1000));
    vietnamTime.setHours(0, 0, 0, 0);
    
    const startDate = vietnamTime;
    const endDate = new Date(vietnamTime);
    endDate.setHours(23, 59, 59, 999);
    
    // Lấy tổng số tiền đã đặt cược cho số này
    const betStats = await Bet.aggregate([
      {
        $match: {
          numbers,
          betType,
          createdAt: { $gte: startDate, $lte: endDate },
          status: 'pending'
        }
      },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: '$amount' }
        }
      }
    ]);
    
    const totalBetAmount = betStats.length > 0 ? betStats[0].totalAmount : 0;
    
    // Lấy quota cho số này
    const quota = await configService.getQuotaForNumber(numbers, betType);
    
    // Kiểm tra xem có vượt quá quota không
    if ((totalBetAmount + amount) > quota) {
      throw new ApiError(`Số tiền đặt cược cho số "${numbers}" đã đạt giới hạn (${quota.toLocaleString('vi-VN')}đ). Vui lòng chọn số khác.`, 400);
    }
    
    return true;
  } catch (error) {
    if (error instanceof ApiError) {
      throw error;
    }
    console.error('Lỗi khi kiểm tra quota đặt cược:', error);
    throw new ApiError('Không thể kiểm tra quota đặt cược. Vui lòng thử lại sau.', 500);
  }
};

/**
 * Kiểm tra và gửi thông báo khi quota gần đạt ngưỡng
 * @param {String} numbers - Số cược
 * @param {String} betType - Loại cược
 * @returns {Promise<void>}
 */
exports.checkAndSendQuotaAlert = async (numbers, betType) => {
  try {
    const configService = require('./configService');
    const telegramService = require('./telegramService');
    
    // Kiểm tra xem hệ thống quota có được bật không
    const quotaEnabled = await configService.isQuotaEnabled();
    if (!quotaEnabled) {
      return;
    }
    
    // Lấy thống kê số tiền đặt cược cho số này
    let totalBetAmount = 0;
    let betCount = 0;
    
    // Thử sử dụng Redis nếu có
    const redis = await configService.getRedisClient();
    if (redis) {
      // Tạo key duy nhất cho số và loại cược
      const key = `quota:${numbers}:${betType}`;
      
      // Lấy tổng số tiền đã đặt cược cho số này từ Redis
      totalBetAmount = parseInt(await redis.getAsync(key) || 0);
      
      // Lấy số lượng cược từ cache nếu có
      const cachedData = await configService.getCachedQuotaData(`bet_count:${numbers}:${betType}`);
      betCount = cachedData ? cachedData.count : 0;
      
      // Nếu không có dữ liệu trong cache, truy vấn từ MongoDB
      if (betCount === 0) {
        const Bet = require('../models/Bet');
        
        // Lấy ngày hiện tại (giờ GMT+7)
        const now = new Date();
        const vietnamTime = new Date(now.getTime() + (7 * 60 * 60 * 1000));
        vietnamTime.setHours(0, 0, 0, 0);
        
        const startDate = vietnamTime;
        const endDate = new Date(vietnamTime);
        endDate.setHours(23, 59, 59, 999);
        
        // Lấy số lượng cược từ MongoDB
        const betStats = await Bet.aggregate([
          {
            $match: {
              numbers,
              betType,
              createdAt: { $gte: startDate, $lte: endDate },
              status: 'pending'
            }
          },
          {
            $group: {
              _id: null,
              count: { $sum: 1 }
            }
          }
        ]);
        
        betCount = betStats.length > 0 ? betStats[0].count : 0;
        
        // Lưu vào cache
        await configService.cacheQuotaData(`bet_count:${numbers}:${betType}`, { count: betCount }, 300);
      }
    } else {
      // Fallback to MongoDB
      const Bet = require('../models/Bet');
      
      // Lấy ngày hiện tại (giờ GMT+7)
      const now = new Date();
      const vietnamTime = new Date(now.getTime() + (7 * 60 * 60 * 1000));
      vietnamTime.setHours(0, 0, 0, 0);
      
      const startDate = vietnamTime;
      const endDate = new Date(vietnamTime);
      endDate.setHours(23, 59, 59, 999);
      
      // Lấy tổng số tiền đã đặt cược cho số này
      const betStats = await Bet.aggregate([
        {
          $match: {
            numbers,
            betType,
            createdAt: { $gte: startDate, $lte: endDate },
            status: 'pending'
          }
        },
        {
          $group: {
            _id: null,
            totalAmount: { $sum: '$amount' },
            count: { $sum: 1 }
          }
        }
      ]);
      
      if (betStats.length > 0) {
        totalBetAmount = betStats[0].totalAmount;
        betCount = betStats[0].count;
      }
    }
    
    // Lấy quota cho số này
    const quota = await configService.getQuotaForNumber(numbers, betType);
    
    // Tính phần trăm đã sử dụng
    const percentUsed = (totalBetAmount / quota) * 100;
    
    // Lấy ngưỡng thông báo
    const threshold = await configService.getQuotaNotificationThreshold();
    
    // Nếu đã vượt ngưỡng thông báo, gửi cảnh báo
    if (percentUsed >= threshold) {
      const remainingQuota = quota - totalBetAmount;
      const message = `⚠️ Cảnh báo quota: Số "${numbers}" (${betType}) đã đạt ${percentUsed.toFixed(1)}% quota.\n` +
                      `- Đã đặt: ${totalBetAmount.toLocaleString('vi-VN')}đ (${betCount} lần)\n` +
                      `- Quota: ${quota.toLocaleString('vi-VN')}đ\n` +
                      `- Còn lại: ${remainingQuota.toLocaleString('vi-VN')}đ`;
      
      await telegramService.sendAdminAlert(message);
    }
  } catch (error) {
    console.error('Lỗi khi kiểm tra và gửi thông báo quota:', error);
  }
};

/**
 * Tạo hash cho giao dịch
 * @param {String} senderId - ID người gửi
 * @param {String} receiverId - ID người nhận
 * @param {Number} amount - Số tiền
 * @returns {String} Hash giao dịch
 */
function createTransactionHash(senderId, receiverId, amount) {
  const data = `${senderId}-${receiverId}-${amount}-${Date.now()}`;
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Đặt cược
 * @param {String} userId - ID người dùng
 * @param {String} numbers - Số cược
 * @param {String} betType - Loại cược
 * @param {Number} amount - Số tiền cược
 * @param {String} provinceCode - Mã tỉnh
 * @param {Object} metadata - Thông tin thêm
 * @param {Date} betDate - Ngày đặt cược (GMT+7)
 * @returns {Object} - Thông tin cược
 */
exports.placeBet = async (userId, numbers, betType, amount, provinceCode, metadata = {}, betDate = null) => {
  // Kiểm tra thời gian đặt cược
  await checkBettingTime();

  // Nếu không cung cấp ngày cược, sử dụng ngày hiện tại theo GMT+7
  if (!betDate) {
    betDate = dateHelper.getCurrentVietnamTime();
  }

  // Kiểm tra quota đặt cược
  const quotaCheck = await checkBetQuota(numbers, betType, amount, provinceCode, betDate);

  // Kiểm tra và gửi thông báo nếu gần đạt ngưỡng quota
  await exports.checkAndSendQuotaAlert(numbers, betType);

  // Bắt đầu session MongoDB
  const session = await mongoose.startSession();
  session.startTransaction({
    readConcern: { level: 'snapshot' },
    writeConcern: { w: 'majority' }
  });

  try {
    // Kiểm tra thông tin người dùng
    const user = await User.findById(userId).session(session);
    if (!user) {
      throw new ApiError('User not found', 404);
    }

    // Kiểm tra số dư
    if (user.balance < amount) {
      throw new ApiError('Insufficient balance', 400);
    }
    
    // Lấy tài khoản Pool
    const poolAccount = await userService.getPoolAccount();

    // Tạo cược mới
    const newBet = new Bet({
      userId,
      numbers,
      betType,
      amount,
      provinceCode,
      ipAddress: metadata.ipAddress,
      deviceInfo: metadata.deviceInfo,
      betDate: betDate, // Sử dụng ngày đặt cược cung cấp hoặc mặc định
      transactionTimestamp: new Date()
    });

    // Lưu tổng điểm trước khi thực hiện giao dịch
    const totalBalanceBefore = user.balance + poolAccount.balance;
    
    // Lưu cược trong transaction
    await newBet.save({ session });

    // Cập nhật số dư người dùng sử dụng atomic operation
    const updatedUser = await User.findOneAndUpdate(
      { _id: userId, balance: { $gte: amount } },
      { $inc: { balance: -amount } },
      { new: true, session }
    );

    if (!updatedUser) {
      throw new ApiError('Failed to update user balance or insufficient balance', 400);
    }
    
    // Cập nhật số dư tài khoản Pool
    const updatedPool = await User.findOneAndUpdate(
      { _id: poolAccount._id },
      { $inc: { balance: amount } },
      { new: true, session }
    );
    
    if (!updatedPool) {
      throw new ApiError('Failed to update pool account balance', 500);
    }
    
    // Kiểm tra tổng điểm sau khi thực hiện giao dịch
    const totalBalanceAfter = updatedUser.balance + updatedPool.balance;
    
    // Đảm bảo tổng điểm trước và sau khi chuyển là không đổi
    if (totalBalanceBefore !== totalBalanceAfter) {
      throw new ApiError(`Lỗi toàn vẹn dữ liệu: Tổng điểm trước (${totalBalanceBefore}) và sau (${totalBalanceAfter}) không khớp`, 500);
    }

    // Tạo transaction record cho người dùng
    const userTransaction = new Transaction({
      userId,
      receiverId: poolAccount._id,
      type: 'bet',
      amount: -amount,
      status: 'completed',
      reference: newBet._id,
      referenceModel: 'Bet',
      description: `Đặt cược ${betType} cho số ${numbers} ngày ${dateHelper.formatDateVN(betDate)}`,
      createdAt: new Date(),
      metaData: {
        betId: newBet._id,
        userBalanceBefore: user.balance,
        userBalanceAfter: updatedUser.balance,
        poolBalanceBefore: poolAccount.balance,
        poolBalanceAfter: updatedPool.balance,
        totalBalanceBefore,
        totalBalanceAfter,
        balanceIntegrityVerified: true,
        ipAddress: metadata.ipAddress,
        deviceInfo: metadata.deviceInfo
      },
      transactionHash: createTransactionHash(userId, poolAccount._id, amount)
    });

    await userTransaction.save({ session });
    
    // Tạo transaction record cho tài khoản Pool
    const poolTransaction = new Transaction({
      userId: poolAccount._id,
      receiverId: userId,
      type: 'bet_receive',
      amount: amount,
      status: 'completed',
      reference: newBet._id,
      referenceModel: 'Bet',
      description: `Nhận tiền cược ${betType} từ ${user.username || userId} cho số ${numbers}`,
      createdAt: new Date(),
      metaData: {
        betId: newBet._id,
        userBalanceBefore: user.balance,
        userBalanceAfter: updatedUser.balance,
        poolBalanceBefore: poolAccount.balance,
        poolBalanceAfter: updatedPool.balance,
        totalBalanceBefore,
        totalBalanceAfter,
        balanceIntegrityVerified: true
      },
      transactionHash: createTransactionHash(poolAccount._id, userId, amount)
    });

    await poolTransaction.save({ session });

    // Xóa cache của người dùng và tài khoản Pool
    await redisClient.del(getCacheKey('USER_PROFILE', userId));
    await redisClient.del(getCacheKey('USER_BETS', userId));
    await redisClient.del(getCacheKey('SYSTEM_POOL_ACCOUNT'));

    // Commit transaction
    await session.commitTransaction();
    
    logger.info(`User ${userId} placed bet: ${betType} ${numbers} amount: ${amount} for date: ${dateHelper.formatDateVN(betDate)}`);

    // Trả về kết quả đặt cược và cảnh báo quota nếu có
    const result = {
      id: newBet._id,
      numbers,
      betType,
      amount,
      provinceCode,
      betDate: newBet.betDate,
      status: newBet.status,
      createdAt: newBet.createdAt
    };
    
    // Thêm thông tin cảnh báo quota nếu có
    if (quotaCheck.warnings) {
      if (quotaCheck.warnings.betTypeThresholdReached) {
        result.warnings = result.warnings || {};
        result.warnings.betType = `Loại cược ${betType} đã đạt ${await configService.getQuotaNotificationThreshold()}% quota (còn lại: ${quotaCheck.warnings.betTypeRemaining.toLocaleString('vi-VN')}đ)`;
      }
      
      if (quotaCheck.warnings.numberThresholdReached) {
        result.warnings = result.warnings || {};
        result.warnings.number = `Số "${numbers}" đã đạt ${await configService.getQuotaNotificationThreshold()}% quota (còn lại: ${quotaCheck.warnings.numberRemaining.toLocaleString('vi-VN')}đ)`;
      }
    }
    
    return result;
  } catch (error) {
    // Rollback transaction nếu có lỗi
    await session.abortTransaction();
    logger.error(`Error placing bet: ${error.message}`, { stack: error.stack });
    throw error;
  } finally {
    // Kết thúc session
    session.endSession();
  }
};

/**
 * Kiểm tra giới hạn đặt cược trong ngày
 * @param {ObjectId} userId - ID của người dùng
 * @param {Number} amount - Số tiền cược
 * @returns {Boolean} - true nếu trong giới hạn
 */
async function validateBetLimit(userId, amount) {
  // Lấy thời gian đầu ngày và cuối ngày theo GMT+7
  const vietnamTime = dateHelper.getCurrentVietnamTime();
  
  // Đặt về 00:00:00
  const startOfDay = new Date(vietnamTime);
  startOfDay.setUTCHours(0, 0, 0, 0);
  
  // Đặt về 23:59:59
  const endOfDay = new Date(vietnamTime);
  endOfDay.setUTCHours(23, 59, 59, 999);
  
  // Tính tổng số tiền đã cược trong ngày
  const todayBets = await Bet.find({
    userId: userId,
    createdAt: { $gte: startOfDay, $lte: endOfDay }
  });
  
  const todayTotal = todayBets.reduce((sum, bet) => sum + bet.amount, 0);
  
  // Kiểm tra giới hạn (ví dụ: 10,000,000 VND một ngày)
  const dailyLimit = 10000000; // Có thể đưa vào config
  
  if (todayTotal + amount > dailyLimit) {
    throw new ApiError(`Vượt quá giới hạn đặt cược hàng ngày (${dailyLimit.toLocaleString('vi-VN')} VND)`, 400);
  }
  
  return true;
}

/**
 * Kiểm tra định dạng số cược
 * @param {string} numbers - Số cược
 * @param {string} betType - Loại cược
 */
function validateBetFormat(numbers, betType) {
  switch (betType) {
    case '2D':
      if (!/^\d{2}$/.test(numbers)) {
        throw new ApiError('Cược 2D phải là 2 chữ số', 400);
      }
      break;
    case '3D':
      if (!/^\d{3}$/.test(numbers)) {
        throw new ApiError('Cược 3D phải là 3 chữ số', 400);
      }
      break;
    case '4D':
      if (!/^\d{4}$/.test(numbers)) {
        throw new ApiError('Cược 4D phải là 4 chữ số', 400);
      }
      break;
    case 'Bao lô 2D':
      if (!/^\d{2}$/.test(numbers)) {
        throw new ApiError('Cược Bao lô 2D phải là 2 chữ số', 400);
      }
      break;
    case 'Bao lô 3D':
      if (!/^\d{3}$/.test(numbers)) {
        throw new ApiError('Cược Bao lô 3D phải là 3 chữ số', 400);
      }
      break;
    case 'Bao lô 4D':
      if (!/^\d{4}$/.test(numbers)) {
        throw new ApiError('Cược Bao lô 4D phải là 4 chữ số', 400);
      }
      break;
    default:
      throw new ApiError('Loại cược không hợp lệ', 400);
  }
}

/**
 * Lấy danh sách cược của người dùng
 * @param {String} userId - ID người dùng
 * @param {Object} options - Tùy chọn phân trang và lọc
 * @returns {Object} - Danh sách cược và metadata
 */
exports.getUserBets = async (userId, options = {}) => {
  try {
    const { page = 1, limit = 20, status, startDate, endDate } = options;
    const skip = (page - 1) * limit;
    
    // Xây dựng query
    const query = { userId };
    
    if (status) {
      query.status = status;
    }
    
    if (startDate && endDate) {
      query.createdAt = { $gte: startDate, $lte: endDate };
    } else if (startDate) {
      query.createdAt = { $gte: startDate };
    } else if (endDate) {
      query.createdAt = { $lte: endDate };
    }

    // Kiểm tra cache
    const cacheKey = getCacheKey('USER_BETS', userId, JSON.stringify(options));
    const cachedData = await redisClient.get(cacheKey);
    
    if (cachedData) {
      return JSON.parse(cachedData);
    }
    
    // Thực hiện truy vấn với phân trang
    const [bets, total] = await Promise.all([
      Bet.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Bet.countDocuments(query)
    ]);
    
    // Định dạng kết quả với ngày/tháng/năm GMT+7
    const formattedBets = bets.map(bet => ({
      id: bet._id,
      numbers: bet.numbers,
      betType: bet.betType,
      amount: bet.amount,
      status: bet.status,
      provinceCode: bet.provinceCode,
      betDate: dateHelper.formatDateVN(bet.betDate || bet.createdAt),
      resultDate: bet.resultDate ? dateHelper.formatDateVN(bet.resultDate) : null,
      dateMatchStatus: bet.dateMatchStatus || 'not_checked',
      winAmount: bet.winAmount,
      createdAt: dateHelper.formatDateTimeVN(bet.createdAt)
    }));
    
    const result = {
      bets: formattedBets,
      count: bets.length,
      total,
      pagination: {
        page,
        limit,
        pages: Math.ceil(total / limit)
      }
    };
    
    // Lưu cache
    await redisClient.setEx(cacheKey, config.cacheExpiry, JSON.stringify(result));
    
    return result;
  } catch (error) {
    logger.error(`Error getting user bets: ${error.message}`, { stack: error.stack });
    throw error;
  }
};

/**
 * Lấy thông tin cược theo ID
 * @param {String} betId - ID cược
 * @param {String} userId - ID người dùng
 * @returns {Object} - Thông tin cược
 */
exports.getBetById = async (betId, userId) => {
  try {
    const cacheKey = getCacheKey('BET_DETAIL', betId);
    const cachedData = await redisClient.get(cacheKey);
    
    if (cachedData) {
      const bet = JSON.parse(cachedData);
      // Kiểm tra quyền truy cập
      if (bet.userId.toString() !== userId.toString()) {
        throw new ApiError('Access denied', 403);
      }
      return bet;
    }
    
    const bet = await Bet.findOne({ _id: betId, userId });
    
    if (!bet) {
      throw new ApiError('Bet not found', 404);
    }
    
    // Kiểm tra tính toàn vẹn
    const isIntegrityValid = bet.verifyIntegrity();
    
    if (!isIntegrityValid) {
      logger.warn(`Integrity check failed for bet: ${betId}`, { userId });
      throw new ApiError('Data integrity check failed', 400);
    }
    
    // Cache kết quả
    await redisClient.setEx(cacheKey, 300, JSON.stringify(bet)); // Cache 5 phút
    
    return bet;
  } catch (error) {
    logger.error(`Error getting bet by id: ${error.message}`, { stack: error.stack });
    throw error;
  }
};

/**
 * Lấy danh sách loại cược và tỉ lệ thắng
 * @returns {Array} - Danh sách loại cược
 */
exports.getBetTypes = async () => {
  try {
    const cacheKey = getCacheKey('BET_TYPES');
    const cachedData = await redisClient.get(cacheKey);
    
    if (cachedData) {
      return JSON.parse(cachedData);
    }
    
    const betTypes = [
      {
        id: '2D',
        name: '2D (2 số cuối)',
        description: 'Đặt cược vào 2 chữ số cuối của giải đặc biệt',
        payoutRatio: config.payoutRatios['2D'] || 70
      },
      {
        id: '3D',
        name: '3D (3 số cuối)',
        description: 'Đặt cược vào 3 chữ số cuối của giải đặc biệt',
        payoutRatio: config.payoutRatios['3D'] || 600
      },
      {
        id: '4D',
        name: '4D (4 số cuối)',
        description: 'Đặt cược vào 4 chữ số cuối của giải đặc biệt',
        payoutRatio: config.payoutRatios['4D'] || 5000
      },
      {
        id: 'Bao lô 2D',
        name: 'Bao lô 2D',
        description: 'Đặt cược vào 2 chữ số cuối của tất cả các giải',
        payoutRatio: config.payoutRatios['Bao lô 2D'] || 70
      },
      {
        id: 'Bao lô 3D',
        name: 'Bao lô 3D',
        description: 'Đặt cược vào 3 chữ số cuối của tất cả các giải',
        payoutRatio: config.payoutRatios['Bao lô 3D'] || 600
      },
      {
        id: 'Bao lô 4D',
        name: 'Bao lô 4D',
        description: 'Đặt cược vào 4 chữ số cuối của tất cả các giải',
        payoutRatio: config.payoutRatios['Bao lô 4D'] || 5000
      }
    ];
    
    // Cache kết quả
    await redisClient.setEx(cacheKey, 3600, JSON.stringify(betTypes)); // Cache 1 giờ
    
    return betTypes;
  } catch (error) {
    logger.error(`Error getting bet types: ${error.message}`, { stack: error.stack });
    throw error;
  }
}; 