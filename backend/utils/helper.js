const config = require('../config');
const dateHelper = require('./dateHelper');

/**
 * Kiểm tra định dạng số
 * @param {string} number - Số cần kiểm tra
 * @param {string} type - Loại số (2D, 3D, 4D)
 * @returns {boolean} - Kết quả kiểm tra
 */
exports.validateNumber = (number, type) => {
  if (type === '2D') {
    return /^[0-9]{2}$/.test(number);
  }
  if (type === '3D') {
    return /^[0-9]{3}$/.test(number);
  }
  if (type === '4D') {
    return /^[0-9]{4}$/.test(number);
  }
  return false;
};

/**
 * Định dạng ngày theo kiểu DD/MM/YYYY (GMT+7)
 * @param {Date} date - Đối tượng ngày
 * @returns {string} Ngày đã định dạng
 */
exports.formatDate = (date) => {
  return dateHelper.formatDateVN(date);
};

/**
 * Định dạng ngày giờ đầy đủ (GMT+7)
 * @param {Date} date - Đối tượng ngày
 * @returns {string} - Ngày giờ đã định dạng
 */
exports.formatDateTime = (date) => {
  return dateHelper.formatDateTimeVN(date);
};

/**
 * Chuyển đổi múi giờ
 * @param {Date} date - Đối tượng ngày theo UTC
 * @param {string} timezone - Múi giờ cần chuyển đổi
 * @returns {Date} Đối tượng ngày đã chuyển đổi
 */
exports.convertToTimezone = (date, timezone = config.timeZone) => {
  if (timezone === 'Asia/Ho_Chi_Minh' || timezone === 'GMT+7') {
    return dateHelper.convertToVietnamTime(date);
  }
  return new Date(date.toLocaleString('en-US', { timeZone: timezone }));
};

/**
 * Lấy ngày hiện tại theo múi giờ GMT+7
 * @returns {Date} Đối tượng ngày hiện tại theo GMT+7
 */
exports.getCurrentVietnamTime = () => {
  return dateHelper.getCurrentVietnamTime();
};

/**
 * So sánh hai ngày (chỉ ngày/tháng/năm, không bao gồm giờ) theo GMT+7
 * @param {Date} date1 - Ngày thứ nhất
 * @param {Date} date2 - Ngày thứ hai
 * @returns {boolean} true nếu hai ngày giống nhau
 */
exports.isSameDay = (date1, date2) => {
  return dateHelper.isSameDay(date1, date2);
};

/**
 * Định dạng số tiền theo VND
 * @param {number} amount - Số tiền
 * @returns {string} - Số tiền đã định dạng
 */
exports.formatCurrency = (amount) => {
  return new Intl.NumberFormat('vi-VN', {
    style: 'currency',
    currency: 'VND',
    minimumFractionDigits: 0
  }).format(amount);
};

/**
 * Tạo mã ID giao dịch ngắn gọn
 * @returns {string} - Mã ID
 */
exports.generateTransactionCode = () => {
  const now = new Date();
  const timestamp = now.getTime().toString().slice(-8);
  const random = Math.floor(Math.random() * 10000).toString().padStart(4, '0');
  return `TX${timestamp}${random}`;
};