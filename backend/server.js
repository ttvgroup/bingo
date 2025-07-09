const express = require('express');
const mongoose = require('mongoose');
const helmet = require('helmet');
const cors = require('cors');
const { initRedisClient, getRedisClient } = require('./config/redis');
const config = require('./config');
const apiRoutes = require('./routes/api');
const logger = require('./utils/logger');
const { sanitizeJson } = require('./middleware/validation');

// Khởi tạo ứng dụng Express
const app = express();

// Middleware bảo mật và CORS
app.use(helmet());
app.use(cors({
  origin: config.allowedOrigins || '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-telegram-auth']
}));

// Middleware xử lý dữ liệu JSON
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));
app.use(sanitizeJson);

// Middleware ghi log
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.url}`);
  next();
});

// API Routes
app.use('/api', apiRoutes);

// Error handler
app.use((err, req, res, next) => {
  logger.error(`Error: ${err.message}`, { stack: err.stack });
  
  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';
  const errors = err.errors || [];
  
  res.status(statusCode).json({
    success: false,
    message,
    errors
  });
});

// Hàm khởi tạo kết nối database
const connectDB = async () => {
  try {
    await mongoose.connect(config.mongoURI, {
      useNewUrlParser: true,
      useUnifiedTopology: true
    });
    logger.info('MongoDB connected');
    return true;
  } catch (error) {
    logger.error(`MongoDB connection error: ${error.message}`, { stack: error.stack });
    return false;
  }
};

// Khởi động server
const startServer = async () => {
  try {
    // Kết nối MongoDB
    const dbConnected = await connectDB();
    if (!dbConnected) {
      logger.error('Failed to connect to MongoDB, exiting application');
      process.exit(1);
    }
    
    // Khởi tạo Redis client
    await initRedisClient();
    
    // Kiểm tra xem Redis có kết nối thành công không (không bắt buộc)
    const redisClient = getRedisClient();
    if (!redisClient || !redisClient.isOpen) {
      logger.warn('Redis connection failed, continuing without cache');
    }
    
    // Khởi động server
    const PORT = config.port || 5000;
    const server = app.listen(PORT, () => {
      logger.info(`Server running in ${config.nodeEnv || 'development'} mode on port ${PORT}`);
    });
    
    // Xử lý graceful shutdown
    const gracefulShutdown = async () => {
      logger.info('Received shutdown signal, closing connections...');
      
      // Đóng HTTP server
      server.close(() => {
        logger.info('HTTP server closed');
      });
      
      // Đóng Redis connection
      if (redisClient && redisClient.isOpen) {
        await redisClient.quit();
        logger.info('Redis connection closed');
      }
      
      // Đóng MongoDB connection
      if (mongoose.connection.readyState === 1) {
        await mongoose.connection.close();
        logger.info('MongoDB connection closed');
      }
      
      logger.info('Graceful shutdown completed');
      process.exit(0);
    };
    
    // Bắt các sự kiện để graceful shutdown
    process.on('SIGTERM', gracefulShutdown);
    process.on('SIGINT', gracefulShutdown);
    
    // Xử lý lỗi không bắt được
    process.on('unhandledRejection', (reason, promise) => {
      logger.error(`Unhandled Rejection at: ${promise}, reason: ${reason}`);
    });
    
    process.on('uncaughtException', (error) => {
      logger.error(`Uncaught Exception: ${error.message}`, { stack: error.stack });
      
      // Lỗi không xử lý được thì shutdown gracefully
      gracefulShutdown().catch((err) => {
        logger.error(`Error during graceful shutdown: ${err.message}`);
        process.exit(1);
      });
    });
  } catch (error) {
    logger.error(`Error starting server: ${error.message}`, { stack: error.stack });
    process.exit(1);
  }
};

// Khởi động server
startServer();

module.exports = { app };