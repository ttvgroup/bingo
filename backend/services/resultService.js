const Result = require('../models/Result');
const Bet = require('../models/Bet');
const User = require('../models/User');
const Transaction = require('../models/Transaction');
const ApiError = require('../utils/error');
const mongoose = require('mongoose');
const redisClient = require('../config/redis');
const telegramService = require('./telegramService');
const config = require('../config');
const logger = require('../utils/logger');
const { getCacheKey } = require('./cacheService');
const rewardService = require('./rewardService');

/**
 * Tạo kết quả xổ số mới
 * @param {Object} resultData - Thông tin kết quả
 * @param {String} adminId - ID của admin tạo kết quả
 * @returns {Object} - Kết quả đã tạo
 */
exports.createResult = async (resultData, adminId) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Tạo kết quả mới
    const result = new Result({
      ...resultData,
      createdBy: adminId,
      createdAt: new Date()
    });

    // Lưu kết quả
    await result.save({ session });

    // Cập nhật kết quả cho các cược
    await processResultForBets(result, adminId, session);
    
    // Xóa các cache liên quan đến kết quả
    await clearResultCache(result.date);

    // Commit transaction
    await session.commitTransaction();
    
    logger.info(`New result created for ${result.date.toISOString()} by admin ${adminId}`);
    
    return result;
  } catch (error) {
    // Rollback transaction nếu có lỗi
    await session.abortTransaction();
    logger.error(`Error creating result: ${error.message}`, { stack: error.stack });
    throw error;
  } finally {
    // Kết thúc session
    session.endSession();
  }
};

/**
 * Cập nhật kết quả xổ số
 * @param {String} resultId - ID kết quả
 * @param {Object} updateData - Dữ liệu cập nhật
 * @param {String} adminId - ID của admin cập nhật kết quả
 * @returns {Object} - Kết quả đã cập nhật
 */
exports.updateResult = async (resultId, updateData, adminId) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Tìm và cập nhật kết quả
    const result = await Result.findByIdAndUpdate(
      resultId,
      { 
        ...updateData, 
        updatedBy: adminId, 
        updatedAt: new Date() 
      },
      { new: true, session, runValidators: true }
    );

    if (!result) {
      throw new ApiError('Result not found', 404);
    }

    // Xử lý lại kết quả cho các cược
    await processResultForBets(result, adminId, session, true);
    
    // Xóa cache
    await clearResultCache(result.date);

    // Commit transaction
    await session.commitTransaction();
    
    logger.info(`Result ${resultId} updated by admin ${adminId}`);
    
    return result;
  } catch (error) {
    // Rollback transaction nếu có lỗi
    await session.abortTransaction();
    logger.error(`Error updating result: ${error.message}`, { stack: error.stack });
    throw error;
  } finally {
    // Kết thúc session
    session.endSession();
  }
};

/**
 * Xóa kết quả xổ số
 * @param {String} resultId - ID kết quả
 * @param {String} adminId - ID của admin xóa kết quả
 * @returns {Boolean} - Kết quả xóa
 */
exports.deleteResult = async (resultId, adminId) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Tìm kết quả
    const result = await Result.findById(resultId);
    
    if (!result) {
      throw new ApiError('Result not found', 404);
    }
    
    // Lấy các cược liên quan
    const bets = await Bet.find({ resultId });
    
    // Hoàn tiền cho các cược đã thắng
    for (const bet of bets) {
      if (bet.status === 'won' && bet.winAmount > 0) {
        // Tìm user
        const user = await User.findById(bet.userId).session(session);
        
        if (user) {
          // Cập nhật số dư (hoàn lại tiền cược, trừ đi tiền thắng)
          await User.findByIdAndUpdate(
            user._id,
            { $inc: { balance: -bet.winAmount } },
            { session }
          );
          
          // Tạo transaction record
          const transaction = new Transaction({
            userId: user._id,
            type: 'win',
            amount: -bet.winAmount,
            status: 'completed',
            reference: bet._id,
            referenceModel: 'Bet',
            description: `Hoàn tiền thắng do xóa kết quả`,
            createdAt: new Date()
          });
          
          await transaction.save({ session });
        }
      }
      
      // Cập nhật trạng thái cược về pending
      bet.status = 'pending';
      bet.winAmount = 0;
      bet.resultId = null;
      await bet.save({ session });
    }
    
    // Xóa kết quả
    await Result.findByIdAndDelete(resultId, { session });
    
    // Xóa cache
    await clearResultCache(result.date);
    
    // Commit transaction
    await session.commitTransaction();
    
    logger.info(`Result ${resultId} deleted by admin ${adminId}`);
    
    return true;
  } catch (error) {
    // Rollback transaction nếu có lỗi
    await session.abortTransaction();
    logger.error(`Error deleting result: ${error.message}`, { stack: error.stack });
    throw error;
  } finally {
    // Kết thúc session
    session.endSession();
  }
};

/**
 * Lấy kết quả mới nhất
 * @returns {Object} - Kết quả mới nhất
 */
exports.getLatestResult = async () => {
  try {
    const cacheKey = getCacheKey('RESULT_LATEST');
    const cachedData = await redisClient.get(cacheKey);
    
    if (cachedData) {
      return JSON.parse(cachedData);
    }
    
    const result = await Result.findOne()
      .sort({ date: -1 })
      .populate('createdBy', 'username')
      .populate('updatedBy', 'username');
    
    if (!result) {
      return null;
    }
    
    // Cache kết quả
    await redisClient.setEx(cacheKey, 300, JSON.stringify(result)); // Cache 5 phút
    
    return result;
  } catch (error) {
    logger.error(`Error getting latest result: ${error.message}`, { stack: error.stack });
    throw error;
  }
};

/**
 * Lấy kết quả theo ID
 * @param {String} resultId - ID kết quả
 * @returns {Object} - Kết quả
 */
exports.getResultById = async (resultId) => {
  try {
    const cacheKey = getCacheKey('RESULT_BY_ID', resultId);
    const cachedData = await redisClient.get(cacheKey);
    
    if (cachedData) {
      return JSON.parse(cachedData);
    }
    
    const result = await Result.findById(resultId);
    
    if (!result) {
      throw new ApiError('Result not found', 404);
    }
    
    // Cache kết quả
    await redisClient.setEx(cacheKey, 300, JSON.stringify(result)); // Cache 5 phút
    
    return result;
  } catch (error) {
    logger.error(`Error getting result by id: ${error.message}`, { stack: error.stack });
    throw error;
  }
};

/**
 * Lấy kết quả theo ngày
 * @param {Date} date - Ngày kết quả
 * @returns {Array} - Danh sách kết quả
 */
exports.getResultByDate = async (date) => {
  try {
    // Xử lý ngày
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);
    
    const cacheKey = getCacheKey('RESULT_BY_DATE', startOfDay.toISOString());
    const cachedData = await redisClient.get(cacheKey);
    
    if (cachedData) {
      return JSON.parse(cachedData);
    }
    
    const results = await Result.find({
      date: { $gte: startOfDay, $lte: endOfDay }
    }).sort({ region: 1 });
    
    // Cache kết quả
    await redisClient.setEx(cacheKey, 3600, JSON.stringify(results)); // Cache 1 giờ
    
    return results;
  } catch (error) {
    logger.error(`Error getting result by date: ${error.message}`, { stack: error.stack });
    throw error;
  }
};

/**
 * Xử lý kết quả cho các cược
 * @param {Object} result - Kết quả xổ số
 * @param {String} adminId - ID admin
 * @param {Object} session - MongoDB session
 * @param {Boolean} isUpdate - Có phải cập nhật không
 */
const processResultForBets = async (result, adminId, session, isUpdate = false) => {
  try {
    // Lấy danh sách tỉnh
    const provinceCodes = result.provinces.map(p => p.code);
    
    // Tìm các cược chưa xử lý cho các tỉnh trong kết quả
    const pendingBets = await Bet.find({
      provinceCode: { $in: provinceCodes },
      status: 'pending'
    }).session(session);
    
    // Nếu cập nhật, reset các cược đã xử lý trước đó
    if (isUpdate) {
      // Tìm các cược đã xử lý trước đó
      const processedBets = await Bet.find({
        resultId: result._id,
        status: { $in: ['won', 'lost'] }
      }).session(session);
      
      // Hoàn tiền cho các cược đã thắng
      for (const bet of processedBets) {
        if (bet.status === 'won' && bet.winAmount > 0) {
          // Tìm user
          const user = await User.findById(bet.userId).session(session);
          
          if (user) {
            // Cập nhật số dư (hoàn lại tiền cược, trừ đi tiền thắng)
            await User.findByIdAndUpdate(
              user._id,
              { $inc: { balance: -bet.winAmount } },
              { session }
            );
            
            // Tạo transaction record
            const transaction = new Transaction({
              userId: user._id,
              type: 'win',
              amount: -bet.winAmount,
              status: 'completed',
              reference: bet._id,
              referenceModel: 'Bet',
              description: `Hoàn tiền thắng do cập nhật kết quả`,
              createdAt: new Date()
            });
            
            await transaction.save({ session });
            
            // Xóa cache người dùng
            await redisClient.del(getCacheKey('USER_PROFILE', user._id));
          }
        }
        
        // Reset cược về trạng thái pending
        bet.status = 'pending';
        bet.winAmount = 0;
        await bet.save({ session });
      }
    }
    
    // Mảng lưu người thắng để thông báo
    const winners = [];
    
    // Xử lý từng cược
    for (const bet of pendingBets) {
      // Tìm tỉnh tương ứng
      const province = result.provinces.find(p => p.code === bet.provinceCode);
      
      if (!province) continue;
      
      // Kiểm tra kết quả dựa trên loại cược
      const isWin = checkWin(bet, province.results);
      
      if (isWin) {
        // Tìm user để tính thưởng
        const user = await User.findById(bet.userId).session(session);
        if (!user) continue;
        
        // Sử dụng rewardService để tính tiền thưởng
        const rewardResult = await rewardService.calculateReward(bet, user, true);
        const winAmount = rewardResult.winAmount;
        
        // Cập nhật cược
        bet.status = 'won';
        bet.resultId = result._id;
        bet.winAmount = winAmount;
        await bet.save({ session });
        
        // Cập nhật số dư người dùng
        await User.findByIdAndUpdate(
          bet.userId,
          { $inc: { balance: winAmount } },
          { session }
        );
        
        // Tạo transaction record
        const transaction = new Transaction({
          userId: bet.userId,
          type: 'win',
          amount: winAmount,
          status: 'completed',
          reference: bet._id,
          referenceModel: 'Bet',
          description: `Thắng cược ${bet.betType} cho số ${bet.numbers}`,
          createdAt: new Date()
        });
        
        await transaction.save({ session });
        
        // Thêm vào danh sách người thắng
        winners.push({
          telegramId: user.telegramId,
          bet,
          winAmount,
          province,
          bonuses: rewardResult.bonuses || []
        });
        
        // Xóa cache người dùng
        await redisClient.del(getCacheKey('USER_PROFILE', user._id));
      } else {
        // Cập nhật cược thua
        bet.status = 'lost';
        bet.resultId = result._id;
        bet.winAmount = 0;
        await bet.save({ session });
      }
      
      // Xóa cache cược
      await redisClient.del(getCacheKey('BET_DETAIL', bet._id));
      await redisClient.del(getCacheKey('USER_BETS', bet.userId));
    }
    
    // Thông báo cho người thắng sau khi transaction đã commit
    if (winners.length > 0) {
      // Chỉ lưu danh sách người thắng, thông báo sau khi commit
      setTimeout(() => {
        telegramService.notifyWinners(winners, result).catch(err => {
          logger.error(`Error notifying winners: ${err.message}`, { stack: err.stack });
        });
      }, 1000);
    }
  } catch (error) {
    logger.error(`Error processing results: ${error.message}`, { stack: error.stack });
    throw error;
  }
};

/**
 * Kiểm tra xem cược có thắng không
 * @param {Object} bet - Thông tin cược
 * @param {Object} results - Kết quả xổ số
 * @returns {Boolean} - Có thắng không
 */
const checkWin = (bet, results) => {
  const { numbers, betType } = bet;
  
  // Xử lý từng loại cược
  switch (betType) {
    case '2D': // 2 số cuối giải đặc biệt
      return results.special.slice(-2) === numbers;
      
    case '3D': // 3 số cuối giải đặc biệt
      return results.special.slice(-3) === numbers;
      
    case '4D': // 4 số cuối giải đặc biệt
      return results.special.slice(-4) === numbers;
      
    case 'Bao lô 2D': // 2 số cuối bất kỳ giải nào
      // Tạo mảng chứa 2 số cuối của tất cả các giải
      const allResults2D = [
        results.eighth,
        results.seventh,
        ...(results.sixth || []),
        results.fifth,
        ...(results.fourth || []),
        ...(results.third || []),
        results.second,
        results.first,
        results.special
      ].map(num => num.slice(-2));
      
      return allResults2D.includes(numbers);
      
    case 'Bao lô 3D': // 3 số cuối bất kỳ giải nào
      // Tạo mảng chứa 3 số cuối của các giải có đủ 3 số
      const allResults3D = [
        results.seventh,
        ...(results.sixth || []),
        results.fifth,
        ...(results.fourth || []),
        ...(results.third || []),
        results.second,
        results.first,
        results.special
      ].map(num => num.slice(-3));
      
      return allResults3D.includes(numbers);
      
    case 'Bao lô 4D': // 4 số cuối bất kỳ giải nào
      // Tạo mảng chứa 4 số cuối của các giải có đủ 4 số
      const allResults4D = [
        ...(results.sixth || []),
        results.fifth,
        ...(results.fourth || []),
        ...(results.third || []),
        results.second,
        results.first,
        results.special
      ].map(num => num.slice(-4));
      
      return allResults4D.includes(numbers);
      
    default:
      return false;
  }
};

/**
 * Lấy tỉ lệ thưởng mặc định
 * @param {String} betType - Loại cược
 * @returns {Number} - Tỉ lệ thưởng
 */
const getDefaultPayoutRatio = (betType) => {
  switch (betType) {
    case '2D':
    case 'Bao lô 2D':
      return 70;
    case '3D':
    case 'Bao lô 3D':
      return 600;
    case '4D':
    case 'Bao lô 4D':
      return 5000;
    default:
      return 1;
  }
};

/**
 * Xóa cache liên quan đến kết quả
 * @param {Date} date - Ngày kết quả
 */
const clearResultCache = async (date) => {
  try {
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    
    // Xóa các cache liên quan
    await redisClient.del(getCacheKey('RESULT_LATEST'));
    await redisClient.del(getCacheKey('RESULT_BY_DATE', startOfDay.toISOString()));
    
    // Lấy tất cả các khóa liên quan đến "RESULT_FILTER"
    const keys = await redisClient.keys(`${getCacheKey('RESULT_FILTER')}*`);
    
    // Xóa tất cả các khóa tìm được
    if (keys.length > 0) {
      await redisClient.del(keys);
    }
    
    logger.info(`Cache cleared for results on date: ${startOfDay.toISOString()}`);
  } catch (error) {
    logger.error(`Error clearing result cache: ${error.message}`, { stack: error.stack });
    // Không throw lỗi để không ảnh hưởng đến flow chính
  }
};

/**
 * Lọc kết quả xổ số theo chữ số cuối
 * @param {string} resultId - ID của kết quả hoặc null để lấy kết quả mới nhất
 * @param {number} lastDigit - Chữ số cuối cần lọc (0-9)
 * @returns {Promise<Object>} Kết quả đã lọc
 */
exports.filterByLastDigit = async (resultId, lastDigit) => {
  try {
    // Kiểm tra tham số đầu vào
    if (lastDigit < 0 || lastDigit > 9 || !Number.isInteger(lastDigit)) {
      throw new ApiError(400, 'Chữ số cuối phải là số nguyên từ 0 đến 9');
    }

    // Lấy kết quả xổ số
    let result;
    if (resultId) {
      result = await Result.findById(resultId);
      if (!result) {
        throw new ApiError(404, 'Không tìm thấy kết quả');
      }
    } else {
      result = await Result.findOne().sort({ date: -1 });
      if (!result) {
        throw new ApiError(404, 'Không có kết quả nào');
      }
    }

    // Lọc kết quả theo chữ số cuối
    const filteredResult = {
      date: result.date,
      weekday: result.weekday,
      region: result.region,
      lastDigit: lastDigit,
      provinces: []
    };

    for (const province of result.provinces) {
      const filteredProvince = {
        name: province.name,
        code: province.code,
        info: province.info,
        results: {
          eighth: endsWithDigit(province.results.eighth, lastDigit) ? province.results.eighth : null,
          seventh: endsWithDigit(province.results.seventh, lastDigit) ? province.results.seventh : null,
          sixth: province.results.sixth.filter(num => endsWithDigit(num, lastDigit)),
          fifth: endsWithDigit(province.results.fifth, lastDigit) ? province.results.fifth : null,
          fourth: province.results.fourth.filter(num => endsWithDigit(num, lastDigit)),
          third: province.results.third.filter(num => endsWithDigit(num, lastDigit)),
          second: endsWithDigit(province.results.second, lastDigit) ? province.results.second : null,
          first: endsWithDigit(province.results.first, lastDigit) ? province.results.first : null,
          special: endsWithDigit(province.results.special, lastDigit) ? province.results.special : null
        }
      };

      filteredProvince.matchCount = countMatches(filteredProvince.results);
      filteredResult.provinces.push(filteredProvince);
    }

    return filteredResult;
  } catch (error) {
    logger.error('Error in filterByLastDigit:', error);
    throw error;
  }
};

/**
 * Lọc kết quả xổ số theo nhiều chữ số cuối
 * @param {string} resultId - ID của kết quả hoặc null để lấy kết quả mới nhất
 * @param {Array<number>} lastDigits - Mảng các chữ số cuối cần lọc (0-9)
 * @returns {Promise<Object>} Kết quả đã lọc
 */
exports.filterByMultipleLastDigits = async (resultId, lastDigits) => {
  try {
    // Kiểm tra tham số đầu vào
    if (!Array.isArray(lastDigits) || lastDigits.length === 0) {
      throw new ApiError(400, 'Cần cung cấp ít nhất một chữ số cuối');
    }

    for (const digit of lastDigits) {
      if (digit < 0 || digit > 9 || !Number.isInteger(digit)) {
        throw new ApiError(400, 'Chữ số cuối phải là số nguyên từ 0 đến 9');
      }
    }

    // Lấy kết quả xổ số
    let result;
    if (resultId) {
      result = await Result.findById(resultId);
      if (!result) {
        throw new ApiError(404, 'Không tìm thấy kết quả');
      }
    } else {
      result = await Result.findOne().sort({ date: -1 });
      if (!result) {
        throw new ApiError(404, 'Không có kết quả nào');
      }
    }

    // Lọc kết quả theo các chữ số cuối
    const filteredResult = {
      date: result.date,
      weekday: result.weekday,
      region: result.region,
      lastDigits: lastDigits,
      provinces: []
    };

    for (const province of result.provinces) {
      const filteredProvince = {
        name: province.name,
        code: province.code,
        info: province.info,
        results: {
          eighth: endsWithAnyDigit(province.results.eighth, lastDigits) ? province.results.eighth : null,
          seventh: endsWithAnyDigit(province.results.seventh, lastDigits) ? province.results.seventh : null,
          sixth: province.results.sixth.filter(num => endsWithAnyDigit(num, lastDigits)),
          fifth: endsWithAnyDigit(province.results.fifth, lastDigits) ? province.results.fifth : null,
          fourth: province.results.fourth.filter(num => endsWithAnyDigit(num, lastDigits)),
          third: province.results.third.filter(num => endsWithAnyDigit(num, lastDigits)),
          second: endsWithAnyDigit(province.results.second, lastDigits) ? province.results.second : null,
          first: endsWithAnyDigit(province.results.first, lastDigits) ? province.results.first : null,
          special: endsWithAnyDigit(province.results.special, lastDigits) ? province.results.special : null
        }
      };

      filteredProvince.matchCount = countMatches(filteredProvince.results);
      filteredResult.provinces.push(filteredProvince);
    }

    return filteredResult;
  } catch (error) {
    logger.error('Error in filterByMultipleLastDigits:', error);
    throw error;
  }
};

/**
 * Lấy thống kê tần suất xuất hiện của các chữ số cuối
 * @param {number} days - Số ngày cần lấy thống kê
 * @returns {Promise<Object>} Thống kê tần suất
 */
exports.getLastDigitFrequency = async (days = 7) => {
  try {
    // Lấy kết quả xổ số trong số ngày quy định
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const results = await Result.find({
      date: { $gte: startDate, $lte: endDate }
    }).sort({ date: -1 });

    if (results.length === 0) {
      throw new ApiError(404, 'Không có kết quả nào trong khoảng thời gian này');
    }

    // Khởi tạo đối tượng thống kê
    const frequency = {
      days: days,
      startDate: startDate,
      endDate: endDate,
      totalResults: results.length,
      digits: {}
    };

    // Khởi tạo đếm cho từng chữ số
    for (let i = 0; i < 10; i++) {
      frequency.digits[i] = {
        count: 0,
        byPrize: {
          eighth: 0,
          seventh: 0,
          sixth: 0,
          fifth: 0,
          fourth: 0,
          third: 0,
          second: 0,
          first: 0,
          special: 0
        }
      };
    }

    // Đếm tần suất
    for (const result of results) {
      for (const province of result.provinces) {
        // Giải 8
        const eighthLastDigit = parseInt(province.results.eighth.slice(-1));
        frequency.digits[eighthLastDigit].count++;
        frequency.digits[eighthLastDigit].byPrize.eighth++;

        // Giải 7
        const seventhLastDigit = parseInt(province.results.seventh.slice(-1));
        frequency.digits[seventhLastDigit].count++;
        frequency.digits[seventhLastDigit].byPrize.seventh++;

        // Giải 6
        for (const num of province.results.sixth) {
          const sixthLastDigit = parseInt(num.slice(-1));
          frequency.digits[sixthLastDigit].count++;
          frequency.digits[sixthLastDigit].byPrize.sixth++;
        }

        // Giải 5
        const fifthLastDigit = parseInt(province.results.fifth.slice(-1));
        frequency.digits[fifthLastDigit].count++;
        frequency.digits[fifthLastDigit].byPrize.fifth++;

        // Giải 4
        for (const num of province.results.fourth) {
          const fourthLastDigit = parseInt(num.slice(-1));
          frequency.digits[fourthLastDigit].count++;
          frequency.digits[fourthLastDigit].byPrize.fourth++;
        }

        // Giải 3
        for (const num of province.results.third) {
          const thirdLastDigit = parseInt(num.slice(-1));
          frequency.digits[thirdLastDigit].count++;
          frequency.digits[thirdLastDigit].byPrize.third++;
        }

        // Giải 2
        const secondLastDigit = parseInt(province.results.second.slice(-1));
        frequency.digits[secondLastDigit].count++;
        frequency.digits[secondLastDigit].byPrize.second++;

        // Giải 1
        const firstLastDigit = parseInt(province.results.first.slice(-1));
        frequency.digits[firstLastDigit].count++;
        frequency.digits[firstLastDigit].byPrize.first++;

        // Giải đặc biệt
        const specialLastDigit = parseInt(province.results.special.slice(-1));
        frequency.digits[specialLastDigit].count++;
        frequency.digits[specialLastDigit].byPrize.special++;
      }
    }

    // Tính tỷ lệ phần trăm
    const totalCount = Object.values(frequency.digits).reduce((sum, digit) => sum + digit.count, 0);
    for (let i = 0; i < 10; i++) {
      frequency.digits[i].percentage = (frequency.digits[i].count / totalCount * 100).toFixed(2);
    }

    return frequency;
  } catch (error) {
    logger.error('Error in getLastDigitFrequency:', error);
    throw error;
  }
};

/**
 * Kiểm tra xem một số có kết thúc bằng một chữ số cụ thể hay không
 * @param {string} number - Số cần kiểm tra
 * @param {number} digit - Chữ số cuối cần kiểm tra
 * @returns {boolean} Kết quả kiểm tra
 */
function endsWithDigit(number, digit) {
  if (!number) return false;
  return number.slice(-1) === digit.toString();
}

/**
 * Kiểm tra xem một số có kết thúc bằng một trong các chữ số cụ thể hay không
 * @param {string} number - Số cần kiểm tra
 * @param {Array<number>} digits - Mảng các chữ số cuối cần kiểm tra
 * @returns {boolean} Kết quả kiểm tra
 */
function endsWithAnyDigit(number, digits) {
  if (!number) return false;
  const lastDigit = number.slice(-1);
  return digits.some(digit => digit.toString() === lastDigit);
}

/**
 * Đếm số lượng kết quả khớp trong một đối tượng kết quả đã lọc
 * @param {Object} results - Đối tượng kết quả đã lọc
 * @returns {number} Số lượng kết quả khớp
 */
function countMatches(results) {
  let count = 0;
  
  if (results.eighth) count++;
  if (results.seventh) count++;
  if (results.fifth) count++;
  if (results.second) count++;
  if (results.first) count++;
  if (results.special) count++;
  
  count += results.sixth.length;
  count += results.fourth.length;
  count += results.third.length;
  
  return count;
} 