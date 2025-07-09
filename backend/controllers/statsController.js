const User = require('../models/User');
const Bet = require('../models/Bet');
const Result = require('../models/Result');
const Transaction = require('../models/Transaction');
const ApiError = require('../utils/error');
const asyncHandler = require('../utils/asyncHandler');
const redisClient = require('../config/redis');

/**
 * Lấy thống kê người dùng
 * @route GET /api/stats/user
 * @access Private
 */
exports.getUserStats = asyncHandler(async (req, res, next) => {
  const userId = req.user._id;
  
  // Tổng số tiền đã cược
  const totalBetAmount = await Bet.aggregate([
    { $match: { userId } },
    { $group: { _id: null, total: { $sum: "$amount" } } }
  ]);
  
  // Tổng số tiền thắng
  const totalWinAmount = await Bet.aggregate([
    { $match: { userId, status: 'won' } },
    { $group: { _id: null, total: { $sum: "$winAmount" } } }
  ]);
  
  // Số lượng cược thắng/thua
  const wonBets = await Bet.countDocuments({ userId, status: 'won' });
  const lostBets = await Bet.countDocuments({ userId, status: 'lost' });
  const pendingBets = await Bet.countDocuments({ userId, status: 'pending' });
  
  // Số cược theo loại
  const betTypeStats = await Bet.aggregate([
    { $match: { userId } },
    { $group: { _id: "$betType", count: { $sum: 1 }, amount: { $sum: "$amount" } } }
  ]);
  
  // Thống kê theo tháng
  const monthlyStats = await Bet.aggregate([
    { $match: { userId } },
    {
      $group: {
        _id: {
          year: { $year: "$createdAt" },
          month: { $month: "$createdAt" }
        },
        totalBets: { $sum: 1 },
        totalAmount: { $sum: "$amount" },
        totalWins: { $sum: { $cond: [{ $eq: ["$status", "won"] }, 1, 0] } },
        totalWinAmount: { $sum: { $cond: [{ $eq: ["$status", "won"] }, "$winAmount", 0] } }
      }
    },
    { $sort: { "_id.year": -1, "_id.month": -1 } }
  ]);
  
  res.status(200).json({
    success: true,
    stats: {
      totalBetAmount: totalBetAmount.length > 0 ? totalBetAmount[0].total : 0,
      totalWinAmount: totalWinAmount.length > 0 ? totalWinAmount[0].total : 0,
      wonBets,
      lostBets,
      pendingBets,
      betTypeStats,
      monthlyStats
    }
  });
});

/**
 * Lấy thống kê số nóng
 * @route GET /api/stats/hot-numbers
 * @access Public
 */
exports.getHotNumbers = asyncHandler(async (req, res, next) => {
  const { days = 30, limit = 10, type = '2D' } = req.query;
  
  // Tính ngày bắt đầu
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - parseInt(days));
  
  // Cache key
  const cacheKey = `hot_numbers:${type}:${days}:${limit}`;
  
  // Kiểm tra cache
  try {
    const cachedData = await redisClient.get(cacheKey);
    if (cachedData) {
      return res.status(200).json(JSON.parse(cachedData));
    }
  } catch (err) {
    console.error('Redis error:', err);
  }
  
  // Xác định trường cần lấy dựa trên loại cược
  let resultField;
  let numberLength;
  
  switch (type) {
    case '2D':
      resultField = { $substr: ["$provinces.results.special", 4, 2] };
      numberLength = 2;
      break;
    case '3D':
      resultField = { $substr: ["$provinces.results.special", 3, 3] };
      numberLength = 3;
      break;
    case '4D':
      resultField = { $substr: ["$provinces.results.special", 2, 4] };
      numberLength = 4;
      break;
    default:
      throw new ApiError('Loại cược không hợp lệ', 400);
  }
  
  // Lấy kết quả từ database
  const results = await Result.aggregate([
    { $match: { date: { $gte: startDate } } },
    { $unwind: "$provinces" },
    {
      $project: {
        date: 1,
        province: "$provinces.name",
        number: resultField
      }
    },
    { $group: { _id: "$number", count: { $sum: 1 }, provinces: { $push: "$province" } } },
    { $match: { _id: { $regex: `^[0-9]{${numberLength}}$` } } },
    { $sort: { count: -1 } },
    { $limit: parseInt(limit) }
  ]);
  
  // Định dạng kết quả
  const hotNumbers = results.map(item => ({
    number: item._id,
    count: item.count,
    provinces: item.provinces.slice(0, 5) // Giới hạn số lượng tỉnh hiển thị
  }));
  
  const response = {
    success: true,
    type,
    days: parseInt(days),
    hotNumbers
  };
  
  // Lưu vào cache
  try {
    await redisClient.setEx(cacheKey, 3600, JSON.stringify(response));
  } catch (err) {
    console.error('Redis error:', err);
  }
  
  res.status(200).json(response);
});

/**
 * Lấy thống kê hệ thống
 * @route GET /api/stats/system
 * @access Admin
 */
exports.getSystemStats = asyncHandler(async (req, res, next) => {
  // Thống kê người dùng
  const totalUsers = await User.countDocuments();
  const totalAdmins = await User.countDocuments({ role: 'admin' });
  const totalAffiliates = await User.countDocuments({ role: 'affiliate' });
  
  // Thống kê cược
  const totalBets = await Bet.countDocuments();
  const pendingBets = await Bet.countDocuments({ status: 'pending' });
  const wonBets = await Bet.countDocuments({ status: 'won' });
  const lostBets = await Bet.countDocuments({ status: 'lost' });
  
  // Thống kê tài chính
  const totalBetAmount = await Bet.aggregate([
    { $group: { _id: null, total: { $sum: "$amount" } } }
  ]);
  
  const totalWinAmount = await Bet.aggregate([
    { $match: { status: 'won' } },
    { $group: { _id: null, total: { $sum: "$winAmount" } } }
  ]);
  
  // Thống kê theo ngày (7 ngày gần nhất)
  const startDate = new Date();
  startDate.setDate(startDate.getDate() - 7);
  
  const dailyStats = await Bet.aggregate([
    { $match: { createdAt: { $gte: startDate } } },
    {
      $group: {
        _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
        totalBets: { $sum: 1 },
        totalAmount: { $sum: "$amount" },
        totalWins: { $sum: { $cond: [{ $eq: ["$status", "won"] }, 1, 0] } },
        totalWinAmount: { $sum: { $cond: [{ $eq: ["$status", "won"] }, "$winAmount", 0] } }
      }
    },
    { $sort: { "_id": 1 } }
  ]);
  
  // Thống kê theo loại cược
  const betTypeStats = await Bet.aggregate([
    { $group: { _id: "$betType", count: { $sum: 1 }, amount: { $sum: "$amount" } } },
    { $sort: { count: -1 } }
  ]);
  
  res.status(200).json({
    success: true,
    stats: {
      users: {
        total: totalUsers,
        admins: totalAdmins,
        affiliates: totalAffiliates,
        regularUsers: totalUsers - totalAdmins - totalAffiliates
      },
      bets: {
        total: totalBets,
        pending: pendingBets,
        won: wonBets,
        lost: lostBets
      },
      finance: {
        totalBetAmount: totalBetAmount.length > 0 ? totalBetAmount[0].total : 0,
        totalWinAmount: totalWinAmount.length > 0 ? totalWinAmount[0].total : 0,
        profit: totalBetAmount.length > 0 && totalWinAmount.length > 0 
          ? totalBetAmount[0].total - totalWinAmount[0].total 
          : 0
      },
      daily: dailyStats,
      betTypes: betTypeStats
    }
  });
});