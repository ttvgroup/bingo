const User = require('../models/User');
const Result = require('../models/Result');
const Transaction = require('../models/Transaction');
const ApiError = require('../utils/error');
const path = require('path');
const fs = require('fs').promises;

exports.assignAdminRole = async (req, res, next) => {
  try {
    const { userId } = req.body;

    if (!userId) {
      throw new ApiError(400, 'Vui lòng cung cấp ID người dùng');
    }

    const user = await User.findById(userId);
    if (!user) {
      throw new ApiError(404, 'Không tìm thấy người dùng');
    }

    user.role = 'admin';
    await user.save();

    res.json({ message: 'Đã cấp quyền admin thành công', user });
  } catch (error) {
    next(error);
  }
};

exports.getAllResults = async (req, res, next) => {
  try {
    const { page = 1, limit = 10 } = req.query;
    const skip = (page - 1) * limit;

    const results = await Result.find()
      .sort({ date: -1 })
      .skip(skip)
      .limit(Number(limit));

    const total = await Result.countDocuments();

    res.json({
      results,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (error) {
    next(error);
  }
};

exports.getAllTransactions = async (req, res, next) => {
  try {
    const { page = 1, limit = 10, status } = req.query;
    const skip = (page - 1) * limit;

    const query = status ? { status } : {};

    const transactions = await Transaction.find(query)
      .populate('userId', 'telegramUsername telegramId')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(Number(limit));

    const total = await Transaction.countDocuments(query);

    res.json({
      transactions,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      total
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Cập nhật cấu trúc xổ số hàng tuần
 */
exports.updateWeeklyStructure = async (req, res, next) => {
  try {
    const { days, schema } = req.body;
    
    if (!days || !Array.isArray(days)) {
      throw new ApiError(400, 'Dữ liệu không hợp lệ. Cần cung cấp mảng "days"');
    }
    
    // Kiểm tra từng ngày
    for (const day of days) {
      if (!day.weekday || !day.provinces || !Array.isArray(day.provinces)) {
        throw new ApiError(400, 'Cấu trúc dữ liệu không hợp lệ');
      }
      
      // Kiểm tra tỉnh/thành phố trong mỗi ngày
      for (const province of day.provinces) {
        if (!province.name || !province.code) {
          throw new ApiError(400, `Thiếu thông tin tỉnh/thành phố trong ${day.weekday}`);
        }
      }
    }
    
    // Kiểm tra schema
    if (!schema || !schema.prizes || !schema.betTypes) {
      throw new ApiError(400, 'Thiếu thông tin schema');
    }
    
    const filePath = path.join(__dirname, '..', 'data', 'weekly_kqxs.json');
    
    // Tạo backup trước khi cập nhật
    try {
      const currentData = await fs.readFile(filePath, 'utf8');
      const backupPath = path.join(__dirname, '..', 'data', `weekly_kqxs_backup_${Date.now()}.json`);
      await fs.writeFile(backupPath, currentData);
    } catch (err) {
      console.error('Không thể tạo backup:', err);
    }
    
    // Ghi file mới
    const newData = JSON.stringify({ days, schema }, null, 2);
    await fs.writeFile(filePath, newData);
    
    res.json({ message: 'Đã cập nhật cấu trúc xổ số hàng tuần thành công' });
  } catch (error) {
    next(error);
  }
};