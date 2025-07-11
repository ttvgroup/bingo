const mongoose = require('mongoose');
const User = require('../models/User');
const Bet = require('../models/Bet');
const Transaction = require('../models/Transaction');
const Coin = require('../models/Coin');
const Balance = require('../models/Balance');
const config = require('../config');
const logger = require('../utils/logger');

/**
 * Dịch vụ tính thưởng nâng cao
 * Triển khai các phương pháp tính thưởng động và các loại thưởng đặc biệt
 */

/**
 * Tính tiền thắng cho người dùng với hệ thống tính thưởng nâng cao
 * @param {Object} bet - Thông tin cược
 * @param {Object} user - Thông tin người dùng
 * @param {Boolean} isWinner - Kết quả người dùng có thắng hay không
 * @returns {Object} - Thông tin về tiền thưởng và các thưởng bổ sung
 */
exports.calculateReward = async (bet, user, isWinner) => {
  if (!isWinner) return { winAmount: 0, bonuses: [] };
  
  try {
    // Tính tiền thắng cơ bản
    let baseWinAmount = calculateBaseWinAmount(bet);
    
    // Áp dụng hệ số thưởng động
    const dynamicFactor = await calculateDynamicOddsFactor(bet);
    let winAmount = baseWinAmount * dynamicFactor;
    
    // Lưu danh sách thưởng bổ sung để hiển thị cho người dùng
    const bonuses = [];
    
    // Áp dụng thưởng đặc biệt
    const specialBonus = await calculateSpecialBonus(bet, user);
    if (specialBonus.percentage > 0) {
      const specialBonusAmount = winAmount * specialBonus.percentage;
      winAmount += specialBonusAmount;
      bonuses.push({
        type: 'special',
        name: specialBonus.name,
        percentage: specialBonus.percentage * 100,
        amount: specialBonusAmount
      });
    }
    
    // Cập nhật điểm thưởng trung thành
    await updateLoyaltyPoints(user, bet);
    
    // Làm tròn xuống để tránh số lẻ
    winAmount = Math.floor(winAmount);
    
    return {
      baseWinAmount: baseWinAmount,
      winAmount: winAmount,
      dynamicFactor: dynamicFactor,
      bonuses: bonuses
    };
  } catch (error) {
    logger.error(`Error calculating reward: ${error.message}`, { stack: error.stack });
    // Trả về phương pháp tính cơ bản trong trường hợp lỗi
    return {
      winAmount: calculateBaseWinAmount(bet),
      bonuses: []
    };
  }
};

/**
 * Tính tiền thắng cơ bản dựa trên loại cược
 * @param {Object} bet - Thông tin cược
 * @returns {Number} - Tiền thưởng cơ bản
 */
function calculateBaseWinAmount(bet) {
  let baseAmount = 0;
  
  switch (bet.betType) {
    case '2D':
      baseAmount = bet.amount * config.payoutRatios['2D'];
      break;
    case '3D':
      baseAmount = bet.amount * config.payoutRatios['3D'];
      break;
    case '4D':
      baseAmount = bet.amount * config.payoutRatios['4D'];
      break;
    case 'Bao lô 2D':
      // Chia cho số lô vì cược bao lô là đặt cược cho tất cả các lô
      const lotsPerProvince2D = config.baoLoQuantity['Bao lô 2D'] || 1;
      baseAmount = (bet.amount / lotsPerProvince2D) * config.payoutRatios['Bao lô 2D'];
      break;
    case 'Bao lô 3D':
      const lotsPerProvince3D = config.baoLoQuantity['Bao lô 3D'] || 1;
      baseAmount = (bet.amount / lotsPerProvince3D) * config.payoutRatios['Bao lô 3D'];
      break;
    case 'Bao lô 4D':
      const lotsPerProvince4D = config.baoLoQuantity['Bao lô 4D'] || 1;
      baseAmount = (bet.amount / lotsPerProvince4D) * config.payoutRatios['Bao lô 4D'];
      break;
    default:
      // Mặc định trả về số tiền cược nếu không tìm thấy loại cược
      baseAmount = bet.amount;
  }
  
  return Math.floor(baseAmount);
}

/**
 * Tính hệ số thưởng động dựa trên các yếu tố ảnh hưởng
 * @param {Object} bet - Thông tin cược
 * @returns {Number} - Hệ số thưởng động
 */
async function calculateDynamicOddsFactor(bet) {
  try {
    // Hệ số dựa trên số tiền cược
    // Cược càng lớn, hệ số càng cao (tối đa tăng 20%)
    const betAmountFactor = Math.min(1.2, 1 + (bet.amount / 10000) * 0.2);
    
    // Hệ số dựa trên số người đặt cược trên cùng số
    // Số càng nhiều người cược, hệ số càng giảm (tối đa giảm 20%)
    const sameBetsCount = await Bet.countDocuments({
      numbers: bet.numbers,
      betType: bet.betType,
      provinceCode: bet.provinceCode,
      betDate: {
        $gte: new Date(bet.betDate).setHours(0, 0, 0, 0),
        $lte: new Date(bet.betDate).setHours(23, 59, 59, 999)
      }
    });
    const popularityFactor = Math.max(0.8, 1 - (sameBetsCount / 100) * 0.2);
    
    // Hệ số dựa trên thời gian đặt cược
    // Đặt cược càng sớm, hệ số càng cao (tối đa tăng 10%)
    const resultTime = new Date(bet.betDate).setHours(16, 30, 0, 0); // Thời điểm công bố kết quả
    const betTime = new Date(bet.createdAt).getTime();
    const timeUntilResult = Math.max(0, resultTime - betTime) / 1000; // Thời gian còn lại tính bằng giây
    const timeFactor = Math.min(1.1, 1 + (timeUntilResult / 86400) * 0.1);
    
    // Kết hợp các hệ số
    return betAmountFactor * popularityFactor * timeFactor;
  } catch (error) {
    logger.error(`Error calculating dynamic odds factor: ${error.message}`, { stack: error.stack });
    return 1; // Trả về hệ số mặc định là 1 trong trường hợp lỗi
  }
}

/**
 * Tính thưởng đặc biệt
 * @param {Object} bet - Thông tin cược
 * @param {Object} user - Thông tin người dùng
 * @returns {Object} - Thông tin thưởng đặc biệt
 */
async function calculateSpecialBonus(bet, user) {
  // Mặc định không có thưởng
  let bonusPercentage = 0;
  let bonusName = '';
  
  // Kiểm tra số may mắn trong ngày
  const today = new Date().toISOString().split('T')[0];
  const luckyNumberKey = `lucky_number:${today}`;
  
  // Giả sử có một hệ thống lưu trữ số may mắn hàng ngày
  const luckyNumber = await getLuckyNumber(today);
  if (luckyNumber && bet.numbers === luckyNumber) {
    bonusPercentage = 1.0; // 100% (nhân đôi tiền thưởng)
    bonusName = 'Thưởng trúng số may mắn trong ngày';
  }
  
  // Kiểm tra sinh nhật
  if (user.dateOfBirth) {
    const birthDate = new Date(user.dateOfBirth);
    const betDate = new Date(bet.betDate);
    
    if (birthDate.getDate() === betDate.getDate() && birthDate.getMonth() === betDate.getMonth()) {
      bonusPercentage += 0.2; // 20%
      bonusName = bonusName ? `${bonusName}, Thưởng sinh nhật` : 'Thưởng sinh nhật';
    }
  }
  
  // Kiểm tra cột mốc số lần đặt cược
  const betCount = await Bet.countDocuments({ userId: user._id });
  if (betCount === 100 || betCount === 500 || betCount === 1000) {
    bonusPercentage += 0.15; // 15%
    bonusName = bonusName ? `${bonusName}, Thưởng cột mốc lần cược thứ ${betCount}` : `Thưởng cột mốc lần cược thứ ${betCount}`;
  }
  
  return {
    percentage: bonusPercentage,
    name: bonusName
  };
}

/**
 * Lấy số may mắn trong ngày
 * @param {String} date - Ngày cần lấy số may mắn (định dạng YYYY-MM-DD)
 * @returns {String} - Số may mắn
 */
async function getLuckyNumber(date) {
  // Thực tế sẽ lấy từ cache hoặc database
  // Ở đây tạm thời tạo số ngẫu nhiên dựa trên ngày
  const dateParts = date.split('-');
  const seed = parseInt(dateParts[2]) + parseInt(dateParts[1]);
  return (seed % 100).toString().padStart(2, '0'); // Tạo số 2 chữ số
}

/**
 * Cập nhật điểm thưởng trung thành cho người dùng
 * @param {Object} user - Thông tin người dùng
 * @param {Object} bet - Thông tin cược
 */
async function updateLoyaltyPoints(user, bet) {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    // Lấy hoặc tạo coin balance cho user
    const coinBalance = await Coin.getOrCreateCoinBalance(user._id);
    
    // Tính coin từ tiền cược: 100,000đ = 1 Coin
    const coinsEarned = Math.floor(bet.amount / 100000);
    
    if (coinsEarned > 0) {
      await coinBalance.addCoins(
        coinsEarned,
        'earn',
        `Tích lũy từ cược ${bet.betType} số ${bet.numbers}`,
        bet._id,
        'Bet'
      );
    }
    
    // Cập nhật tổng số tiền cược
    user.totalBetAmount = (user.totalBetAmount || 0) + bet.amount;
    
    // Ghi lại ngày đặt cược gần nhất
    user.lastBetDate = new Date();
    
    // Kiểm tra các mốc đặt cược để thưởng coin đặc biệt
    const milestones = [10000000, 50000000, 100000000, 1000000000]; // 10m, 50m, 100m, 1B
    const currentTotal = user.totalBetAmount;
    
    for (const milestone of milestones) {
      if (currentTotal >= milestone && !coinBalance.hasAchievedMilestone(milestone)) {
        // Thưởng coin đặc biệt cho mốc
        let bonusCoins = 0;
        let milestoneText = '';
        
        if (milestone === 10000000) {
          bonusCoins = 10; // 10 coin cho mốc 10m
          milestoneText = '10 triệu';
        } else if (milestone === 50000000) {
          bonusCoins = 50; // 50 coin cho mốc 50m
          milestoneText = '50 triệu';
        } else if (milestone === 100000000) {
          bonusCoins = 100; // 100 coin cho mốc 100m
          milestoneText = '100 triệu';
        } else if (milestone === 1000000000) {
          bonusCoins = 2000; // 2000 coin cho mốc 1B
          milestoneText = '1 tỷ';
        }
        
        await coinBalance.addMilestone(
          milestone,
          bonusCoins,
          `Thưởng mốc đạt ${milestoneText} đồng đặt cược`
        );
        
        logger.info(`User ${user.telegramId} đạt mốc ${milestoneText} đồng đặt cược, nhận thêm ${bonusCoins} coin`);
      }
    }
    
    // Lưu các thay đổi
    await user.save({ session });
    await session.commitTransaction();
  } catch (error) {
    await session.abortTransaction();
    logger.error(`Error updating loyalty points: ${error.message}`, { stack: error.stack });
    throw error;
  } finally {
    session.endSession();
  }
}

/**
 * Đổi coin thành phần thưởng
 * @param {String} userId - ID người dùng
 * @param {String} rewardType - Loại phần thưởng
 * @param {Number} coins - Số coin muốn đổi
 * @returns {Object} - Kết quả đổi thưởng
 */
exports.redeemLoyaltyPoints = async (userId, rewardType, coins) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const user = await User.findById(userId).session(session);
    if (!user) {
      throw new Error('Không tìm thấy người dùng');
    }
    
    const coinBalance = await Coin.getOrCreateCoinBalance(userId);
    if (coinBalance.balance < coins) {
      throw new Error('Không đủ coin để đổi thưởng');
    }
    
    let reward = {};
    
    // Xử lý từng loại phần thưởng
    switch (rewardType) {
      case 'cash':
        // Đổi coin thành tiền: 1 coin = 10,000đ
        const cashAmount = coins * 10000;
        
        // Cập nhật số dư
        user.balance += cashAmount;
        
        // Tạo giao dịch
        const transaction = new Transaction({
          userId: user._id,
          type: 'coin_reward',
          amount: cashAmount,
          status: 'completed',
          description: `Đổi ${coins} coin thành ${cashAmount} tiền`,
          createdAt: new Date()
        });
        
        await transaction.save({ session });
        
        reward = {
          type: 'cash',
          amount: cashAmount,
          description: `${cashAmount} tiền thưởng`
        };
        break;
      
      case 'p_balance':
        // Đổi coin thành P balance: 1 coin = 1,000 P
        const pAmount = coins * 1000;
        
        // Lấy hoặc tạo balance P cho user
        const userBalance = await Balance.getOrCreateBalance(userId, 'user');
        await userBalance.receiveP(
          pAmount,
          'milestone_reward',
          `Đổi ${coins} coin thành ${pAmount} P`,
          null,
          'Coin'
        );
        
        reward = {
          type: 'p_balance',
          amount: pAmount,
          description: `${pAmount} P balance`
        };
        break;
      
      default:
        throw new Error('Loại phần thưởng không hợp lệ');
    }
    
    // Trừ coin
    await coinBalance.spendCoins(
      coins,
      'spend',
      `Đổi ${coins} coin lấy ${rewardType}`,
      null,
      'System'
    );
    
    await session.commitTransaction();
    return { success: true, reward };
  } catch (error) {
    await session.abortTransaction();
    logger.error(`Error redeeming loyalty points: ${error.message}`, { stack: error.stack });
    return { success: false, error: error.message };
  } finally {
    session.endSession();
  }
};

/**
 * Lấy Leaderboard - Top 10 người cược nhiều nhất
 * @returns {Array} - Danh sách top 10 người cược nhiều nhất
 */
exports.getTopBettingLeaderboard = async () => {
  try {
    const topBettors = await User.find({ totalBetAmount: { $gt: 0 } })
      .select('telegramId username totalBetAmount')
      .sort({ totalBetAmount: -1 })
      .limit(10);
    
    return topBettors.map((user, index) => ({
      rank: index + 1,
      userId: user._id,
      telegramId: user.telegramId,
      username: user.username || 'Người dùng ẩn danh',
      totalBetAmount: user.totalBetAmount || 0
    }));
  } catch (error) {
    logger.error(`Error getting top betting leaderboard: ${error.message}`, { stack: error.stack });
    return [];
  }
};

/**
 * Lấy Leaderboard - Top 10 người thắng nhiều nhất
 * @returns {Array} - Danh sách top 10 người thắng nhiều nhất
 */
exports.getTopWinningLeaderboard = async () => {
  try {
    const topWinners = await User.aggregate([
      {
        $lookup: {
          from: 'bets',
          localField: '_id',
          foreignField: 'userId',
          as: 'bets'
        }
      },
      {
        $addFields: {
          totalWinAmount: {
            $sum: {
              $map: {
                input: {
                  $filter: {
                    input: '$bets',
                    cond: { $eq: ['$$this.status', 'won'] }
                  }
                },
                as: 'bet',
                in: '$$bet.winAmount'
              }
            }
          }
        }
      },
      {
        $match: { totalWinAmount: { $gt: 0 } }
      },
      {
        $sort: { totalWinAmount: -1 }
      },
      {
        $limit: 10
      },
      {
        $project: {
          _id: 1,
          telegramId: 1,
          username: 1,
          totalWinAmount: 1
        }
      }
    ]);
    
    return topWinners.map((user, index) => ({
      rank: index + 1,
      userId: user._id,
      telegramId: user.telegramId,
      username: user.username || 'Người dùng ẩn danh',
      totalWinAmount: user.totalWinAmount || 0
    }));
  } catch (error) {
    logger.error(`Error getting top winning leaderboard: ${error.message}`, { stack: error.stack });
    return [];
  }
};

/**
 * Lấy thông tin Leaderboard tổng hợp
 * @returns {Object} - Thông tin Leaderboard
 */
exports.getLeaderboardInfo = async () => {
  try {
    const [topBettors, topWinners] = await Promise.all([
      exports.getTopBettingLeaderboard(),
      exports.getTopWinningLeaderboard()
    ]);
    
    return {
      topBettors,
      topWinners,
      lastUpdated: new Date()
    };
  } catch (error) {
    logger.error(`Error getting leaderboard info: ${error.message}`, { stack: error.stack });
    return {
      topBettors: [],
      topWinners: [],
      lastUpdated: new Date()
    };
  }
}; 