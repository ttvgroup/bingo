const Result = require('../models/Result');
const lotteryService = require('../services/lotteryService');
const redisClient = require('../config/redis');
const ApiError = require('../utils/error');
const config = require('../config');
const logger = require('../utils/logger');
const resultService = require('../services/resultService');
const asyncHandler = require('../utils/asyncHandler');

/**
 * Thêm kết quả xổ số mới với cấu trúc mới
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
exports.addResult = asyncHandler(async (req, res, next) => {
  const { date, weekday, region, provinces } = req.body;
  
  // Validate date và weekday
  if (!date || !weekday) {
    throw new ApiError('Ngày và thứ không được bỏ trống', 400);
  }

  // Validate provinces
  if (!provinces || !Array.isArray(provinces) || provinces.length === 0) {
    throw new ApiError('Cần cung cấp thông tin ít nhất một tỉnh/thành', 400);
  }

  // Validate mỗi province
  for (const province of provinces) {
    if (!province.name || !province.code || !province.results) {
      throw new ApiError('Thông tin tỉnh/thành không hợp lệ', 400);
    }
    
    const results = province.results;
    
    // Validate kết quả các giải
    if (!/^[0-9]{2}$/.test(results.eighth)) {
      throw new ApiError(`Giải 8 của ${province.name} không hợp lệ`, 400);
    }
    
    if (!/^[0-9]{3}$/.test(results.seventh)) {
      throw new ApiError(`Giải 7 của ${province.name} không hợp lệ`, 400);
    }
    
    if (!Array.isArray(results.sixth) || results.sixth.length !== 3 || 
        !results.sixth.every(num => /^[0-9]{4}$/.test(num))) {
      throw new ApiError(`Giải 6 của ${province.name} không hợp lệ`, 400);
    }
    
    if (!/^[0-9]{4}$/.test(results.fifth)) {
      throw new ApiError(`Giải 5 của ${province.name} không hợp lệ`, 400);
    }
    
    if (!Array.isArray(results.fourth) || results.fourth.length !== 7 ||
        !results.fourth.every(num => /^[0-9]{5}$/.test(num))) {
      throw new ApiError(`Giải 4 của ${province.name} không hợp lệ`, 400);
    }
    
    if (!Array.isArray(results.third) || results.third.length !== 2 ||
        !results.third.every(num => /^[0-9]{5}$/.test(num))) {
      throw new ApiError(`Giải 3 của ${province.name} không hợp lệ`, 400);
    }
    
    if (!/^[0-9]{5}$/.test(results.second)) {
      throw new ApiError(`Giải 2 của ${province.name} không hợp lệ`, 400);
    }
    
    if (!/^[0-9]{5}$/.test(results.first)) {
      throw new ApiError(`Giải 1 của ${province.name} không hợp lệ`, 400);
    }
    
    if (!/^[0-9]{6}$/.test(results.special)) {
      throw new ApiError(`Giải đặc biệt của ${province.name} không hợp lệ`, 400);
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

  res.status(201).json({ 
    success: true,
    message: 'Thêm kết quả thành công', 
    result 
  });
});

/**
 * Lấy danh sách kết quả mới nhất
 * @route GET /api/results
 * @access Public
 */
exports.getLatestResults = asyncHandler(async (req, res, next) => {
  const { limit = 10, page = 1, region, date, province } = req.query;
  
  // Xây dựng query
  const query = {};
  
  if (region) {
    query.region = region;
  }
  
  if (date) {
    // Nếu date được cung cấp, lấy kết quả của ngày cụ thể
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);
    
    query.date = {
      $gte: startOfDay,
      $lte: endOfDay
    };
  }
  
  if (province) {
    query['provinces.code'] = province;
  }
  
  // Thực hiện truy vấn với phân trang
  const options = {
    page: parseInt(page, 10),
    limit: parseInt(limit, 10),
    sort: { date: -1 }
  };
  
  const results = await Result.find(query)
    .sort(options.sort)
    .skip((options.page - 1) * options.limit)
    .limit(options.limit);
  
  const total = await Result.countDocuments(query);
  
  res.status(200).json({
    success: true,
    count: results.length,
    total,
    totalPages: Math.ceil(total / options.limit),
    currentPage: options.page,
    results
  });
});

/**
 * Lấy kết quả xổ số mới nhất
 * @route GET /api/results/latest
 * @access Public
 */
exports.getLatestResult = asyncHandler(async (req, res, next) => {
  const result = await Result.findOne().sort({ date: -1 });
  if (!result) {
    throw new ApiError('Không có kết quả nào', 404);
  }
  
  res.status(200).json({
    success: true,
    result
  });
});

/**
 * Lấy kết quả xổ số theo ID
 * @route GET /api/results/:id
 * @access Public
 */
exports.getResultById = asyncHandler(async (req, res, next) => {
  const result = await Result.findById(req.params.id);
  if (!result) {
    throw new ApiError('Không tìm thấy kết quả', 404);
  }
  
  res.status(200).json({
    success: true,
    result
  });
});

/**
 * Lấy kết quả xổ số theo ngày
 * @route GET /api/results/date/:date
 * @access Public
 */
exports.getResultsByDate = asyncHandler(async (req, res, next) => {
  const { date } = req.params;
  
  // Tạo đối tượng Date từ tham số
  const searchDate = new Date(date);
  
  // Kiểm tra xem ngày có hợp lệ không
  if (isNaN(searchDate.getTime())) {
    throw new ApiError('Định dạng ngày không hợp lệ', 400);
  }
  
  // Tạo khoảng thời gian cho ngày (từ 00:00:00 đến 23:59:59)
  const startOfDay = new Date(searchDate);
  startOfDay.setHours(0, 0, 0, 0);
  
  const endOfDay = new Date(searchDate);
  endOfDay.setHours(23, 59, 59, 999);
  
  // Tìm kết quả trong khoảng thời gian
  const results = await Result.find({
    date: {
      $gte: startOfDay,
      $lte: endOfDay
    }
  });
  
  if (results.length === 0) {
    throw new ApiError('Không tìm thấy kết quả cho ngày này', 404);
  }
  
  res.status(200).json({
    success: true,
    count: results.length,
    results
  });
});

/**
 * Lấy kết quả xổ số theo tỉnh
 * @route GET /api/results/province/:province
 * @access Public
 */
exports.getResultsByProvince = asyncHandler(async (req, res, next) => {
  const { province } = req.params;
  const { limit = 10, page = 1 } = req.query;
  
  // Thực hiện truy vấn với phân trang
  const options = {
    page: parseInt(page, 10),
    limit: parseInt(limit, 10),
    sort: { date: -1 }
  };
  
  const results = await Result.find({
    'provinces.code': province
  })
    .sort(options.sort)
    .skip((options.page - 1) * options.limit)
    .limit(options.limit);
  
  if (results.length === 0) {
    throw new ApiError('Không tìm thấy kết quả cho tỉnh này', 404);
  }
  
  const total = await Result.countDocuments({
    'provinces.code': province
  });
  
  res.status(200).json({
    success: true,
    count: results.length,
    total,
    totalPages: Math.ceil(total / options.limit),
    currentPage: options.page,
    results
  });
});

/**
 * Tạo kết quả xổ số mới
 * @route POST /api/admin/results
 * @access Admin
 */
exports.createResult = asyncHandler(async (req, res, next) => {
  // Tạo kết quả xổ số
  const result = await Result.create({
    ...req.body,
    createdBy: req.adminUser._id
  });
  
  // Kiểm tra kết quả với các cược hiện có
  const betsSummary = await lotteryService.checkResults(result._id);
  
  res.status(201).json({
    success: true,
    result,
    betsSummary
  });
});

/**
 * Lấy danh sách kết quả xổ số (admin)
 * @route GET /api/admin/results
 * @access Admin
 */
exports.getAdminResults = asyncHandler(async (req, res, next) => {
  const { limit = 10, page = 1, region, date, province } = req.query;
  
  // Xây dựng query
  const query = {};
  
  if (region) {
    query.region = region;
  }
  
  if (date) {
    // Nếu date được cung cấp, lấy kết quả của ngày cụ thể
    const startOfDay = new Date(date);
    startOfDay.setHours(0, 0, 0, 0);
    
    const endOfDay = new Date(date);
    endOfDay.setHours(23, 59, 59, 999);
    
    query.date = {
      $gte: startOfDay,
      $lte: endOfDay
    };
  }
  
  if (province) {
    query['provinces.code'] = province;
  }
  
  // Thực hiện truy vấn với phân trang
  const options = {
    page: parseInt(page, 10),
    limit: parseInt(limit, 10),
    sort: { date: -1 }
  };
  
  const results = await Result.find(query)
    .populate('createdBy', 'telegramId username')
    .populate('updatedBy', 'telegramId username')
    .sort(options.sort)
    .skip((options.page - 1) * options.limit)
    .limit(options.limit);
  
  const total = await Result.countDocuments(query);
  
  res.status(200).json({
    success: true,
    count: results.length,
    total,
    totalPages: Math.ceil(total / options.limit),
    currentPage: options.page,
    results
  });
});

/**
 * Lấy chi tiết kết quả xổ số (admin)
 * @route GET /api/admin/results/:id
 * @access Admin
 */
exports.getAdminResultById = asyncHandler(async (req, res, next) => {
  const result = await Result.findById(req.params.id)
    .populate('createdBy', 'telegramId username')
    .populate('updatedBy', 'telegramId username');
  
  if (!result) {
    throw new ApiError('Không tìm thấy kết quả', 404);
  }
  
  res.status(200).json({
    success: true,
    result
  });
});

/**
 * Cập nhật kết quả xổ số
 * @route PUT /api/admin/results/:id
 * @access Admin
 */
exports.updateResult = asyncHandler(async (req, res, next) => {
  const resultId = req.params.id;
  const { provinces } = req.body;
  
  // Tìm kết quả cần cập nhật
  const result = await Result.findById(resultId);
  
  if (!result) {
    throw new ApiError('Không tìm thấy kết quả', 404);
  }
  
  // Validate provinces nếu có
  if (provinces) {
    if (!Array.isArray(provinces) || provinces.length === 0) {
      throw new ApiError('Cần cung cấp thông tin ít nhất một tỉnh/thành', 400);
    }
    
    // Validate mỗi province
    for (const province of provinces) {
      if (!province.name || !province.code || !province.results) {
        throw new ApiError('Thông tin tỉnh/thành không hợp lệ', 400);
      }
      
      const results = province.results;
      
      // Validate kết quả các giải
      if (results.eighth && !/^[0-9]{2}$/.test(results.eighth)) {
        throw new ApiError(`Giải 8 của ${province.name} không hợp lệ`, 400);
      }
      
      if (results.seventh && !/^[0-9]{3}$/.test(results.seventh)) {
        throw new ApiError(`Giải 7 của ${province.name} không hợp lệ`, 400);
      }
      
      if (results.sixth && (!Array.isArray(results.sixth) || 
          !results.sixth.every(num => /^[0-9]{4}$/.test(num)))) {
        throw new ApiError(`Giải 6 của ${province.name} không hợp lệ`, 400);
      }
      
      if (results.fifth && !/^[0-9]{4}$/.test(results.fifth)) {
        throw new ApiError(`Giải 5 của ${province.name} không hợp lệ`, 400);
      }
      
      if (results.fourth && (!Array.isArray(results.fourth) ||
          !results.fourth.every(num => /^[0-9]{5}$/.test(num)))) {
        throw new ApiError(`Giải 4 của ${province.name} không hợp lệ`, 400);
      }
      
      if (results.third && (!Array.isArray(results.third) ||
          !results.third.every(num => /^[0-9]{5}$/.test(num)))) {
        throw new ApiError(`Giải 3 của ${province.name} không hợp lệ`, 400);
      }
      
      if (results.second && !/^[0-9]{5}$/.test(results.second)) {
        throw new ApiError(`Giải 2 của ${province.name} không hợp lệ`, 400);
      }
      
      if (results.first && !/^[0-9]{5}$/.test(results.first)) {
        throw new ApiError(`Giải 1 của ${province.name} không hợp lệ`, 400);
      }
      
      if (results.special && !/^[0-9]{6}$/.test(results.special)) {
        throw new ApiError(`Giải đặc biệt của ${province.name} không hợp lệ`, 400);
      }
    }
    
    // Cập nhật provinces
    result.provinces = provinces;
  }
  
  // Cập nhật các trường khác nếu có
  if (req.body.date) result.date = new Date(req.body.date);
  if (req.body.weekday) result.weekday = req.body.weekday;
  if (req.body.region) result.region = req.body.region;
  
  // Cập nhật thông tin người chỉnh sửa
  result.updatedBy = req.adminUser._id;
  result.updatedAt = new Date();
  
  // Lưu kết quả đã cập nhật
  await result.save();
  
  // Kiểm tra lại kết quả với các cược hiện có
  const betsSummary = await lotteryService.checkResults(result._id);
  
  // Cache kết quả mới
  try {
    if (new Date(result.date).toDateString() === new Date().toDateString()) {
      await redisClient.setEx('latest_result', config.cacheExpiry, JSON.stringify(result));
    }
  } catch (redisErr) {
    logger.error('Failed to cache result:', redisErr);
  }
  
  res.status(200).json({
    success: true,
    message: 'Cập nhật kết quả thành công',
    result,
    betsSummary
  });
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
  // Tạo kết quả xổ số
  const result = await Result.create(req.body);
  
  // Kiểm tra kết quả với các cược hiện có
  const betsSummary = await lotteryService.checkResults(result._id);
  
  res.status(201).json({
    message: 'Đã tạo kết quả xổ số thành công',
    result,
    betsSummary
  });
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