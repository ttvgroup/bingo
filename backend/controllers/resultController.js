const Result = require('../models/Result');
const lotteryService = require('../services/lotteryService');
const redisClient = require('../config/redis');
const ApiError = require('../utils/error');
const config = require('../config');
const logger = require('../utils/logger');
const { asyncHandler } = require('../utils/helper');
const resultService = require('../services/resultService');

/**
 * Thêm kết quả xổ số mới với cấu trúc mới
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
exports.addResult = async (req, res, next) => {
  try {
    const { date, weekday, region, provinces } = req.body;
    
    // Validate date và weekday
    if (!date || !weekday) {
      throw new ApiError(400, 'Ngày và thứ không được bỏ trống');
    }

    // Validate provinces
    if (!provinces || !Array.isArray(provinces) || provinces.length === 0) {
      throw new ApiError(400, 'Cần cung cấp thông tin ít nhất một tỉnh/thành');
    }

    // Validate mỗi province
    for (const province of provinces) {
      if (!province.name || !province.code || !province.results) {
        throw new ApiError(400, 'Thông tin tỉnh/thành không hợp lệ');
      }
      
      const results = province.results;
      
      // Validate kết quả các giải
      if (!/^[0-9]{2}$/.test(results.eighth)) {
        throw new ApiError(400, `Giải 8 của ${province.name} không hợp lệ`);
      }
      
      if (!/^[0-9]{3}$/.test(results.seventh)) {
        throw new ApiError(400, `Giải 7 của ${province.name} không hợp lệ`);
      }
      
      if (!Array.isArray(results.sixth) || results.sixth.length !== 3 || 
          !results.sixth.every(num => /^[0-9]{4}$/.test(num))) {
        throw new ApiError(400, `Giải 6 của ${province.name} không hợp lệ`);
      }
      
      if (!/^[0-9]{4}$/.test(results.fifth)) {
        throw new ApiError(400, `Giải 5 của ${province.name} không hợp lệ`);
      }
      
      if (!Array.isArray(results.fourth) || results.fourth.length !== 7 ||
          !results.fourth.every(num => /^[0-9]{5}$/.test(num))) {
        throw new ApiError(400, `Giải 4 của ${province.name} không hợp lệ`);
      }
      
      if (!Array.isArray(results.third) || results.third.length !== 2 ||
          !results.third.every(num => /^[0-9]{5}$/.test(num))) {
        throw new ApiError(400, `Giải 3 của ${province.name} không hợp lệ`);
      }
      
      if (!/^[0-9]{5}$/.test(results.second)) {
        throw new ApiError(400, `Giải 2 của ${province.name} không hợp lệ`);
      }
      
      if (!/^[0-9]{5}$/.test(results.first)) {
        throw new ApiError(400, `Giải 1 của ${province.name} không hợp lệ`);
      }
      
      if (!/^[0-9]{6}$/.test(results.special)) {
        throw new ApiError(400, `Giải đặc biệt của ${province.name} không hợp lệ`);
      }
    }

    const result = new Result({
      date: new Date(date),
      weekday,
      region: region || 'Miền Nam',
      provinces
    });
    
    await result.save();

    // Cache result
    try {
      await redisClient.setEx('latest_result', config.cacheExpiry, JSON.stringify(result));
    } catch (redisErr) {
      logger.error('Failed to cache result:', redisErr);
    }

    // Process bets and notify
    await lotteryService.checkResults(result._id);

    // Notify result to Telegram channel
    await lotteryService.notifyResult(result);

    res.status(201).json({ message: 'Thêm kết quả thành công', result });
  } catch (error) {
    logger.error('Error adding result:', error);
    next(error);
  }
};

// Lấy kết quả xổ số mới nhất
exports.getLatestResult = asyncHandler(async (req, res) => {
  const result = await Result.findOne().sort({ date: -1 });
  if (!result) {
    throw new ApiError(404, 'Không có kết quả nào');
  }
  res.json(result);
});

// Lấy kết quả xổ số theo ID
exports.getResultById = asyncHandler(async (req, res) => {
  const result = await Result.findById(req.params.id);
  if (!result) {
    throw new ApiError(404, 'Không tìm thấy kết quả');
  }
  res.json(result);
});

// Lấy kết quả xổ số theo ngày
exports.getResultByDate = asyncHandler(async (req, res) => {
  const { date } = req.params;
  const result = await Result.findOne({ date: new Date(date) });
  if (!result) {
    throw new ApiError(404, 'Không tìm thấy kết quả cho ngày này');
  }
  res.json(result);
});

// Tạo kết quả xổ số mới
exports.createResult = asyncHandler(async (req, res) => {
  const result = await Result.create(req.body);
  res.status(201).json(result);
});

// Cập nhật kết quả xổ số
exports.updateResult = asyncHandler(async (req, res) => {
  const result = await Result.findByIdAndUpdate(req.params.id, req.body, {
    new: true,
    runValidators: true
  });
  if (!result) {
    throw new ApiError(404, 'Không tìm thấy kết quả');
  }
  res.json(result);
});

// Xóa kết quả xổ số
exports.deleteResult = asyncHandler(async (req, res) => {
  const result = await Result.findByIdAndDelete(req.params.id);
  if (!result) {
    throw new ApiError(404, 'Không tìm thấy kết quả');
  }
  res.json({ message: 'Đã xóa kết quả' });
});

// Lọc kết quả xổ số theo chữ số cuối
exports.filterByLastDigit = asyncHandler(async (req, res) => {
  const { resultId } = req.params;
  const { digit } = req.query;
  
  if (!digit || isNaN(parseInt(digit))) {
    throw new ApiError(400, 'Cần cung cấp chữ số cuối hợp lệ');
  }

  const filteredResult = await resultService.filterByLastDigit(
    resultId !== 'latest' ? resultId : null,
    parseInt(digit)
  );

  res.json(filteredResult);
});

// Lọc kết quả xổ số theo nhiều chữ số cuối
exports.filterByMultipleLastDigits = asyncHandler(async (req, res) => {
  const { resultId } = req.params;
  const { digits } = req.query;
  
  if (!digits) {
    throw new ApiError(400, 'Cần cung cấp ít nhất một chữ số cuối');
  }

  // Chuyển đổi chuỗi digits thành mảng các số
  const digitArray = digits.split(',').map(d => parseInt(d.trim())).filter(d => !isNaN(d));
  
  if (digitArray.length === 0) {
    throw new ApiError(400, 'Cần cung cấp ít nhất một chữ số cuối hợp lệ');
  }

  const filteredResult = await resultService.filterByMultipleLastDigits(
    resultId !== 'latest' ? resultId : null,
    digitArray
  );

  res.json(filteredResult);
});

// Lấy thống kê tần suất xuất hiện của các chữ số cuối
exports.getLastDigitFrequency = asyncHandler(async (req, res) => {
  const { days } = req.query;
  const daysNumber = days ? parseInt(days) : 7;
  
  if (isNaN(daysNumber) || daysNumber <= 0) {
    throw new ApiError(400, 'Số ngày phải là số nguyên dương');
  }

  const frequency = await resultService.getLastDigitFrequency(daysNumber);
  res.json(frequency);
});