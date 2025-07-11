const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/error');
const lotteryService = require('../services/lotteryService');
const PayoutRequest = require('../models/PayoutRequest');
const Bet = require('../models/Bet');

/**
 * Lấy danh sách cược đã thắng chờ phê duyệt
 * @route GET /api/admin/payouts/pending-bets
 * @access Admin
 */
exports.getPendingWinningBets = asyncHandler(async (req, res) => {
  const { page, limit, sortBy, sortOrder, provinceCode } = req.query;
  
  const result = await lotteryService.getPendingWinningBets({
    page,
    limit,
    sortBy,
    sortOrder,
    provinceCode
  });
  
  res.status(200).json({
    success: true,
    data: result
  });
});

/**
 * Tạo yêu cầu phê duyệt thanh toán
 * @route POST /api/admin/payouts/requests
 * @access Admin
 */
exports.createPayoutRequest = asyncHandler(async (req, res) => {
  const { betIds } = req.body;
  
  if (!betIds || !Array.isArray(betIds) || betIds.length === 0) {
    throw new ApiError('Vui lòng cung cấp danh sách ID cược hợp lệ', 400);
  }
  
  const result = await lotteryService.createPayoutRequest(betIds);
  
  res.status(201).json({
    success: true,
    message: 'Đã tạo yêu cầu phê duyệt thanh toán',
    data: result
  });
});

/**
 * Lấy danh sách yêu cầu phê duyệt thanh toán
 * @route GET /api/admin/payouts/requests
 * @access Admin
 */
exports.getPayoutRequests = asyncHandler(async (req, res) => {
  const { page = 1, limit = 20, status } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);
  
  // Xây dựng query
  const query = {};
  if (status) {
    query.status = status;
  }
  
  // Thực hiện truy vấn
  const requests = await PayoutRequest.find(query)
    .sort({ createdAt: -1 })
    .skip(skip)
    .limit(parseInt(limit))
    .populate('processedBy', 'telegramId username');
  
  const total = await PayoutRequest.countDocuments(query);
  
  res.status(200).json({
    success: true,
    data: {
      requests,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / parseInt(limit))
      }
    }
  });
});

/**
 * Lấy chi tiết yêu cầu phê duyệt thanh toán
 * @route GET /api/admin/payouts/requests/:id
 * @access Admin
 */
exports.getPayoutRequestDetail = asyncHandler(async (req, res) => {
  const { id } = req.params;
  
  const request = await PayoutRequest.findById(id)
    .populate('processedBy', 'telegramId username');
  
  if (!request) {
    throw new ApiError('Không tìm thấy yêu cầu phê duyệt', 404);
  }
  
  // Lấy danh sách cược liên quan
  const bets = await Bet.find({ _id: { $in: request.betIds } })
    .populate('userId', 'telegramId username balance');
  
  res.status(200).json({
    success: true,
    data: {
      request,
      bets
    }
  });
});

/**
 * Phê duyệt yêu cầu thanh toán
 * @route POST /api/admin/payouts/requests/:id/approve
 * @access Admin
 */
exports.approvePayoutRequest = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const adminId = req.adminUser._id;
  
  const result = await lotteryService.approvePayoutRequest(id, adminId);
  
  res.status(200).json({
    success: true,
    message: 'Đã phê duyệt thanh toán thành công',
    data: result
  });
});

/**
 * Từ chối yêu cầu thanh toán
 * @route POST /api/admin/payouts/requests/:id/reject
 * @access Admin
 */
exports.rejectPayoutRequest = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { reason } = req.body;
  const adminId = req.adminUser._id;
  
  const payoutRequest = await PayoutRequest.findById(id);
  
  if (!payoutRequest) {
    throw new ApiError('Không tìm thấy yêu cầu phê duyệt', 404);
  }
  
  if (payoutRequest.status !== 'pending') {
    throw new ApiError(`Yêu cầu phê duyệt đã được xử lý (${payoutRequest.status})`, 400);
  }
  
  // Cập nhật trạng thái yêu cầu
  payoutRequest.status = 'rejected';
  payoutRequest.processedBy = adminId;
  payoutRequest.processedAt = new Date();
  payoutRequest.notes = reason || 'Không được phê duyệt';
  await payoutRequest.save();
  
  // Cập nhật trạng thái cược
  await Bet.updateMany(
    { _id: { $in: payoutRequest.betIds } },
    { paymentStatus: 'rejected' }
  );
  
  res.status(200).json({
    success: true,
    message: 'Đã từ chối yêu cầu thanh toán',
    data: {
      requestId: payoutRequest._id,
      status: 'rejected',
      reason: payoutRequest.notes
    }
  });
}); 