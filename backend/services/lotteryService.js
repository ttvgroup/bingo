const Bet = require('../models/Bet');
const User = require('../models/User');
const Result = require('../models/Result');
const telegramService = require('./telegramService');
const redisClient = require('../config/redis');
const ApiError = require('../utils/error');
const config = require('../config');
const logger = require('../utils/logger');
const helper = require('../utils/helper');
const mongoose = require('mongoose');

/**
 * Kiểm tra kết quả và cập nhật trạng thái các cược
 * @param {string} resultId - ID của kết quả
 * @returns {Object} Thống kê kết quả kiểm tra
 */
exports.checkResults = async (resultId) => {
  const result = await Result.findById(resultId);
  if (!result) {
    throw new ApiError(404, 'Không tìm thấy kết quả');
  }

  // Lấy tất cả các cược chưa có kết quả
  const bets = await Bet.find({ 
    status: 'pending',
    provinceCode: { $in: result.provinces.map(p => p.code) }
  }).populate('userId');
  
  if (bets.length === 0) {
    return { message: 'Không có cược nào cần kiểm tra' };
  }

  // Thống kê
  const summary = {
    totalBets: bets.length,
    winners: 0,
    losers: 0,
    totalWinAmount: 0,
    winnersByType: {},
    winnersList: []
  };

  // Sử dụng session để đảm bảo tính toàn vẹn
  const session = await mongoose.startSession();
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
      
      // Cập nhật thông tin cược
      if (isWinner) {
        bet.status = 'won';
        bet.winAmount = Math.floor(winAmount); // Làm tròn xuống
        
        // Cập nhật thống kê
        summary.winners++;
        summary.totalWinAmount += bet.winAmount;
        
        // Thêm vào danh sách người thắng
        summary.winnersList.push({
          betId: bet._id,
          userId: bet.userId._id,
          telegramId: bet.userId.telegramId,
          username: bet.userId.username,
          numbers: bet.numbers,
          betType: bet.betType,
          amount: bet.amount,
          winAmount: bet.winAmount
        });
        
        // Thống kê theo loại cược
        if (!summary.winnersByType[bet.betType]) {
          summary.winnersByType[bet.betType] = {
            count: 0,
            totalWin: 0
          };
        }
        summary.winnersByType[bet.betType].count++;
        summary.winnersByType[bet.betType].totalWin += bet.winAmount;
        
        // KHÔNG cập nhật số dư người dùng ở đây - sẽ cập nhật sau khi admin xác nhận
      } else {
        bet.status = 'lost';
        summary.losers++;
      }
      
      // Liên kết với kết quả
      bet.resultId = resultId;
      await bet.save({ session });

      // Thông báo cho người dùng
      if (bet.status === 'won') {
        const message = `🎉 *THÔNG BÁO TRÚNG THƯỞNG* 🎉\n\n` + 
          `Bạn đã trúng thưởng!\n\n` + 
          `🎮 Loại cược: ${bet.betType}\n` + 
          `🔢 Số đã đặt: ${bet.numbers}\n` + 
          `💰 Số tiền cược: ${helper.formatCurrency(bet.amount)}\n` + 
          `💵 Tiền thắng: ${helper.formatCurrency(bet.winAmount)}\n\n` +
          `*Tiền thưởng sẽ được chuyển vào tài khoản sau khi được xác nhận.*`;
          
        await telegramService.sendMessage(bet.userId.telegramId, message);
      } else {
        const message = `Rất tiếc! Bạn đã không trúng.\n` + 
          `Số cược: ${bet.numbers} (${bet.betType})\n` + 
          `Số dư hiện tại: ${helper.formatCurrency(bet.userId.balance)}`;
          
        await telegramService.sendMessage(bet.userId.telegramId, message);
      }
    }

    // Commit transaction
    await session.commitTransaction();
    
    // Thông báo trên kênh chung
    if (summary.winners > 0) {
      let channelMsg = `🏆 *KẾT QUẢ XỔ SỐ NGÀY ${helper.formatDate(result.date)}* 🏆\n\n`;
      channelMsg += `Có ${summary.winners} người trúng giải với tổng giá trị ${helper.formatCurrency(summary.totalWinAmount)}!\n\n`;
      
      for (const [type, stats] of Object.entries(summary.winnersByType)) {
        channelMsg += `${type}: ${stats.count} người trúng, ${helper.formatCurrency(stats.totalWin)}\n`;
      }
      
      await telegramService.sendChannelMessage(channelMsg);
    }

    return summary;
  } catch (error) {
    await session.abortTransaction();
    logger.error('Error processing bets results:', error);
    throw error;
  } finally {
    session.endSession();
  }
};

/**
 * Xác nhận thanh toán cho những người trúng
 * @param {Array} betIds - Danh sách ID cược cần xác nhận
 * @param {string} adminId - ID của admin xác nhận
 * @returns {Object} Thống kê kết quả thanh toán
 */
exports.confirmPayouts = async (betIds, adminId) => {
  if (!Array.isArray(betIds) || betIds.length === 0) {
    throw new ApiError(400, 'Cần cung cấp danh sách ID cược');
  }
  
  // Thống kê
  const summary = {
    totalProcessed: betIds.length,
    totalApproved: 0,
    totalAmount: 0,
    users: {}
  };
  
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const bets = await Bet.find({ 
      _id: { $in: betIds },
      status: 'won',
      paymentStatus: 'pending'
    }).populate('userId').session(session);
    
    if (bets.length === 0) {
      throw new ApiError(404, 'Không tìm thấy cược hợp lệ để xác nhận');
    }
    
    for (const bet of bets) {
      const user = bet.userId;
      
      // Cập nhật trạng thái thanh toán
      bet.paymentStatus = 'approved';
      bet.paymentConfirmedBy = adminId;
      bet.paymentConfirmedAt = new Date();
      
      // Cập nhật số dư người dùng
      user.balance += bet.winAmount;
      
      // Cập nhật thống kê
      summary.totalApproved++;
      summary.totalAmount += bet.winAmount;
      
      const userKey = user._id.toString();
      if (!summary.users[userKey]) {
        summary.users[userKey] = {
          telegramId: user.telegramId,
          username: user.username,
          betCount: 0,
          amount: 0
        };
      }
      summary.users[userKey].betCount++;
      summary.users[userKey].amount += bet.winAmount;
      
      // Lưu thay đổi
      await bet.save({ session });
      await user.save({ session });
      
      // Cập nhật cache
      try {
        await redisClient.setEx(`user:${user.telegramId}`, config.cacheExpiry, JSON.stringify(user));
      } catch (redisErr) {
        logger.error('Redis cache error:', redisErr);
      }
      
      // Thông báo cho người dùng
      const message = `💰 *THÔNG BÁO THANH TOÁN* 💰\n\n` +
        `Xin chúc mừng! Tiền thưởng cho cược của bạn đã được chuyển vào tài khoản.\n\n` +
        `🎮 Loại cược: ${bet.betType}\n` +
        `🔢 Số cược: ${bet.numbers}\n` +
        `💵 Tiền thắng: ${helper.formatCurrency(bet.winAmount)}\n\n` +
        `Số dư hiện tại: ${helper.formatCurrency(user.balance)}`;
      
      await telegramService.sendMessage(user.telegramId, message);
    }
    
    // Commit transaction
    await session.commitTransaction();
    
    return summary;
  } catch (error) {
    await session.abortTransaction();
    logger.error('Error confirming payouts:', error);
    throw error;
  } finally {
    session.endSession();
  }
};

/**
 * Lấy danh sách cược chờ thanh toán
 * @param {Object} filters - Các điều kiện lọc
 * @returns {Promise<Array>} Danh sách cược
 */
exports.getPendingPayouts = async (filters = {}) => {
  // Mặc định lọc các cược trúng và chưa thanh toán
  let query = { status: 'won', paymentStatus: 'pending' };
  
  // Áp dụng các bộ lọc
  if (filters.resultId) {
    query.resultId = filters.resultId;
  }
  
  if (filters.startDate && filters.endDate) {
    query.createdAt = { $gte: filters.startDate, $lte: filters.endDate };
  }
  
  if (filters.betType) {
    query.betType = filters.betType;
  }
  
  // Lấy danh sách cược
  const pendingPayouts = await Bet.find(query)
    .populate('userId', 'telegramId username balance')
    .populate('resultId', 'date weekday')
    .sort({ createdAt: -1 });
  
  // Tạo thống kê tóm tắt
  const summary = {
    totalBets: pendingPayouts.length,
    totalAmount: pendingPayouts.reduce((sum, bet) => sum + bet.winAmount, 0),
    betTypeBreakdown: {},
    userBreakdown: {}
  };
  
  // Thống kê theo loại cược và người dùng
  for (const bet of pendingPayouts) {
    // Thống kê theo loại cược
    if (!summary.betTypeBreakdown[bet.betType]) {
      summary.betTypeBreakdown[bet.betType] = {
        count: 0,
        amount: 0
      };
    }
    summary.betTypeBreakdown[bet.betType].count++;
    summary.betTypeBreakdown[bet.betType].amount += bet.winAmount;
    
    // Thống kê theo người dùng
    const userId = bet.userId._id.toString();
    if (!summary.userBreakdown[userId]) {
      summary.userBreakdown[userId] = {
        telegramId: bet.userId.telegramId,
        username: bet.userId.username,
        count: 0,
        amount: 0
      };
    }
    summary.userBreakdown[userId].count++;
    summary.userBreakdown[userId].amount += bet.winAmount;
  }
  
  return {
    pendingPayouts,
    summary
  };
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