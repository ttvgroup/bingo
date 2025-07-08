const TelegramBot = require('node-telegram-bot-api');
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: false });

exports.sendMessage = async (chatId, message) => {
  try {
    await bot.sendMessage(chatId, message);
  } catch (error) {
    console.error('Error sending Telegram message:', error);
    throw error;
  }
};

exports.notifyWinners = async (winners, result) => {
  for (const winner of winners) {
    const message = `Chúc mừng! Bạn đã trúng thưởng!\nSố trúng: ${result.twoDigitNumber} (2D) hoặc ${result.threeDigitNumber} (3D)\nSố tiền thắng: ${winner.amount * 70}`;
    await bot.sendMessage(winner.userId.telegramId, message);
  }
};