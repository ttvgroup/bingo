const User = require('../models/User');
const Bet = require('../models/Bet');
const Transaction = require('../models/Transaction');
const mongoose = require('mongoose');
const ApiError = require('../utils/error');
const redisClient = require('../config/redis');
const config = require('../config');
const logger = require('../utils/logger');
const { getCacheKey } = require('./cacheService');

/**
 * Kiểm tra thời gian đặt cược theo múi giờ GMT+7 (Việt Nam/Thái Lan)
 * @returns {boolean} - Kết quả kiểm tra
 */
const checkBettingTime = () => {
  // Sử dụng hàm tiện ích từ config
  if (!config.isWithinBettingHours()) {
    const startHour = config.bettingTime.start.hour.toString().padStart(2, '0');
    const startMinute = config.bettingTime.start.minute.toString().padStart(2, '0');
    const endHour = config.bettingTime.end.hour.toString().padStart(2, '0');
    const endMinute = config.bettingTime.end.minute.toString().padStart(2, '0');
    
    throw new ApiError(`Giờ đặt cược là từ ${startHour}:${startMinute} đến ${endHour}:${endMinute} (GMT+7)`, 400);
  }
  
  return true;
};

/**
 * Đặt cược
 * @param {String} userId - ID người dùng
 * @param {String} numbers - Số cược
 * @param {String} betType - Loại cược
 * @param {Number} amount - Số tiền cược
 * @param {String} provinceCode - Mã tỉnh
 * @param {Object} metadata - Thông tin thêm
 * @returns {Object} - Thông tin cược
 */
exports.placeBet = async (userId, numbers, betType, amount, provinceCode, metadata = {}) => {
  // Bắt đầu session MongoDB
  const session = await mongoose.startSession();
  session.startTransaction();

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

    // Tạo cược mới
    const newBet = new Bet({
      userId,
      numbers,
      betType,
      amount,
      provinceCode,
      ipAddress: metadata.ipAddress,
      deviceInfo: metadata.deviceInfo,
      transactionTimestamp: new Date()
    });

    // Lưu cược trong transaction
    await newBet.save({ session });

    // Cập nhật số dư người dùng sử dụng atomic operation
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { $inc: { balance: -amount } }, // Sử dụng $inc để tránh race condition
      { new: true, session }
    );

    if (!updatedUser) {
      throw new ApiError('Failed to update user balance', 500);
    }

    // Tạo transaction record
    const transaction = new Transaction({
      userId,
      type: 'bet',
      amount: -amount,
      status: 'completed',
      reference: newBet._id,
      referenceModel: 'Bet',
      description: `Đặt cược ${betType} cho số ${numbers}`,
      createdAt: new Date()
    });

    await transaction.save({ session });

    // Xóa cache của người dùng
    await redisClient.del(getCacheKey('USER_PROFILE', userId));
    await redisClient.del(getCacheKey('USER_BETS', userId));

    // Commit transaction
    await session.commitTransaction();
    
    logger.info(`User ${userId} placed bet: ${betType} ${numbers} amount: ${amount}`);

    return {
      id: newBet._id,
      numbers,
      betType,
      amount,
      provinceCode,
      status: newBet.status,
      createdAt: newBet.createdAt
    };
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
  const vietnamTime = config.getVietnamTime();
  
  // Đặt về 00:00:00
  const startOfDay = new Date(vietnamTime);
  startOfDay.setHours(0, 0, 0, 0);
  
  // Đặt về 23:59:59
  const endOfDay = new Date(vietnamTime);
  endOfDay.setHours(23, 59, 59, 999);
  
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
    const cacheKey = getCacheKey('USER_BETS', `${userId}:${JSON.stringify(options)}`);
    const cachedData = await redisClient.get(cacheKey);
    
    if (cachedData) {
      return JSON.parse(cachedData);
    }
    
    // Lấy dữ liệu từ database
    const [bets, total] = await Promise.all([
      Bet.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .select('numbers betType amount status provinceCode createdAt winAmount'),
        
      Bet.countDocuments(query)
    ]);
    
    const result = {
      bets,
      count: bets.length,
      total,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / limit)
      }
    };
    
    // Cache kết quả
    await redisClient.setEx(cacheKey, 300, JSON.stringify(result)); // Cache 5 phút
    
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