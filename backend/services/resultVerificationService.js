// Service này đã không còn cần thiết vì chức năng xác thực kết quả từ bên ngoài đã được loại bỏ
// Giữ lại file này để đảm bảo các import không bị lỗi

const axios = require('axios');
const logger = require('../utils/logger');

/**
 * Service giả định, không thực hiện chức năng xác thực kết quả từ nguồn bên ngoài
 * Được giữ lại để đảm bảo khả năng tương thích với code hiện tại
 */
exports.verifyResult = async (result) => {
  try {
    // Trả về kết quả xác thực giả định luôn thành công
    return {
      isVerified: true,
      source: "internal",
      details: {
        message: "Xác thực kết quả nội bộ",
        timestamp: new Date()
      }
    };
  } catch (error) {
    logger.error(`Error during result verification: ${error.message}`);
    return {
      isVerified: false,
      error: error.message
    };
  }
};

/**
 * Phương thức giả định chỉ trả về kết quả đã cung cấp
 */
exports.fetchExternalResult = async (date, provinceCode) => {
  return null;
}; 