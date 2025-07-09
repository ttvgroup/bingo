const User = require('../models/User');
const redisClient = require('../config/redis');
const ApiError = require('../utils/error');
const jwt = require('jsonwebtoken');
const asyncHandler = require('../utils/asyncHandler');
const logger = require('../utils/logger');

/**
 * Lấy danh sách tất cả người dùng (chỉ dành cho admin)
 * @route GET /api/admin/users
 * @access Admin
 */
exports.getAllUsers = asyncHandler(async (req, res, next) => {
  const { page = 1, limit = 10, sort = '-createdAt', search = '' } = req.query;
  
  // Xây dựng query
  let query = {};
  
  if (search) {
    query = {
      $or: [
        { username: { $regex: search, $options: 'i' } },
        { telegramId: { $regex: search, $options: 'i' } }
      ]
    };
  }
  
  // Thực hiện truy vấn với phân trang
  const options = {
    page: parseInt(page, 10),
    limit: parseInt(limit, 10),
    sort: sort
  };
  
  const users = await User.find(query)
    .select('-telegramAuthCode -loginQrCode')
    .sort(options.sort)
    .skip((options.page - 1) * options.limit)
    .limit(options.limit);
  
  const total = await User.countDocuments(query);
  
  res.status(200).json({
    success: true,
    count: users.length,
    total,
    totalPages: Math.ceil(total / options.limit),
    currentPage: options.page,
    users
  });
});

/**
 * Lấy thông tin người dùng theo ID
 * @route GET /api/admin/users/:id
 * @access Admin
 */
exports.getUserById = asyncHandler(async (req, res, next) => {
  const user = await User.findById(req.params.id)
    .select('-telegramAuthCode -loginQrCode');
  
  if (!user) {
    throw new ApiError('Không tìm thấy người dùng', 404);
  }
  
  res.status(200).json({
    success: true,
    user
  });
});

/**
 * Cập nhật thông tin người dùng (chỉ dành cho admin)
 * @route PUT /api/admin/users/:id
 * @access Admin
 */
exports.updateUser = asyncHandler(async (req, res, next) => {
  const { role, balance, affiliateCode } = req.body;
  
  // Tìm người dùng
  const user = await User.findById(req.params.id);
  
  if (!user) {
    throw new ApiError('Không tìm thấy người dùng', 404);
  }
  
  // Cập nhật thông tin
  if (role) user.role = role;
  if (balance !== undefined) user.balance = balance;
  if (affiliateCode !== undefined) user.affiliateCode = affiliateCode;
  
  // Lưu thay đổi
  await user.save();
  
  res.status(200).json({
    success: true,
    user: {
      _id: user._id,
      telegramId: user.telegramId,
      username: user.username,
      balance: user.balance,
      role: user.role,
      affiliateCode: user.affiliateCode
    }
  });
});

/**
 * Đăng ký người dùng mới
 * @route POST /api/users/register
 * @access Public
 */
exports.register = asyncHandler(async (req, res, next) => {
  const { telegramId, username } = req.body;
  
  // Kiểm tra dữ liệu đầu vào
  if (!telegramId || !username) {
    throw new ApiError('Vui lòng cung cấp đầy đủ thông tin', 400);
  }
  
  // Kiểm tra xem người dùng đã tồn tại chưa
  let user = await User.findOne({ telegramId });
  
  if (user) {
    throw new ApiError('Người dùng đã tồn tại', 400);
  }
  
  // Tạo người dùng mới
  user = new User({
    telegramId,
    username,
    balance: 1000, // Số dư mặc định
    role: 'user'
  });
  
  // Lưu người dùng
  await user.save();
  
  // Tạo token JWT
  const token = jwt.sign(
    { id: user.telegramId },
    process.env.JWT_SECRET || 'your-secret-key',
    { expiresIn: '30d' }
  );
  
  res.status(201).json({
    success: true,
    token,
    user: {
      telegramId: user.telegramId,
      username: user.username,
      balance: user.balance,
      role: user.role
    }
  });
});

/**
 * Đăng nhập người dùng
 * @route POST /api/users/login
 * @access Public
 */
exports.login = asyncHandler(async (req, res, next) => {
  const { telegramId } = req.body;
  
  // Kiểm tra dữ liệu đầu vào
  if (!telegramId) {
    throw new ApiError('Vui lòng cung cấp Telegram ID', 400);
  }
  
  // Tìm người dùng
  const user = await User.findOne({ telegramId });
  
  if (!user) {
    throw new ApiError('Không tìm thấy người dùng', 404);
  }
  
  // Tạo token JWT
  const token = jwt.sign(
    { id: user.telegramId },
    process.env.JWT_SECRET || 'your-secret-key',
    { expiresIn: '30d' }
  );
  
  res.status(200).json({
    success: true,
    token,
    user: {
      telegramId: user.telegramId,
      username: user.username,
      balance: user.balance,
      role: user.role
    }
  });
});

/**
 * Lấy thông tin người dùng hiện tại
 * @route GET /api/users/me
 * @access Private
 */
exports.getMe = asyncHandler(async (req, res, next) => {
  const telegramId = req.user.id;
  
  const user = await User.findOne({ telegramId })
    .select('-telegramAuthCode -loginQrCode');
  
  if (!user) {
    throw new ApiError('Không tìm thấy người dùng', 404);
  }
  
  res.status(200).json({
    success: true,
    user
  });
});

/**
 * Cập nhật thông tin cá nhân
 * @route PUT /api/users/me
 * @access Private
 */
exports.updateMe = asyncHandler(async (req, res, next) => {
  const telegramId = req.user.id;
  const { username } = req.body;
  
  const user = await User.findOne({ telegramId });
  
  if (!user) {
    throw new ApiError('Không tìm thấy người dùng', 404);
  }
  
  if (username) {
    user.username = username;
  }
  
  await user.save();
  
  res.status(200).json({
    success: true,
    user: {
      telegramId: user.telegramId,
      username: user.username,
      balance: user.balance,
      role: user.role
    }
  });
});

/**
 * Làm mới token
 * @route GET /api/users/refresh
 * @access Private
 */
exports.refreshToken = asyncHandler(async (req, res, next) => {
  const telegramId = req.user.id;
  
  // Tạo token JWT mới
  const token = jwt.sign(
    { id: telegramId },
    process.env.JWT_SECRET || 'your-secret-key',
    { expiresIn: '30d' }
  );
  
  res.status(200).json({
    success: true,
    token
  });
});

/**
 * Tạo người dùng mới (chỉ dành cho admin)
 * @route POST /api/users
 * @access Private
 */
exports.createUser = asyncHandler(async (req, res, next) => {
  const { telegramId, username, balance, role } = req.body;
  
  // Kiểm tra dữ liệu đầu vào
  if (!telegramId || !username) {
    throw new ApiError('Vui lòng cung cấp đầy đủ thông tin', 400);
  }
  
  // Kiểm tra xem người dùng đã tồn tại chưa
  let user = await User.findOne({ telegramId });
  
  if (user) {
    throw new ApiError('Người dùng đã tồn tại', 400);
  }
  
  // Tạo người dùng mới
  user = new User({
    telegramId,
    username,
    balance: balance || 1000,
    role: role || 'user'
  });
  
  // Lưu người dùng
  await user.save();
  
  res.status(201).json({
    success: true,
    user: {
      telegramId: user.telegramId,
      username: user.username,
      balance: user.balance,
      role: user.role
    }
  });
});