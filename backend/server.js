const express = require('express');
const mongoose = require('mongoose');
const redis = require('redis');
const helmet = require('helmet');
const cors = require('cors');
const config = require('./config');
const apiRoutes = require('./routes/api');
const logger = require('./utils/logger');

const app = express();

// Security middleware
app.use(helmet());
app.use(cors({
  origin: config.allowedOrigins,
  methods: ['GET', 'POST', 'PUT', 'DELETE'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());

// Connect to MongoDB
mongoose.connect(config.mongoURI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
})
  .then(() => logger.info('MongoDB connected'))
  .catch((err) => logger.error('MongoDB connection error:', err));

// Connect to Redis
const redisClient = redis.createClient({ 
  url: config.redisUrl,
  socket: {
    reconnectStrategy: (retries) => Math.min(retries * 50, 1000)
  }
});

redisClient.on('error', (err) => logger.error('Redis Client Error', err));
redisClient.on('connect', () => logger.info('Connected to Redis'));
redisClient.on('reconnecting', () => logger.warn('Reconnecting to Redis'));

(async () => {
  try {
    await redisClient.connect();
  } catch (err) {
    logger.error('Redis connection failed:', err);
  }
})();

// Routes
app.use('/api', apiRoutes);

// Start server
const PORT = config.port;
app.listen(PORT, () => logger.info(`Server running on port ${PORT}`));

// Handle unhandled rejections
process.on('unhandledRejection', (err) => {
  logger.error('Unhandled Rejection:', err);
  // Không terminate process trong môi trường production
  if (process.env.NODE_ENV !== 'production') {
    process.exit(1);
  }
});

module.exports = { app, redisClient };