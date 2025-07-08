const winston = require('winston');
const config = require('../config');

// Định nghĩa định dạng log
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.printf(({ level, message, timestamp, stack }) => {
    return `${timestamp} ${level.toUpperCase()}: ${stack || message}`;
  })
);

// Tạo logger với các cấu hình
const logger = winston.createLogger({
  level: config.logLevel,
  format: winston.format.combine(
    winston.format.errors({ stack: true }),
    logFormat
  ),
  transports: [
    // Log thông tin vào console
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        logFormat
      ),
    }),
    
    // Log errors vào file
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    
    // Log tất cả vào file
    new winston.transports.File({
      filename: 'logs/combined.log',
      maxsize: 5242880, // 5MB
      maxFiles: 10,
    }),
  ],
});

// Không ghi log vào file khi ở môi trường test
if (process.env.NODE_ENV === 'test') {
  logger.transports.forEach((t) => {
    if (t instanceof winston.transports.File) {
      t.silent = true;
    }
  });
}

module.exports = logger; 