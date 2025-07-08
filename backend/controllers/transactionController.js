const Transaction = require('../models/Transaction');
const User = require('../models/User');
const redis = require('redis');
const config = require('../config');

const redisClient = redis.createClient({ url: config.redisUrl });

redisClient.on('error', (err) => console.error('Redis Client Error:', err));
redisClient.connect().catch((err) => console.error('Redis connection failed:', err));

exports.createTransaction = async (req, res) => {
  try {
    const { type, amount } = req.body;
    const telegramId = req.user.id;

    if (!['deposit', 'withdraw'].includes(type)) {
      return res.status(400).json({ message: 'Invalid transaction type' });
    }
    if (amount <= 0) {
      return res.status(400).json({ message: 'Invalid amount' });
    }

    const user = await User.findOne({ telegramId });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    if (type === 'withdraw' && user.balance < amount) {
      return res.status(400).json({ message: 'Insufficient balance' });
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

    res.status(201).json({ message: 'Transaction created successfully', transaction, balance: user.balance });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getTransactionHistory = async (req, res) => {
  try {
    const telegramId = req.user.id;
    const user = await User.findOne({ telegramId });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }

    const transactions = await Transaction.find({ userId: user._id }).sort({ createdAt: -1 });
    res.json({ transactions, balance: user.balance });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.approveTransaction = async (req, res) => {
  try {
    const { transactionId } = req.params;
    const transaction = await Transaction.findById(transactionId).populate('userId');
    if (!transaction) {
      return res.status(404).json({ message: 'Transaction not found' });
    }

    transaction.status = 'completed';
    await transaction.save();

    // Update user cache in Redis with 1-hour TTL
    try {
      await redisClient.setEx(`user:${transaction.userId.telegramId}`, 3600, JSON.stringify(transaction.userId));
    } catch (redisErr) {
      console.error('Failed to cache user in Redis:', redisErr);
    }

    res.json({ message: 'Transaction approved', transaction });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};