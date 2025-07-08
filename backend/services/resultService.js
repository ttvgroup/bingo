const Result = require('../models/Result');
const ApiError = require('../utils/error');
const logger = require('../utils/logger');

/**
 * Lọc kết quả xổ số theo chữ số cuối
 * @param {string} resultId - ID của kết quả hoặc null để lấy kết quả mới nhất
 * @param {number} lastDigit - Chữ số cuối cần lọc (0-9)
 * @returns {Promise<Object>} Kết quả đã lọc
 */
exports.filterByLastDigit = async (resultId, lastDigit) => {
  try {
    // Kiểm tra tham số đầu vào
    if (lastDigit < 0 || lastDigit > 9 || !Number.isInteger(lastDigit)) {
      throw new ApiError(400, 'Chữ số cuối phải là số nguyên từ 0 đến 9');
    }

    // Lấy kết quả xổ số
    let result;
    if (resultId) {
      result = await Result.findById(resultId);
      if (!result) {
        throw new ApiError(404, 'Không tìm thấy kết quả');
      }
    } else {
      result = await Result.findOne().sort({ date: -1 });
      if (!result) {
        throw new ApiError(404, 'Không có kết quả nào');
      }
    }

    // Lọc kết quả theo chữ số cuối
    const filteredResult = {
      date: result.date,
      weekday: result.weekday,
      region: result.region,
      lastDigit: lastDigit,
      provinces: []
    };

    for (const province of result.provinces) {
      const filteredProvince = {
        name: province.name,
        code: province.code,
        info: province.info,
        results: {
          eighth: endsWithDigit(province.results.eighth, lastDigit) ? province.results.eighth : null,
          seventh: endsWithDigit(province.results.seventh, lastDigit) ? province.results.seventh : null,
          sixth: province.results.sixth.filter(num => endsWithDigit(num, lastDigit)),
          fifth: endsWithDigit(province.results.fifth, lastDigit) ? province.results.fifth : null,
          fourth: province.results.fourth.filter(num => endsWithDigit(num, lastDigit)),
          third: province.results.third.filter(num => endsWithDigit(num, lastDigit)),
          second: endsWithDigit(province.results.second, lastDigit) ? province.results.second : null,
          first: endsWithDigit(province.results.first, lastDigit) ? province.results.first : null,
          special: endsWithDigit(province.results.special, lastDigit) ? province.results.special : null
        }
      };

      filteredProvince.matchCount = countMatches(filteredProvince.results);
      filteredResult.provinces.push(filteredProvince);
    }

    return filteredResult;
  } catch (error) {
    logger.error('Error in filterByLastDigit:', error);
    throw error;
  }
};

/**
 * Lọc kết quả xổ số theo nhiều chữ số cuối
 * @param {string} resultId - ID của kết quả hoặc null để lấy kết quả mới nhất
 * @param {Array<number>} lastDigits - Mảng các chữ số cuối cần lọc (0-9)
 * @returns {Promise<Object>} Kết quả đã lọc
 */
exports.filterByMultipleLastDigits = async (resultId, lastDigits) => {
  try {
    // Kiểm tra tham số đầu vào
    if (!Array.isArray(lastDigits) || lastDigits.length === 0) {
      throw new ApiError(400, 'Cần cung cấp ít nhất một chữ số cuối');
    }

    for (const digit of lastDigits) {
      if (digit < 0 || digit > 9 || !Number.isInteger(digit)) {
        throw new ApiError(400, 'Chữ số cuối phải là số nguyên từ 0 đến 9');
      }
    }

    // Lấy kết quả xổ số
    let result;
    if (resultId) {
      result = await Result.findById(resultId);
      if (!result) {
        throw new ApiError(404, 'Không tìm thấy kết quả');
      }
    } else {
      result = await Result.findOne().sort({ date: -1 });
      if (!result) {
        throw new ApiError(404, 'Không có kết quả nào');
      }
    }

    // Lọc kết quả theo các chữ số cuối
    const filteredResult = {
      date: result.date,
      weekday: result.weekday,
      region: result.region,
      lastDigits: lastDigits,
      provinces: []
    };

    for (const province of result.provinces) {
      const filteredProvince = {
        name: province.name,
        code: province.code,
        info: province.info,
        results: {
          eighth: endsWithAnyDigit(province.results.eighth, lastDigits) ? province.results.eighth : null,
          seventh: endsWithAnyDigit(province.results.seventh, lastDigits) ? province.results.seventh : null,
          sixth: province.results.sixth.filter(num => endsWithAnyDigit(num, lastDigits)),
          fifth: endsWithAnyDigit(province.results.fifth, lastDigits) ? province.results.fifth : null,
          fourth: province.results.fourth.filter(num => endsWithAnyDigit(num, lastDigits)),
          third: province.results.third.filter(num => endsWithAnyDigit(num, lastDigits)),
          second: endsWithAnyDigit(province.results.second, lastDigits) ? province.results.second : null,
          first: endsWithAnyDigit(province.results.first, lastDigits) ? province.results.first : null,
          special: endsWithAnyDigit(province.results.special, lastDigits) ? province.results.special : null
        }
      };

      filteredProvince.matchCount = countMatches(filteredProvince.results);
      filteredResult.provinces.push(filteredProvince);
    }

    return filteredResult;
  } catch (error) {
    logger.error('Error in filterByMultipleLastDigits:', error);
    throw error;
  }
};

/**
 * Lấy thống kê tần suất xuất hiện của các chữ số cuối
 * @param {number} days - Số ngày cần lấy thống kê
 * @returns {Promise<Object>} Thống kê tần suất
 */
exports.getLastDigitFrequency = async (days = 7) => {
  try {
    // Lấy kết quả xổ số trong số ngày quy định
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - days);

    const results = await Result.find({
      date: { $gte: startDate, $lte: endDate }
    }).sort({ date: -1 });

    if (results.length === 0) {
      throw new ApiError(404, 'Không có kết quả nào trong khoảng thời gian này');
    }

    // Khởi tạo đối tượng thống kê
    const frequency = {
      days: days,
      startDate: startDate,
      endDate: endDate,
      totalResults: results.length,
      digits: {}
    };

    // Khởi tạo đếm cho từng chữ số
    for (let i = 0; i < 10; i++) {
      frequency.digits[i] = {
        count: 0,
        byPrize: {
          eighth: 0,
          seventh: 0,
          sixth: 0,
          fifth: 0,
          fourth: 0,
          third: 0,
          second: 0,
          first: 0,
          special: 0
        }
      };
    }

    // Đếm tần suất
    for (const result of results) {
      for (const province of result.provinces) {
        // Giải 8
        const eighthLastDigit = parseInt(province.results.eighth.slice(-1));
        frequency.digits[eighthLastDigit].count++;
        frequency.digits[eighthLastDigit].byPrize.eighth++;

        // Giải 7
        const seventhLastDigit = parseInt(province.results.seventh.slice(-1));
        frequency.digits[seventhLastDigit].count++;
        frequency.digits[seventhLastDigit].byPrize.seventh++;

        // Giải 6
        for (const num of province.results.sixth) {
          const sixthLastDigit = parseInt(num.slice(-1));
          frequency.digits[sixthLastDigit].count++;
          frequency.digits[sixthLastDigit].byPrize.sixth++;
        }

        // Giải 5
        const fifthLastDigit = parseInt(province.results.fifth.slice(-1));
        frequency.digits[fifthLastDigit].count++;
        frequency.digits[fifthLastDigit].byPrize.fifth++;

        // Giải 4
        for (const num of province.results.fourth) {
          const fourthLastDigit = parseInt(num.slice(-1));
          frequency.digits[fourthLastDigit].count++;
          frequency.digits[fourthLastDigit].byPrize.fourth++;
        }

        // Giải 3
        for (const num of province.results.third) {
          const thirdLastDigit = parseInt(num.slice(-1));
          frequency.digits[thirdLastDigit].count++;
          frequency.digits[thirdLastDigit].byPrize.third++;
        }

        // Giải 2
        const secondLastDigit = parseInt(province.results.second.slice(-1));
        frequency.digits[secondLastDigit].count++;
        frequency.digits[secondLastDigit].byPrize.second++;

        // Giải 1
        const firstLastDigit = parseInt(province.results.first.slice(-1));
        frequency.digits[firstLastDigit].count++;
        frequency.digits[firstLastDigit].byPrize.first++;

        // Giải đặc biệt
        const specialLastDigit = parseInt(province.results.special.slice(-1));
        frequency.digits[specialLastDigit].count++;
        frequency.digits[specialLastDigit].byPrize.special++;
      }
    }

    // Tính tỷ lệ phần trăm
    const totalCount = Object.values(frequency.digits).reduce((sum, digit) => sum + digit.count, 0);
    for (let i = 0; i < 10; i++) {
      frequency.digits[i].percentage = (frequency.digits[i].count / totalCount * 100).toFixed(2);
    }

    return frequency;
  } catch (error) {
    logger.error('Error in getLastDigitFrequency:', error);
    throw error;
  }
};

/**
 * Kiểm tra xem một số có kết thúc bằng một chữ số cụ thể hay không
 * @param {string} number - Số cần kiểm tra
 * @param {number} digit - Chữ số cuối cần kiểm tra
 * @returns {boolean} Kết quả kiểm tra
 */
function endsWithDigit(number, digit) {
  if (!number) return false;
  return number.slice(-1) === digit.toString();
}

/**
 * Kiểm tra xem một số có kết thúc bằng một trong các chữ số cụ thể hay không
 * @param {string} number - Số cần kiểm tra
 * @param {Array<number>} digits - Mảng các chữ số cuối cần kiểm tra
 * @returns {boolean} Kết quả kiểm tra
 */
function endsWithAnyDigit(number, digits) {
  if (!number) return false;
  const lastDigit = number.slice(-1);
  return digits.some(digit => digit.toString() === lastDigit);
}

/**
 * Đếm số lượng kết quả khớp trong một đối tượng kết quả đã lọc
 * @param {Object} results - Đối tượng kết quả đã lọc
 * @returns {number} Số lượng kết quả khớp
 */
function countMatches(results) {
  let count = 0;
  
  if (results.eighth) count++;
  if (results.seventh) count++;
  if (results.fifth) count++;
  if (results.second) count++;
  if (results.first) count++;
  if (results.special) count++;
  
  count += results.sixth.length;
  count += results.fourth.length;
  count += results.third.length;
  
  return count;
} 