const User = require('../models/User');
const Bet = require('../models/Bet');
const rewardService = require('../services/rewardService');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/error');

/**
 * Controller quản lý các API liên quan đến hệ thống tính thưởng nâng cao
 */

/**
 * Lấy thông tin các cấp độ cược và thưởng tương ứng
 * @route GET /api/rewards/bet-tiers
 * @access Public
 */
exports.getBetTiers = asyncHandler(async (req, res) => {
  const betTiers = await rewardService.getBetTiers();
  res.status(200).json({
    success: true,
    data: betTiers
  });
});

/**
 * Lấy thông tin điểm thưởng trung thành của người dùng
 * @route GET /api/rewards/loyalty-points
 * @access Private
 */
exports.getLoyaltyPoints = asyncHandler(async (req, res) => {
  const user = await User.findById(req.user.id);
  
  if (!user) {
    throw new ApiError('Không tìm thấy người dùng', 404);
  }
  
  res.status(200).json({
    success: true,
    data: {
      points: user.loyaltyPoints || 0,
      tier: user.currentTier || 'Standard',
      totalBetAmount: user.totalBetAmount || 0,
      consecutiveBetDays: user.consecutiveBetDays || 0
    }
  });
});

/**
 * Đổi điểm thưởng lấy phần thưởng
 * @route POST /api/rewards/redeem-points
 * @access Private
 */
exports.redeemLoyaltyPoints = asyncHandler(async (req, res) => {
  const { rewardType, points } = req.body;
  
  // Kiểm tra đầu vào
  if (!rewardType || !points) {
    throw new ApiError('Thiếu thông tin phần thưởng hoặc số điểm cần đổi', 400);
  }
  
  // Kiểm tra loại phần thưởng
  const validRewardTypes = ['free_bet', 'odds_boost', 'cash'];
  if (!validRewardTypes.includes(rewardType)) {
    throw new ApiError('Loại phần thưởng không hợp lệ', 400);
  }
  
  // Kiểm tra số điểm
  if (points <= 0 || !Number.isInteger(points)) {
    throw new ApiError('Số điểm cần đổi phải là số nguyên dương', 400);
  }
  
  const result = await rewardService.redeemLoyaltyPoints(req.user.id, rewardType, points);
  
  if (!result.success) {
    throw new ApiError(result.error || 'Không thể đổi điểm thưởng', 400);
  }
  
  res.status(200).json({
    success: true,
    message: 'Đổi điểm thưởng thành công',
    data: result.reward
  });
});

/**
 * Lấy thông tin jackpot hiện tại
 * @route GET /api/rewards/jackpot
 * @access Public
 */
exports.getJackpot = asyncHandler(async (req, res) => {
  // Giả lập lấy thông tin jackpot
  // Trong thực tế sẽ lấy từ database
  const jackpotInfo = {
    amount: 5000000,
    specialNumber: '88',
    lastWinner: {
      username: 'user123',
      amount: 3000000,
      date: '2023-10-15'
    },
    conditions: [
      'Đặt cược tối thiểu 100,000 đồng',
      'Chọn đúng số đặc biệt',
      'Đặt cược trong khung giờ vàng (12h-14h)'
    ]
  };
  
  res.status(200).json({
    success: true,
    data: jackpotInfo
  });
});

/**
 * Tạo cược kết hợp (Parlay/Combo)
 * @route POST /api/rewards/parlay
 * @access Private
 */
exports.createParlay = asyncHandler(async (req, res) => {
  const { bets } = req.body;
  
  if (!bets || !Array.isArray(bets) || bets.length < 2) {
    throw new ApiError('Cần ít nhất 2 cược để tạo cược kết hợp', 400);
  }
  
  // Xác thực thông tin cược
  const validBets = [];
  for (const betData of bets) {
    // Kiểm tra các trường bắt buộc
    if (!betData.numbers || !betData.betType || !betData.provinceCode || !betData.amount) {
      throw new ApiError('Thông tin cược không hợp lệ', 400);
    }
    
    // Tạo đối tượng cược
    const bet = {
      userId: req.user.id,
      numbers: betData.numbers,
      betType: betData.betType,
      provinceCode: betData.provinceCode,
      amount: betData.amount
    };
    
    validBets.push(bet);
  }
  
  // Tính phần thưởng cho cược kết hợp
  const parlayInfo = await rewardService.calculateParlayReward(validBets);
  
  res.status(200).json({
    success: true,
    data: parlayInfo
  });
});

/**
 * Xem thông tin chi tiết thưởng của một cược thắng
 * @route GET /api/rewards/bet/:betId/details
 * @access Private
 */
exports.getBetRewardDetails = asyncHandler(async (req, res) => {
  const { betId } = req.params;
  
  // Lấy thông tin cược
  const bet = await Bet.findById(betId);
  if (!bet) {
    throw new ApiError('Không tìm thấy cược', 404);
  }
  
  // Kiểm tra quyền sở hữu
  if (bet.userId.toString() !== req.user.id && req.user.role !== 'admin') {
    throw new ApiError('Không có quyền xem thông tin cược này', 403);
  }
  
  // Chỉ hiển thị chi tiết thưởng cho cược thắng
  if (bet.status !== 'won') {
    throw new ApiError('Chỉ hiển thị chi tiết thưởng cho cược thắng', 400);
  }
  
  // Lấy thông tin người dùng
  const user = await User.findById(bet.userId);
  
  // Tính toán lại chi tiết thưởng
  // Lưu ý: Trong triển khai thực tế, có thể lưu chi tiết thưởng trong cược để tránh tính toán lại
  const rewardDetails = await rewardService.calculateReward(bet, user, true);
  
  res.status(200).json({
    success: true,
    data: {
      bet: {
        _id: bet._id,
        numbers: bet.numbers,
        betType: bet.betType,
        amount: bet.amount,
        provinceCode: bet.provinceCode,
        status: bet.status,
        createdAt: bet.createdAt,
        winAmount: bet.winAmount
      },
      rewardDetails: rewardDetails
    }
  });
}); 