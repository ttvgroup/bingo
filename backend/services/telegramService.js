const TelegramBot = require('node-telegram-bot-api');
const config = require('../config');
const logger = require('../utils/logger');
const crypto = require('crypto');
const User = require('../models/User');

// Khởi tạo bot Telegram với token từ config
const bot = new TelegramBot(config.telegramBotToken, { polling: false });

/**
 * Khởi động bot với chức năng polling và đăng ký các lệnh
 */
exports.startBot = () => {
  // Kích hoạt polling nếu không đang ở chế độ webhook
  bot.startPolling({ polling: true });
  
  logger.info('Telegram bot started in polling mode');
  
  // Đăng ký lệnh /start
  bot.onText(/\/start/, async (msg) => {
    const chatId = msg.chat.id;
    const username = msg.chat.username || msg.from.first_name;
    const telegramId = msg.from.id.toString();
    
    try {
      // Kiểm tra xem người dùng đã tồn tại chưa
      let user = await User.findOne({ telegramId });
      
      if (!user) {
        // Nếu chưa tồn tại, tạo user mới với telegramId làm _id
        user = new User({
          _id: telegramId, // Sử dụng telegramId làm _id
          telegramId,
          username,
          balance: 0, // Số dư mặc định là 0
          role: 'user'
        });
        
        await user.save();
        logger.info(`New user registered from Telegram: ${telegramId} (${username})`);
        
        await bot.sendMessage(
          chatId,
          `Chào mừng ${username} đến với Bot Xổ Số! 🎮\n\nTài khoản của bạn đã được tạo thành công với số dư 0 điểm.`
        );
      } else {
        // Nếu đã tồn tại, gửi lời chào
        await bot.sendMessage(
          chatId,
          `Chào mừng ${username} quay trở lại! 👋\n\nSố dư hiện tại của bạn là ${user.balance} điểm.`
        );
      }
    } catch (error) {
      logger.error(`Error handling start command: ${error.message}`, { stack: error.stack });
      await bot.sendMessage(chatId, 'Có lỗi xảy ra khi xử lý yêu cầu của bạn. Vui lòng thử lại sau.');
    }
  });
  
  // Đăng ký các lệnh khác
  bot.onText(/\/help/, async (msg) => {
    const chatId = msg.chat.id;
    await bot.sendMessage(
      chatId,
      `Các lệnh có sẵn:\n
/start - Bắt đầu sử dụng bot
/help - Hiển thị trợ giúp
/balance - Kiểm tra số dư
/history - Xem lịch sử cược`
    );
  });
  
  bot.onText(/\/balance/, async (msg) => {
    const chatId = msg.chat.id;
    const telegramId = msg.from.id.toString();
    
    try {
      const user = await User.findOne({ telegramId });
      if (user) {
        await bot.sendMessage(chatId, `Số dư hiện tại của bạn là: ${user.balance} điểm`);
      } else {
        await bot.sendMessage(chatId, 'Bạn chưa đăng ký tài khoản. Vui lòng sử dụng lệnh /start');
      }
    } catch (error) {
      logger.error(`Error checking balance: ${error.message}`);
      await bot.sendMessage(chatId, 'Có lỗi xảy ra khi kiểm tra số dư.');
    }
  });
};

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

/**
 * Gửi thông báo giao dịch chuyển tiền
 * @param {String} receiverTelegramId - ID Telegram của người nhận
 * @param {Object} transaction - Thông tin giao dịch
 * @param {Object} sender - Thông tin người gửi
 * @param {Object} receiver - Thông tin người nhận
 * @returns {Promise<void>}
 */
exports.sendTransferNotification = async (receiverTelegramId, transaction, sender, receiver) => {
  try {
    const formattedAmount = transaction.amount.toLocaleString('vi-VN');
    const formattedBalance = receiver.balance.toLocaleString('vi-VN');
    const senderName = sender.username || sender.telegramId;
    const date = new Date().toLocaleString('vi-VN');
    
    const message = `
💰 *THÔNG BÁO NHẬN ĐIỂM* 💰

🔹 *Người gửi:* ${senderName}
🔹 *Số điểm:* ${formattedAmount}
🔹 *Thời gian:* ${date}
🔹 *Mô tả:* ${transaction.description || 'Không có mô tả'}
🔹 *Mã giao dịch:* \`${transaction._id}\`

💼 *Số dư hiện tại:* ${formattedBalance} điểm

_Cảm ơn bạn đã sử dụng dịch vụ của chúng tôi!_
`;

    await exports.sendMessage(receiverTelegramId, message);
  } catch (error) {
    console.error('Không thể gửi thông báo chuyển tiền:', error);
  }
};

/**
 * Gửi thông báo tạo điểm cho admin
 * @param {String} adminTelegramId - ID Telegram của admin
 * @param {Number} amount - Số điểm đã tạo
 * @param {Number} dailyCreated - Tổng điểm đã tạo trong ngày
 * @param {Number} dailyLimit - Giới hạn điểm tạo mỗi ngày
 * @returns {Promise<void>}
 */
exports.sendPointCreationNotification = async (adminTelegramId, amount, dailyCreated, dailyLimit) => {
  try {
    const formattedAmount = amount.toLocaleString('vi-VN');
    const formattedDailyCreated = dailyCreated.toLocaleString('vi-VN');
    const formattedDailyLimit = dailyLimit.toLocaleString('vi-VN');
    const remainingToday = dailyLimit - dailyCreated;
    const formattedRemaining = remainingToday.toLocaleString('vi-VN');
    const date = new Date().toLocaleString('vi-VN');
    
    const message = `
🔰 *THÔNG BÁO TẠO ĐIỂM* 🔰

✅ Bạn đã tạo thành công *${formattedAmount}* điểm

📊 *Thống kê ngày ${date.split(',')[0]}:*
🔹 Đã tạo: ${formattedDailyCreated} điểm
🔹 Giới hạn: ${formattedDailyLimit} điểm
🔹 Còn lại: ${formattedRemaining} điểm

⏱ *Thời gian:* ${date}
`;

    await exports.sendMessage(adminTelegramId, message);
  } catch (error) {
    console.error('Không thể gửi thông báo tạo điểm:', error);
  }
};

/**
 * Gửi thông báo xác thực hai lớp
 * @param {String} telegramId - ID Telegram của người dùng
 * @param {String} code - Mã xác thực
 * @param {String} purpose - Mục đích xác thực
 * @returns {Promise<void>}
 */
exports.sendTwoFactorCode = async (telegramId, code, purpose) => {
  try {
    let purposeText = 'xác thực';
    switch (purpose) {
      case 'transaction':
        purposeText = 'giao dịch';
        break;
      case 'login':
        purposeText = 'đăng nhập';
        break;
      case 'point_creation':
        purposeText = 'tạo điểm';
        break;
      case 'withdraw':
        purposeText = 'rút tiền';
        break;
    }
    
    const message = `
🔐 *MÃ XÁC THỰC HAI LỚP*

Mã xác thực ${purposeText} của bạn là:

*${code}*

⏱ Mã có hiệu lực trong 5 phút.
⚠️ KHÔNG CHIA SẺ mã này với bất kỳ ai!
`;

    await exports.sendMessage(telegramId, message);
  } catch (error) {
    console.error('Không thể gửi mã xác thực hai lớp:', error);
  }
};