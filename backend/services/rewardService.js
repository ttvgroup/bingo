const mongoose = require('mongoose');
const User = require('../models/User');
const Bet = require('../models/Bet');
const Transaction = require('../models/Transaction');
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
    
    // Áp dụng thưởng theo cấp độ người chơi
    const tierBonus = await calculateTierBonus(user);
    if (tierBonus > 0) {
      const tierBonusAmount = winAmount * tierBonus;
      winAmount += tierBonusAmount;
      bonuses.push({
        type: 'tier',
        name: `Thưởng cấp độ ${user.currentTier}`,
        percentage: tierBonus * 100,
        amount: tierBonusAmount
      });
    }
    
    // Áp dụng thưởng khuyến khích
    const incentiveBonus = await calculateIncentiveBonus(bet, user);
    if (incentiveBonus.percentage > 0) {
      const incentiveBonusAmount = winAmount * incentiveBonus.percentage;
      winAmount += incentiveBonusAmount;
      bonuses.push({
        type: 'incentive',
        name: incentiveBonus.name,
        percentage: incentiveBonus.percentage * 100,
        amount: incentiveBonusAmount
      });
    }
    
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
    
    // Kiểm tra jackpot
    const jackpotResult = await checkJackpot(bet, user);
    if (jackpotResult.won) {
      winAmount += jackpotResult.amount;
      bonuses.push({
        type: 'jackpot',
        name: 'Jackpot',
        amount: jackpotResult.amount
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
 * Tính thưởng theo cấp độ người chơi
 * @param {Object} user - Thông tin người dùng
 * @returns {Number} - Phần trăm thưởng thêm (0.05 = 5%)
 */
async function calculateTierBonus(user) {
  // Các mức thưởng theo cấp độ
  const tierBonuses = {
    'Standard': 0,
    'Bạc': 0.05, // 5%
    'Vàng': 0.10, // 10%
    'Bạch kim': 0.15, // 15%
    'Kim cương': 0.20 // 20%
  };
  
  // Cập nhật cấp độ người chơi nếu cần
  if (user.totalBetAmount >= 50000000) {
    user.currentTier = 'Kim cương';
  } else if (user.totalBetAmount >= 20000000) {
    user.currentTier = 'Bạch kim';
  } else if (user.totalBetAmount >= 5000000) {
    user.currentTier = 'Vàng';
  } else if (user.totalBetAmount >= 1000000) {
    user.currentTier = 'Bạc';
  }
  
  // Trả về phần trăm thưởng dựa trên cấp độ
  return tierBonuses[user.currentTier] || 0;
}

/**
 * Tính thưởng khuyến khích
 * @param {Object} bet - Thông tin cược
 * @param {Object} user - Thông tin người dùng
 * @returns {Object} - Thông tin thưởng khuyến khích
 */
async function calculateIncentiveBonus(bet, user) {
  // Mặc định không có thưởng
  let bonusPercentage = 0;
  let bonusName = '';
  
  // Kiểm tra lần đầu thắng cược
  const firstWinCheck = await Bet.findOne({
    userId: user._id,
    status: 'won'
  });
  
  if (!firstWinCheck) {
    // Lần đầu thắng cược
    bonusPercentage = 0.10; // 10%
    bonusName = 'Thưởng lần đầu thắng';
  } else {
    // Kiểm tra chuỗi thua liên tiếp
    const recentBets = await Bet.find({
      userId: user._id
    })
    .sort({ createdAt: -1 })
    .limit(5);
    
    if (recentBets.length >= 5 && recentBets.every(b => b.status === 'lost')) {
      bonusPercentage = 0.05; // 5%
      bonusName = 'Thưởng quay lại sau chuỗi thua';
    }
  }
  
  // Thưởng cho khoản thắng lớn
  if (bet.amount >= 10000000) {
    bonusPercentage += 0.03; // 3%
    bonusName = bonusName ? `${bonusName}, Thưởng thắng lớn` : 'Thưởng thắng lớn';
  }
  
  // Thưởng đặt cược liên tục hàng ngày
  if (user.consecutiveBetDays > 0) {
    const streakBonus = Math.min(0.07, user.consecutiveBetDays * 0.01); // Tối đa 7%
    bonusPercentage += streakBonus;
    bonusName = bonusName ? `${bonusName}, Thưởng đặt cược ${user.consecutiveBetDays} ngày liên tiếp` : `Thưởng đặt cược ${user.consecutiveBetDays} ngày liên tiếp`;
  }
  
  return {
    percentage: bonusPercentage,
    name: bonusName
  };
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
 * Kiểm tra điều kiện trúng jackpot
 * @param {Object} bet - Thông tin cược
 * @param {Object} user - Thông tin người dùng
 * @returns {Object} - Kết quả jackpot
 */
async function checkJackpot(bet, user) {
  // Kiểm tra các điều kiện cần để trúng jackpot
  if (bet.amount < 100000) {
    return { won: false, amount: 0 };
  }
  
  // Kiểm tra số đặc biệt (giả sử số đặc biệt của jackpot được cấu hình)
  const specialNumber = await getJackpotSpecialNumber();
  if (bet.numbers !== specialNumber) {
    return { won: false, amount: 0 };
  }
  
  // Kiểm tra điều kiện phụ: đặt cược trong khung giờ vàng
  const betHour = new Date(bet.createdAt).getHours();
  if (!(betHour >= 12 && betHour < 14)) { // Khung giờ vàng: 12h-14h
    return { won: false, amount: 0 };
  }
  
  // Đã trúng jackpot, lấy số tiền hiện tại
  const jackpotAmount = await getJackpotAmount();
  
  // Cập nhật jackpot về 0 hoặc một số tiền cố định
  await resetJackpot();
  
  return { won: true, amount: jackpotAmount };
}

/**
 * Lấy số đặc biệt cho jackpot
 * @returns {String} - Số đặc biệt
 */
async function getJackpotSpecialNumber() {
  // Thực tế sẽ lấy từ cấu hình hoặc database
  return "88"; // Giả sử số đặc biệt là 88
}

/**
 * Lấy số tiền jackpot hiện tại
 * @returns {Number} - Số tiền jackpot
 */
async function getJackpotAmount() {
  // Thực tế sẽ lấy từ database
  return 5000000; // Giả sử jackpot đang là 5,000,000
}

/**
 * Reset jackpot sau khi có người trúng
 */
async function resetJackpot() {
  // Thực tế sẽ cập nhật vào database
  // Đặt lại giá trị khởi tạo cho jackpot
}

/**
 * Cập nhật điểm thưởng trung thành cho người dùng
 * @param {Object} user - Thông tin người dùng
 * @param {Object} bet - Thông tin cược
 */
async function updateLoyaltyPoints(user, bet) {
  // Tính điểm thưởng: 1 điểm cho mỗi 10,000 đặt cược
  const newPoints = Math.floor(bet.amount / 10000);
  user.loyaltyPoints = (user.loyaltyPoints || 0) + newPoints;
  
  // Cập nhật tổng số tiền cược
  user.totalBetAmount = (user.totalBetAmount || 0) + bet.amount;
  
  // Cập nhật ngày đặt cược liên tiếp
  const today = new Date().setHours(0, 0, 0, 0);
  const lastBetDate = user.lastBetDate ? new Date(user.lastBetDate).setHours(0, 0, 0, 0) : null;
  
  if (!lastBetDate) {
    user.consecutiveBetDays = 1;
  } else if (today - lastBetDate === 86400000) { // 1 ngày (tính bằng ms)
    user.consecutiveBetDays = (user.consecutiveBetDays || 0) + 1;
  } else if (today !== lastBetDate) {
    user.consecutiveBetDays = 1; // Reset nếu không phải ngày liên tiếp
  }
  
  user.lastBetDate = new Date();
  
  // Lưu các thay đổi
  await user.save();
}

/**
 * Đổi điểm thưởng thành phần thưởng
 * @param {String} userId - ID người dùng
 * @param {String} rewardType - Loại phần thưởng
 * @param {Number} points - Số điểm muốn đổi
 * @returns {Object} - Kết quả đổi thưởng
 */
exports.redeemLoyaltyPoints = async (userId, rewardType, points) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  
  try {
    const user = await User.findById(userId).session(session);
    if (!user) {
      throw new Error('Không tìm thấy người dùng');
    }
    
    if (!user.loyaltyPoints || user.loyaltyPoints < points) {
      throw new Error('Không đủ điểm thưởng');
    }
    
    let reward = {};
    
    // Xử lý từng loại phần thưởng
    switch (rewardType) {
      case 'free_bet':
        // Tạo cược miễn phí
        const betAmount = points * 5000; // 5,000 cho mỗi điểm
        reward = {
          type: 'free_bet',
          amount: betAmount,
          description: `Cược miễn phí ${betAmount}`
        };
        break;
      
      case 'odds_boost':
        // Tăng tỷ lệ thắng cho lần cược tiếp theo
        const boostPercentage = Math.min(50, points); // Tối đa 50%
        reward = {
          type: 'odds_boost',
          percentage: boostPercentage,
          description: `Tăng tỷ lệ thắng ${boostPercentage}% cho lần cược tiếp theo`
        };
        break;
      
      case 'cash':
        // Đổi điểm thành tiền
        const cashAmount = points * 1000; // 1,000 cho mỗi điểm
        
        // Cập nhật số dư
        user.balance += cashAmount;
        
        // Tạo giao dịch
        const transaction = new Transaction({
          userId: user._id,
          type: 'loyalty_reward',
          amount: cashAmount,
          status: 'completed',
          description: `Đổi ${points} điểm thưởng thành ${cashAmount} tiền`,
          createdAt: new Date()
        });
        
        await transaction.save({ session });
        
        reward = {
          type: 'cash',
          amount: cashAmount,
          description: `${cashAmount} tiền thưởng`
        };
        break;
      
      default:
        throw new Error('Loại phần thưởng không hợp lệ');
    }
    
    // Trừ điểm thưởng
    user.loyaltyPoints -= points;
    await user.save({ session });
    
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
 * Lấy thông tin cấp độ cược
 * @returns {Array} - Danh sách các cấp độ cược
 */
exports.getBetTiers = async () => {
  return [
    {
      name: 'Standard',
      minAmount: 0,
      maxAmount: 999999,
      bonusPercentage: 0
    },
    {
      name: 'Bạc',
      minAmount: 1000000,
      maxAmount: 4999999,
      bonusPercentage: 5
    },
    {
      name: 'Vàng',
      minAmount: 5000000,
      maxAmount: 19999999,
      bonusPercentage: 10
    },
    {
      name: 'Bạch kim',
      minAmount: 20000000,
      maxAmount: 49999999,
      bonusPercentage: 15
    },
    {
      name: 'Kim cương',
      minAmount: 50000000,
      maxAmount: Infinity,
      bonusPercentage: 20
    }
  ];
};

/**
 * Tính phần thưởng cho cược kết hợp
 * @param {Array} bets - Danh sách các cược
 * @returns {Object} - Thông tin thưởng cho cược kết hợp
 */
exports.calculateParlayReward = async (bets) => {
  try {
    if (!Array.isArray(bets) || bets.length < 2) {
      throw new Error('Cần ít nhất 2 cược để tạo cược kết hợp');
    }
    
    // Tính tổng tỷ lệ cơ bản
    let totalOdds = 1;
    let totalAmount = 0;
    
    bets.forEach(bet => {
      // Lấy tỷ lệ cơ bản cho từng loại cược
      let odds = 0;
      switch (bet.betType) {
        case '2D':
          odds = config.payoutRatios['2D'];
          break;
        case '3D':
          odds = config.payoutRatios['3D'];
          break;
        case '4D':
          odds = config.payoutRatios['4D'];
          break;
        case 'Bao lô 2D':
          odds = config.payoutRatios['Bao lô 2D'];
          break;
        case 'Bao lô 3D':
          odds = config.payoutRatios['Bao lô 3D'];
          break;
        case 'Bao lô 4D':
          odds = config.payoutRatios['Bao lô 4D'];
          break;
      }
      
      totalOdds *= odds;
      totalAmount += bet.amount;
    });
    
    // Tính hệ số thưởng thêm cho cược kết hợp
    const bonusFactor = 1 + (bets.length - 1) * 0.1; // Tăng 10% cho mỗi cược thêm
    const finalOdds = totalOdds * bonusFactor;
    
    return {
      bets: bets.length,
      totalAmount: totalAmount,
      baseOdds: totalOdds,
      bonusFactor: bonusFactor,
      finalOdds: finalOdds,
      potentialWin: Math.floor(totalAmount * finalOdds)
    };
  } catch (error) {
    logger.error(`Error calculating parlay reward: ${error.message}`, { stack: error.stack });
    throw error;
  }
};

/**
 * Đóng góp vào quỹ Jackpot từ một cược
 * @param {Object} bet - Thông tin cược
 */
exports.contributeToJackpot = async (bet) => {
  try {
    const contributionPercentage = 0.005; // 0.5%
    const contribution = Math.floor(bet.amount * contributionPercentage);
    
    // Thực tế sẽ cập nhật vào database
    // Tăng số tiền jackpot
  } catch (error) {
    logger.error(`Error contributing to jackpot: ${error.message}`, { stack: error.stack });
  }
}; 