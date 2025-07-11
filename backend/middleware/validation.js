const { body, validationResult } = require('express-validator');
const ApiError = require('../utils/error');

/**
 * Middleware xác thực đầu vào chung
 */
exports.validate = (req, res, next) => {
  const errors = validationResult(req);
  
  if (!errors.isEmpty()) {
    const errorMessages = errors.array().map(error => ({
      field: error.param,
      message: error.msg
    }));
    
    return next(new ApiError('Validation error', 400, errorMessages));
  }
  
  next();
};

/**
 * Xác thực tham số cho kết quả xổ số
 */
exports.resultValidation = [
  body('date')
    .isISO8601().withMessage('Ngày không hợp lệ, yêu cầu định dạng ISO 8601')
    .toDate(),
    
  body('weekday')
    .isIn(['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật'])
    .withMessage('Thứ trong tuần không hợp lệ'),
    
  body('region')
    .isIn(['Miền Bắc', 'Miền Trung', 'Miền Nam'])
    .withMessage('Khu vực không hợp lệ'),
    
  body('provinces')
    .isArray({ min: 1 }).withMessage('Phải có ít nhất một tỉnh'),
    
  body('provinces.*.name')
    .notEmpty().withMessage('Tên tỉnh không được để trống'),
    
  body('provinces.*.code')
    .notEmpty().withMessage('Mã tỉnh không được để trống'),
    
  body('provinces.*.results')
    .notEmpty().withMessage('Kết quả không được để trống'),
    
  body('provinces.*.results.eighth')
    .matches(/^\d{2}$/).withMessage('Giải 8 phải có đúng 2 chữ số'),
    
  body('provinces.*.results.seventh')
    .matches(/^\d{3}$/).withMessage('Giải 7 phải có đúng 3 chữ số'),
    
  body('provinces.*.results.sixth')
    .isArray().withMessage('Giải 6 phải là mảng')
    .custom(values => {
      if (!Array.isArray(values) || values.length < 3) return false;
      return values.every(num => /^\d{4}$/.test(num));
    }).withMessage('Giải 6 phải chứa các số có 4 chữ số'),
    
  body('provinces.*.results.fifth')
    .matches(/^\d{4}$/).withMessage('Giải 5 phải có đúng 4 chữ số'),
    
  body('provinces.*.results.fourth')
    .isArray().withMessage('Giải 4 phải là mảng')
    .custom(values => {
      if (!Array.isArray(values) || values.length < 4) return false;
      return values.every(num => /^\d{5}$/.test(num));
    }).withMessage('Giải 4 phải chứa các số có 5 chữ số'),
    
  body('provinces.*.results.third')
    .isArray().withMessage('Giải 3 phải là mảng')
    .custom(values => {
      if (!Array.isArray(values) || values.length < 2) return false;
      return values.every(num => /^\d{5}$/.test(num));
    }).withMessage('Giải 3 phải chứa các số có 5 chữ số'),
    
  body('provinces.*.results.second')
    .matches(/^\d{5}$/).withMessage('Giải nhì phải có đúng 5 chữ số'),
    
  body('provinces.*.results.first')
    .matches(/^\d{5}$/).withMessage('Giải nhất phải có đúng 5 chữ số'),
    
  body('provinces.*.results.special')
    .matches(/^\d{6}$/).withMessage('Giải đặc biệt phải có đúng 6 chữ số')
];

/**
 * Xác thực tham số cho giao dịch
 */
exports.transactionValidation = [
  body('amount')
    .isInt({ min: 1000 }).withMessage('Số tiền phải lớn hơn hoặc bằng 1,000')
    .isInt({ max: 100000000 }).withMessage('Số tiền không được vượt quá 100,000,000')
];

/**
 * Middleware để làm sạch dữ liệu JSON đầu vào
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
exports.sanitizeJson = (req, res, next) => {
  if (req.body && typeof req.body === 'object') {
    // Loại bỏ các trường có giá trị undefined hoặc null
    Object.keys(req.body).forEach(key => {
      if (req.body[key] === undefined || req.body[key] === null) {
        delete req.body[key];
      }
    });
    
    // Loại bỏ các ký tự đặc biệt trong các trường string
    sanitizeObject(req.body);
  }
  
  next();
};

/**
 * Hàm đệ quy để làm sạch dữ liệu trong object
 * @param {Object} obj - Object cần làm sạch
 */
function sanitizeObject(obj) {
  Object.keys(obj).forEach(key => {
    const value = obj[key];
    
    if (typeof value === 'string') {
      // Loại bỏ các ký tự đặc biệt trong string
      obj[key] = sanitizeString(value);
    } else if (typeof value === 'object' && value !== null) {
      // Làm sạch đệ quy cho object con
      sanitizeObject(value);
    }
  });
}

/**
 * Hàm làm sạch string
 * @param {String} str - String cần làm sạch
 * @returns {String} - String đã làm sạch
 */
function sanitizeString(str) {
  // Loại bỏ các ký tự có thể gây lỗi bảo mật
  return str
    .replace(/[<>]/g, '') // Loại bỏ các thẻ HTML
    .replace(/javascript:/gi, '') // Loại bỏ javascript:
    .replace(/on\w+=/gi, ''); // Loại bỏ các sự kiện on*=
} 