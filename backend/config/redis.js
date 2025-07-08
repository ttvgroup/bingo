const redis = require('redis');
const config = require('./index');
const logger = require('../utils/logger');

const redisClient = redis.createClient({
  url: config.redisUrl,
  retry_strategy: (options) => {
    if (options.error && options.error.code === 'ECONNREFUSED') {
      logger.error('Redis connection refused. Retrying...');
      return Math.min(options.attempt * 100, 3000); // Retry after 100ms, max 3s
    }
    return undefined; // Stop retrying on other errors
  },
});

redisClient.on('error', (err) => logger.error('Redis Client Error:', err));
redisClient.on('connect', () => logger.info('Redis connected'));

redisClient.connect().catch((err) => logger.error('Redis connection failed:', err));

module.exports = redisClient;