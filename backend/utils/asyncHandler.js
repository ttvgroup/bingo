/**
 * Wrapper cho các hàm async để xử lý lỗi mà không cần try-catch
 * @param {Function} fn - Hàm async cần wrap
 * @returns {Function} - Middleware Express với xử lý lỗi
 */
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

module.exports = asyncHandler; 