const rateLimit = require('express-rate-limit'); // Cần cài đặt nếu chưa có
const ApiError = require('../utils/error');
const logger = require('../utils/logger');
const config = require('../config');

/**
 * Middleware giới hạn tốc độ gọi API
 * Ngăn chặn tấn công brute-force hoặc DDoS
 */

// Tạo bộ nhớ đệm lưu trữ các địa chỉ IP đã bị chặn
const blockedIPs = new Map();

// Middleware kiểm tra nếu IP đã bị chặn
exports.checkBlockedIP = (req, res, next) => {
  const ip = req.ip || 
             req.connection.remoteAddress || 
             req.socket.remoteAddress || 
             req.headers['x-forwarded-for'];
             
  if (blockedIPs.has(ip)) {
    const blockData = blockedIPs.get(ip);
    const now = Date.now();
    
    if (now < blockData.expiry) {
      // IP vẫn đang bị chặn
      logger.warn(`Blocked IP attempt: ${ip}, remaining time: ${Math.ceil((blockData.expiry - now) / 1000)} seconds`);
      return res.status(429).json({
        status: 'error',
        message: 'Quá nhiều yêu cầu. Bạn đã bị chặn tạm thời.',
        retryAfter: Math.ceil((blockData.expiry - now) / 1000)
      });
    } else {
      // Đã hết thời gian chặn, xóa khỏi danh sách
      blockedIPs.delete(ip);
    }
  }
  
  next();
};

// Middleware giới hạn tốc độ cho API thông thường
exports.standardLimiter = rateLimit({
  windowMs: config.rateLimiting?.windowMs || 15 * 60 * 1000, // 15 phút mặc định
  max: config.rateLimiting?.max || 100, // 100 requests mặc định
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'error',
    message: 'Quá nhiều yêu cầu. Vui lòng thử lại sau.'
  },
  handler: (req, res, next, options) => {
    const ip = req.ip || 
               req.connection.remoteAddress || 
               req.socket.remoteAddress || 
               req.headers['x-forwarded-for'];
               
    logger.warn(`Rate limit exceeded by IP: ${ip}`);
    
    // Nếu IP vượt quá giới hạn nhiều lần, chặn tạm thời
    if (!blockedIPs.has(ip)) {
      blockedIPs.set(ip, {
        count: 1,
        expiry: Date.now() + 30 * 60 * 1000 // Chặn 30 phút
      });
    } else {
      const blockData = blockedIPs.get(ip);
      blockData.count += 1;
      
      // Tăng thời gian chặn theo cấp số nhân
      const multiplier = Math.min(Math.pow(2, blockData.count - 1), 24); // Tối đa 24 giờ
      blockData.expiry = Date.now() + multiplier * 60 * 60 * 1000;
      
      blockedIPs.set(ip, blockData);
    }
    
    res.status(options.statusCode).send(options.message);
  }
});

// Middleware giới hạn tốc độ nghiêm ngặt hơn cho các API nhạy cảm
exports.strictLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 giờ
  max: 20, // 20 requests
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'error',
    message: 'Quá nhiều yêu cầu cho tính năng nhạy cảm. Vui lòng thử lại sau.'
  },
  handler: (req, res, next, options) => {
    const ip = req.ip || 
               req.connection.remoteAddress || 
               req.socket.remoteAddress || 
               req.headers['x-forwarded-for'];
               
    logger.warn(`Strict rate limit exceeded by IP: ${ip} for sensitive endpoint: ${req.originalUrl}`);
    
    // Chặn ngay lập tức
    blockedIPs.set(ip, {
      count: 3, // Bắt đầu với mức phạt cao hơn
      expiry: Date.now() + 2 * 60 * 60 * 1000 // Chặn 2 giờ
    });
    
    res.status(options.statusCode).send(options.message);
  }
});

// Middleware giới hạn tốc độ cho API đăng nhập
exports.loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 phút
  max: 5, // 5 lần thử đăng nhập
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true, // Bỏ qua các yêu cầu đăng nhập thành công
  message: {
    status: 'error',
    message: 'Quá nhiều lần thử đăng nhập không thành công. Vui lòng thử lại sau 15 phút.'
  }
});

// Middleware giới hạn tốc độ cho tạo tài khoản
exports.registerLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000, // 24 giờ
  max: 3, // 3 tài khoản mỗi ngày
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    status: 'error',
    message: 'Đã đạt giới hạn đăng ký tài khoản mới. Vui lòng thử lại sau.'
  }
}); 