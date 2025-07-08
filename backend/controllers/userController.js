const User = require('../models/User');
const redisClient = require('../config/redis');
const ApiError = require('../utils/error');

// Đổi tên từ registerUser thành register để phù hợp với routes
exports.register = async (req, res, next) => {
  try {
    const { telegramId, username, affiliateCode } = req.body;

    // Check if user already exists
    let user = await User.findOne({ telegramId });
    if (user) {
      throw new ApiError(400, 'User already exists');
    }

    // Validate affiliate code
    let referredBy = null;
    if (affiliateCode) {
      const affiliate = await User.findOne({ affiliateCode, role: 'affiliate' });
      if (!affiliate) {
        throw new ApiError(400, 'Invalid affiliate code');
      }
      referredBy = affiliate._id;
    }

    // Create new user
    user = new User({
      telegramId,
      username,
      referredBy,
    });
    await user.save();

    // Cache user data
    try {
      await redisClient.setEx(`user:${telegramId}`, 3600, JSON.stringify(user));
    } catch (redisErr) {
      console.error('Failed to cache user:', redisErr);
    }

    res.status(201).json({ message: 'User registered successfully', user });
  } catch (error) {
    next(error);
  }
};

// Thêm các hàm còn thiếu để phù hợp với routes
exports.login = async (req, res, next) => {
  try {
    const { telegramId } = req.body;
    const user = await User.findOne({ telegramId });
    
    if (!user) {
      throw new ApiError(404, 'User not found');
    }
    
    res.status(200).json({ message: 'Login successful', user });
  } catch (error) {
    next(error);
  }
};

exports.getProfile = async (req, res, next) => {
  try {
    const telegramId = req.user.id;
    const user = await User.findOne({ telegramId });
    
    if (!user) {
      throw new ApiError(404, 'User not found');
    }
    
    res.status(200).json({ user });
  } catch (error) {
    next(error);
  }
};

exports.updateProfile = async (req, res, next) => {
  try {
    const telegramId = req.user.id;
    const { username } = req.body;
    
    const user = await User.findOneAndUpdate(
      { telegramId }, 
      { username }, 
      { new: true }
    );
    
    if (!user) {
      throw new ApiError(404, 'User not found');
    }
    
    // Update cache
    try {
      await redisClient.setEx(`user:${telegramId}`, 3600, JSON.stringify(user));
    } catch (redisErr) {
      console.error('Failed to update user cache:', redisErr);
    }
    
    res.status(200).json({ message: 'Profile updated successfully', user });
  } catch (error) {
    next(error);
  }
};

// Thêm hàm getUser và createUser từ userRoutes.js
exports.getUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id);
    
    if (!user) {
      throw new ApiError(404, 'User not found');
    }
    
    res.status(200).json({ user });
  } catch (error) {
    next(error);
  }
};

exports.createUser = async (req, res, next) => {
  try {
    const { telegramId, username } = req.body;
    
    // Check if user exists
    let user = await User.findOne({ telegramId });
    if (user) {
      throw new ApiError(400, 'User already exists');
    }
    
    user = new User({
      telegramId,
      username,
    });
    
    await user.save();
    
    res.status(201).json({ message: 'User created successfully', user });
  } catch (error) {
    next(error);
  }
};