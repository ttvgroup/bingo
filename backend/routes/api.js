const express = require('express');
const router = express.Router();

// Controllers
const userController = require('../controllers/userController');
const betController = require('../controllers/betController');
const resultController = require('../controllers/resultController');
const statsController = require('../controllers/statsController');
const transactionController = require('../controllers/transactionController');
const adminController = require('../controllers/adminController');

// Middleware
const auth = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');
const roleAuth = require('../middleware/roleAuth');
const twoFactorAuth = require('../middleware/twoFactorAuth');
const rateLimit = require('../middleware/rateLimit');

// Admin authentication routes
router.post('/admin/login/telegram/send-code', adminController.sendTelegramCode);
router.post('/admin/login/telegram', adminAuth.verifyTelegramCode, adminController.loginWithTelegram);
router.get('/admin/login/qr', adminAuth.isAdmin, adminAuth.generateLoginQR, adminController.getLoginQR);
router.post('/admin/device/register', adminAuth.registerNewDevice, adminController.registerDevice);

// Admin device management routes - Protected
router.get('/admin/devices', auth.verifyTelegramAuth, adminAuth.isAdmin, adminController.getRegisteredDevices);
router.delete('/admin/devices/:deviceId', auth.verifyTelegramAuth, adminAuth.isAdmin, adminController.removeDevice);

// Admin routes - All protected with both auth and device verification
router.use('/admin', auth.verifyTelegramAuth, adminAuth.isAdmin, adminAuth.verifyAdminDevice);

// Admin result management
router.post('/admin/results', adminController.createResult);
router.put('/admin/results/:id', adminController.updateResult);
router.delete('/admin/results/:id', adminController.deleteResult);

// Admin user management
router.get('/admin/users', adminController.getUsers);
router.put('/admin/users/:id', adminController.updateUser);

// Admin bet management
router.get('/admin/bets', adminController.getBets);

// Admin transaction management
router.get('/admin/transactions', adminController.getTransactions);
router.put('/admin/transactions/:id/approve', adminController.approveTransaction);
router.put('/admin/transactions/:id/reject', adminController.rejectTransaction);

// User routes
router.post('/users/register', userController.register);
router.post('/users/login', userController.login);
router.get('/users/me', auth.verifyTelegramAuth, userController.getProfile);
router.put('/users/me', auth.verifyTelegramAuth, userController.updateProfile);
router.get('/users/:id', auth.verifyTelegramAuth, userController.getUser);
router.post('/users', auth.verifyTelegramAuth, userController.createUser);

// Bet routes
router.post('/bets', auth.verifyTelegramAuth, betController.placeBet);
router.get('/bets', auth.verifyTelegramAuth, betController.getUserBets);
router.get('/bets/:id', auth.verifyTelegramAuth, betController.getBet);
router.get('/bet-types', betController.getBetTypes);

// Result routes
router.get('/results/latest', resultController.getLatestResults);
router.get('/results/:id', resultController.getResult);
router.get('/results/date/:date', resultController.getResultByDate);
router.get('/results/:resultId/filter', resultController.filterResultsByLastDigit);
router.get('/results/:resultId/filter-multi', resultController.filterResultsByMultipleDigits);
router.get('/results/statistics/frequency', resultController.getFrequencyStatistics);

// Transaction routes
router.get('/transactions', auth.verifyTelegramAuth, transactionController.getUserTransactions);
router.post('/transactions/deposit', auth.verifyTelegramAuth, transactionController.createDepositRequest);
router.post('/transactions/withdraw', auth.verifyTelegramAuth, transactionController.createWithdrawRequest);

// Stats routes
router.get('/stats/user', auth.verifyTelegramAuth, statsController.getUserStats);
router.get('/stats/public', statsController.getPublicStats);

// Admin routes - Áp dụng middleware IP restriction và 2FA
const secureAdminRoutes = [adminAuth, twoFactorAuth.ipRestriction];
const strictSecureAdminRoutes = [adminAuth, twoFactorAuth.ipRestriction, twoFactorAuth.require2FA];

// Kết quả xổ số
router.post('/admin/results', strictSecureAdminRoutes, rateLimit.strictLimiter, resultController.createResult);
router.put('/admin/results/:id', strictSecureAdminRoutes, rateLimit.strictLimiter, resultController.updateResult);
router.delete('/admin/results/:id', strictSecureAdminRoutes, rateLimit.strictLimiter, resultController.deleteResult);

// Xác minh kết quả từ nguồn bên ngoài
router.post('/admin/results/:id/verify-external', secureAdminRoutes, adminController.verifyResultWithExternalSources);
router.put('/admin/results/:id/approve', strictSecureAdminRoutes, adminController.approveResult);

// Quản lý người dùng và giao dịch
router.get('/admin/users', secureAdminRoutes, adminController.getAllUsers);
router.get('/admin/bets', secureAdminRoutes, adminController.getAllBets);
router.get('/admin/transactions', secureAdminRoutes, adminController.getAllTransactions);
router.put('/admin/users/:id', strictSecureAdminRoutes, adminController.updateUser);
router.put('/admin/transactions/:id/approve', strictSecureAdminRoutes, adminController.approveTransaction);
router.put('/admin/transactions/:id/reject', strictSecureAdminRoutes, adminController.rejectTransaction);

// Quản lý thanh toán cược
router.put('/admin/bets/:id/approve-payment', secureAdminRoutes, adminController.approveBetPayment);
router.put('/admin/bets/:id/reject-payment', secureAdminRoutes, adminController.rejectBetPayment);
router.put('/admin/bets/:id/double-confirm-payment', secureAdminRoutes, adminController.doubleConfirmBetPayment);

// Quản lý thanh toán thắng cược
router.get('/admin/payouts/pending', secureAdminRoutes, adminController.getPendingPayouts);
router.post('/admin/payouts/confirm', strictSecureAdminRoutes, adminController.confirmPayouts);

// Đối chiếu dữ liệu
router.get('/admin/results/:resultId/verify', secureAdminRoutes, adminController.verifyResultData);

// Quản lý bảo mật
router.post('/admin/setup-2fa', adminAuth, adminController.setup2FA);
router.post('/admin/activate-2fa', adminAuth, adminController.activate2FA);
router.put('/admin/manage-allowed-ips', adminAuth, adminController.manageAllowedIps);

// Nhật ký kiểm toán
router.get('/admin/audit-logs', strictSecureAdminRoutes, (req, res, next) => {
  const auditService = require('../services/auditService');
  
  auditService.getAllAuditLogs(req.query, {
    page: parseInt(req.query.page) || 1,
    limit: parseInt(req.query.limit) || 50
  })
    .then(result => {
      res.status(200).json({
        status: 'success',
        data: result
      });
    })
    .catch(err => next(err));
});

module.exports = router;