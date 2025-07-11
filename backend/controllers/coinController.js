const coinService = require('../services/coinService');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/error');

/**
 * Controller quản lý các API liên quan đến hệ thống Coin và Balance P
 */

/**
 * Lấy thông tin coin balance của user
 * @route GET /api/coins/balance
 * @access Private
 */
exports.getUserCoinBalance = asyncHandler(async (req, res) => {
  const coinBalance = await coinService.getUserCoinBalance(req.user.id);
  
  res.status(200).json({
    success: true,
    data: coinBalance
  });
});

/**
 * Lấy thông tin P balance của user
 * @route GET /api/coins/p-balance
 * @access Private
 */
exports.getUserPBalance = asyncHandler(async (req, res) => {
  const pBalance = await coinService.getUserPBalance(req.user.id);
  
  res.status(200).json({
    success: true,
    data: pBalance
  });
});

/**
 * Lấy lịch sử giao dịch coin của user
 * @route GET /api/coins/history
 * @access Private
 */
exports.getUserCoinHistory = asyncHandler(async (req, res) => {
  const { limit = 50 } = req.query;
  const history = await coinService.getUserCoinHistory(req.user.id, parseInt(limit));
  
  res.status(200).json({
    success: true,
    data: history
  });
});

/**
 * Lấy lịch sử giao dịch P của user
 * @route GET /api/coins/p-history
 * @access Private
 */
exports.getUserPHistory = asyncHandler(async (req, res) => {
  const { limit = 50 } = req.query;
  const history = await coinService.getUserPHistory(req.user.id, parseInt(limit));
  
  res.status(200).json({
    success: true,
    data: history
  });
});

/**
 * Admin cấp coin cho user
 * @route POST /api/admin/coins/grant
 * @access Admin
 */
exports.adminGrantCoins = asyncHandler(async (req, res) => {
  const { userId, amount, reason } = req.body;
  
  if (!userId || !amount || !reason) {
    throw new ApiError('Thiếu thông tin cần thiết', 400);
  }
  
  if (amount <= 0) {
    throw new ApiError('Số lượng coin phải lớn hơn 0', 400);
  }
  
  const result = await coinService.adminGrantCoins(userId, amount, reason, req.user.id);
  
  res.status(200).json({
    success: true,
    message: result.message,
    data: result
  });
});

/**
 * Admin trừ coin của user
 * @route POST /api/admin/coins/deduct
 * @access Admin
 */
exports.adminDeductCoins = asyncHandler(async (req, res) => {
  const { userId, amount, reason } = req.body;
  
  if (!userId || !amount || !reason) {
    throw new ApiError('Thiếu thông tin cần thiết', 400);
  }
  
  if (amount <= 0) {
    throw new ApiError('Số lượng coin phải lớn hơn 0', 400);
  }
  
  const result = await coinService.adminDeductCoins(userId, amount, reason, req.user.id);
  
  res.status(200).json({
    success: true,
    message: result.message,
    data: result
  });
});

/**
 * Admin cấp P cho user
 * @route POST /api/admin/p/grant
 * @access Admin
 */
exports.adminGrantP = asyncHandler(async (req, res) => {
  const { userId, amount, reason } = req.body;
  
  if (!userId || !amount || !reason) {
    throw new ApiError('Thiếu thông tin cần thiết', 400);
  }
  
  if (amount <= 0) {
    throw new ApiError('Số lượng P phải lớn hơn 0', 400);
  }
  
  const result = await coinService.adminGrantP(userId, amount, reason, req.user.id);
  
  res.status(200).json({
    success: true,
    message: result.message,
    data: result
  });
});

/**
 * Admin trừ P của user
 * @route POST /api/admin/p/deduct
 * @access Admin
 */
exports.adminDeductP = asyncHandler(async (req, res) => {
  const { userId, amount, reason } = req.body;
  
  if (!userId || !amount || !reason) {
    throw new ApiError('Thiếu thông tin cần thiết', 400);
  }
  
  if (amount <= 0) {
    throw new ApiError('Số lượng P phải lớn hơn 0', 400);
  }
  
  const result = await coinService.adminDeductP(userId, amount, reason, req.user.id);
  
  res.status(200).json({
    success: true,
    message: result.message,
    data: result
  });
});

/**
 * Lấy top coin holders
 * @route GET /api/coins/top-holders
 * @access Public
 */
exports.getTopCoinHolders = asyncHandler(async (req, res) => {
  const { limit = 10 } = req.query;
  const topHolders = await coinService.getTopCoinHolders(parseInt(limit));
  
  res.status(200).json({
    success: true,
    data: topHolders
  });
});

/**
 * Lấy top P holders
 * @route GET /api/coins/top-p-holders
 * @access Public
 */
exports.getTopPHolders = asyncHandler(async (req, res) => {
  const { limit = 10 } = req.query;
  const topHolders = await coinService.getTopPHolders(parseInt(limit));
  
  res.status(200).json({
    success: true,
    data: topHolders
  });
});

/**
 * Lấy thống kê hệ thống
 * @route GET /api/admin/coins/stats
 * @access Admin
 */
exports.getSystemStats = asyncHandler(async (req, res) => {
  const stats = await coinService.getSystemStats();
  
  res.status(200).json({
    success: true,
    data: stats
  });
});

/**
 * Khởi tạo daily bonus
 * @route POST /api/admin/coins/initialize-daily-bonus
 * @access Admin
 */
exports.initializeDailyBonus = asyncHandler(async (req, res) => {
  const result = await coinService.initializeDailyBonus(req.user.id);
  
  res.status(200).json({
    success: result.success,
    message: result.message,
    data: result
  });
}); 