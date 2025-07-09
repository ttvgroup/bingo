const Bet = require('../models/Bet');
const User = require('../models/User');
const ApiError = require('../utils/error');
const betService = require('../services/betService');
const { body, validationResult } = require('express-validator');
const logger = require('../utils/logger');
const config = require('../config');
const asyncHandler = require('../utils/asyncHandler');

/**
 * Validator cho đặt cược
 */
exports.betValidation = [
  body('numbers')
    .trim()
    .notEmpty().withMessage('Số cược không được để trống')
    .custom((value, { req }) => {
      const betType = req.body.betType;
      
      if (betType === '2D' || betType === 'Bao lô 2D') {
        if (!/^\d{2}$/.test(value)) {
          throw new Error('Số cược 2D phải có đúng 2 chữ số');
        }
      } else if (betType === '3D' || betType === 'Bao lô 3D') {
        if (!/^\d{3}$/.test(value)) {
          throw new Error('Số cược 3D phải có đúng 3 chữ số');
        }
      } else if (betType === '4D' || betType === 'Bao lô 4D') {
        if (!/^\d{4}$/.test(value)) {
          throw new Error('Số cược 4D phải có đúng 4 chữ số');
        }
      } else {
        throw new Error('Loại cược không hợp lệ');
      }
      
      return true;
    }),
    
  body('betType')
    .trim()
    .notEmpty().withMessage('Loại cược không được để trống')
    .isIn(['2D', '3D', '4D', 'Bao lô 2D', 'Bao lô 3D', 'Bao lô 4D'])
    .withMessage('Loại cược không hợp lệ'),
    
  body('amount')
    .isInt({ min: 1 }).withMessage('Số tiền cược phải là số nguyên dương')
    .custom((value, { req }) => {
      if (value > 10000000) {
        throw new Error('Số tiền cược không được vượt quá 10.000.000');
      }
      return true;
    }),
    
  body('provinceCode')
    .trim()
    .notEmpty().withMessage('Mã tỉnh không được để trống')
];

/**
 * Kiểm tra thời gian đặt cược
 */
const checkBettingTime = () => {
  const now = new Date();
  
  // Đặt múi giờ Vietnam (GMT+7)
  const vietnamTime = new Date(now.getTime() + (7 * 60 * 60 * 1000));
  
  // Lấy giờ từ 0-23
  const hours = vietnamTime.getUTCHours();
  
  // Chỉ cho phép đặt cược từ 0:01 đến 15:30 hàng ngày
  return (hours >= 0 && hours < 15) || (hours === 15 && vietnamTime.getUTCMinutes() <= 30);
};

/**
 * @route POST /api/bets
 * @desc Đặt cược mới
 * @access Private
 */
exports.placeBet = [
  exports.betValidation,
  asyncHandler(async (req, res, next) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return next(new ApiError('Validation error', 400, errors.array()));
    }
    
    // Kiểm tra thời gian đặt cược
    if (!checkBettingTime()) {
      return next(new ApiError('Ngoài thời gian đặt cược. Chỉ được đặt cược từ 00:01 đến 15:30 hàng ngày (giờ Việt Nam)', 403));
    }
    
    const { numbers, betType, amount, provinceCode } = req.body;
    const userId = req.user._id;
    
    // Lưu thông tin thiết bị và IP
    const metadata = {
      ipAddress: req.ip || req.connection.remoteAddress,
      deviceInfo: req.headers['user-agent'] || 'Unknown'
    };
    
    // Sử dụng betService để đặt cược với transaction
    const bet = await betService.placeBet(userId, numbers, betType, amount, provinceCode, metadata);
    
    res.status(201).json({
      success: true,
      data: bet
    });
  })
];

/**
 * @route GET /api/bets
 * @desc Lấy danh sách cược của người dùng
 * @access Private
 */
exports.getUserBets = asyncHandler(async (req, res, next) => {
  const userId = req.user._id;
  const options = {
    page: parseInt(req.query.page, 10) || 1,
    limit: parseInt(req.query.limit, 10) || 20,
    status: req.query.status,
    startDate: req.query.startDate ? new Date(req.query.startDate) : null,
    endDate: req.query.endDate ? new Date(req.query.endDate) : null
  };
  
  // Sử dụng betService để lấy danh sách cược (có cache)
  const result = await betService.getUserBets(userId, options);
  
  res.status(200).json({
    success: true,
    count: result.count,
    total: result.total,
    pagination: result.pagination,
    data: result.bets
  });
});

/**
 * @route GET /api/bets/:id
 * @desc Lấy thông tin chi tiết một cược
 * @access Private
 */
exports.getUserBetById = asyncHandler(async (req, res, next) => {
  const betId = req.params.id;
  const userId = req.user._id;
  
  // Sử dụng betService để lấy thông tin cược (có cache)
  const bet = await betService.getBetById(betId, userId);
  
  // Bỏ một số trường nhạy cảm
  const betData = {
    id: bet._id,
    numbers: bet.numbers,
    betType: bet.betType,
    amount: bet.amount,
    status: bet.status,
    provinceCode: bet.provinceCode,
    createdAt: bet.createdAt,
    winAmount: bet.winAmount,
    resultId: bet.resultId
  };
  
  res.status(200).json({
    success: true,
    data: betData
  });
});

/**
 * @route GET /api/bet-types
 * @desc Lấy danh sách loại cược
 * @access Public
 */
exports.getBetTypes = asyncHandler(async (req, res, next) => {
  // Sử dụng betService để lấy danh sách loại cược (có cache)
  const betTypes = await betService.getBetTypes();
  
  res.status(200).json({
    success: true,
    count: betTypes.length,
    data: betTypes
  });
});

/**
 * @route GET /api/admin/bets
 * @desc Lấy danh sách cược cho admin
 * @access Admin
 */
exports.getAdminBets = asyncHandler(async (req, res, next) => {
  const options = {
    page: parseInt(req.query.page, 10) || 1,
    limit: parseInt(req.query.limit, 10) || 20,
    status: req.query.status,
    userId: req.query.userId,
    startDate: req.query.startDate ? new Date(req.query.startDate) : null,
    endDate: req.query.endDate ? new Date(req.query.endDate) : null
  };
  
  // Sử dụng betService để lấy danh sách cược
  const result = await betService.getAdminBets(options);
  
  res.status(200).json({
    success: true,
    count: result.count,
    total: result.total,
    pagination: result.pagination,
    data: result.bets
  });
});

/**
 * @route GET /api/admin/bets/:id
 * @desc Lấy thông tin chi tiết một cược cho admin
 * @access Admin
 */
exports.getAdminBetById = asyncHandler(async (req, res, next) => {
  const betId = req.params.id;
  
  // Sử dụng betService để lấy thông tin cược
  const bet = await betService.getAdminBetById(betId);
  
  res.status(200).json({
    success: true,
    data: bet
  });
});

/**
 * @route GET /api/bets/history
 * @desc Lấy lịch sử cược của người dùng
 * @access Private
 */
exports.getUserBetHistory = asyncHandler(async (req, res, next) => {
  const userId = req.user._id;
  const options = {
    page: parseInt(req.query.page, 10) || 1,
    limit: parseInt(req.query.limit, 10) || 20,
    startDate: req.query.startDate ? new Date(req.query.startDate) : null,
    endDate: req.query.endDate ? new Date(req.query.endDate) : null
  };
  
  // Sử dụng betService để lấy lịch sử cược
  const result = await betService.getUserBetHistory(userId, options);
  
  res.status(200).json({
    success: true,
    count: result.count,
    total: result.total,
    pagination: result.pagination,
    data: result.bets
  });
});

/**
 * @route GET /api/bets/active
 * @desc Lấy danh sách cược đang hoạt động của người dùng
 * @access Private
 */
exports.getUserActiveBets = asyncHandler(async (req, res, next) => {
  const userId = req.user._id;
  const options = {
    page: parseInt(req.query.page, 10) || 1,
    limit: parseInt(req.query.limit, 10) || 20
  };
  
  // Sử dụng betService để lấy cược đang hoạt động
  const result = await betService.getUserActiveBets(userId, options);
  
  res.status(200).json({
    success: true,
    count: result.count,
    total: result.total,
    pagination: result.pagination,
    data: result.bets
  });
});

/**
 * @route GET /api/bets/winners
 * @desc Lấy danh sách cược thắng của người dùng
 * @access Private
 */
exports.getWinningBets = asyncHandler(async (req, res, next) => {
  const userId = req.user._id;
  const options = {
    page: parseInt(req.query.page, 10) || 1,
    limit: parseInt(req.query.limit, 10) || 20,
    startDate: req.query.startDate ? new Date(req.query.startDate) : null,
    endDate: req.query.endDate ? new Date(req.query.endDate) : null
  };
  
  // Sử dụng betService để lấy cược thắng
  const result = await betService.getUserWinningBets(userId, options);
  
  res.status(200).json({
    success: true,
    count: result.count,
    total: result.total,
    pagination: result.pagination,
    data: result.bets
  });
});