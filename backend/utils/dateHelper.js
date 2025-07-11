/**
 * Các chức năng hỗ trợ xử lý ngày tháng cho hệ thống
 * Tất cả các hàm đều xử lý theo múi giờ GMT+7 (Việt Nam)
 */

/**
 * Chuyển đổi đối tượng Date thành múi giờ Việt Nam (GMT+7)
 * @param {Date} date - Đối tượng ngày cần chuyển đổi
 * @returns {Date} Đối tượng Date theo múi giờ GMT+7
 */
exports.convertToVietnamTime = (date) => {
  if (!date) return null;
  const d = new Date(date);
  // Chuyển đổi sang GMT+7
  return new Date(d.getTime() + 7 * 60 * 60 * 1000);
};

/**
 * Lấy ngày hiện tại theo múi giờ Việt Nam
 * @returns {Date} Ngày hiện tại theo múi giờ GMT+7
 */
exports.getCurrentVietnamTime = () => {
  const now = new Date();
  return exports.convertToVietnamTime(now);
};

/**
 * Định dạng ngày theo kiểu DD/MM/YYYY (GMT+7)
 * @param {Date} date - Đối tượng ngày
 * @returns {string} Chuỗi ngày đã định dạng
 */
exports.formatDateVN = (date) => {
  if (!date) return '';
  const vietnamDate = exports.convertToVietnamTime(date);
  const day = String(vietnamDate.getUTCDate()).padStart(2, '0');
  const month = String(vietnamDate.getUTCMonth() + 1).padStart(2, '0');
  const year = vietnamDate.getUTCFullYear();
  
  return `${day}/${month}/${year}`;
};

/**
 * Định dạng ngày giờ đầy đủ theo kiểu DD/MM/YYYY HH:MM (GMT+7)
 * @param {Date} date - Đối tượng ngày
 * @returns {string} Chuỗi ngày giờ đã định dạng
 */
exports.formatDateTimeVN = (date) => {
  if (!date) return '';
  const vietnamDate = exports.convertToVietnamTime(date);
  const day = String(vietnamDate.getUTCDate()).padStart(2, '0');
  const month = String(vietnamDate.getUTCMonth() + 1).padStart(2, '0');
  const year = vietnamDate.getUTCFullYear();
  const hour = String(vietnamDate.getUTCHours()).padStart(2, '0');
  const minute = String(vietnamDate.getUTCMinutes()).padStart(2, '0');
  
  return `${day}/${month}/${year} ${hour}:${minute}`;
};

/**
 * Tạo đối tượng Date từ chuỗi định dạng ngày Việt Nam DD/MM/YYYY
 * @param {string} dateStr - Chuỗi ngày định dạng DD/MM/YYYY
 * @returns {Date} Đối tượng Date
 */
exports.parseVNDate = (dateStr) => {
  if (!dateStr) return null;
  
  const parts = dateStr.split('/');
  if (parts.length !== 3) return null;
  
  const day = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1; // Tháng trong JS bắt đầu từ 0
  const year = parseInt(parts[2], 10);
  
  // Tạo Date với giờ 00:00:00 GMT+7
  const date = new Date(Date.UTC(year, month, day, -7, 0, 0));
  return date;
};

/**
 * So sánh hai ngày (chỉ ngày/tháng/năm, không bao gồm giờ)
 * @param {Date} date1 - Ngày thứ nhất
 * @param {Date} date2 - Ngày thứ hai
 * @returns {boolean} true nếu hai ngày giống nhau
 */
exports.isSameDay = (date1, date2) => {
  if (!date1 || !date2) return false;
  
  const d1 = exports.convertToVietnamTime(date1);
  const d2 = exports.convertToVietnamTime(date2);
  
  return (
    d1.getUTCFullYear() === d2.getUTCFullYear() &&
    d1.getUTCMonth() === d2.getUTCMonth() &&
    d1.getUTCDate() === d2.getUTCDate()
  );
};

/**
 * Lấy ngày đầu tiên của tuần hiện tại (Thứ 2) theo múi giờ GMT+7
 * @param {Date} date - Ngày cần lấy (mặc định là ngày hiện tại)
 * @returns {Date} Ngày đầu tuần
 */
exports.getFirstDayOfWeek = (date = new Date()) => {
  const vietnamDate = exports.convertToVietnamTime(date);
  const day = vietnamDate.getUTCDay() || 7; // Chuyển 0 (Chủ nhật) thành 7
  const diff = vietnamDate.getUTCDate() - day + 1; // Ngày đầu tuần (thứ 2)
  
  return new Date(Date.UTC(
    vietnamDate.getUTCFullYear(),
    vietnamDate.getUTCMonth(),
    diff,
    -7, 0, 0
  ));
};

/**
 * Lấy ngày cuối cùng của tuần hiện tại (Chủ nhật) theo múi giờ GMT+7
 * @param {Date} date - Ngày cần lấy (mặc định là ngày hiện tại)
 * @returns {Date} Ngày cuối tuần
 */
exports.getLastDayOfWeek = (date = new Date()) => {
  const firstDay = exports.getFirstDayOfWeek(date);
  return new Date(Date.UTC(
    firstDay.getUTCFullYear(),
    firstDay.getUTCMonth(),
    firstDay.getUTCDate() + 6,
    -7, 0, 0
  ));
}; 