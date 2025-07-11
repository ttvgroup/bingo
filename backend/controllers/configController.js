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