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