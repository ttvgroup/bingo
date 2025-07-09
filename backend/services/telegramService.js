const TelegramBot = require('node-telegram-bot-api');
const config = require('../config');
const logger = require('../utils/logger');
const crypto = require('crypto');
const User = require('../models/User');

// Khởi tạo bot Telegram với token từ config
const bot = new TelegramBot(config.telegramBotToken, { polling: false });

/**
 * Gửi tin nhắn qua Telegram
 * @param {string} chatId - ID của cuộc trò chuyện
 * @param {string} message - Nội dung tin nhắn
 * @returns {Promise} - Kết quả gửi tin nhắn
 */
exports.sendMessage = async (chatId, message) => {
  try {
    return await bot.sendMessage(chatId, message, { parse_mode: 'HTML' });
  } catch (error) {
    logger.error(`Error sending Telegram message: ${error.message}`);
    throw error;
  }
};

/**
 * Thông báo cho người thắng cuộc
 * @param {Array} winners - Danh sách người thắng
 * @param {Object} result - Kết quả xổ số
 */
exports.notifyWinners = async (winners, result) => {
  try {
    for (const winner of winners) {
      const message = `
<b>🎉 Chúc mừng!</b> Bạn đã thắng!

<b>Số đã đặt:</b> ${winner.bet.numbers}
<b>Loại cược:</b> ${winner.bet.betType}
<b>Số tiền thắng:</b> ${winner.winAmount}

<b>Kết quả:</b> ${result.date.toLocaleDateString('vi-VN')}
<b>Tỉnh:</b> ${winner.province.name}
      `;
      
      await exports.sendMessage(winner.telegramId, message);
    }
    
    // Thông báo trên kênh chung
    if (winners.length > 0 && config.telegramChannelId) {
      const channelMessage = `
<b>🎊 KẾT QUẢ XỔ SỐ NGÀY ${result.date.toLocaleDateString('vi-VN')}</b>

<b>Tổng số người thắng:</b> ${winners.length}
<b>Tổng tiền thưởng:</b> ${winners.reduce((total, w) => total + w.winAmount, 0)}

Xin chúc mừng tất cả những người thắng cuộc! 🎉
      `;
      
      await exports.sendMessage(config.telegramChannelId, channelMessage);
    }
  } catch (error) {
    logger.error(`Error notifying winners: ${error.message}`);
    throw error;
  }
};

/**
 * Gửi mã xác thực qua Telegram cho người dùng admin
 * @param {string} telegramId - ID Telegram của admin
 * @returns {Promise<boolean>} - Kết quả gửi mã xác thực
 */
exports.sendAuthCode = async (telegramId) => {
  try {
    // Tìm user với telegramId
    const user = await User.findOne({ telegramId, role: 'admin' });
    
    if (!user) {
      logger.error(`Admin not found with Telegram ID: ${telegramId}`);
      return false;
    }
    
    // Tạo mã xác thực 6 chữ số
    const authCode = crypto.randomInt(100000, 999999).toString();
    
    // Lưu mã xác thực vào user với thời hạn 5 phút
    user.telegramAuthCode = {
      code: authCode,
      expiresAt: new Date(Date.now() + 5 * 60 * 1000) // 5 phút
    };
    
    await user.save();
    
    // Gửi mã xác thực qua Telegram
    const message = `
<b>🔐 Mã xác thực đăng nhập</b>

Mã xác thực của bạn là: <code>${authCode}</code>

Mã này có hiệu lực trong 5 phút.
<i>Không chia sẻ mã này với bất kỳ ai!</i>
    `;
    
    await exports.sendMessage(telegramId, message);
    return true;
  } catch (error) {
    logger.error(`Error sending auth code: ${error.message}`);
    return false;
  }
};

/**
 * Thông báo đăng nhập từ thiết bị mới
 * @param {string} telegramId - ID Telegram của admin
 * @param {Object} deviceInfo - Thông tin thiết bị
 */
exports.notifyNewDeviceLogin = async (telegramId, deviceInfo) => {
  try {
    const message = `
<b>⚠️ Đăng nhập mới</b>

Tài khoản của bạn vừa được đăng nhập từ một thiết bị mới:

<b>Thiết bị:</b> ${deviceInfo.deviceName || 'Không xác định'}
<b>Thời gian:</b> ${new Date().toLocaleString('vi-VN')}

Nếu đây không phải là bạn, vui lòng thay đổi mật khẩu ngay lập tức!
    `;
    
    await exports.sendMessage(telegramId, message);
  } catch (error) {
    logger.error(`Error notifying new device login: ${error.message}`);
  }
};