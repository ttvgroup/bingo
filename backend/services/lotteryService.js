const Bet = require('../models/Bet');
const User = require('../models/User');
const Result = require('../models/Result');
const telegramService = require('./telegramService');
const redisClient = require('../config/redis');
const ApiError = require('../utils/error');
const config = require('../config');
const logger = require('../utils/logger');

/**
 * Kiểm tra kết quả và cập nhật trạng thái các cược
 * @param {string} resultId - ID của kết quả
 */
exports.checkResults = async (resultId) => {
  const result = await Result.findById(resultId);
  if (!result) {
    throw new ApiError(404, 'Không tìm thấy kết quả');
  }

  const bets = await Bet.find({ status: 'pending' }).populate('userId');
  const winners = [];
  const redisPipeline = redisClient.multi();

  // Sử dụng session để đảm bảo tính toàn vẹn
  const session = await User.startSession();
  session.startTransaction();

  try {
    // Lấy tất cả các số từ kết quả
    const resultNumbers = extractResultNumbers(result);

    for (const bet of bets) {
      let isWinner = false;
      let winAmount = 0;
      
      // Kiểm tra kết quả dựa vào loại cược
      switch (bet.betType) {
        case '2D':
          isWinner = check2D(bet.numbers, resultNumbers.twoDigits);
          if (isWinner) {
            winAmount = bet.amount * config.payoutRatios['2D'];
          }
          break;
        case '3D':
          isWinner = check3D(bet.numbers, resultNumbers.threeDigits);
          if (isWinner) {
            winAmount = bet.amount * config.payoutRatios['3D'];
          }
          break;
        case '4D':
          isWinner = check4D(bet.numbers, resultNumbers.fourDigits);
          if (isWinner) {
            winAmount = bet.amount * config.payoutRatios['4D'];
          }
          break;
        case 'Bao lô 2D':
          isWinner = checkBaoLo2D(bet.numbers, resultNumbers, bet.provinceCode);
          if (isWinner) {
            // Chia cho số lô vì cược bao lô là đặt cược cho tất cả các lô
            const lotsPerProvince = config.baoLoQuantity['Bao lô 2D'];
            winAmount = (bet.amount / lotsPerProvince) * config.payoutRatios['Bao lô 2D'];
          }
          break;
        case 'Bao lô 3D':
          isWinner = checkBaoLo3D(bet.numbers, resultNumbers, bet.provinceCode);
          if (isWinner) {
            const lotsPerProvince = config.baoLoQuantity['Bao lô 3D'];
            winAmount = (bet.amount / lotsPerProvince) * config.payoutRatios['Bao lô 3D'];
          }
          break;
        case 'Bao lô 4D':
          isWinner = checkBaoLo4D(bet.numbers, resultNumbers, bet.provinceCode);
          if (isWinner) {
            const lotsPerProvince = config.baoLoQuantity['Bao lô 4D'];
            winAmount = (bet.amount / lotsPerProvince) * config.payoutRatios['Bao lô 4D'];
          }
          break;
      }
      
      if (isWinner) {
        bet.status = 'won';
        bet.winAmount = winAmount;
        const user = bet.userId;
        user.balance += winAmount;
        await user.save({ session });
        redisPipeline.setEx(`user:${user.telegramId}`, config.cacheExpiry, JSON.stringify(user));
        winners.push({ userId: user, amount: winAmount, betType: bet.betType });
      } else {
        bet.status = 'lost';
      }
      
      bet.resultId = resultId;
      await bet.save({ session });

      // Thông báo cho người dùng
      if (bet.status === 'won') {
        const message = `🎉 *CHÚC MỪNG!* 🎉\n\nBạn đã trúng thưởng!\n\n🎮 Loại cược: ${bet.betType}\n🔢 Số đã đặt: ${bet.numbers}\n💰 Số tiền cược: ${bet.amount}\n💵 Tiền thắng: ${winAmount}\n\nSố dư hiện tại: ${bet.userId.balance}`;
        await telegramService.sendMessage(bet.userId.telegramId, message);
      } else {
        const message = `Rất tiếc! Bạn đã không trúng.\nSố cược: ${bet.numbers} (${bet.betType})\nSố dư: ${bet.userId.balance}`;
        await telegramService.sendMessage(bet.userId.telegramId, message);
      }
    }

    // Commit transaction
    await session.commitTransaction();

    // Thực hiện Redis pipeline
    try {
      await redisPipeline.exec();
    } catch (redisErr) {
      logger.error('Redis pipeline error:', redisErr);
    }

    if (winners.length > 0) {
      await telegramService.notifyWinners(winners, result);
    }
  } catch (error) {
    await session.abortTransaction();
    logger.error('Error processing bets results:', error);
    throw error;
  } finally {
    session.endSession();
  }
};

/**
 * Trích xuất tất cả các số từ kết quả
 * @param {Object} result - Kết quả xổ số
 * @returns {Object} Các số đã trích xuất
 */
function extractResultNumbers(result) {
  const twoDigits = [];
  const threeDigits = [];
  const fourDigits = [];
  const provinceResults = {};
  
  for (const province of result.provinces) {
    const provinceCode = province.code;
    provinceResults[provinceCode] = {
      twoDigits: [],
      threeDigits: [],
      fourDigits: []
    };
    
    // 2D: Giải 8 và 2 số cuối của tất cả các giải
    provinceResults[provinceCode].twoDigits.push(province.results.eighth);
    provinceResults[provinceCode].twoDigits.push(province.results.special.slice(-2));
    provinceResults[provinceCode].twoDigits.push(province.results.first.slice(-2));
    provinceResults[provinceCode].twoDigits.push(province.results.second.slice(-2));
    
    for (const num of province.results.third) {
      provinceResults[provinceCode].twoDigits.push(num.slice(-2));
    }
    
    for (const num of province.results.fourth) {
      provinceResults[provinceCode].twoDigits.push(num.slice(-2));
    }
    
    provinceResults[provinceCode].twoDigits.push(province.results.fifth.slice(-2));
    
    for (const num of province.results.sixth) {
      provinceResults[provinceCode].twoDigits.push(num.slice(-2));
    }
    
    provinceResults[provinceCode].twoDigits.push(province.results.seventh.slice(-2));
    
    // 3D: Giải 7 và 3 số cuối của giải đặc biệt
    provinceResults[provinceCode].threeDigits.push(province.results.seventh);
    provinceResults[provinceCode].threeDigits.push(province.results.special.slice(-3));
    provinceResults[provinceCode].threeDigits.push(province.results.first.slice(-3));
    provinceResults[provinceCode].threeDigits.push(province.results.second.slice(-3));
    
    for (const num of province.results.third) {
      provinceResults[provinceCode].threeDigits.push(num.slice(-3));
    }
    
    for (const num of province.results.fourth) {
      provinceResults[provinceCode].threeDigits.push(num.slice(-3));
    }
    
    provinceResults[provinceCode].threeDigits.push(province.results.fifth.slice(-3));
    
    for (const num of province.results.sixth) {
      provinceResults[provinceCode].threeDigits.push(num.slice(-3));
    }
    
    // 4D: Tất cả các số 4 chữ số từ các giải
    for (const num of province.results.sixth) {
      provinceResults[provinceCode].fourDigits.push(num);
    }
    
    provinceResults[provinceCode].fourDigits.push(province.results.fifth);
    
    // Thêm vào danh sách tổng hợp
    twoDigits.push(...provinceResults[provinceCode].twoDigits);
    threeDigits.push(...provinceResults[provinceCode].threeDigits);
    fourDigits.push(...provinceResults[provinceCode].fourDigits);
  }
  
  return {
    twoDigits,
    threeDigits,
    fourDigits,
    provinceResults
  };
}

/**
 * Kiểm tra cược 2D
 * @param {string} betNumber - Số cược
 * @param {Array} resultNumbers - Các số kết quả
 * @returns {boolean} Kết quả kiểm tra
 */
function check2D(betNumber, resultNumbers) {
  return resultNumbers.includes(betNumber);
}

/**
 * Kiểm tra cược 3D
 * @param {string} betNumber - Số cược
 * @param {Array} resultNumbers - Các số kết quả
 * @returns {boolean} Kết quả kiểm tra
 */
function check3D(betNumber, resultNumbers) {
  return resultNumbers.includes(betNumber);
}

/**
 * Kiểm tra cược 4D
 * @param {string} betNumber - Số cược
 * @param {Array} resultNumbers - Các số kết quả
 * @returns {boolean} Kết quả kiểm tra
 */
function check4D(betNumber, resultNumbers) {
  return resultNumbers.includes(betNumber);
}

/**
 * Kiểm tra cược Bao lô 2D
 * @param {string} betNumber - Số cược
 * @param {Object} resultNumbers - Các số kết quả
 * @param {string} provinceCode - Mã tỉnh
 * @returns {boolean} Kết quả kiểm tra
 */
function checkBaoLo2D(betNumber, resultNumbers, provinceCode) {
  // Nếu không có mã tỉnh, kiểm tra tất cả các tỉnh
  if (!provinceCode) {
    return resultNumbers.twoDigits.includes(betNumber);
  }
  
  // Nếu có mã tỉnh, chỉ kiểm tra tỉnh đó
  if (!resultNumbers.provinceResults[provinceCode]) {
    return false;
  }
  
  return resultNumbers.provinceResults[provinceCode].twoDigits.includes(betNumber);
}

/**
 * Kiểm tra cược Bao lô 3D
 * @param {string} betNumber - Số cược
 * @param {Object} resultNumbers - Các số kết quả
 * @param {string} provinceCode - Mã tỉnh
 * @returns {boolean} Kết quả kiểm tra
 */
function checkBaoLo3D(betNumber, resultNumbers, provinceCode) {
  // Nếu không có mã tỉnh, kiểm tra tất cả các tỉnh
  if (!provinceCode) {
    return resultNumbers.threeDigits.includes(betNumber);
  }
  
  // Nếu có mã tỉnh, chỉ kiểm tra tỉnh đó
  if (!resultNumbers.provinceResults[provinceCode]) {
    return false;
  }
  
  return resultNumbers.provinceResults[provinceCode].threeDigits.includes(betNumber);
}

/**
 * Kiểm tra cược Bao lô 4D
 * @param {string} betNumber - Số cược
 * @param {Object} resultNumbers - Các số kết quả
 * @param {string} provinceCode - Mã tỉnh
 * @returns {boolean} Kết quả kiểm tra
 */
function checkBaoLo4D(betNumber, resultNumbers, provinceCode) {
  // Nếu không có mã tỉnh, kiểm tra tất cả các tỉnh
  if (!provinceCode) {
    return resultNumbers.fourDigits.includes(betNumber);
  }
  
  // Nếu có mã tỉnh, chỉ kiểm tra tỉnh đó
  if (!resultNumbers.provinceResults[provinceCode]) {
    return false;
  }
  
  return resultNumbers.provinceResults[provinceCode].fourDigits.includes(betNumber);
}

/**
 * Thông báo kết quả mới
 * @param {Object} result - Kết quả xổ số
 */
exports.notifyResult = async (result) => {
  const channelId = config.telegramChannelId;
  if (!channelId) {
    logger.error('TELEGRAM_CHANNEL_ID not configured');
    return;
  }
  
  try {
    // Format ngày
    const formattedDate = new Date(result.date).toLocaleDateString('vi-VN');
    
    let message = `🎲 *KẾT QUẢ XỔ SỐ ${result.region.toUpperCase()} - ${formattedDate} (${result.weekday})*\n\n`;
    
    // Thông tin từng tỉnh
    for (const province of result.provinces) {
      message += `🏆 *${province.name.toUpperCase()} (${province.code})*\n`;
      message += `➖➖➖➖➖➖➖➖➖\n`;
      message += `🔸 Giải 8: ${province.results.eighth}\n`;
      message += `🔸 Giải 7: ${province.results.seventh}\n`;
      message += `🔸 Giải 6: ${province.results.sixth.join(', ')}\n`;
      message += `🔸 Giải 5: ${province.results.fifth}\n`;
      message += `🔸 Giải 4: ${province.results.fourth.join(', ')}\n`;
      message += `🔸 Giải 3: ${province.results.third.join(', ')}\n`;
      message += `🔸 Giải 2: ${province.results.second}\n`;
      message += `🔸 Giải 1: ${province.results.first}\n`;
      message += `🔸 Giải Đặc Biệt: ${province.results.special}\n\n`;
    }
    
    // Thêm thông tin phụ
    message += `📱 Kiểm tra vé số của bạn ngay bây giờ!`;
    
    await telegramService.sendMessage(channelId, message, { parse_mode: 'Markdown' });
  } catch (error) {
    logger.error('Failed to notify result:', error);
  }
};