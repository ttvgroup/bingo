const AuditLog = require('../models/AuditLog');
const logger = require('../utils/logger');

/**
 * Service quản lý nhật ký kiểm toán
 * Lưu trữ và truy xuất nhật ký cho các hoạt động quan trọng
 */

/**
 * Tạo một bản ghi nhật ký kiểm toán mới
 * 
 * @param {Object} data - Dữ liệu nhật ký
 * @param {String} data.action - Loại hành động (create, update, delete, verify, reject)
 * @param {String} data.resourceType - Loại tài nguyên (result, bet, transaction, user)
 * @param {ObjectId} data.resourceId - ID của tài nguyên
 * @param {ObjectId} data.userId - ID của người thực hiện hành động
 * @param {String} data.ipAddress - Địa chỉ IP
 * @param {String} data.userAgent - Thông tin trình duyệt/ứng dụng
 * @param {Object} data.details - Thông tin chi tiết (tùy chọn)
 * @returns {Promise<Object>} - Bản ghi nhật ký đã tạo
 */
exports.createAuditLog = async (data) => {
  try {
    // Kiểm tra các trường bắt buộc
    if (!data.action || !data.resourceType || !data.resourceId || !data.userId) {
      throw new Error('Thiếu thông tin bắt buộc cho nhật ký kiểm toán');
    }
    
    // Tạo bản ghi nhật ký
    const auditLog = new AuditLog({
      action: data.action,
      resourceType: data.resourceType,
      resourceId: data.resourceId,
      userId: data.userId,
      ipAddress: data.ipAddress,
      userAgent: data.userAgent,
      details: data.details || {}
    });
    
    // Lưu vào database
    await auditLog.save();
    
    // Ghi log
    logger.info(`Audit log created: ${data.action} ${data.resourceType} by user ${data.userId}`);
    
    return auditLog;
  } catch (error) {
    logger.error(`Error creating audit log: ${error.message}`);
    // Không throw lỗi để không ảnh hưởng đến luồng chính
    return null;
  }
};

/**
 * Lấy nhật ký cho một tài nguyên cụ thể
 * 
 * @param {String} resourceType - Loại tài nguyên
 * @param {ObjectId} resourceId - ID của tài nguyên
 * @param {Object} options - Các tùy chọn truy vấn
 * @returns {Promise<Array>} - Danh sách nhật ký
 */
exports.getResourceAuditLogs = async (resourceType, resourceId, options = {}) => {
  try {
    const query = { resourceType, resourceId };
    
    // Tìm kiếm theo loại hành động (nếu có)
    if (options.action) {
      query.action = options.action;
    }
    
    // Tìm kiếm theo thời gian (nếu có)
    if (options.startDate || options.endDate) {
      query.createdAt = {};
      
      if (options.startDate) {
        query.createdAt.$gte = new Date(options.startDate);
      }
      
      if (options.endDate) {
        query.createdAt.$lte = new Date(options.endDate);
      }
    }
    
    // Thực hiện truy vấn
    const logs = await AuditLog.find(query)
      .sort({ createdAt: -1 })
      .skip(options.skip || 0)
      .limit(options.limit || 50)
      .populate('userId', 'username telegramId role');
    
    return logs;
  } catch (error) {
    logger.error(`Error retrieving audit logs: ${error.message}`);
    throw error;
  }
};

/**
 * Lấy nhật ký cho một người dùng cụ thể
 * 
 * @param {ObjectId} userId - ID của người dùng
 * @param {Object} options - Các tùy chọn truy vấn
 * @returns {Promise<Array>} - Danh sách nhật ký
 */
exports.getUserAuditLogs = async (userId, options = {}) => {
  try {
    const query = { userId };
    
    // Tìm kiếm theo loại tài nguyên (nếu có)
    if (options.resourceType) {
      query.resourceType = options.resourceType;
    }
    
    // Tìm kiếm theo loại hành động (nếu có)
    if (options.action) {
      query.action = options.action;
    }
    
    // Tìm kiếm theo thời gian (nếu có)
    if (options.startDate || options.endDate) {
      query.createdAt = {};
      
      if (options.startDate) {
        query.createdAt.$gte = new Date(options.startDate);
      }
      
      if (options.endDate) {
        query.createdAt.$lte = new Date(options.endDate);
      }
    }
    
    // Thực hiện truy vấn
    const logs = await AuditLog.find(query)
      .sort({ createdAt: -1 })
      .skip(options.skip || 0)
      .limit(options.limit || 50);
    
    return logs;
  } catch (error) {
    logger.error(`Error retrieving user audit logs: ${error.message}`);
    throw error;
  }
};

/**
 * Lấy tất cả nhật ký với các bộ lọc
 * 
 * @param {Object} filters - Các bộ lọc
 * @param {Object} options - Các tùy chọn phân trang
 * @returns {Promise<Object>} - Danh sách nhật ký và thông tin phân trang
 */
exports.getAllAuditLogs = async (filters = {}, options = {}) => {
  try {
    const query = {};
    
    // Áp dụng các bộ lọc
    if (filters.resourceType) query.resourceType = filters.resourceType;
    if (filters.action) query.action = filters.action;
    if (filters.userId) query.userId = filters.userId;
    
    // Lọc theo thời gian
    if (filters.startDate || filters.endDate) {
      query.createdAt = {};
      
      if (filters.startDate) {
        query.createdAt.$gte = new Date(filters.startDate);
      }
      
      if (filters.endDate) {
        query.createdAt.$lte = new Date(filters.endDate);
      }
    }
    
    // Tính tổng số bản ghi
    const total = await AuditLog.countDocuments(query);
    
    // Lấy dữ liệu theo phân trang
    const page = options.page || 1;
    const limit = options.limit || 50;
    const skip = (page - 1) * limit;
    
    const logs = await AuditLog.find(query)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('userId', 'username telegramId role');
    
    return {
      logs,
      pagination: {
        total,
        page,
        limit,
        pages: Math.ceil(total / limit)
      }
    };
  } catch (error) {
    logger.error(`Error retrieving all audit logs: ${error.message}`);
    throw error;
  }
}; 