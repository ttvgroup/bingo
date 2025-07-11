const Transaction = require('../models/Transaction');
const User = require('../models/User');
const ApiError = require('../utils/error');
const config = require('../config');
const asyncHandler = require('../utils/asyncHandler');
const redisClient = require('../config/redis');

/**
 * Tạo giao dịch mới
 * @route POST /api/transactions
 * @access Private
 */
exports.createTransaction = asyncHandler(async (req, res, next) => {
  const { type, amount } = req.body;
  const telegramId = req.user.id;

  if (!['deposit', 'withdraw'].includes(type)) {
    throw new ApiError('Invalid transaction type', 400);
  }
  if (amount <= 0) {
    throw new ApiError('Invalid amount', 400);
  }

  const user = await User.findOne({ telegramId });
  if (!user) {
    throw new ApiError('User not found', 404);
  }

  if (type === 'withdraw' && user.balance < amount) {
    throw new ApiError('Insufficient balance', 400);
  }

  const transaction = new Transaction({
    userId: user._id,
    type,
    amount,
  });
  await transaction.save();

  if (type === 'deposit') {
    user.balance += amount;
  } else if (type === 'withdraw') {
    user.balance -= amount;
  }
  await user.save();

  // Update user cache in Redis with 1-hour TTL
  try {
    await redisClient.setEx(`user:${telegramId}`, 3600, JSON.stringify(user));
  } catch (redisErr) {
    console.error('Failed to cache user in Redis:', redisErr);
  }

  res.status(201).json({ 
    success: true,
    transaction, 
    balance: user.balance 
  });
});

/**
 * Lấy lịch sử giao dịch của người dùng
 * @route GET /api/transactions
 * @access Private
 */
exports.getUserTransactions = asyncHandler(async (req, res, next) => {
  const telegramId = req.user.id;
  const { page = 1, limit = 10, type } = req.query;
  
  const user = await User.findOne({ telegramId });
  if (!user) {
    throw new ApiError('User not found', 404);
  }

  // Xây dựng query
  const query = { userId: user._id };
  if (type && ['deposit', 'withdraw', 'win', 'bet', 'referral'].includes(type)) {
    query.type = type;
  }

  // Thực hiện truy vấn với phân trang
  const options = {
    page: parseInt(page, 10),
    limit: parseInt(limit, 10),
    sort: { createdAt: -1 }
  };

  const transactions = await Transaction.find(query)
    .sort(options.sort)
    .skip((options.page - 1) * options.limit)
    .limit(options.limit);

  const total = await Transaction.countDocuments(query);

  res.status(200).json({
    success: true,
    count: transactions.length,
    total,
    totalPages: Math.ceil(total / options.limit),
    currentPage: options.page,
    transactions,
    balance: user.balance
  });
});

/**
 * Lấy chi tiết giao dịch của người dùng
 * @route GET /api/transactions/:id
 * @access Private
 */
exports.getUserTransactionById = asyncHandler(async (req, res, next) => {
  const telegramId = req.user.id;
  const transactionId = req.params.id;
  
  const user = await User.findOne({ telegramId });
  if (!user) {
    throw new ApiError('User not found', 404);
  }

  const transaction = await Transaction.findOne({
    _id: transactionId,
    userId: user._id
  });

  if (!transaction) {
    throw new ApiError('Transaction not found', 404);
  }

  res.status(200).json({
    success: true,
    transaction
  });
});

/**
 * Phê duyệt giao dịch (admin)
 * @route PUT /api/admin/transactions/:id/status
 * @access Admin
 */
exports.updateTransactionStatus = asyncHandler(async (req, res, next) => {
  const { transactionId } = req.params;
  const { status } = req.body;
  
  if (!['pending', 'completed', 'failed', 'cancelled'].includes(status)) {
    throw new ApiError('Invalid status', 400);
  }

  const transaction = await Transaction.findById(transactionId).populate('userId');
  if (!transaction) {
    throw new ApiError('Transaction not found', 404);
  }

  transaction.status = status;
  transaction.processedBy = req.adminUser._id;
  transaction.processedAt = new Date();
  await transaction.save();

  // Cập nhật số dư người dùng nếu hoàn thành hoặc hủy
  if (status === 'completed' && transaction.status !== 'completed') {
    const user = await User.findById(transaction.userId);
    
    if (transaction.type === 'deposit') {
      user.balance += transaction.amount;
    } else if (transaction.type === 'withdraw') {
      user.balance -= transaction.amount;
    }
    
    await user.save();
    
    // Cập nhật cache Redis
    try {
      await redisClient.setEx(`user:${user.telegramId}`, 3600, JSON.stringify(user));
    } catch (redisErr) {
      console.error('Failed to cache user in Redis:', redisErr);
    }
  }

  res.status(200).json({
    success: true,
    transaction
  });
});

/**
 * Lấy danh sách giao dịch (admin)
 * @route GET /api/admin/transactions
 * @access Admin
 */
exports.getAdminTransactions = asyncHandler(async (req, res, next) => {
  const { page = 1, limit = 10, type, status, userId } = req.query;
  
  // Xây dựng query
  const query = {};
  
  if (type) {
    query.type = type;
  }
  
  if (status) {
    query.status = status;
  }
  
  if (userId) {
    query.userId = userId;
  }

  // Thực hiện truy vấn với phân trang
  const options = {
    page: parseInt(page, 10),
    limit: parseInt(limit, 10),
    sort: { createdAt: -1 }
  };

  const transactions = await Transaction.find(query)
    .populate('userId', 'telegramId username')
    .sort(options.sort)
    .skip((options.page - 1) * options.limit)
    .limit(options.limit);

  const total = await Transaction.countDocuments(query);

  res.status(200).json({
    success: true,
    count: transactions.length,
    total,
    totalPages: Math.ceil(total / options.limit),
    currentPage: options.page,
    transactions
  });
});

/**
 * Lấy chi tiết giao dịch (admin)
 * @route GET /api/admin/transactions/:id
 * @access Admin
 */
exports.getAdminTransactionById = asyncHandler(async (req, res, next) => {
  const transactionId = req.params.id;
  
  const transaction = await Transaction.findById(transactionId)
    .populate('userId', 'telegramId username balance')
    .populate('processedBy', 'telegramId username');

  if (!transaction) {
    throw new ApiError('Transaction not found', 404);
  }

  res.status(200).json({
    success: true,
    transaction
  });
});

/**
 * Cập nhật thông tin giao dịch (admin)
 * @route PUT /api/admin/transactions/:id
 * @access Admin
 */
exports.updateTransaction = asyncHandler(async (req, res, next) => {
  const transactionId = req.params.id;
  const { description, metaData } = req.body;
  
  const transaction = await Transaction.findById(transactionId);
  if (!transaction) {
    throw new ApiError('Transaction not found', 404);
  }

  // Chỉ cho phép cập nhật một số trường nhất định
  if (description) transaction.description = description;
  if (metaData) transaction.metaData = metaData;
  
  transaction.updatedAt = new Date();
  await transaction.save();

  res.status(200).json({
    success: true,
    transaction
  });
});