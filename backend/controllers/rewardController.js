const User = require('../models/User');
const Bet = require('../models/Bet');
const rewardService = require('../services/rewardService');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/error');

/**
 * Controller quản lý các API liên quan đến hệ thống tính thưởng nâng cao
 */

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
  
  // Lấy thông tin coin balance
  const coinService = require('../services/coinService');
  const coinBalance = await coinService.getUserCoinBalance(req.user.id);
  
  res.status(200).json({
    success: true,
    data: {
      totalBetAmount: user.totalBetAmount || 0,
      coinBalance: coinBalance.balance,
      totalCoinsEarned: coinBalance.totalEarned,
      totalCoinsSpent: coinBalance.totalSpent,
      achievedMilestones: coinBalance.achievedMilestones,
      nextMilestones: [10000000, 50000000, 100000000, 1000000000].filter(m => !coinBalance.achievedMilestones?.includes(m)),
      // Tỷ lệ tích lũy: 100,000đ = 1 Coin
      earningRate: '100,000đ = 1 Coin',
      // Các mốc thưởng
      milestones: [
        { amount: 10000000, coins: 10, description: '10 triệu đồng' },
        { amount: 50000000, coins: 50, description: '50 triệu đồng' },
        { amount: 100000000, coins: 100, description: '100 triệu đồng' },
        { amount: 1000000000, coins: 2000, description: '1 tỷ đồng' }
      ]
    }
  });
});

/**
 * Đổi coin thành phần thưởng
 * @route POST /api/rewards/redeem-points
 * @access Private
 */
exports.redeemLoyaltyPoints = asyncHandler(async (req, res) => {
  const { rewardType, coins } = req.body;
  
  // Kiểm tra đầu vào
  if (!rewardType || !coins) {
    throw new ApiError('Thiếu thông tin phần thưởng hoặc số coin cần đổi', 400);
  }
  
  // Kiểm tra loại phần thưởng
  const validRewardTypes = ['cash', 'p_balance'];
  if (!validRewardTypes.includes(rewardType)) {
    throw new ApiError('Loại phần thưởng không hợp lệ', 400);
  }
  
  // Kiểm tra số coin
  if (coins <= 0 || !Number.isInteger(coins)) {
    throw new ApiError('Số coin cần đổi phải là số nguyên dương', 400);
  }
  
  const result = await rewardService.redeemLoyaltyPoints(req.user.id, rewardType, coins);
  
  if (!result.success) {
    throw new ApiError(result.error || 'Không thể đổi coin thưởng', 400);
  }
  
  res.status(200).json({
    success: true,
    message: 'Đổi coin thưởng thành công',
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

/**
 * Lấy Leaderboard - Top 10 người cược nhiều nhất
 * @route GET /api/rewards/leaderboard/betting
 * @access Public
 */
exports.getTopBettingLeaderboard = asyncHandler(async (req, res) => {
  const leaderboard = await rewardService.getTopBettingLeaderboard();
  
  res.status(200).json({
    success: true,
    data: leaderboard
  });
});

/**
 * Lấy Leaderboard - Top 10 người thắng nhiều nhất
 * @route GET /api/rewards/leaderboard/winning
 * @access Public
 */
exports.getTopWinningLeaderboard = asyncHandler(async (req, res) => {
  const leaderboard = await rewardService.getTopWinningLeaderboard();
  
  res.status(200).json({
    success: true,
    data: leaderboard
  });
});

/**
 * Lấy thông tin Leaderboard tổng hợp
 * @route GET /api/rewards/leaderboard
 * @access Public
 */
exports.getLeaderboardInfo = asyncHandler(async (req, res) => {
  const leaderboardInfo = await rewardService.getLeaderboardInfo();
  
  res.status(200).json({
    success: true,
    data: leaderboardInfo
  });
}); 