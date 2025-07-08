const Bet = require('../models/Bet');
const User = require('../models/User');
const Result = require('../models/Result');
const redisClient = require('../config/redis');
const ApiError = require('../utils/error');

exports.getUserStats = async (req, res, next) => {
  try {
    const telegramId = req.user.id;
    let user;
    try {
      const cachedUser = await redisClient.get(`user:${telegramId}`);
      if (cachedUser) {
        user = JSON.parse(cachedUser);
      } else {
        user = await User.findOne({ telegramId });
        if (!user) {
          throw new ApiError(404, 'User not found');
        }
        await redisClient.setEx(`user:${telegramId}`, 3600, JSON.stringify(user));
      }
    } catch (redisErr) {
      console.error('Redis error:', redisErr);
      user = await User.findOne({ telegramId });
      if (!user) {
        throw new ApiError(404, 'User not found');
      }
    }

    const bets = await Bet.find({ userId: user._id }).populate('resultId');
    const results = await Result.find().sort({ date: -1 }).limit(10);

    const stats = {
      totalBets: bets.length,
      totalAmountBet: bets.reduce((sum, bet) => sum + bet.amount, 0),
      totalWins: bets.filter((bet) => bet.status === 'won').length,
      totalWinAmount: bets
        .filter((bet) => bet.status === 'won')
        .reduce((sum, bet) => sum + bet.amount * 70, 0),
      winRate: bets.length > 0 ? (bets.filter((bet) => bet.status === 'won').length / bets.length) * 100 : 0,
      recentBets: bets.slice(0, 10),
      recentResults: results,
      balance: user.balance,
    };

    res.json(stats);
  } catch (error) {
    next(error);
  }
};

exports.getGlobalStats = async (req, res, next) => {
  try {
    const bets = await Bet.find();
    const users = await User.find();

    const stats = {
      totalUsers: users.length,
      totalBets: bets.length,
      totalAmountBet: bets.reduce((sum, bet) => sum + bet.amount, 0),
      totalWins: bets.filter((bet) => bet.status === 'won').length,
      totalWinAmount: bets
        .filter((bet) => bet.status === 'won')
        .reduce((sum, bet) => sum + bet.amount * 70, 0),
    };

    res.json(stats);
  } catch (error) {
    next(error);
  }
};

exports.getAffiliateStats = async (req, res, next) => {
  try {
    const telegramId = req.user.id;
    let user;
    try {
      const cachedUser = await redisClient.get(`user:${telegramId}`);
      if (cachedUser) {
        user = JSON.parse(cachedUser);
      } else {
        user = await User.findOne({ telegramId });
        if (!user) {
          throw new ApiError(404, 'User not found');
        }
        await redisClient.setEx(`user:${telegramId}`, 3600, JSON.stringify(user));
      }
    } catch (redisErr) {
      console.error('Redis error:', redisErr);
      user = await User.findOne({ telegramId });
      if (!user) {
        throw new ApiError(404, 'User not found');
      }
    }

    if (user.role !== 'affiliate') {
      throw new ApiError(403, 'Access denied: Affiliate only');
    }

    const referredUsers = await User.find({ referredBy: user._id });
    const referredBets = await Bet.find({ userId: { $in: referredUsers.map(u => u._id) } });

    const stats = {
      totalReferredUsers: referredUsers.length,
      totalReferredBets: referredBets.length,
      totalReferredAmountBet: referredBets.reduce((sum, bet) => sum + bet.amount, 0),
      totalReferredWins: referredBets.filter((bet) => bet.status === 'won').length,
      affiliateCode: user.affiliateCode,
    };

    res.json(stats);
  } catch (error) {
    next(error);
  }
};