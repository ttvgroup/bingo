const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/error');
const configService = require('../services/configService');
const SystemConfig = require('../models/SystemConfig');
const auditService = require('../services/auditService');

/**
 * @desc    Lấy tất cả cấu hình hệ thống
 * @route   GET /api/admin/config
 * @access  Admin
 */
exports.getAllConfigs = asyncHandler(async (req, res, next) => {
  const configs = await configService.getAllConfigs();
  res.status(200).json({
    success: true,
    data: configs
  });
});

/**
 * @desc    Lấy một cấu hình theo key
 * @route   GET /api/admin/config/:key
 * @access  Admin
 */
exports.getConfigByKey = asyncHandler(async (req, res, next) => {
  const { key } = req.params;
  
  // Kiểm tra key có hợp lệ không
  if (!Object.values(SystemConfig.KEYS).includes(key)) {
    return next(new ApiError(`Khóa cấu hình không hợp lệ: ${key}`, 400));
  }
  
  const value = await configService.getConfig(key);
  
  res.status(200).json({
    success: true,
    data: {
      key,
      value
    }
  });
});

/**
 * @desc    Cập nhật một cấu hình
 * @route   PUT /api/admin/config/:key
 * @access  Admin
 */
exports.updateConfig = asyncHandler(async (req, res, next) => {
  const { key } = req.params;
  const { value, description } = req.body;
  
  // Kiểm tra key có hợp lệ không
  if (!Object.values(SystemConfig.KEYS).includes(key)) {
    return next(new ApiError(`Khóa cấu hình không hợp lệ: ${key}`, 400));
  }
  
  // Kiểm tra value
  if (value === undefined) {
    return next(new ApiError('Giá trị cấu hình không được để trống', 400));
  }
  
  // Lấy thông tin client
  const clientIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  const userAgent = req.headers['user-agent'];
  
  // Lưu giá trị cũ để ghi log
  const oldValue = await configService.getConfig(key);
  
  // Cập nhật cấu hình
  const updatedConfig = await configService.updateConfig(key, value, description, req.adminUser._id);
  
  // Ghi log
  await auditService.logConfigChange(
    req.adminUser,
    key,
    oldValue,
    value,
    clientIp,
    userAgent
  );
  
  res.status(200).json({
    success: true,
    message: `Cấu hình ${key} đã được cập nhật thành công`,
    data: updatedConfig
  });
});

/**
 * @desc    Bật/tắt chức năng đặt cược
 * @route   PUT /api/admin/config/betting/toggle
 * @access  Admin
 */
exports.toggleBetting = asyncHandler(async (req, res, next) => {
  const { enabled } = req.body;
  
  if (typeof enabled !== 'boolean') {
    return next(new ApiError('Giá trị enabled phải là boolean', 400));
  }
  
  // Lấy thông tin client
  const clientIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  const userAgent = req.headers['user-agent'];
  
  // Lưu giá trị cũ để ghi log
  const oldValue = await configService.getConfig(SystemConfig.KEYS.BETTING_ENABLED);
  
  // Cập nhật trạng thái
  const updatedConfig = await configService.toggleBetting(enabled, req.adminUser._id);
  
  // Ghi log
  await auditService.logConfigChange(
    req.adminUser,
    SystemConfig.KEYS.BETTING_ENABLED,
    oldValue,
    enabled,
    clientIp,
    userAgent
  );
  
  // Thông báo kết quả
  const actionText = enabled ? 'bật' : 'tắt';
  
  res.status(200).json({
    success: true,
    message: `Đã ${actionText} chức năng đặt cược thành công`,
    data: {
      key: SystemConfig.KEYS.BETTING_ENABLED,
      value: enabled
    }
  });
});

/**
 * @desc    Cập nhật thời gian đặt cược
 * @route   PUT /api/admin/config/betting/hours
 * @access  Admin
 */
exports.updateBettingHours = asyncHandler(async (req, res, next) => {
  const { startHour, startMinute, endHour, endMinute } = req.body;
  
  // Kiểm tra dữ liệu đầu vào
  if (startHour === undefined || startMinute === undefined || endHour === undefined || endMinute === undefined) {
    return next(new ApiError('Thiếu thông tin thời gian', 400));
  }
  
  // Kiểm tra giá trị hợp lệ
  if (startHour < 0 || startHour > 23 || startMinute < 0 || startMinute > 59 ||
      endHour < 0 || endHour > 23 || endMinute < 0 || endMinute > 59) {
    return next(new ApiError('Giá trị thời gian không hợp lệ', 400));
  }
  
  // Lấy thông tin client
  const clientIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  const userAgent = req.headers['user-agent'];
  
  // Lưu giá trị cũ để ghi log
  const oldStartConfig = await configService.getConfig(SystemConfig.KEYS.BETTING_HOURS_START);
  const oldEndConfig = await configService.getConfig(SystemConfig.KEYS.BETTING_HOURS_END);
  
  // Cập nhật thời gian
  const updatedHours = await configService.updateBettingHours(
    { hour: parseInt(startHour), minute: parseInt(startMinute) },
    { hour: parseInt(endHour), minute: parseInt(endMinute) },
    req.adminUser._id
  );
  
  // Ghi log
  await auditService.logConfigChange(
    req.adminUser,
    'betting_hours',
    { start: oldStartConfig, end: oldEndConfig },
    updatedHours,
    clientIp,
    userAgent
  );
  
  res.status(200).json({
    success: true,
    message: `Đã cập nhật thời gian đặt cược: ${startHour.toString().padStart(2, '0')}:${startMinute.toString().padStart(2, '0')} - ${endHour.toString().padStart(2, '0')}:${endMinute.toString().padStart(2, '0')}`,
    data: updatedHours
  });
});

/**
 * @desc    Lấy trạng thái đặt cược hiện tại
 * @route   GET /api/admin/config/betting/status
 * @access  Admin
 */
exports.getBettingStatus = asyncHandler(async (req, res, next) => {
  const bettingEnabled = await configService.getConfig(SystemConfig.KEYS.BETTING_ENABLED, true);
  const bettingHours = await configService.getBettingHours();
  const isWithinHours = await configService.isWithinBettingHours();
  
  res.status(200).json({
    success: true,
    data: {
      enabled: bettingEnabled,
      hours: bettingHours,
      isWithinHours,
      currentStatus: bettingEnabled && isWithinHours ? 'active' : 'inactive',
      statusText: bettingEnabled && isWithinHours ? 'Đang mở' : (bettingEnabled ? 'Tạm đóng (ngoài giờ)' : 'Đã khóa')
    }
  });
}); 

/**
 * @desc    Lấy cấu hình quota
 * @route   GET /api/admin/config/quota
 * @access  Admin
 */
exports.getQuotaConfig = asyncHandler(async (req, res, next) => {
  // Lấy trạng thái bật/tắt quota
  const quotaEnabled = await configService.isQuotaEnabled();
  
  // Lấy quota cho từng loại cược
  const quota2D = await configService.getConfig(SystemConfig.KEYS.QUOTA_2D);
  const quota3D = await configService.getConfig(SystemConfig.KEYS.QUOTA_3D);
  const quota4D = await configService.getConfig(SystemConfig.KEYS.QUOTA_4D);
  const quotaBaoLo2D = await configService.getConfig(SystemConfig.KEYS.QUOTA_BAO_LO_2D);
  const quotaBaoLo3D = await configService.getConfig(SystemConfig.KEYS.QUOTA_BAO_LO_3D);
  const quotaBaoLo4D = await configService.getConfig(SystemConfig.KEYS.QUOTA_BAO_LO_4D);
  
  // Lấy quota mặc định cho mỗi số
  const defaultQuotaPerNumber = await configService.getConfig(SystemConfig.KEYS.QUOTA_DEFAULT_PER_NUMBER);
  
  // Lấy quota riêng cho từng số
  const quotaPerNumber = await configService.getConfig(SystemConfig.KEYS.QUOTA_PER_NUMBER, {});
  
  // Lấy ngưỡng thông báo
  const notificationThreshold = await configService.getConfig(SystemConfig.KEYS.QUOTA_NOTIFICATION_THRESHOLD);
  
  res.status(200).json({
    success: true,
    data: {
      enabled: quotaEnabled,
      betTypes: {
        '2D': quota2D,
        '3D': quota3D,
        '4D': quota4D,
        'Bao lô 2D': quotaBaoLo2D,
        'Bao lô 3D': quotaBaoLo3D,
        'Bao lô 4D': quotaBaoLo4D
      },
      defaultQuotaPerNumber,
      quotaPerNumber,
      notificationThreshold
    }
  });
});

/**
 * @desc    Bật/tắt hệ thống quota
 * @route   PUT /api/admin/config/quota/toggle
 * @access  Admin
 */
exports.toggleQuota = asyncHandler(async (req, res, next) => {
  const { enabled } = req.body;
  
  if (typeof enabled !== 'boolean') {
    return next(new ApiError('Giá trị enabled phải là boolean', 400));
  }
  
  // Lấy thông tin client
  const clientIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  const userAgent = req.headers['user-agent'];
  
  // Lưu giá trị cũ để ghi log
  const oldValue = await configService.getConfig(SystemConfig.KEYS.QUOTA_ENABLED);
  
  // Cập nhật trạng thái
  const updatedConfig = await configService.toggleQuota(enabled, req.adminUser._id);
  
  // Ghi log
  await auditService.logConfigChange(
    req.adminUser,
    SystemConfig.KEYS.QUOTA_ENABLED,
    oldValue,
    enabled,
    clientIp,
    userAgent
  );
  
  // Thông báo kết quả
  const actionText = enabled ? 'bật' : 'tắt';
  
  res.status(200).json({
    success: true,
    message: `Đã ${actionText} hệ thống quota thành công`,
    data: {
      key: SystemConfig.KEYS.QUOTA_ENABLED,
      value: enabled
    }
  });
});

/**
 * @desc    Cập nhật quota cho loại cược
 * @route   PUT /api/admin/config/quota/bet-type
 * @access  Admin
 */
exports.updateBetTypeQuota = asyncHandler(async (req, res, next) => {
  const { betType, quota } = req.body;
  
  // Kiểm tra dữ liệu đầu vào
  if (!betType || quota === undefined || isNaN(quota) || quota < 0) {
    return next(new ApiError('Dữ liệu không hợp lệ', 400));
  }
  
  // Xác định key cấu hình dựa trên loại cược
  let configKey;
  switch (betType) {
    case '2D':
      configKey = SystemConfig.KEYS.QUOTA_2D;
      break;
    case '3D':
      configKey = SystemConfig.KEYS.QUOTA_3D;
      break;
    case '4D':
      configKey = SystemConfig.KEYS.QUOTA_4D;
      break;
    case 'Bao lô 2D':
      configKey = SystemConfig.KEYS.QUOTA_BAO_LO_2D;
      break;
    case 'Bao lô 3D':
      configKey = SystemConfig.KEYS.QUOTA_BAO_LO_3D;
      break;
    case 'Bao lô 4D':
      configKey = SystemConfig.KEYS.QUOTA_BAO_LO_4D;
      break;
    default:
      return next(new ApiError('Loại cược không hợp lệ', 400));
  }
  
  // Lấy thông tin client
  const clientIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  const userAgent = req.headers['user-agent'];
  
  // Lưu giá trị cũ để ghi log
  const oldValue = await configService.getConfig(configKey);
  
  // Cập nhật quota
  const updatedConfig = await configService.updateConfig(
    configKey,
    parseInt(quota),
    `Quota cho loại cược ${betType}`,
    req.adminUser._id
  );
  
  // Ghi log
  await auditService.logConfigChange(
    req.adminUser,
    configKey,
    oldValue,
    parseInt(quota),
    clientIp,
    userAgent
  );
  
  res.status(200).json({
    success: true,
    message: `Đã cập nhật quota cho loại cược ${betType}: ${parseInt(quota).toLocaleString('vi-VN')}đ`,
    data: {
      betType,
      quota: parseInt(quota)
    }
  });
});

/**
 * @desc    Cập nhật quota mặc định cho mỗi số
 * @route   PUT /api/admin/config/quota/default
 * @access  Admin
 */
exports.updateDefaultNumberQuota = asyncHandler(async (req, res, next) => {
  const { quota } = req.body;
  
  // Kiểm tra dữ liệu đầu vào
  if (quota === undefined || isNaN(quota) || quota < 0) {
    return next(new ApiError('Dữ liệu không hợp lệ', 400));
  }
  
  // Lấy thông tin client
  const clientIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  const userAgent = req.headers['user-agent'];
  
  // Lưu giá trị cũ để ghi log
  const oldValue = await configService.getConfig(SystemConfig.KEYS.QUOTA_DEFAULT_PER_NUMBER);
  
  // Cập nhật quota mặc định
  const updatedConfig = await configService.updateConfig(
    SystemConfig.KEYS.QUOTA_DEFAULT_PER_NUMBER,
    parseInt(quota),
    `Quota mặc định cho mỗi số`,
    req.adminUser._id
  );
  
  // Ghi log
  await auditService.logConfigChange(
    req.adminUser,
    SystemConfig.KEYS.QUOTA_DEFAULT_PER_NUMBER,
    oldValue,
    parseInt(quota),
    clientIp,
    userAgent
  );
  
  res.status(200).json({
    success: true,
    message: `Đã cập nhật quota mặc định cho mỗi số: ${parseInt(quota).toLocaleString('vi-VN')}đ`,
    data: {
      defaultQuota: parseInt(quota)
    }
  });
});

/**
 * @desc    Cập nhật quota cho số cụ thể
 * @route   PUT /api/admin/config/quota/number
 * @access  Admin
 */
exports.updateNumberQuota = asyncHandler(async (req, res, next) => {
  const { number, betType, quota } = req.body;
  
  // Kiểm tra dữ liệu đầu vào
  if (!number || !betType || quota === undefined || isNaN(quota) || quota < 0) {
    return next(new ApiError('Dữ liệu không hợp lệ', 400));
  }
  
  // Kiểm tra định dạng số
  if (!/^\d+$/.test(number)) {
    return next(new ApiError('Định dạng số không hợp lệ', 400));
  }
  
  // Kiểm tra loại cược
  const validBetTypes = ['2D', '3D', '4D', 'Bao lô 2D', 'Bao lô 3D', 'Bao lô 4D'];
  if (!validBetTypes.includes(betType)) {
    return next(new ApiError('Loại cược không hợp lệ', 400));
  }
  
  // Lấy thông tin client
  const clientIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  const userAgent = req.headers['user-agent'];
  
  // Cập nhật quota cho số cụ thể
  await configService.updateQuotaForNumber(number, betType, parseInt(quota), req.adminUser._id);
  
  res.status(200).json({
    success: true,
    message: `Đã cập nhật quota cho số ${number} (${betType}): ${parseInt(quota).toLocaleString('vi-VN')}đ`,
    data: {
      number,
      betType,
      quota: parseInt(quota)
    }
  });
});

/**
 * @desc    Xóa quota cho số cụ thể
 * @route   DELETE /api/admin/config/quota/number
 * @access  Admin
 */
exports.deleteNumberQuota = asyncHandler(async (req, res, next) => {
  const { number, betType } = req.body;
  
  // Kiểm tra dữ liệu đầu vào
  if (!number || !betType) {
    return next(new ApiError('Dữ liệu không hợp lệ', 400));
  }
  
  // Kiểm tra loại cược
  const validBetTypes = ['2D', '3D', '4D', 'Bao lô 2D', 'Bao lô 3D', 'Bao lô 4D'];
  if (!validBetTypes.includes(betType)) {
    return next(new ApiError('Loại cược không hợp lệ', 400));
  }
  
  // Lấy thông tin client
  const clientIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  const userAgent = req.headers['user-agent'];
  
  // Lấy cấu hình quota hiện tại
  const quotaPerNumber = await configService.getConfig(SystemConfig.KEYS.QUOTA_PER_NUMBER, {});
  
  // Tạo key duy nhất cho số và loại cược
  const key = `${number}_${betType}`;
  
  // Kiểm tra xem có cấu hình riêng không
  if (!quotaPerNumber[key]) {
    return next(new ApiError('Không tìm thấy cấu hình quota cho số này', 404));
  }
  
  // Lưu giá trị cũ để ghi log
  const oldValue = quotaPerNumber[key];
  
  // Xóa cấu hình riêng cho số này
  delete quotaPerNumber[key];
  
  // Lưu lại cấu hình
  await configService.updateConfig(
    SystemConfig.KEYS.QUOTA_PER_NUMBER,
    quotaPerNumber,
    `Xóa quota cho số ${number} (${betType})`,
    req.adminUser._id
  );
  
  // Ghi log
  await auditService.logConfigChange(
    req.adminUser,
    `quota_number_${number}_${betType}`,
    oldValue,
    null,
    clientIp,
    userAgent
  );
  
  res.status(200).json({
    success: true,
    message: `Đã xóa quota riêng cho số ${number} (${betType}), sẽ sử dụng quota mặc định`,
    data: {
      number,
      betType
    }
  });
});

/**
 * @desc    Cập nhật ngưỡng thông báo quota
 * @route   PUT /api/admin/config/quota/threshold
 * @access  Admin
 */
exports.updateQuotaThreshold = asyncHandler(async (req, res, next) => {
  const { threshold } = req.body;
  
  // Kiểm tra dữ liệu đầu vào
  if (threshold === undefined || isNaN(threshold) || threshold < 0 || threshold > 100) {
    return next(new ApiError('Ngưỡng thông báo phải là số từ 0 đến 100', 400));
  }
  
  // Lấy thông tin client
  const clientIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  const userAgent = req.headers['user-agent'];
  
  // Lưu giá trị cũ để ghi log
  const oldValue = await configService.getConfig(SystemConfig.KEYS.QUOTA_NOTIFICATION_THRESHOLD);
  
  // Cập nhật ngưỡng thông báo
  const updatedConfig = await configService.updateConfig(
    SystemConfig.KEYS.QUOTA_NOTIFICATION_THRESHOLD,
    parseInt(threshold),
    `Ngưỡng thông báo quota`,
    req.adminUser._id
  );
  
  // Ghi log
  await auditService.logConfigChange(
    req.adminUser,
    SystemConfig.KEYS.QUOTA_NOTIFICATION_THRESHOLD,
    oldValue,
    parseInt(threshold),
    clientIp,
    userAgent
  );
  
  res.status(200).json({
    success: true,
    message: `Đã cập nhật ngưỡng thông báo quota: ${threshold}%`,
    data: {
      threshold: parseInt(threshold)
    }
  });
}); 

/**
 * @desc    Cấu hình Redis cho hệ thống quota
 * @route   PUT /api/admin/config/quota/redis
 * @access  Admin
 */
exports.configureRedis = asyncHandler(async (req, res, next) => {
  const { enabled, host, port } = req.body;
  
  // Kiểm tra dữ liệu đầu vào
  if (enabled === undefined) {
    return next(new ApiError('Thiếu thông tin bật/tắt Redis', 400));
  }
  
  // Lấy thông tin client
  const clientIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  const userAgent = req.headers['user-agent'];
  
  // Lưu giá trị cũ để ghi log
  const oldEnabledValue = await configService.getConfig('redis_enabled', false);
  const oldHostValue = await configService.getConfig('redis_host', 'localhost');
  const oldPortValue = await configService.getConfig('redis_port', 6379);
  
  // Cập nhật cấu hình Redis
  await configService.updateConfig(
    'redis_enabled',
    enabled,
    'Bật/tắt sử dụng Redis cho hệ thống quota',
    req.adminUser._id
  );
  
  if (host) {
    await configService.updateConfig(
      'redis_host',
      host,
      'Host của Redis server',
      req.adminUser._id
    );
  }
  
  if (port) {
    await configService.updateConfig(
      'redis_port',
      parseInt(port),
      'Port của Redis server',
      req.adminUser._id
    );
  }
  
  // Ghi log
  await auditService.logConfigChange(
    req.adminUser,
    'redis_enabled',
    oldEnabledValue,
    enabled,
    clientIp,
    userAgent
  );
  
  if (host) {
    await auditService.logConfigChange(
      req.adminUser,
      'redis_host',
      oldHostValue,
      host,
      clientIp,
      userAgent
    );
  }
  
  if (port) {
    await auditService.logConfigChange(
      req.adminUser,
      'redis_port',
      oldPortValue,
      parseInt(port),
      clientIp,
      userAgent
    );
  }
  
  // Khởi tạo lại kết nối Redis nếu được bật
  if (enabled) {
    await configService.initRedisConnection();
  }
  
  res.status(200).json({
    success: true,
    message: `Đã ${enabled ? 'bật' : 'tắt'} sử dụng Redis cho hệ thống quota`,
    data: {
      enabled,
      host: host || oldHostValue,
      port: port || oldPortValue
    }
  });
});

/**
 * @desc    Kiểm tra kết nối Redis
 * @route   GET /api/admin/config/quota/redis/test
 * @access  Admin
 */
exports.testRedisConnection = asyncHandler(async (req, res, next) => {
  // Kiểm tra xem Redis có được bật không
  const redisEnabled = await configService.getConfig('redis_enabled', false);
  if (!redisEnabled) {
    return res.status(200).json({
      success: false,
      message: 'Redis hiện đang tắt. Vui lòng bật Redis trước khi kiểm tra kết nối.',
      data: {
        enabled: false
      }
    });
  }
  
  // Thử kết nối Redis
  const redis = await configService.getRedisClient();
  
  if (!redis) {
    return res.status(200).json({
      success: false,
      message: 'Không thể kết nối đến Redis server. Vui lòng kiểm tra cấu hình.',
      data: {
        enabled: true,
        connected: false
      }
    });
  }
  
  // Thử ping Redis
  try {
    await new Promise((resolve, reject) => {
      redis.ping((err, result) => {
        if (err) reject(err);
        else resolve(result);
      });
    });
    
    res.status(200).json({
      success: true,
      message: 'Kết nối Redis thành công!',
      data: {
        enabled: true,
        connected: true,
        host: await configService.getConfig('redis_host', 'localhost'),
        port: await configService.getConfig('redis_port', 6379)
      }
    });
  } catch (error) {
    res.status(200).json({
      success: false,
      message: 'Redis server không phản hồi. Vui lòng kiểm tra cấu hình.',
      data: {
        enabled: true,
        connected: false,
        error: error.message
      }
    });
  }
});

/**
 * @desc    Cấu hình phát hiện hành vi bất thường
 * @route   PUT /api/admin/config/quota/anomaly
 * @access  Admin
 */
exports.configureAnomalyDetection = asyncHandler(async (req, res, next) => {
  const { maxBetsPerDay, maxDailyAmount } = req.body;
  
  // Kiểm tra dữ liệu đầu vào
  if (maxBetsPerDay === undefined && maxDailyAmount === undefined) {
    return next(new ApiError('Không có thông tin cấu hình nào được cung cấp', 400));
  }
  
  // Lấy thông tin client
  const clientIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  const userAgent = req.headers['user-agent'];
  
  // Cập nhật cấu hình
  if (maxBetsPerDay !== undefined) {
    const oldValue = await configService.getConfig('max_bets_per_day', 100);
    await configService.updateConfig(
      'max_bets_per_day',
      parseInt(maxBetsPerDay),
      'Số lượng cược tối đa mỗi ngày cho mỗi người dùng',
      req.adminUser._id
    );
    
    await auditService.logConfigChange(
      req.adminUser,
      'max_bets_per_day',
      oldValue,
      parseInt(maxBetsPerDay),
      clientIp,
      userAgent
    );
  }
  
  if (maxDailyAmount !== undefined) {
    const oldValue = await configService.getConfig('max_daily_amount', 50000000);
    await configService.updateConfig(
      'max_daily_amount',
      parseInt(maxDailyAmount),
      'Tổng số tiền cược tối đa mỗi ngày cho mỗi người dùng',
      req.adminUser._id
    );
    
    await auditService.logConfigChange(
      req.adminUser,
      'max_daily_amount',
      oldValue,
      parseInt(maxDailyAmount),
      clientIp,
      userAgent
    );
  }
  
  res.status(200).json({
    success: true,
    message: 'Đã cập nhật cấu hình phát hiện hành vi bất thường',
    data: {
      maxBetsPerDay: maxBetsPerDay !== undefined ? parseInt(maxBetsPerDay) : await configService.getConfig('max_bets_per_day', 100),
      maxDailyAmount: maxDailyAmount !== undefined ? parseInt(maxDailyAmount) : await configService.getConfig('max_daily_amount', 50000000)
    }
  });
}); 