const User = require('../models/User');
const Bet = require('../models/Bet');
const redisClient = require('../config/redis');
const ApiError = require('../utils/error');
const config = require('../config');
const logger = require('../utils/logger');

/**
 * Đặt cược
 * @param {string} telegramId - ID Telegram của người dùng
 * @param {string} numbers - Số cược
 * @param {string} betType - Loại cược
 * @param {number} amount - Số tiền cược
 * @param {string} provinceCode - Mã tỉnh
 * @returns {Object} - Thông tin cược và số dư mới
 */
exports.placeBet = async (telegramId, numbers, betType, amount, provinceCode) => {
  // Kiểm tra thời gian đặt cược
  const currentHour = new Date().getUTCHours();
  if (currentHour < config.bettingHoursStart || currentHour >= config.bettingHoursEnd) {
    throw new ApiError(400, `Giờ đặt cược là từ ${config.bettingHoursStart}:00 đến ${config.bettingHoursEnd}:00 UTC`);
  }

  // Kiểm tra định dạng số cược
  validateBetFormat(numbers, betType);

  // Kiểm tra số tiền cược
  if (amount <= 0) {
    throw new ApiError(400, 'Số tiền cược phải lớn hơn 0');
  }

  // Tìm thông tin người dùng
  const user = await User.findOne({ telegramId });
  if (!user) {
    throw new ApiError(404, 'Không tìm thấy người dùng');
  }

  // Kiểm tra số dư
  if (user.balance < amount) {
    throw new ApiError(400, 'Số dư không đủ để đặt cược');
  }

  // Tạo cược mới
  const bet = new Bet({
    userId: user._id,
    numbers,
    betType,
    amount,
    provinceCode
  });

  // Sử dụng session để đảm bảo tính toàn vẹn dữ liệu
  const session = await User.startSession();
  session.startTransaction();

  try {
    // Trừ tiền từ tài khoản người dùng
    user.balance -= amount;
    await user.save({ session });
    
    // Lưu thông tin cược
    await bet.save({ session });
    
    // Commit transaction
    await session.commitTransaction();
    
    // Cập nhật cache
    try {
      await redisClient.setEx(`user:${telegramId}`, config.cacheExpiry, JSON.stringify(user));
    } catch (redisErr) {
      logger.error('Redis cache error:', redisErr);
    }
    
    return { bet, balance: user.balance };
  } catch (error) {
    // Rollback nếu có lỗi
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

/**
 * Kiểm tra định dạng số cược
 * @param {string} numbers - Số cược
 * @param {string} betType - Loại cược
 */
function validateBetFormat(numbers, betType) {
  switch (betType) {
    case '2D':
      if (!/^\d{2}$/.test(numbers)) {
        throw new ApiError(400, 'Cược 2D phải là 2 chữ số');
      }
      break;
    case '3D':
      if (!/^\d{3}$/.test(numbers)) {
        throw new ApiError(400, 'Cược 3D phải là 3 chữ số');
      }
      break;
    case '4D':
      if (!/^\d{4}$/.test(numbers)) {
        throw new ApiError(400, 'Cược 4D phải là 4 chữ số');
      }
      break;
    case 'Bao lô 2D':
      if (!/^\d{2}$/.test(numbers)) {
        throw new ApiError(400, 'Cược Bao lô 2D phải là 2 chữ số');
      }
      break;
    case 'Bao lô 3D':
      if (!/^\d{3}$/.test(numbers)) {
        throw new ApiError(400, 'Cược Bao lô 3D phải là 3 chữ số');
      }
      break;
    case 'Bao lô 4D':
      if (!/^\d{4}$/.test(numbers)) {
        throw new ApiError(400, 'Cược Bao lô 4D phải là 4 chữ số');
      }
      break;
    default:
      throw new ApiError(400, 'Loại cược không hợp lệ');
  }
}

/**
 * Lấy danh sách cược của người dùng
 * @param {string} telegramId - ID Telegram của người dùng
 * @returns {Array} - Danh sách cược
 */
exports.getUserBets = async (telegramId) => {
  const user = await User.findOne({ telegramId });
  if (!user) {
    throw new ApiError(404, 'Không tìm thấy người dùng');
  }

  const bets = await Bet.find({ userId: user._id })
    .sort({ createdAt: -1 })
    .limit(50);

  return bets;
};

/**
 * Lấy thông tin một cược cụ thể
 * @param {string} betId - ID của cược
 * @param {string} telegramId - ID Telegram của người dùng
 * @returns {Object} - Thông tin cược
 */
exports.getBetById = async (betId, telegramId) => {
  const user = await User.findOne({ telegramId });
  if (!user) {
    throw new ApiError(404, 'Không tìm thấy người dùng');
  }

  const bet = await Bet.findOne({ _id: betId, userId: user._id });
  if (!bet) {
    throw new ApiError(404, 'Không tìm thấy cược này');
  }

  return bet;
};

/**
 * Lấy danh sách các loại cược
 * @returns {Array} - Danh sách các loại cược
 */
exports.getBetTypes = async () => {
  return [
    {
      type: '2D',
      description: 'Cược vào 2 chữ số cuối của giải',
      minBet: 10000,
      payoutRatio: config.payoutRatios['2D'],
      format: 'XX (2 chữ số)'
    },
    {
      type: '3D',
      description: 'Cược vào 3 chữ số cuối của giải',
      minBet: 10000,
      payoutRatio: config.payoutRatios['3D'],
      format: 'XXX (3 chữ số)'
    },
    {
      type: '4D',
      description: 'Cược vào 4 chữ số đầy đủ của giải',
      minBet: 10000,
      payoutRatio: config.payoutRatios['4D'],
      format: 'XXXX (4 chữ số)'
    },
    {
      type: 'Bao lô 2D',
      description: 'Cược vào 2 chữ số xuất hiện ở bất kỳ vị trí nào',
      minBet: 10000 * config.baoLoQuantity['Bao lô 2D'],
      payoutRatio: config.payoutRatios['Bao lô 2D'],
      format: 'XX (2 chữ số)'
    },
    {
      type: 'Bao lô 3D',
      description: 'Cược vào 3 chữ số xuất hiện ở bất kỳ vị trí nào',
      minBet: 10000 * config.baoLoQuantity['Bao lô 3D'],
      payoutRatio: config.payoutRatios['Bao lô 3D'],
      format: 'XXX (3 chữ số)'
    },
    {
      type: 'Bao lô 4D',
      description: 'Cược vào 4 chữ số xuất hiện ở bất kỳ vị trí nào',
      minBet: 10000 * config.baoLoQuantity['Bao lô 4D'],
      payoutRatio: config.payoutRatios['Bao lô 4D'],
      format: 'XXXX (4 chữ số)'
    }
  ];
}; 