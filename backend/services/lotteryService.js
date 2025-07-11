const Bet = require('../models/Bet');
const User = require('../models/User');
const Result = require('../models/Result');
const Transaction = require('../models/Transaction');
const PayoutRequest = require('../models/PayoutRequest');
const telegramService = require('./telegramService');
const redisClient = require('../config/redis');
const ApiError = require('../utils/error');
const config = require('../config');
const logger = require('../utils/logger');
const helper = require('../utils/helper');
const mongoose = require('mongoose');
const userService = require('./userService');
const crypto = require('crypto');

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
    winnersList: [],
    dateMatchedBets: 0,
    dateMismatchedBets: 0
  };

  // Sử dụng session để đảm bảo tính toàn vẹn
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    // Lấy tất cả các số từ kết quả
    const resultNumbers = extractResultNumbers(result);

    for (const bet of bets) {
      // Kiểm tra sự phù hợp ngày cược với ngày kết quả
      const isDateMatched = bet.checkDateMatch(result.date);
      
      // Cập nhật thống kê kiểm tra ngày
      if (isDateMatched) {
        summary.dateMatchedBets++;
      } else {
        summary.dateMismatchedBets++;
        // Nếu ngày không khớp, đánh dấu là thua và bỏ qua
        bet.status = 'lost';
        summary.losers++;
        
        await bet.save({ session });
        
        // Thông báo cho người dùng
        const message = `Rất tiếc! Vé cược của bạn không trúng do ngày cược (${helper.formatDate(bet.betDate)}) không trùng với ngày kết quả (${helper.formatDate(result.date)}).\n` + 
          `Số cược: ${bet.numbers} (${bet.betType})`;
        
        await telegramService.sendMessage(bet.userId.telegramId, message);
        continue;
      }
      
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
          winAmount: bet.winAmount,
          betDate: helper.formatDate(bet.betDate),
          resultDate: helper.formatDate(result.date),
          dateMatched: isDateMatched
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
          `📅 Ngày cược: ${helper.formatDate(bet.betDate)}\n` +
          `📅 Ngày kết quả: ${helper.formatDate(result.date)}\n` +
          `💰 Số tiền cược: ${helper.formatCurrency(bet.amount)}\n` + 
          `💵 Tiền thắng: ${helper.formatCurrency(bet.winAmount)}\n\n` +
          `*Tiền thưởng sẽ được chuyển vào tài khoản sau khi được xác nhận.*`;
          
        await telegramService.sendMessage(bet.userId.telegramId, message);
      } else {
        const message = `Rất tiếc! Bạn đã không trúng.\n` + 
          `Số cược: ${bet.numbers} (${bet.betType})\n` + 
          `Ngày cược: ${helper.formatDate(bet.betDate)}\n` +
          `Ngày kết quả: ${helper.formatDate(result.date)}\n` +
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
 * Lấy danh sách cược đã thắng chờ admin phê duyệt
 * @param {Object} options - Tùy chọn lọc và phân trang
 * @returns {Object} Danh sách cược và thông tin phân trang
 */
exports.getPendingWinningBets = async (options = {}) => {
  const { page = 1, limit = 20, sortBy = 'createdAt', sortOrder = -1, provinceCode } = options;
  const skip = (parseInt(page) - 1) * parseInt(limit);
  
  // Xây dựng query
  const query = {
    status: 'won',
    paymentStatus: { $ne: 'approved' },
    winAmount: { $gt: 0 }
  };
  
  if (provinceCode) {
    query.provinceCode = provinceCode;
  }
  
  // Thực hiện truy vấn
  const bets = await Bet.find(query)
    .populate('userId', 'telegramId username balance')
    .sort({ [sortBy]: sortOrder })
    .skip(skip)
    .limit(parseInt(limit));
  
  const total = await Bet.countDocuments(query);
  
  // Tính tổng số tiền thắng
  const totalWinAmount = await Bet.aggregate([
    { $match: query },
    { $group: { _id: null, total: { $sum: '$winAmount' } } }
  ]).then(result => (result.length > 0 ? result[0].total : 0));
  
  return {
    bets,
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total,
      pages: Math.ceil(total / parseInt(limit))
    },
    totalWinAmount
  };
};

/**
 * Tạo yêu cầu phê duyệt thanh toán cho admin
 * @param {Array} betIds - Danh sách ID cược cần phê duyệt
 * @returns {Object} Thông tin yêu cầu phê duyệt
 */
exports.createPayoutRequest = async (betIds) => {
  if (!Array.isArray(betIds) || betIds.length === 0) {
    throw new ApiError('Cần cung cấp danh sách ID cược', 400);
  }
  
  // Lấy danh sách cược
  const bets = await Bet.find({
    _id: { $in: betIds },
    status: 'won',
    paymentStatus: { $ne: 'approved' },
    winAmount: { $gt: 0 }
  }).populate('userId', 'telegramId username balance');
  
  if (bets.length === 0) {
    throw new ApiError('Không tìm thấy cược hợp lệ để tạo yêu cầu phê duyệt', 404);
  }
  
  // Tính tổng số tiền thắng
  const totalWinAmount = bets.reduce((sum, bet) => sum + bet.winAmount, 0);
  
  // Tạo yêu cầu phê duyệt
  const payoutRequest = new PayoutRequest({
    betIds: bets.map(bet => bet._id),
    totalAmount: totalWinAmount,
    status: 'pending',
    createdAt: new Date(),
    userCount: [...new Set(bets.map(bet => bet.userId._id.toString()))].length,
    betCount: bets.length
  });
  
  await payoutRequest.save();
  
  // Cập nhật trạng thái cược
  await Bet.updateMany(
    { _id: { $in: betIds } },
    { paymentStatus: 'pending_approval' }
  );
  
  // Thông báo cho admin về yêu cầu phê duyệt mới
  const adminUsers = await User.find({ role: 'admin' });
  for (const admin of adminUsers) {
    try {
      await telegramService.sendMessage(
        admin.telegramId,
        `🔔 *YÊU CẦU PHÊ DUYỆT THANH TOÁN MỚI*\n\n` +
        `ID: ${payoutRequest._id}\n` +
        `Số lượng cược: ${bets.length}\n` +
        `Số người chơi: ${payoutRequest.userCount}\n` +
        `Tổng tiền: ${helper.formatCurrency(totalWinAmount)}\n\n` +
        `Vui lòng kiểm tra và phê duyệt trong hệ thống quản trị.`
      );
    } catch (error) {
      logger.error(`Không thể gửi thông báo đến admin ${admin.telegramId}:`, error);
    }
  }
  
  return {
    requestId: payoutRequest._id,
    betCount: bets.length,
    userCount: payoutRequest.userCount,
    totalAmount: totalWinAmount,
    status: 'pending'
  };
};

/**
 * Admin phê duyệt thanh toán cho người thắng cược
 * @param {String} requestId - ID yêu cầu phê duyệt
 * @param {String} adminId - ID của admin phê duyệt
 * @returns {Object} Kết quả phê duyệt
 */
exports.approvePayoutRequest = async (requestId, adminId) => {
  // Tìm yêu cầu phê duyệt
  const payoutRequest = await PayoutRequest.findById(requestId);
  if (!payoutRequest) {
    throw new ApiError('Không tìm thấy yêu cầu phê duyệt', 404);
  }
  
  if (payoutRequest.status !== 'pending') {
    throw new ApiError(`Yêu cầu phê duyệt đã được xử lý (${payoutRequest.status})`, 400);
  }
  
  // Thống kê
  const summary = {
    totalProcessed: payoutRequest.betIds.length,
    totalApproved: 0,
    totalAmount: 0,
    users: {}
  };
  
  // Sử dụng session để đảm bảo tính toàn vẹn dữ liệu
  const session = await mongoose.startSession();
  session.startTransaction({
    readConcern: { level: 'snapshot' },
    writeConcern: { w: 'majority' }
  });
  
  try {
    // Lấy danh sách cược cần phê duyệt
    const bets = await Bet.find({
      _id: { $in: payoutRequest.betIds },
      status: 'won',
      paymentStatus: { $ne: 'approved' }
    }).populate('userId').session(session);
    
    if (bets.length === 0) {
      throw new ApiError('Không tìm thấy cược nào cần phê duyệt', 404);
    }
    
    // Xử lý từng cược
    for (const bet of bets) {
      const user = bet.userId;
      const userId = user._id.toString();
      
      // Cập nhật số dư người dùng
      await User.updateOne(
        { _id: user._id },
        { $inc: { balance: bet.winAmount } }
      ).session(session);
      
      // Cập nhật thống kê
      summary.totalApproved++;
      summary.totalAmount += bet.winAmount;
      
      if (!summary.users[userId]) {
        summary.users[userId] = {
          telegramId: user.telegramId,
          username: user.username,
          betCount: 0,
          amount: 0
        };
      }
      summary.users[userId].betCount++;
      summary.users[userId].amount += bet.winAmount;
      
      // Tạo transaction record cho Admin (gửi)
      const adminTransaction = new Transaction({
        userId: adminId,
        receiverId: user._id,
        type: 'win_payout',
        amount: -bet.winAmount,
        status: 'completed',
        reference: bet._id,
        referenceModel: 'Bet',
        description: `Thanh toán tiền thắng cược ${bet.betType} cho số ${bet.numbers}`,
        processedBy: adminId,
        processedAt: new Date(),
        metaData: {
          betId: bet._id,
          adminId,
          payoutApproval: true,
          requestId: payoutRequest._id
        },
        transactionHash: createTransactionHash(adminId, user._id, bet.winAmount)
      });
      
      await adminTransaction.save({ session });
      
      // Tạo transaction record cho người dùng (nhận)
      const userTransaction = new Transaction({
        userId: user._id,
        receiverId: adminId,
        type: 'win',
        amount: bet.winAmount,
        status: 'completed',
        reference: bet._id,
        referenceModel: 'Bet',
        description: `Nhận tiền thắng cược ${bet.betType} cho số ${bet.numbers}`,
        processedBy: adminId,
        processedAt: new Date(),
        metaData: {
          betId: bet._id,
          adminId,
          payoutApproval: true,
          requestId: payoutRequest._id
        },
        transactionHash: createTransactionHash(user._id, adminId, bet.winAmount)
      });
      
      await userTransaction.save({ session });
      
      // Cập nhật trạng thái thanh toán của cược
      bet.paymentStatus = 'approved';
      bet.paymentConfirmedBy = adminId;
      bet.paymentConfirmedAt = new Date();
      await bet.save({ session });
      
      // Xóa cache người dùng
      try {
        await redisClient.del(`user:${user.telegramId}`);
      } catch (redisErr) {
        logger.error('Redis cache error:', redisErr);
      }
      
      // Thông báo cho người dùng
      const message = `💰 *THÔNG BÁO THANH TOÁN* 💰\n\n` +
        `Xin chúc mừng! Tiền thưởng cho cược của bạn đã được chuyển vào tài khoản.\n\n` +
        `🎮 Loại cược: ${bet.betType}\n` +
        `🔢 Số cược: ${bet.numbers}\n` +
        `💵 Tiền thắng: ${helper.formatCurrency(bet.winAmount)}\n\n` +
        `Số dư hiện tại: ${helper.formatCurrency(user.balance + bet.winAmount)}`;
      
      await telegramService.sendMessage(user.telegramId, message);
    }
    
    // Cập nhật trạng thái yêu cầu phê duyệt
    payoutRequest.status = 'approved';
    payoutRequest.processedBy = adminId;
    payoutRequest.processedAt = new Date();
    payoutRequest.summary = summary;
    await payoutRequest.save({ session });
    
    // Commit transaction
    await session.commitTransaction();
    
    return {
      success: true,
      requestId: payoutRequest._id,
      summary
    };
  } catch (error) {
    await session.abortTransaction();
    logger.error('Error approving payouts:', error);
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