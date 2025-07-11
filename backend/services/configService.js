const SystemConfig = require('../models/SystemConfig');
const redisClient = require('../config/redis');
const logger = require('../utils/logger');

// Cache key cho cấu hình hệ thống
const CONFIG_CACHE_KEY = 'system:config';
const CONFIG_CACHE_TTL = 300; // 5 phút

/**
 * Khởi tạo cấu hình mặc định nếu chưa có trong database
 */
exports.initDefaultConfigs = async () => {
  try {
    const defaultConfigs = [
      {
        key: SystemConfig.KEYS.BETTING_ENABLED,
        value: true,
        description: 'Trạng thái bật/tắt chức năng đặt cược'
      },
      {
        key: SystemConfig.KEYS.BETTING_HOURS_START,
        value: { hour: 0, minute: 1 }, // 00:01
        description: 'Thời gian bắt đầu cho phép đặt cược (giờ GMT+7)'
      },
      {
        key: SystemConfig.KEYS.BETTING_HOURS_END,
        value: { hour: 15, minute: 30 }, // 15:30
        description: 'Thời gian kết thúc cho phép đặt cược (giờ GMT+7)'
      },
      {
        key: SystemConfig.KEYS.DAILY_BET_LIMIT,
        value: 10000000, // 10 triệu VND
        description: 'Giới hạn đặt cược trong ngày'
      },
      {
        key: SystemConfig.KEYS.PAYOUT_RATIO_2D,
        value: 70,
        description: 'Tỉ lệ trả thưởng cho cược 2D'
      },
      {
        key: SystemConfig.KEYS.PAYOUT_RATIO_3D,
        value: 600,
        description: 'Tỉ lệ trả thưởng cho cược 3D'
      },
      {
        key: SystemConfig.KEYS.PAYOUT_RATIO_4D,
        value: 5000,
        description: 'Tỉ lệ trả thưởng cho cược 4D'
      },
      {
        key: SystemConfig.KEYS.MAINTENANCE_MODE,
        value: false,
        description: 'Chế độ bảo trì hệ thống'
      },
      // Thêm cấu hình mặc định cho hệ thống quota
      {
        key: SystemConfig.KEYS.QUOTA_ENABLED,
        value: true,
        description: 'Bật/tắt hệ thống quota cho từng số/loại cược'
      },
      {
        key: SystemConfig.KEYS.QUOTA_2D,
        value: 50000000, // 50 triệu VND
        description: 'Quota tổng cho mỗi loại cược 2D'
      },
      {
        key: SystemConfig.KEYS.QUOTA_3D,
        value: 20000000, // 20 triệu VND
        description: 'Quota tổng cho mỗi loại cược 3D'
      },
      {
        key: SystemConfig.KEYS.QUOTA_4D,
        value: 10000000, // 10 triệu VND
        description: 'Quota tổng cho mỗi loại cược 4D'
      },
      {
        key: SystemConfig.KEYS.QUOTA_BAO_LO_2D,
        value: 30000000, // 30 triệu VND
        description: 'Quota tổng cho mỗi loại cược Bao lô 2D'
      },
      {
        key: SystemConfig.KEYS.QUOTA_BAO_LO_3D,
        value: 15000000, // 15 triệu VND
        description: 'Quota tổng cho mỗi loại cược Bao lô 3D'
      },
      {
        key: SystemConfig.KEYS.QUOTA_BAO_LO_4D,
        value: 5000000, // 5 triệu VND
        description: 'Quota tổng cho mỗi loại cược Bao lô 4D'
      },
      {
        key: SystemConfig.KEYS.QUOTA_DEFAULT_PER_NUMBER,
        value: 10000000, // 10 triệu VND
        description: 'Quota mặc định cho mỗi số nếu không có cấu hình riêng'
      },
      {
        key: SystemConfig.KEYS.QUOTA_PER_NUMBER,
        value: {}, // Cấu hình trống ban đầu, sẽ được cập nhật sau
        description: 'Cấu hình quota riêng cho từng số (key: số, value: quota)'
      },
      {
        key: SystemConfig.KEYS.QUOTA_NOTIFICATION_THRESHOLD,
        value: 80, // 80%
        description: 'Ngưỡng % để thông báo sắp đạt quota'
      }
    ];

    for (const config of defaultConfigs) {
      // Chỉ tạo nếu chưa tồn tại
      const existingConfig = await SystemConfig.findOne({ key: config.key });
      if (!existingConfig) {
        await SystemConfig.create(config);
        logger.info(`Đã tạo cấu hình mặc định: ${config.key}`);
      }
    }

    // Cập nhật cache
    await this.refreshConfigCache();
  } catch (error) {
    logger.error('Lỗi khi khởi tạo cấu hình mặc định:', error);
  }
};

/**
 * Làm mới cache cấu hình
 */
exports.refreshConfigCache = async () => {
  try {
    const allConfigs = await SystemConfig.getAllConfigs();
    await redisClient.setEx(CONFIG_CACHE_KEY, CONFIG_CACHE_TTL, JSON.stringify(allConfigs));
    return allConfigs;
  } catch (error) {
    logger.error('Lỗi khi làm mới cache cấu hình:', error);
    return null;
  }
};

/**
 * Lấy tất cả cấu hình hệ thống
 */
exports.getAllConfigs = async () => {
  try {
    // Thử lấy từ cache trước
    const cachedConfigs = await redisClient.get(CONFIG_CACHE_KEY);
    if (cachedConfigs) {
      return JSON.parse(cachedConfigs);
    }

    // Nếu không có trong cache, lấy từ database và cập nhật cache
    return await this.refreshConfigCache();
  } catch (error) {
    logger.error('Lỗi khi lấy cấu hình hệ thống:', error);
    
    // Fallback: lấy trực tiếp từ database nếu có lỗi cache
    return await SystemConfig.getAllConfigs();
  }
};

/**
 * Lấy một cấu hình theo key
 * @param {String} key - Khóa cấu hình
 * @param {*} defaultValue - Giá trị mặc định nếu không tìm thấy
 */
exports.getConfig = async (key, defaultValue = null) => {
  try {
    const allConfigs = await this.getAllConfigs();
    return allConfigs && allConfigs[key] !== undefined ? allConfigs[key] : defaultValue;
  } catch (error) {
    logger.error(`Lỗi khi lấy cấu hình ${key}:`, error);
    
    // Fallback: lấy trực tiếp từ database
    return await SystemConfig.getConfig(key, defaultValue);
  }
};

/**
 * Cập nhật một cấu hình
 * @param {String} key - Khóa cấu hình
 * @param {*} value - Giá trị mới
 * @param {String} description - Mô tả (tùy chọn)
 * @param {ObjectId} updatedBy - ID người cập nhật
 */
exports.updateConfig = async (key, value, description = '', updatedBy = null) => {
  try {
    const updatedConfig = await SystemConfig.setConfig(key, value, description, updatedBy);
    
    // Cập nhật cache
    await this.refreshConfigCache();
    
    return updatedConfig;
  } catch (error) {
    logger.error(`Lỗi khi cập nhật cấu hình ${key}:`, error);
    throw error;
  }
};

/**
 * Kiểm tra trạng thái bật/tắt đặt cược
 */
exports.isBettingEnabled = async () => {
  return await this.getConfig(SystemConfig.KEYS.BETTING_ENABLED, true);
};

/**
 * Bật/tắt chức năng đặt cược
 * @param {Boolean} enabled - Trạng thái bật/tắt
 * @param {ObjectId} updatedBy - ID admin thực hiện thay đổi
 */
exports.toggleBetting = async (enabled, updatedBy = null) => {
  return await this.updateConfig(
    SystemConfig.KEYS.BETTING_ENABLED,
    enabled,
    `${enabled ? 'Bật' : 'Tắt'} chức năng đặt cược`,
    updatedBy
  );
};

/**
 * Kiểm tra thời gian đặt cược
 * @returns {Boolean} - true nếu trong thời gian cho phép đặt cược
 */
exports.isWithinBettingHours = async () => {
  // Nếu chức năng đặt cược bị tắt, luôn trả về false
  const bettingEnabled = await this.isBettingEnabled();
  if (!bettingEnabled) {
    return false;
  }

  // Lấy thời gian bắt đầu và kết thúc từ cấu hình
  const startConfig = await this.getConfig(SystemConfig.KEYS.BETTING_HOURS_START, { hour: 0, minute: 1 });
  const endConfig = await this.getConfig(SystemConfig.KEYS.BETTING_HOURS_END, { hour: 15, minute: 30 });

  // Chuyển đổi thành giờ GMT+7
  const now = new Date();
  const vietnamTime = new Date(now.getTime() + (7 * 60 * 60 * 1000)); // GMT+7
  
  const currentHour = vietnamTime.getUTCHours();
  const currentMinute = vietnamTime.getUTCMinutes();
  
  const startHour = startConfig.hour;
  const startMinute = startConfig.minute;
  const endHour = endConfig.hour;
  const endMinute = endConfig.minute;
  
  // Tính toán thời gian hiện tại, bắt đầu và kết thúc tính bằng phút
  const currentTimeInMinutes = currentHour * 60 + currentMinute;
  const startTimeInMinutes = startHour * 60 + startMinute;
  const endTimeInMinutes = endHour * 60 + endMinute;
  
  return currentTimeInMinutes >= startTimeInMinutes && currentTimeInMinutes <= endTimeInMinutes;
};

/**
 * Lấy thông tin thời gian đặt cược
 */
exports.getBettingHours = async () => {
  const startConfig = await this.getConfig(SystemConfig.KEYS.BETTING_HOURS_START, { hour: 0, minute: 1 });
  const endConfig = await this.getConfig(SystemConfig.KEYS.BETTING_HOURS_END, { hour: 15, minute: 30 });
  
  return {
    start: startConfig,
    end: endConfig
  };
};

/**
 * Cập nhật thời gian đặt cược
 * @param {Object} startTime - Thời gian bắt đầu { hour, minute }
 * @param {Object} endTime - Thời gian kết thúc { hour, minute }
 * @param {ObjectId} updatedBy - ID admin thực hiện thay đổi
 */
exports.updateBettingHours = async (startTime, endTime, updatedBy = null) => {
  // Kiểm tra dữ liệu đầu vào
  if (!startTime || !endTime || 
      typeof startTime.hour !== 'number' || typeof startTime.minute !== 'number' ||
      typeof endTime.hour !== 'number' || typeof endTime.minute !== 'number') {
    throw new Error('Định dạng thời gian không hợp lệ');
  }
  
  // Kiểm tra giá trị hợp lệ
  if (startTime.hour < 0 || startTime.hour > 23 || startTime.minute < 0 || startTime.minute > 59 ||
      endTime.hour < 0 || endTime.hour > 23 || endTime.minute < 0 || endTime.minute > 59) {
    throw new Error('Giá trị thời gian không hợp lệ');
  }
  
  // Cập nhật thời gian bắt đầu
  await this.updateConfig(
    SystemConfig.KEYS.BETTING_HOURS_START,
    startTime,
    `Cập nhật thời gian bắt đầu đặt cược: ${startTime.hour}:${startTime.minute}`,
    updatedBy
  );
  
  // Cập nhật thời gian kết thúc
  await this.updateConfig(
    SystemConfig.KEYS.BETTING_HOURS_END,
    endTime,
    `Cập nhật thời gian kết thúc đặt cược: ${endTime.hour}:${endTime.minute}`,
    updatedBy
  );
  
  return {
    start: startTime,
    end: endTime
  };
}; 

/**
 * Bật/tắt hệ thống quota
 * @param {Boolean} enabled - Trạng thái bật/tắt
 * @param {ObjectId} adminId - ID của admin thực hiện
 * @returns {Promise<Object>} - Cấu hình đã cập nhật
 */
exports.toggleQuota = async (enabled, adminId) => {
  return await SystemConfig.findOneAndUpdate(
    { key: SystemConfig.KEYS.QUOTA_ENABLED },
    {
      value: enabled,
      updatedBy: adminId,
      updatedAt: new Date()
    },
    { new: true, upsert: true }
  );
};

/**
 * Kiểm tra xem hệ thống quota có được bật không
 * @returns {Promise<Boolean>} - true nếu bật, false nếu tắt
 */
exports.isQuotaEnabled = async () => {
  return await exports.getConfig(SystemConfig.KEYS.QUOTA_ENABLED, false);
};

/**
 * Cập nhật quota cho số cụ thể
 * @param {String} number - Số cần cập nhật quota
 * @param {String} betType - Loại cược
 * @param {Number} quota - Quota mới
 * @param {ObjectId} adminId - ID của admin thực hiện
 * @returns {Promise<Object>} - Cấu hình đã cập nhật
 */
exports.updateQuotaForNumber = async (number, betType, quota, adminId) => {
  // Lấy cấu hình hiện tại
  const quotaPerNumber = await exports.getConfig(SystemConfig.KEYS.QUOTA_PER_NUMBER, {});
  
  // Tạo key duy nhất cho số và loại cược
  const key = `${number}_${betType}`;
  
  // Cập nhật hoặc thêm mới quota cho số này
  quotaPerNumber[key] = quota;
  
  // Lưu lại cấu hình
  return await SystemConfig.findOneAndUpdate(
    { key: SystemConfig.KEYS.QUOTA_PER_NUMBER },
    {
      value: quotaPerNumber,
      updatedBy: adminId,
      updatedAt: new Date()
    },
    { new: true, upsert: true }
  );
};

/**
 * Lấy quota cho số cụ thể
 * @param {String} number - Số cần lấy quota
 * @param {String} betType - Loại cược
 * @returns {Promise<Number>} - Quota cho số này
 */
exports.getQuotaForNumber = async (number, betType) => {
  // Lấy cấu hình quota riêng cho từng số
  const quotaPerNumber = await exports.getConfig(SystemConfig.KEYS.QUOTA_PER_NUMBER, {});
  
  // Tạo key duy nhất cho số và loại cược
  const key = `${number}_${betType}`;
  
  // Nếu có cấu hình riêng cho số này, trả về giá trị đó
  if (quotaPerNumber[key] !== undefined) {
    return quotaPerNumber[key];
  }
  
  // Nếu không, lấy quota mặc định cho loại cược
  let defaultQuotaKey;
  switch (betType) {
    case '2D':
      defaultQuotaKey = SystemConfig.KEYS.QUOTA_2D;
      break;
    case '3D':
      defaultQuotaKey = SystemConfig.KEYS.QUOTA_3D;
      break;
    case '4D':
      defaultQuotaKey = SystemConfig.KEYS.QUOTA_4D;
      break;
    case 'Bao lô 2D':
      defaultQuotaKey = SystemConfig.KEYS.QUOTA_BAO_LO_2D;
      break;
    case 'Bao lô 3D':
      defaultQuotaKey = SystemConfig.KEYS.QUOTA_BAO_LO_3D;
      break;
    case 'Bao lô 4D':
      defaultQuotaKey = SystemConfig.KEYS.QUOTA_BAO_LO_4D;
      break;
    default:
      return await exports.getConfig(SystemConfig.KEYS.QUOTA_DEFAULT_PER_NUMBER, 10000000);
  }
  
  return await exports.getConfig(defaultQuotaKey, 10000000);
};

/**
 * Lấy thống kê số tiền đặt cược theo từng số/loại cược
 * @param {String} date - Ngày cần thống kê (định dạng YYYY-MM-DD)
 * @returns {Promise<Object>} - Thống kê số tiền đặt cược
 */
exports.getBetStatsByNumber = async (date) => {
  const Bet = require('../models/Bet');
  
  // Tạo đối tượng Date từ chuỗi YYYY-MM-DD
  let startDate, endDate;
  
  if (date) {
    startDate = new Date(date);
    startDate.setHours(0, 0, 0, 0);
    
    endDate = new Date(date);
    endDate.setHours(23, 59, 59, 999);
  } else {
    // Nếu không có ngày, lấy thống kê của ngày hiện tại
    startDate = new Date();
    startDate.setHours(0, 0, 0, 0);
    
    endDate = new Date();
    endDate.setHours(23, 59, 59, 999);
  }
  
  // Lấy thống kê từ database
  const stats = await Bet.aggregate([
    {
      $match: {
        createdAt: { $gte: startDate, $lte: endDate },
        status: 'pending' // Chỉ lấy các cược đang chờ
      }
    },
    {
      $group: {
        _id: {
          numbers: '$numbers',
          betType: '$betType'
        },
        totalAmount: { $sum: '$amount' },
        count: { $sum: 1 }
      }
    },
    {
      $project: {
        _id: 0,
        numbers: '$_id.numbers',
        betType: '$_id.betType',
        totalAmount: 1,
        count: 1
      }
    },
    {
      $sort: { betType: 1, numbers: 1 }
    }
  ]);
  
  // Lấy quota cho từng số/loại cược
  const result = [];
  
  for (const stat of stats) {
    const quota = await exports.getQuotaForNumber(stat.numbers, stat.betType);
    const percentUsed = (stat.totalAmount / quota) * 100;
    
    result.push({
      numbers: stat.numbers,
      betType: stat.betType,
      totalAmount: stat.totalAmount,
      count: stat.count,
      quota,
      percentUsed: Math.min(percentUsed, 100).toFixed(2),
      remaining: Math.max(quota - stat.totalAmount, 0)
    });
  }
  
  return result;
};

/**
 * Lấy thống kê số tiền đặt cược theo từng số/loại cược có phân trang
 * @param {String} date - Ngày cần thống kê (định dạng YYYY-MM-DD)
 * @param {Number} page - Trang hiện tại
 * @param {Number} limit - Số lượng kết quả mỗi trang
 * @param {String} sortBy - Trường cần sắp xếp
 * @param {String} sortOrder - Thứ tự sắp xếp (asc/desc)
 * @param {String} betType - Lọc theo loại cược
 * @param {String} numbers - Lọc theo số
 * @returns {Promise<Object>} - Thống kê số tiền đặt cược có phân trang
 */
exports.getBetStatsByNumberPaginated = async (date, page = 1, limit = 10, sortBy = 'percentUsed', sortOrder = 'desc', betType = null, numbers = null) => {
  const Bet = require('../models/Bet');
  
  // Tạo đối tượng Date từ chuỗi YYYY-MM-DD
  let startDate, endDate;
  
  if (date) {
    startDate = new Date(date);
    startDate.setHours(0, 0, 0, 0);
    
    endDate = new Date(date);
    endDate.setHours(23, 59, 59, 999);
  } else {
    // Nếu không có ngày, lấy thống kê của ngày hiện tại
    startDate = new Date();
    startDate.setHours(0, 0, 0, 0);
    
    endDate = new Date();
    endDate.setHours(23, 59, 59, 999);
  }
  
  // Xây dựng điều kiện lọc
  const matchCondition = {
    createdAt: { $gte: startDate, $lte: endDate },
    status: 'pending' // Chỉ lấy các cược đang chờ
  };
  
  if (betType) {
    matchCondition.betType = betType;
  }
  
  if (numbers) {
    matchCondition.numbers = numbers;
  }
  
  // Lấy thống kê từ database
  const stats = await Bet.aggregate([
    {
      $match: matchCondition
    },
    {
      $group: {
        _id: {
          numbers: '$numbers',
          betType: '$betType'
        },
        totalAmount: { $sum: '$amount' },
        count: { $sum: 1 }
      }
    },
    {
      $project: {
        _id: 0,
        numbers: '$_id.numbers',
        betType: '$_id.betType',
        totalAmount: 1,
        count: 1
      }
    }
  ]);
  
  // Lấy quota và tính toán các giá trị khác
  const result = [];
  
  for (const stat of stats) {
    const quota = await exports.getQuotaForNumber(stat.numbers, stat.betType);
    const percentUsed = (stat.totalAmount / quota) * 100;
    
    result.push({
      numbers: stat.numbers,
      betType: stat.betType,
      totalAmount: stat.totalAmount,
      count: stat.count,
      quota,
      percentUsed: Math.min(percentUsed, 100).toFixed(2),
      remaining: Math.max(quota - stat.totalAmount, 0)
    });
  }
  
  // Sắp xếp kết quả
  const sortMultiplier = sortOrder === 'desc' ? -1 : 1;
  result.sort((a, b) => {
    if (sortBy === 'percentUsed') {
      return (parseFloat(a.percentUsed) - parseFloat(b.percentUsed)) * sortMultiplier;
    } else if (sortBy === 'totalAmount') {
      return (a.totalAmount - b.totalAmount) * sortMultiplier;
    } else if (sortBy === 'count') {
      return (a.count - b.count) * sortMultiplier;
    } else if (sortBy === 'remaining') {
      return (a.remaining - b.remaining) * sortMultiplier;
    } else if (sortBy === 'numbers') {
      return a.numbers.localeCompare(b.numbers) * sortMultiplier;
    } else if (sortBy === 'betType') {
      return a.betType.localeCompare(b.betType) * sortMultiplier;
    }
    return 0;
  });
  
  // Phân trang
  const startIndex = (page - 1) * limit;
  const endIndex = page * limit;
  const paginatedResult = result.slice(startIndex, endIndex);
  
  return {
    total: result.length,
    page: parseInt(page),
    limit: parseInt(limit),
    totalPages: Math.ceil(result.length / limit),
    data: paginatedResult
  };
};

/**
 * Tối ưu hóa và bảo mật hệ thống quota
 */

/**
 * Kiểm tra và khởi tạo Redis connection nếu có
 * @returns {Object|null} - Redis client hoặc null nếu không có Redis
 */
let redisClient = null;
exports.initRedisConnection = async () => {
  try {
    const redis = require('redis');
    const { promisify } = require('util');
    
    // Kiểm tra xem có cấu hình Redis không
    const redisEnabled = await exports.getConfig('redis_enabled', false);
    const redisHost = await exports.getConfig('redis_host', 'localhost');
    const redisPort = await exports.getConfig('redis_port', 6379);
    
    if (!redisEnabled) {
      return null;
    }
    
    // Khởi tạo kết nối Redis
    redisClient = redis.createClient({
      host: redisHost,
      port: redisPort,
      retry_strategy: function(options) {
        if (options.error && options.error.code === 'ECONNREFUSED') {
          // Không thể kết nối, quay lại sử dụng MongoDB
          console.error('Redis connection failed, falling back to MongoDB');
          return null;
        }
        // Thử kết nối lại sau 1s
        return Math.min(options.attempt * 100, 3000);
      }
    });
    
    // Promisify Redis commands
    const getAsync = promisify(redisClient.get).bind(redisClient);
    const setAsync = promisify(redisClient.set).bind(redisClient);
    const incrAsync = promisify(redisClient.incr).bind(redisClient);
    const expireAsync = promisify(redisClient.expire).bind(redisClient);
    
    // Kiểm tra kết nối
    redisClient.on('error', (error) => {
      console.error('Redis Error:', error);
      redisClient = null;
    });
    
    redisClient.on('connect', () => {
      console.log('Connected to Redis');
    });
    
    // Thêm các phương thức promisified vào client
    redisClient.getAsync = getAsync;
    redisClient.setAsync = setAsync;
    redisClient.incrAsync = incrAsync;
    redisClient.expireAsync = expireAsync;
    
    return redisClient;
  } catch (error) {
    console.error('Error initializing Redis:', error);
    return null;
  }
};

/**
 * Lấy Redis client hiện tại hoặc khởi tạo mới
 * @returns {Object|null} - Redis client hoặc null nếu không có Redis
 */
exports.getRedisClient = async () => {
  if (!redisClient) {
    return await exports.initRedisConnection();
  }
  return redisClient;
};

/**
 * Lưu trữ thông tin quota trong Redis để tối ưu hiệu suất
 * @param {String} key - Key để lưu trữ
 * @param {Object} data - Dữ liệu cần lưu trữ
 * @param {Number} ttl - Thời gian hết hạn (giây)
 * @returns {Boolean} - true nếu thành công, false nếu thất bại
 */
exports.cacheQuotaData = async (key, data, ttl = 300) => {
  try {
    const redis = await exports.getRedisClient();
    if (!redis) return false;
    
    await redis.setAsync(`quota:${key}`, JSON.stringify(data), 'EX', ttl);
    return true;
  } catch (error) {
    console.error('Error caching quota data:', error);
    return false;
  }
};

/**
 * Lấy thông tin quota từ Redis cache
 * @param {String} key - Key để lấy dữ liệu
 * @returns {Object|null} - Dữ liệu đã lưu hoặc null nếu không tìm thấy
 */
exports.getCachedQuotaData = async (key) => {
  try {
    const redis = await exports.getRedisClient();
    if (!redis) return null;
    
    const data = await redis.getAsync(`quota:${key}`);
    return data ? JSON.parse(data) : null;
  } catch (error) {
    console.error('Error getting cached quota data:', error);
    return null;
  }
};

/**
 * Kiểm tra và áp dụng rate limit cho các thao tác quản lý quota
 * @param {String} userId - ID của người dùng thực hiện thao tác
 * @param {String} action - Loại thao tác (update, delete, etc)
 * @returns {Promise<Boolean>} - true nếu cho phép, false nếu bị giới hạn
 */
exports.checkAdminRateLimit = async (userId, action) => {
  try {
    const redis = await exports.getRedisClient();
    if (!redis) return true; // Nếu không có Redis, luôn cho phép
    
    const key = `admin_rate_limit:${userId}:${action}`;
    const limit = await exports.getConfig('admin_rate_limit', 10);
    const window = await exports.getConfig('admin_rate_limit_window', 60);
    
    // Tăng bộ đếm và đặt thời gian hết hạn nếu là lần đầu
    const count = await redis.incrAsync(key);
    if (count === 1) {
      await redis.expireAsync(key, window);
    }
    
    return count <= limit;
  } catch (error) {
    console.error('Error checking admin rate limit:', error);
    return true; // Cho phép trong trường hợp lỗi
  }
};

/**
 * Kiểm tra và phát hiện các hành vi bất thường trong việc sử dụng quota
 * @param {String} userId - ID của người dùng
 * @param {String} betType - Loại cược
 * @param {Number} amount - Số tiền cược
 * @returns {Promise<Object>} - Kết quả kiểm tra
 */
exports.detectAnomalies = async (userId, betType, amount) => {
  try {
    const Bet = require('../models/Bet');
    
    // Lấy ngày hiện tại (giờ GMT+7)
    const now = new Date();
    const vietnamTime = new Date(now.getTime() + (7 * 60 * 60 * 1000));
    vietnamTime.setHours(0, 0, 0, 0);
    
    const startDate = vietnamTime;
    const endDate = new Date(vietnamTime);
    endDate.setHours(23, 59, 59, 999);
    
    // Lấy thống kê đặt cược của người dùng trong ngày
    const userBets = await Bet.aggregate([
      {
        $match: {
          userId,
          createdAt: { $gte: startDate, $lte: endDate }
        }
      },
      {
        $group: {
          _id: null,
          totalAmount: { $sum: '$amount' },
          count: { $sum: 1 },
          avgAmount: { $avg: '$amount' }
        }
      }
    ]);
    
    const result = {
      isAnomaly: false,
      reason: null
    };
    
    if (userBets.length > 0) {
      const stats = userBets[0];
      
      // Kiểm tra các hành vi bất thường
      
      // 1. Đặt cược với số tiền lớn hơn nhiều so với trung bình
      if (amount > stats.avgAmount * 5 && amount > 1000000) {
        result.isAnomaly = true;
        result.reason = 'amount_spike';
      }
      
      // 2. Đặt cược quá nhiều lần trong ngày
      const maxBetsPerDay = await exports.getConfig('max_bets_per_day', 100);
      if (stats.count > maxBetsPerDay) {
        result.isAnomaly = true;
        result.reason = 'frequency_spike';
      }
      
      // 3. Tổng số tiền đặt cược trong ngày quá cao
      const maxDailyAmount = await exports.getConfig('max_daily_amount', 50000000);
      if (stats.totalAmount + amount > maxDailyAmount) {
        result.isAnomaly = true;
        result.reason = 'daily_amount_exceeded';
      }
    }
    
    return result;
  } catch (error) {
    console.error('Error detecting anomalies:', error);
    return { isAnomaly: false, reason: null };
  }
};

/**
 * Tạo Lua script để kiểm tra quota trong Redis
 * @returns {String} - Lua script
 */
exports.createQuotaCheckLuaScript = () => {
  return `
    local key = KEYS[1]
    local limit = tonumber(ARGV[1])
    local window = tonumber(ARGV[2])
    local current_time = tonumber(ARGV[3])
    
    -- Lấy thông tin hiện tại
    local current = redis.call('get', key)
    if current and tonumber(current) >= limit then
      return 0
    end
    
    -- Tăng bộ đếm và đặt thời gian hết hạn nếu là lần đầu
    if current then
      redis.call('incr', key)
    else
      redis.call('set', key, 1, 'EX', window)
    end
    
    return 1
  `;
};

/**
 * Kiểm tra quota sử dụng Redis Lua script (hiệu quả hơn)
 * @param {String} number - Số cược
 * @param {String} betType - Loại cược
 * @param {Number} amount - Số tiền cược
 * @returns {Promise<Boolean>} - true nếu còn đủ quota, false nếu đã hết quota
 */
exports.checkQuotaWithRedis = async (number, betType, amount) => {
  try {
    const redis = await exports.getRedisClient();
    if (!redis) {
      // Fallback to MongoDB if Redis is not available
      return await exports.getQuotaForNumber(number, betType) >= amount;
    }
    
    // Lấy quota cho số và loại cược này
    const quota = await exports.getQuotaForNumber(number, betType);
    
    // Tạo key duy nhất cho số và loại cược
    const key = `quota:${number}:${betType}`;
    
    // Lấy ngày hiện tại (giờ GMT+7)
    const now = new Date();
    const vietnamTime = new Date(now.getTime() + (7 * 60 * 60 * 1000));
    vietnamTime.setHours(0, 0, 0, 0);
    
    // Thời gian còn lại trong ngày (giây)
    const endOfDay = new Date(vietnamTime);
    endOfDay.setHours(23, 59, 59, 999);
    const remainingTime = Math.floor((endOfDay - now) / 1000);
    
    // Lấy tổng số tiền đã đặt cược cho số này
    const totalBetAmount = await redis.getAsync(key) || 0;
    
    // Kiểm tra xem có vượt quá quota không
    return (parseInt(totalBetAmount) + amount) <= quota;
  } catch (error) {
    console.error('Error checking quota with Redis:', error);
    // Fallback to MongoDB if Redis check fails
    return await exports.getQuotaForNumber(number, betType) >= amount;
  }
};

/**
 * Cập nhật số tiền đã đặt cược trong Redis
 * @param {String} number - Số cược
 * @param {String} betType - Loại cược
 * @param {Number} amount - Số tiền cược
 * @returns {Promise<Boolean>} - true nếu thành công, false nếu thất bại
 */
exports.updateBetAmountInRedis = async (number, betType, amount) => {
  try {
    const redis = await exports.getRedisClient();
    if (!redis) return false;
    
    // Tạo key duy nhất cho số và loại cược
    const key = `quota:${number}:${betType}`;
    
    // Lấy ngày hiện tại (giờ GMT+7)
    const now = new Date();
    const vietnamTime = new Date(now.getTime() + (7 * 60 * 60 * 1000));
    vietnamTime.setHours(0, 0, 0, 0);
    
    // Thời gian còn lại trong ngày (giây)
    const endOfDay = new Date(vietnamTime);
    endOfDay.setHours(23, 59, 59, 999);
    const remainingTime = Math.floor((endOfDay - now) / 1000);
    
    // Lấy tổng số tiền đã đặt cược cho số này
    const currentAmount = await redis.getAsync(key) || 0;
    
    // Cập nhật tổng số tiền
    await redis.setAsync(key, parseInt(currentAmount) + amount, 'EX', remainingTime);
    
    return true;
  } catch (error) {
    console.error('Error updating bet amount in Redis:', error);
    return false;
  }
};

/**
 * Lấy ngưỡng thông báo cho quota
 * @returns {Promise<Number>} - Ngưỡng thông báo (%)
 */
exports.getQuotaNotificationThreshold = async () => {
  return await exports.getConfig(SystemConfig.KEYS.QUOTA_NOTIFICATION_THRESHOLD, 80);
}; 