const axios = require('axios'); // Cần cài đặt nếu chưa có
const Result = require('../models/Result');
const ResultHistory = require('../models/ResultHistory');
const logger = require('../utils/logger');
const ApiError = require('../utils/error');

/**
 * Service xác thực kết quả từ nguồn bên ngoài
 * Đảm bảo tính chính xác và minh bạch của kết quả xổ số
 */

// Danh sách các API bên ngoài để kiểm tra kết quả
const EXTERNAL_APIS = {
  // Các API chỉ là ví dụ, cần thay thế bằng API thật
  'source1': 'https://api.xoso.com/results',
  'source2': 'https://ketqua.net/api',
  'source3': 'https://xsmb.me/api/results'
};

/**
 * Xác thực kết quả từ các nguồn bên ngoài
 * 
 * @param {Object} result - Kết quả cần xác thực
 * @param {Object} options - Tùy chọn xác thực
 * @returns {Promise<Object>} - Kết quả xác thực
 */
exports.verifyResultWithExternalSources = async (result, options = {}) => {
  try {
    if (!result || !result._id) {
      throw new ApiError('Kết quả không hợp lệ', 400);
    }
    
    const date = result.date;
    const region = result.region;
    
    logger.info(`Verifying result for date ${date} and region ${region}`);
    
    const verificationResults = [];
    let isVerified = false;
    let matchCount = 0;
    const requiredMatches = options.requiredMatches || 1;
    
    // Lấy danh sách các nguồn cần kiểm tra
    const sources = options.sources || Object.keys(EXTERNAL_APIS);
    
    // Kiểm tra từng nguồn
    for (const source of sources) {
      try {
        const apiUrl = EXTERNAL_APIS[source];
        
        if (!apiUrl) {
          logger.warn(`Invalid source: ${source}`);
          continue;
        }
        
        // Gọi API bên ngoài
        const response = await axios.get(apiUrl, {
          params: {
            date: date.toISOString().split('T')[0],
            region: region
          },
          timeout: 5000 // 5 giây timeout
        });
        
        // Kiểm tra kết quả
        const externalResult = response.data;
        const comparison = compareResults(result, externalResult);
        
        verificationResults.push({
          source,
          timestamp: new Date(),
          matches: comparison.matches,
          differences: comparison.differences,
          isMatch: comparison.isMatch
        });
        
        if (comparison.isMatch) {
          matchCount++;
        }
      } catch (error) {
        logger.error(`Error verifying with source ${source}: ${error.message}`);
        verificationResults.push({
          source,
          timestamp: new Date(),
          error: error.message,
          isMatch: false
        });
      }
    }
    
    // Cập nhật kết quả nếu đủ số lượng xác nhận
    if (matchCount >= requiredMatches) {
      isVerified = true;
    }
    
    // Cập nhật kết quả trong database
    const updatedResult = await Result.findByIdAndUpdate(
      result._id,
      {
        'verification.verified': isVerified,
        'verification.details': verificationResults,
        'verification.timestamp': new Date(),
        verificationAttempts: (result.verificationAttempts || 0) + 1
      },
      { new: true }
    );
    
    // Lưu lịch sử xác thực
    if (options.userId) {
      await ResultHistory.create({
        resultId: result._id,
        userId: options.userId,
        action: 'verify',
        previousState: { verification: result.verification },
        newState: { verification: updatedResult.verification },
        timestamp: new Date(),
        ipAddress: options.ipAddress,
        userAgent: options.userAgent
      });
    }
    
    return {
      isVerified,
      matchCount,
      sources: verificationResults.length,
      details: verificationResults
    };
  } catch (error) {
    logger.error(`Error in result verification: ${error.message}`);
    throw error;
  }
};

/**
 * So sánh hai kết quả
 * 
 * @param {Object} localResult - Kết quả cần kiểm tra
 * @param {Object} externalResult - Kết quả từ nguồn bên ngoài
 * @returns {Object} - Kết quả so sánh
 */
function compareResults(localResult, externalResult) {
  // Khởi tạo kết quả so sánh
  const comparison = {
    matches: [],
    differences: [],
    isMatch: false
  };
  
  try {
    // So sánh các tỉnh
    const localProvinces = localResult.provinces || [];
    const externalProvinces = externalResult.provinces || [];
    
    // Nếu số lượng tỉnh không khớp, cảnh báo nhưng vẫn kiểm tra
    if (localProvinces.length !== externalProvinces.length) {
      comparison.differences.push(`Số lượng tỉnh không khớp: ${localProvinces.length} vs ${externalProvinces.length}`);
    }
    
    // Số lượng kết quả khớp
    let matchedProvinces = 0;
    
    // So sánh từng tỉnh
    for (const localProvince of localProvinces) {
      // Tìm tỉnh tương ứng trong kết quả bên ngoài
      const externalProvince = externalProvinces.find(p => p.code === localProvince.code);
      
      if (!externalProvince) {
        comparison.differences.push(`Không tìm thấy tỉnh ${localProvince.name} (${localProvince.code}) trong kết quả bên ngoài`);
        continue;
      }
      
      // So sánh kết quả của tỉnh
      const provinceComparison = compareProvinceResults(localProvince.results, externalProvince.results);
      
      if (provinceComparison.isMatch) {
        comparison.matches.push(`Kết quả tỉnh ${localProvince.name} (${localProvince.code}) khớp hoàn toàn`);
        matchedProvinces++;
      } else {
        comparison.differences.push(`Kết quả tỉnh ${localProvince.name} (${localProvince.code}) không khớp`);
        comparison.differences.push(...provinceComparison.differences);
      }
    }
    
    // Xác định kết quả cuối cùng
    comparison.isMatch = (matchedProvinces === localProvinces.length) && (matchedProvinces > 0);
    
    return comparison;
  } catch (error) {
    logger.error(`Error comparing results: ${error.message}`);
    comparison.differences.push(`Lỗi so sánh: ${error.message}`);
    comparison.isMatch = false;
    return comparison;
  }
}

/**
 * So sánh kết quả của một tỉnh
 * 
 * @param {Object} localResults - Kết quả cục bộ
 * @param {Object} externalResults - Kết quả từ nguồn bên ngoài
 * @returns {Object} - Kết quả so sánh
 */
function compareProvinceResults(localResults, externalResults) {
  const comparison = {
    matches: [],
    differences: [],
    isMatch: false
  };
  
  if (!localResults || !externalResults) {
    comparison.differences.push('Kết quả không đầy đủ');
    return comparison;
  }
  
  // Danh sách các giải cần so sánh
  const prizes = ['eighth', 'seventh', 'sixth', 'fifth', 'fourth', 'third', 'second', 'first', 'special'];
  
  // Số lượng giải khớp
  let matchedPrizes = 0;
  
  // So sánh từng giải
  for (const prize of prizes) {
    const localValue = localResults[prize];
    const externalValue = externalResults[prize];
    
    // Trường hợp đặc biệt cho các giải có nhiều số (mảng)
    if (Array.isArray(localValue) && Array.isArray(externalValue)) {
      // Kiểm tra độ dài mảng
      if (localValue.length !== externalValue.length) {
        comparison.differences.push(`Số lượng giải ${prize} không khớp: ${localValue.length} vs ${externalValue.length}`);
        continue;
      }
      
      // Kiểm tra từng phần tử
      let allMatched = true;
      for (let i = 0; i < localValue.length; i++) {
        if (localValue[i] !== externalValue[i]) {
          allMatched = false;
          comparison.differences.push(`Giải ${prize}[${i}] không khớp: ${localValue[i]} vs ${externalValue[i]}`);
        }
      }
      
      if (allMatched) {
        comparison.matches.push(`Giải ${prize} khớp hoàn toàn`);
        matchedPrizes++;
      }
    } else {
      // So sánh giải đơn
      if (localValue === externalValue) {
        comparison.matches.push(`Giải ${prize} khớp: ${localValue}`);
        matchedPrizes++;
      } else {
        comparison.differences.push(`Giải ${prize} không khớp: ${localValue || 'N/A'} vs ${externalValue || 'N/A'}`);
      }
    }
  }
  
  // Xác định kết quả so sánh
  comparison.isMatch = (matchedPrizes === prizes.length);
  
  return comparison;
}

/**
 * Xác thực và phê duyệt kết quả
 * 
 * @param {String} resultId - ID kết quả cần phê duyệt
 * @param {String} userId - ID người dùng thực hiện phê duyệt
 * @param {Object} options - Các tùy chọn thêm
 * @returns {Promise<Object>} - Kết quả đã được phê duyệt
 */
exports.approveResult = async (resultId, userId, options = {}) => {
  try {
    // Tìm kết quả
    const result = await Result.findById(resultId);
    
    if (!result) {
      throw new ApiError('Không tìm thấy kết quả', 404);
    }
    
    // Kiểm tra trạng thái hiện tại
    if (result.status === 'verified') {
      throw new ApiError('Kết quả này đã được xác thực trước đó', 400);
    }
    
    // Lưu trạng thái trước khi thay đổi
    const previousState = {
      status: result.status,
      verifiedBy: result.verifiedBy,
      verifiedAt: result.verifiedAt
    };
    
    // Cập nhật trạng thái
    result.status = 'verified';
    result.verifiedBy = userId;
    result.verifiedAt = new Date();
    
    // Lưu thay đổi
    await result.save();
    
    // Lưu lịch sử
    await ResultHistory.create({
      resultId: result._id,
      userId: userId,
      action: 'verify',
      previousState: previousState,
      newState: {
        status: result.status,
        verifiedBy: result.verifiedBy,
        verifiedAt: result.verifiedAt
      },
      ipAddress: options.ipAddress,
      userAgent: options.userAgent
    });
    
    logger.info(`Result ${resultId} verified by user ${userId}`);
    
    return result;
  } catch (error) {
    logger.error(`Error approving result: ${error.message}`);
    throw error;
  }
}; 