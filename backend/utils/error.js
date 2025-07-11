/**
 * Class ApiError để xử lý lỗi API một cách nhất quán
 * @extends Error
 */
class ApiError extends Error {
  /**
   * Tạo một ApiError
   * @param {string} message - Thông báo lỗi
   * @param {number} statusCode - HTTP status code
   * @param {Array|Object} errors - Danh sách lỗi chi tiết (tùy chọn)
   * @param {boolean} isOperational - Có phải lỗi nghiệp vụ không (mặc định: true)
   */
  constructor(message, statusCode = 500, errors = [], isOperational = true) {
    super(message);
    
    this.statusCode = statusCode;
    this.errors = errors;
    this.isOperational = isOperational;
    this.status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';
    
    Error.captureStackTrace(this, this.constructor);
  }
  
  /**
   * Tạo lỗi Bad Request (400)
   * @param {string} message - Thông báo lỗi
   * @param {Array|Object} errors - Danh sách lỗi chi tiết (tùy chọn)
   * @returns {ApiError} - Đối tượng ApiError
   */
  static badRequest(message, errors = []) {
    return new ApiError(message || 'Bad Request', 400, errors);
  }
  
  /**
   * Tạo lỗi Unauthorized (401)
   * @param {string} message - Thông báo lỗi
   * @returns {ApiError} - Đối tượng ApiError
   */
  static unauthorized(message) {
    return new ApiError(message || 'Unauthorized', 401);
  }
  
  /**
   * Tạo lỗi Forbidden (403)
   * @param {string} message - Thông báo lỗi
   * @returns {ApiError} - Đối tượng ApiError
   */
  static forbidden(message) {
    return new ApiError(message || 'Forbidden', 403);
  }
  
  /**
   * Tạo lỗi Not Found (404)
   * @param {string} message - Thông báo lỗi
   * @returns {ApiError} - Đối tượng ApiError
   */
  static notFound(message) {
    return new ApiError(message || 'Resource not found', 404);
  }
  
  /**
   * Tạo lỗi Internal Server Error (500)
   * @param {string} message - Thông báo lỗi
   * @param {boolean} isOperational - Có phải lỗi nghiệp vụ không
   * @returns {ApiError} - Đối tượng ApiError
   */
  static internal(message, isOperational = false) {
    return new ApiError(message || 'Internal Server Error', 500, [], isOperational);
  }
}

module.exports = ApiError;