const betService = require('../services/betService');
const logger = require('../utils/logger');

/**
 * Đặt cược
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
exports.placeBet = async (req, res, next) => {
  try {
    const { numbers, betType, amount, provinceCode } = req.body;
    const telegramId = req.user.id;

    const result = await betService.placeBet(telegramId, numbers, betType, amount, provinceCode);
    
    res.status(201).json({ 
      message: 'Đặt cược thành công', 
      bet: result.bet, 
      balance: result.balance 
    });
  } catch (error) {
    next(error);
  }
};

/**
 * Lấy danh sách cược của người dùng
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
exports.getUserBets = async (req, res, next) => {
  try {
    const telegramId = req.user.id;
    const result = await betService.getUserBets(telegramId);
    
    res.json(result);
  } catch (error) {
    logger.error('Error in getUserBets controller:', error);
    next(error);
  }
};

/**
 * Lấy thông tin cược theo ID
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
exports.getBetById = async (req, res, next) => {
  try {
    const telegramId = req.user.id;
    const { id } = req.params;
    
    const bet = await betService.getBetById(id, telegramId);
    
    res.json({ bet });
  } catch (error) {
    logger.error('Error in getBetById controller:', error);
    next(error);
  }
};

/**
 * Lấy danh sách các loại cược
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
exports.getBetTypes = async (req, res, next) => {
  try {
    const betTypes = await betService.getBetTypes();
    
    res.json({ betTypes });
  } catch (error) {
    logger.error('Error in getBetTypes controller:', error);
    next(error);
  }
};