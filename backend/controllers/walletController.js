const Transaction = require('../models/Transaction');
const User = require('../models/User');
const ApiError = require('../utils/error');
const asyncHandler = require('../utils/asyncHandler');
const redisClient = require('../config/redis');
const mongoose = require('mongoose');
const crypto = require('crypto');
const telegramService = require('../services/telegramService'); // Added for sending Telegram messages
const auditService = require('../services/auditService');

/**
 * Gửi yêu cầu nạp tiền
 * @route POST /api/wallet/deposit
 * @access Private
 */
exports.requestDeposit = asyncHandler(async (req, res, next) => {
  const { amount, description } = req.body;
  const telegramId = req.user.id;

  if (!amount || amount <= 0) {
    throw new ApiError('Số tiền không hợp lệ', 400);
  }

  const user = await User.findOne({ telegramId });
  if (!user) {
    throw new ApiError('Không tìm thấy người dùng', 404);
  }

  const transaction = new Transaction({
    userId: user._id,
    type: 'deposit',
    amount,
    status: 'pending',
    description: description || 'Yêu cầu nạp tiền'
  });

  await transaction.save();

  res.status(201).json({
    success: true,
    transaction,
    message: 'Yêu cầu nạp tiền đã được gửi và đang chờ xử lý'
  });
});

/**
 * Gửi yêu cầu rút tiền
 * @route POST /api/wallet/withdraw
 * @access Private
 */
exports.requestWithdraw = asyncHandler(async (req, res, next) => {
  const { amount, description, bankInfo } = req.body;
  const telegramId = req.user.id;

  if (!amount || amount <= 0) {
    throw new ApiError('Số tiền không hợp lệ', 400);
  }

  if (!bankInfo) {
    throw new ApiError('Vui lòng cung cấp thông tin ngân hàng', 400);
  }

  const user = await User.findOne({ telegramId });
  if (!user) {
    throw new ApiError('Không tìm thấy người dùng', 404);
  }

  if (user.balance < amount) {
    throw new ApiError('Số dư không đủ để thực hiện giao dịch', 400);
  }

  const transaction = new Transaction({
    userId: user._id,
    type: 'withdraw',
    amount,
    status: 'pending',
    description: description || 'Yêu cầu rút tiền',
    metaData: { bankInfo }
  });

  await transaction.save();

  res.status(201).json({
    success: true,
    transaction,
    message: 'Yêu cầu rút tiền đã được gửi và đang chờ xử lý'
  });
});

/**
 * Tạo hash cho giao dịch
 * @private
 */
function createTransactionHash(senderId, receiverId, amount) {
  const dataToHash = `${senderId.toString()}-${receiverId ? receiverId.toString() : ''}-${amount}-${Date.now()}`;
  return crypto.createHash('sha256').update(dataToHash).digest('hex');
}

/**
 * Thực hiện giao dịch chuyển tiền với khả năng retry
 * @private
 */
async function executeTransferWithRetry(senderTelegramId, receiverTelegramId, amount, description, idempotencyKey, clientIp = null, userAgent = null) {
  const maxRetries = 3;
  let retryCount = 0;
  let delay = 100; // ms

  while (retryCount < maxRetries) {
    try {
      return await transferFundsTransaction(senderTelegramId, receiverTelegramId, amount, description, idempotencyKey, clientIp, userAgent);
    } catch (error) {
      if (error.hasOwnProperty("errorLabels") && 
          (error.errorLabels.includes("TransientTransactionError") || 
           error.errorLabels.includes("UnknownTransactionCommitResult"))) {
        
        retryCount++;
        console.log(`Thử lại giao dịch lần ${retryCount} sau ${delay}ms`);
        
        if (retryCount >= maxRetries) {
          throw new ApiError('Không thể hoàn thành giao dịch sau nhiều lần thử', 500);
        }
        
        // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2; // Tăng gấp đôi thời gian chờ
        continue;
      }
      throw error;
    }
  }
}

/**
 * Thực hiện chuyển tiền với idempotency
 * @private
 */
async function transferWithIdempotency(senderTelegramId, receiverTelegramId, amount, description, idempotencyKey, clientIp = null, userAgent = null) {
  // Tạo khóa duy nhất cho idempotency nếu không được cung cấp
  const finalIdempotencyKey = idempotencyKey || crypto.createHash('sha256')
    .update(`${senderTelegramId}-${receiverTelegramId}-${amount}-${Date.now()}-${crypto.randomBytes(8).toString('hex')}`)
    .digest('hex');
  
  // Khóa Redis để đảm bảo chỉ một request được xử lý tại một thời điểm
  const lockKey = `lock:transfer:${finalIdempotencyKey}`;
  
  try {
    // Thử lấy khóa với thời gian sống 30 giây
    const acquired = await redisClient.set(lockKey, 'locked', {
      EX: 30,
      NX: true
    });
    
    if (!acquired) {
      // Nếu không lấy được khóa, kiểm tra xem giao dịch đã hoàn thành chưa
      const existingTransaction = await Transaction.findOne({
        'metaData.idempotencyKey': finalIdempotencyKey,
        type: 'transfer'
      });
      
      if (existingTransaction && existingTransaction.status === 'completed') {
        const sender = await User.findById(existingTransaction.userId);
        const receiver = await User.findById(existingTransaction.receiverId);
        
        return {
          success: true,
          transaction: existingTransaction,
          message: 'Giao dịch đã được xử lý trước đó',
          senderNewBalance: sender?.balance,
          receiverNewBalance: receiver?.balance,
          isIdempotent: true
        };
      }
      
      // Nếu không tìm thấy giao dịch hoàn thành, có thể đang được xử lý
      throw new ApiError('Giao dịch đang được xử lý, vui lòng thử lại sau', 409);
    }
    
    // Kiểm tra lại một lần nữa trước khi thực hiện giao dịch
    const existingTransaction = await Transaction.findOne({
      'metaData.idempotencyKey': finalIdempotencyKey,
      type: 'transfer',
      status: 'completed'
    });
    
    if (existingTransaction) {
      // Xóa khóa Redis
      await redisClient.del(lockKey);
      
      const sender = await User.findById(existingTransaction.userId);
      const receiver = await User.findById(existingTransaction.receiverId);
      
      return {
        success: true,
        transaction: existingTransaction,
        message: 'Giao dịch đã được xử lý trước đó',
        senderNewBalance: sender?.balance,
        receiverNewBalance: receiver?.balance,
        isIdempotent: true
      };
    }
    
    // Nếu không có giao dịch trùng lặp, thực hiện transfer với retry
    const result = await executeTransferWithRetry(
      senderTelegramId, 
      receiverTelegramId, 
      amount, 
      description,
      finalIdempotencyKey,
      clientIp,
      userAgent
    );
    
    return result;
  } catch (error) {
    // Đảm bảo xóa khóa nếu có lỗi
    try {
      await redisClient.del(lockKey);
    } catch (redisError) {
      console.error('Lỗi khi xóa khóa Redis:', redisError);
    }
    
    throw error;
  } finally {
    // Đảm bảo luôn xóa khóa
    try {
      await redisClient.del(lockKey);
    } catch (redisError) {
      console.error('Lỗi khi xóa khóa Redis trong finally:', redisError);
    }
  }
}

/**
 * Hàm core thực hiện giao dịch chuyển tiền
 * @private
 */
async function transferFundsTransaction(senderTelegramId, receiverTelegramId, amount, description = "", idempotencyKey = null, clientIp = null, userAgent = null) {
  // Khởi tạo session với cấu hình bảo mật cao
  const session = await mongoose.startSession();
  
  // Cấu hình transaction với readConcern và writeConcern phù hợp
  session.startTransaction({
    readConcern: { level: 'snapshot' },
    writeConcern: { w: 'majority', j: true }, // Đảm bảo ghi vào journal
    readPreference: 'primary'
  });

  try {
    // Tìm người gửi và người nhận trong cùng transaction
    const sender = await User.findOne({ telegramId: senderTelegramId }).session(session);
    const receiver = await User.findOne({ telegramId: receiverTelegramId }).session(session);

    if (!sender) {
      throw new ApiError('Không tìm thấy người gửi', 404);
    }
    
    if (!receiver) {
      throw new ApiError('Không tìm thấy người nhận', 404);
    }

    if (sender.balance < amount) {
      throw new ApiError('Số dư không đủ để thực hiện giao dịch', 400);
    }

    // Lưu tổng điểm trước khi thực hiện giao dịch
    const totalBalanceBefore = sender.balance + receiver.balance;

    // Sử dụng $inc để cập nhật số dư một cách nguyên tử
    // Tránh race condition bằng cách sử dụng atomic operations
    const senderUpdate = await User.updateOne(
      { _id: sender._id, balance: { $gte: amount } }, // Thêm điều kiện kiểm tra số dư
      { $inc: { balance: -amount } },
      { session }
    );

    // Nếu không có document nào được cập nhật, nghĩa là số dư không đủ
    if (senderUpdate.modifiedCount === 0) {
      throw new ApiError('Số dư không đủ hoặc đã thay đổi, không thể hoàn thành giao dịch', 400);
    }
    
    // Cập nhật số dư người nhận
    await User.updateOne(
      { _id: receiver._id }, 
      { $inc: { balance: amount } },
      { session }
    );

    // Kiểm tra tổng điểm sau khi thực hiện giao dịch
    const updatedSender = await User.findOne({ _id: sender._id }).session(session);
    const updatedReceiver = await User.findOne({ _id: receiver._id }).session(session);
    const totalBalanceAfter = updatedSender.balance + updatedReceiver.balance;

    // Đảm bảo tổng điểm trước và sau khi chuyển là không đổi
    if (totalBalanceBefore !== totalBalanceAfter) {
      throw new ApiError(`Lỗi toàn vẹn dữ liệu: Tổng điểm trước (${totalBalanceBefore}) và sau (${totalBalanceAfter}) không khớp`, 500);
    }

    // Tạo giao dịch với đầy đủ thông tin kiểm toán
    const transactionData = {
      userId: sender._id,
      receiverId: receiver._id,
      type: 'transfer',
      amount,
      status: 'completed',
      description: description || `Chuyển điểm đến ${receiver.username || receiverTelegramId}`,
      processedAt: new Date(),
      metaData: {
        senderTelegramId,
        receiverTelegramId,
        senderName: sender.username,
        receiverName: receiver.username,
        idempotencyKey,
        clientIp,
        userAgent,
        transactionTimestamp: new Date(),
        senderBalanceBefore: sender.balance,
        senderBalanceAfter: updatedSender.balance,
        receiverBalanceBefore: receiver.balance,
        receiverBalanceAfter: updatedReceiver.balance,
        totalBalanceBefore,
        totalBalanceAfter,
        balanceIntegrityVerified: true
      }
    };
    
    // Tạo hash cho giao dịch - đảm bảo tính toàn vẹn dữ liệu
    transactionData.transactionHash = createTransactionHash(sender._id, receiver._id, amount);
    
    // Lưu giao dịch vào database
    const transaction = await Transaction.create([transactionData], { session });

    // Commit transaction nếu mọi thứ OK
    await session.commitTransaction();
    
    // Cập nhật cache Redis sau khi transaction thành công
    try {
      await redisClient.setEx(`user:${senderTelegramId}`, 3600, JSON.stringify({
        ...sender.toObject(),
        balance: updatedSender.balance
      }));
      
      await redisClient.setEx(`user:${receiverTelegramId}`, 3600, JSON.stringify({
        ...receiver.toObject(),
        balance: updatedReceiver.balance
      }));
    } catch (redisErr) {
      // Log lỗi Redis nhưng không ảnh hưởng đến giao dịch
      console.error('Không thể cập nhật cache Redis:', redisErr);
    }

    // Gửi thông báo Telegram về giao dịch thành công
    try {
      await telegramService.sendPrivateMessage(
        senderTelegramId,
        `✅ Bạn đã chuyển ${amount} điểm cho ${receiver.username || receiverTelegramId}.\nSố dư hiện tại: ${updatedSender.balance} điểm.`
      );
      
      await telegramService.sendPrivateMessage(
        receiverTelegramId,
        `💰 Bạn đã nhận ${amount} điểm từ ${sender.username || senderTelegramId}.\nSố dư hiện tại: ${updatedReceiver.balance} điểm.`
      );
    } catch (telegramErr) {
      // Log lỗi Telegram nhưng không ảnh hưởng đến giao dịch
      console.error('Không thể gửi thông báo Telegram:', telegramErr);
    }

    return { 
      success: true, 
      transaction: transaction[0],
      senderNewBalance: updatedSender.balance,
      receiverNewBalance: updatedReceiver.balance,
      message: `Đã chuyển ${amount} điểm cho ${receiver.username || receiverTelegramId}`
    };
    
  } catch (error) {
    // Hoàn tác toàn bộ thay đổi nếu có lỗi
    await session.abortTransaction();
    throw error;
  } finally {
    // Luôn kết thúc phiên để tránh rò rỉ tài nguyên
    session.endSession();
  }
}

/**
 * Chuyển tiền cho người dùng khác
 * @route POST /api/wallet/transfer
 * @access Private
 */
exports.transferFunds = asyncHandler(async (req, res, next) => {
  const { amount, receiverTelegramId, description, idempotencyKey } = req.body;
  const senderTelegramId = req.user.id;
  
  // Lấy thông tin client để lưu vào log
  const clientIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  const userAgent = req.headers['user-agent'];

  if (!amount || amount <= 0) {
    throw new ApiError('Số tiền không hợp lệ', 400);
  }

  if (!receiverTelegramId) {
    throw new ApiError('Vui lòng cung cấp ID người nhận', 400);
  }

  if (senderTelegramId === receiverTelegramId) {
    throw new ApiError('Không thể chuyển tiền cho chính mình', 400);
  }

  // Tạo idempotency key nếu không được cung cấp
  const transferIdempotencyKey = idempotencyKey || crypto.randomUUID();
  
  const result = await transferWithIdempotency(
    senderTelegramId,
    receiverTelegramId,
    amount,
    description,
    transferIdempotencyKey,
    clientIp,
    userAgent
  );
  
  // Ghi log kiểm toán
  const sender = await User.findOne({ telegramId: senderTelegramId });
  if (sender && result.transaction) {
    await auditService.logFinancialTransaction(
      result.transaction,
      sender,
      clientIp,
      userAgent
    );
    
    // Ghi log kiểm tra tính toàn vẹn số dư
    if (result.transaction.metaData) {
      await auditService.logBalanceIntegrityCheck(
        result.transaction,
        {
          totalBalanceBefore: result.transaction.metaData.totalBalanceBefore,
          totalBalanceAfter: result.transaction.metaData.totalBalanceAfter,
          senderBalanceBefore: result.transaction.metaData.senderBalanceBefore,
          senderBalanceAfter: result.transaction.metaData.senderBalanceAfter,
          receiverBalanceBefore: result.transaction.metaData.receiverBalanceBefore,
          receiverBalanceAfter: result.transaction.metaData.receiverBalanceAfter
        },
        clientIp,
        userAgent
      );
    }
  }

  res.status(200).json({
    success: true,
    message: result.message || `Đã chuyển ${amount} điểm thành công`,
    transaction: result.transaction,
    newBalance: result.senderNewBalance
  });
});

/**
 * Lấy lịch sử giao dịch của người dùng
 * @route GET /api/wallet/transactions
 * @access Private
 */
exports.getUserWalletHistory = asyncHandler(async (req, res, next) => {
  const telegramId = req.user.id;
  const { page = 1, limit = 10, type } = req.query;

  const user = await User.findOne({ telegramId });
  if (!user) {
    throw new ApiError('Không tìm thấy người dùng', 404);
  }

  // Xây dựng query
  let query = {};

  // Nếu là giao dịch transfer, hiển thị cả giao dịch mà người dùng là người gửi hoặc người nhận
  if (!type) {
    query = {
      $or: [
        { userId: user._id },
        { receiverId: user._id, type: 'transfer' }
      ]
    };
  } else if (type === 'transfer') {
    query = {
      $and: [
        {
          $or: [
            { userId: user._id },
            { receiverId: user._id }
          ]
        },
        { type: 'transfer' }
      ]
    };
  } else {
    query = {
      userId: user._id,
      type
    };
  }

  // Thực hiện truy vấn với phân trang
  const options = {
    page: parseInt(page, 10),
    limit: parseInt(limit, 10),
    sort: { createdAt: -1 }
  };

  const transactions = await Transaction.find(query)
    .populate('userId', 'telegramId username')
    .populate('receiverId', 'telegramId username')
    .sort(options.sort)
    .skip((options.page - 1) * options.limit)
    .limit(options.limit);

  const total = await Transaction.countDocuments(query);

  // Xử lý để hiển thị thông tin hướng giao dịch cho người dùng
  const processedTransactions = transactions.map(transaction => {
    const txn = transaction.toObject();
    
    if (transaction.type === 'transfer') {
      if (transaction.userId.toString() === user._id.toString()) {
        txn.direction = 'sent';
        txn.displayAmount = -transaction.amount;
      } else if (transaction.receiverId && transaction.receiverId._id.toString() === user._id.toString()) {
        txn.direction = 'received';
        txn.displayAmount = transaction.amount;
      }
    } else {
      txn.displayAmount = transaction.type === 'withdraw' || transaction.type === 'bet' 
        ? -transaction.amount 
        : transaction.amount;
    }
    
    return txn;
  });

  res.status(200).json({
    success: true,
    count: processedTransactions.length,
    total,
    totalPages: Math.ceil(total / options.limit),
    currentPage: options.page,
    transactions: processedTransactions,
    balance: user.balance
  });
});

/**
 * Xử lý yêu cầu nạp/rút tiền (chức năng của admin)
 * @route PUT /api/admin/wallet/transactions/:id
 * @access Admin
 */
exports.processTransaction = asyncHandler(async (req, res, next) => {
  const { id } = req.params;
  const { status, adminNote } = req.body;

  if (!['completed', 'failed', 'cancelled'].includes(status)) {
    throw new ApiError('Trạng thái không hợp lệ', 400);
  }

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const transaction = await Transaction.findById(id).session(session);
    if (!transaction) {
      throw new ApiError('Không tìm thấy giao dịch', 404);
    }

    // Chỉ xử lý các giao dịch đang ở trạng thái pending
    if (transaction.status !== 'pending') {
      throw new ApiError('Giao dịch này đã được xử lý', 400);
    }

    // Chỉ xử lý các giao dịch deposit và withdraw
    if (!['deposit', 'withdraw'].includes(transaction.type)) {
      throw new ApiError('Loại giao dịch không hợp lệ', 400);
    }

    // Tìm người dùng
    const user = await User.findById(transaction.userId).session(session);
    if (!user) {
      throw new ApiError('Không tìm thấy người dùng', 404);
    }

    // Cập nhật giao dịch
    transaction.status = status;
    transaction.processedBy = req.adminUser._id;
    transaction.processedAt = new Date();
    
    if (adminNote) {
      transaction.metaData = { ...transaction.metaData, adminNote };
    }

    await transaction.save({ session });

    // Cập nhật số dư người dùng nếu giao dịch được chấp nhận
    if (status === 'completed') {
      if (transaction.type === 'deposit') {
        // Thêm tiền vào tài khoản sử dụng atomic operation
        await User.updateOne(
          { _id: user._id }, 
          { $inc: { balance: transaction.amount } }
        ).session(session);
        user.balance += transaction.amount;
      } else if (transaction.type === 'withdraw') {
        // Trừ tiền từ tài khoản (kiểm tra số dư)
        if (user.balance < transaction.amount) {
          throw new ApiError('Số dư của người dùng không đủ để thực hiện giao dịch này', 400);
        }
        
        await User.updateOne(
          { _id: user._id, balance: { $gte: transaction.amount } }, 
          { $inc: { balance: -transaction.amount } }
        ).session(session);
        user.balance -= transaction.amount;
      }

      // Cập nhật cache Redis
      try {
        await redisClient.setEx(`user:${user.telegramId}`, 3600, JSON.stringify(user));
      } catch (redisErr) {
        console.error('Không thể cập nhật cache Redis:', redisErr);
      }
    }

    await session.commitTransaction();
    session.endSession();

    res.status(200).json({
      success: true,
      message: `Giao dịch đã được ${status === 'completed' ? 'xác nhận' : status === 'cancelled' ? 'hủy bỏ' : 'từ chối'}`,
      transaction,
      userBalance: user.balance
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    throw error;
  }
});

/**
 * Admin chuyển tiền cho user
 * @route POST /api/admin/wallet/transfer
 * @access Admin
 */
exports.adminTransferFunds = asyncHandler(async (req, res, next) => {
  const { amount, receiverTelegramId, description, idempotencyKey } = req.body;
  const adminTelegramId = req.adminUser.telegramId;
  
  // Lấy thông tin client để lưu vào log
  const clientIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  const userAgent = req.headers['user-agent'];

  if (!amount || amount <= 0) {
    throw new ApiError('Số tiền không hợp lệ', 400);
  }

  if (!receiverTelegramId) {
    throw new ApiError('Vui lòng cung cấp ID người nhận', 400);
  }

  const session = await mongoose.startSession();
  session.startTransaction({
    readConcern: { level: 'snapshot' },
    writeConcern: { w: 'majority' }
  });

  try {
    // Kiểm tra idempotency
    if (idempotencyKey) {
      const existingTransaction = await Transaction.findOne({
        'metaData.idempotencyKey': idempotencyKey,
        type: 'transfer',
        status: 'completed'
      }).session(session);
      
      if (existingTransaction) {
        await session.abortTransaction();
        session.endSession();
        
        return res.status(200).json({
          success: true,
          message: 'Giao dịch đã được xử lý trước đó',
          transaction: existingTransaction
        });
      }
    }

    // Tìm admin và người nhận
    const admin = await User.findOne({ telegramId: adminTelegramId }).session(session);
    if (!admin || admin.role !== 'admin') {
      throw new ApiError('Không có quyền thực hiện thao tác này', 403);
    }

    const receiver = await User.findOne({ telegramId: receiverTelegramId }).session(session);
    if (!receiver) {
      throw new ApiError('Không tìm thấy người nhận', 404);
    }

    // Lưu số dư trước khi chuyển
    const receiverBalanceBefore = receiver.balance;

    // Cập nhật số dư người nhận với atomic operation
    await User.updateOne(
      { _id: receiver._id },
      { $inc: { balance: amount } }
    ).session(session);
    
    // Kiểm tra số dư sau khi cập nhật
    const updatedReceiver = await User.findOne({ _id: receiver._id }).session(session);
    const receiverBalanceAfter = updatedReceiver.balance;
    
    // Kiểm tra tính toàn vẹn dữ liệu
    if (receiverBalanceAfter !== receiverBalanceBefore + amount) {
      throw new ApiError(`Lỗi toàn vẹn dữ liệu: Số dư người nhận trước (${receiverBalanceBefore}) + số tiền (${amount}) không bằng số dư sau (${receiverBalanceAfter})`, 500);
    }

    // Tạo giao dịch transfer
    const transactionData = {
      userId: admin._id,
      receiverId: receiver._id,
      type: 'transfer',
      amount,
      status: 'completed',
      description: description || `Admin chuyển điểm cho ${receiver.username || receiverTelegramId}`,
      processedBy: admin._id,
      processedAt: new Date(),
      metaData: {
        adminTransfer: true,
        adminTelegramId,
        receiverTelegramId,
        idempotencyKey: idempotencyKey || crypto.randomUUID(),
        clientIp,
        userAgent,
        transactionTimestamp: new Date(),
        receiverBalanceBefore,
        receiverBalanceAfter,
        balanceIntegrityVerified: true
      },
      transactionHash: createTransactionHash(admin._id, receiver._id, amount)
    };

    const transaction = await Transaction.create([transactionData], { session });

    // Cập nhật cache Redis
    try {
      await redisClient.setEx(`user:${receiverTelegramId}`, 3600, JSON.stringify({
        ...receiver.toObject(),
        balance: receiverBalanceAfter
      }));
    } catch (redisErr) {
      console.error('Không thể cập nhật cache Redis:', redisErr);
    }

    // Gửi thông báo Telegram
    try {
      await telegramService.sendPrivateMessage(
        receiverTelegramId,
        `💰 Bạn đã nhận ${amount} điểm từ Admin.\nSố dư hiện tại: ${receiverBalanceAfter} điểm.`
      );
    } catch (telegramErr) {
      console.error('Không thể gửi thông báo Telegram:', telegramErr);
    }

    await session.commitTransaction();
    session.endSession();

    // Ghi log kiểm toán
    await auditService.logAdminFinancialAction(
      admin._id,
      'admin_transfer',
      {
        receiverId: receiver._id,
        amount,
        transactionId: transaction[0]._id
      },
      clientIp,
      userAgent
    );

    res.status(200).json({
      success: true,
      message: `Đã chuyển ${amount} điểm cho ${receiver.username || receiverTelegramId}`,
      transaction: transaction[0],
      receiverBalance: receiverBalanceAfter
    });
  } catch (error) {
    await session.abortTransaction();
    session.endSession();
    throw error;
  }
});

/**
 * Lấy thông tin ví điện tử của người dùng
 * @route GET /api/wallet
 * @access Private
 */
exports.getWalletInfo = asyncHandler(async (req, res, next) => {
  const telegramId = req.user.id;

  // Thử lấy thông tin người dùng từ Redis cache
  let user;
  try {
    const cachedUser = await redisClient.get(`user:${telegramId}`);
    if (cachedUser) {
      user = JSON.parse(cachedUser);
    }
  } catch (redisErr) {
    console.error('Lỗi Redis:', redisErr);
  }

  // Nếu không có trong cache, truy vấn database
  if (!user) {
    user = await User.findOne({ telegramId });
    if (!user) {
      throw new ApiError('Không tìm thấy người dùng', 404);
    }

    // Cập nhật cache
    try {
      await redisClient.setEx(`user:${telegramId}`, 3600, JSON.stringify(user));
    } catch (redisErr) {
      console.error('Không thể cập nhật cache Redis:', redisErr);
    }
  }

  // Lấy tổng số tiền đã nạp, rút và chuyển khoản
  const deposits = await Transaction.aggregate([
    { $match: { userId: user._id, type: 'deposit', status: 'completed' } },
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ]);

  const withdrawals = await Transaction.aggregate([
    { $match: { userId: user._id, type: 'withdraw', status: 'completed' } },
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ]);

  const transfersSent = await Transaction.aggregate([
    { $match: { userId: user._id, type: 'transfer', status: 'completed' } },
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ]);

  const transfersReceived = await Transaction.aggregate([
    { $match: { receiverId: user._id, type: 'transfer', status: 'completed' } },
    { $group: { _id: null, total: { $sum: '$amount' } } }
  ]);

  // Lấy giao dịch mới nhất
  const recentTransactions = await Transaction.find({
    $or: [
      { userId: user._id },
      { receiverId: user._id, type: 'transfer' }
    ]
  })
  .sort({ createdAt: -1 })
  .limit(5)
  .populate('userId', 'telegramId username')
  .populate('receiverId', 'telegramId username');

  // Xử lý để hiển thị thông tin hướng giao dịch cho người dùng
  const processedTransactions = recentTransactions.map(transaction => {
    const txn = transaction.toObject();
    
    if (transaction.type === 'transfer') {
      if (transaction.userId.toString() === user._id.toString()) {
        txn.direction = 'sent';
        txn.displayAmount = -transaction.amount;
      } else if (transaction.receiverId && transaction.receiverId._id.toString() === user._id.toString()) {
        txn.direction = 'received';
        txn.displayAmount = transaction.amount;
      }
    } else {
      txn.displayAmount = transaction.type === 'withdraw' || transaction.type === 'bet' 
        ? -transaction.amount 
        : transaction.amount;
    }
    
    return txn;
  });

  res.status(200).json({
    success: true,
    wallet: {
      balance: user.balance,
      totalDeposits: deposits.length > 0 ? deposits[0].total : 0,
      totalWithdrawals: withdrawals.length > 0 ? withdrawals[0].total : 0,
      totalTransfersSent: transfersSent.length > 0 ? transfersSent[0].total : 0,
      totalTransfersReceived: transfersReceived.length > 0 ? transfersReceived[0].total : 0,
      recentTransactions: processedTransactions
    }
  });
}); 

/**
 * Chuyển tiền bằng QR code
 * @route POST /api/wallet/transfer-by-qr
 * @access Private
 */
exports.transferByQR = asyncHandler(async (req, res, next) => {
  const { amount, qrData, description, idempotencyKey } = req.body;
  const senderTelegramId = req.user.telegramId;
  
  // Lấy thông tin client để lưu vào log
  const clientIp = req.headers['x-forwarded-for'] || req.connection.remoteAddress;
  const userAgent = req.headers['user-agent'];

  if (!amount || amount <= 0) {
    throw new ApiError('Số tiền không hợp lệ', 400);
  }

  if (!qrData) {
    throw new ApiError('Dữ liệu QR không hợp lệ', 400);
  }

  // Parse dữ liệu QR
  let parsedQR;
  try {
    parsedQR = JSON.parse(qrData);
  } catch (error) {
    throw new ApiError('Định dạng QR không hợp lệ', 400);
  }

  // Kiểm tra dữ liệu QR
  if (!parsedQR.receiverId || parsedQR.type !== 'payment_receive') {
    throw new ApiError('QR code không phải là mã nhận điểm hợp lệ', 400);
  }

  const receiverTelegramId = parsedQR.receiverId;

  if (senderTelegramId === receiverTelegramId) {
    throw new ApiError('Không thể chuyển tiền cho chính mình', 400);
  }

  // Tạo idempotency key nếu không được cung cấp
  const transferIdempotencyKey = idempotencyKey || crypto.randomUUID();
  
  const result = await transferWithIdempotency(
    senderTelegramId,
    receiverTelegramId,
    amount,
    description || `Chuyển điểm qua QR cho ${parsedQR.username || receiverTelegramId}`,
    transferIdempotencyKey,
    clientIp,
    userAgent
  );

  // Ghi log kiểm toán
  const sender = await User.findOne({ telegramId: senderTelegramId });
  if (sender && result.transaction) {
    await auditService.logFinancialTransaction(
      result.transaction,
      sender,
      clientIp,
      userAgent
    );
  }

  // Thông báo qua Telegram cho người nhận
  try {
    const receiver = await User.findOne({ telegramId: receiverTelegramId });
    if (receiver && sender && result.transaction) {
      await telegramService.sendTransferNotification(
        receiverTelegramId,
        result.transaction,
        sender,
        receiver
      );
    }
  } catch (error) {
    console.error('Không thể gửi thông báo Telegram:', error);
  }

  res.status(200).json({
    success: true,
    message: result.message || `Đã chuyển ${amount} điểm thành công qua QR`,
    transaction: result.transaction,
    newBalance: result.senderNewBalance
  });
}); 