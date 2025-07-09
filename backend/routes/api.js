const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const betController = require('../controllers/betController');
const resultController = require('../controllers/resultController');
const statsController = require('../controllers/statsController');
const transactionController = require('../controllers/transactionController');
const adminController = require('../controllers/adminController');
const auth = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');
const roleAuth = require('../middleware/roleAuth');
const rateLimit = require('../middleware/rateLimit');
const asyncHandler = require('../utils/asyncHandler');

// Định nghĩa các middleware bảo vệ đường dẫn admin
const secureAdminRoutes = [adminAuth.verifyAdmin, roleAuth('admin')];
const strictSecureAdminRoutes = [adminAuth.verifyAdminDevice, roleAuth('admin')];

// === ADMIN ROUTES ===
// Admin Authentication Routes
router.post('/admin/login/telegram/send-code', asyncHandler(adminController.sendTelegramCode));
router.post('/admin/login/telegram', adminAuth.verifyTelegramCode, asyncHandler(adminController.loginWithTelegram));
router.get('/admin/login/qr', asyncHandler(adminController.generateLoginQR));
router.post('/admin/device/register', adminAuth.registerNewDevice, asyncHandler(adminController.registerDevice));
router.get('/admin/devices', adminAuth.verifyAdmin, asyncHandler(adminController.getRegisteredDevices));
router.delete('/admin/devices/:deviceId', adminAuth.verifyAdmin, asyncHandler(adminController.removeDevice));

// Admin Management Routes
router.get('/admin/users', secureAdminRoutes, asyncHandler(userController.getAllUsers));
router.get('/admin/users/:id', secureAdminRoutes, asyncHandler(userController.getUserById));
router.put('/admin/users/:id', strictSecureAdminRoutes, asyncHandler(userController.updateUser));

// Admin Bet Management Routes
router.get('/admin/bets', secureAdminRoutes, asyncHandler(betController.getAdminBets));
router.get('/admin/bets/:id', secureAdminRoutes, asyncHandler(betController.getAdminBetById));

// Transaction routes
router.get('/admin/transactions', secureAdminRoutes, asyncHandler(transactionController.getAdminTransactions));
router.get('/admin/transactions/:id', secureAdminRoutes, asyncHandler(transactionController.getAdminTransactionById));
router.put('/admin/transactions/:id', strictSecureAdminRoutes, asyncHandler(transactionController.updateTransaction));
router.put('/admin/transactions/:id/status', strictSecureAdminRoutes, asyncHandler(transactionController.updateTransactionStatus));

// Result routes
router.get('/admin/results', secureAdminRoutes, asyncHandler(resultController.getAdminResults));
router.get('/admin/results/:id', secureAdminRoutes, asyncHandler(resultController.getAdminResultById));
router.put('/admin/results/:id', strictSecureAdminRoutes, asyncHandler(resultController.updateResult));

// User bet routes - cần auth middleware
router.get('/bets', auth.verifyUser, asyncHandler(betController.getUserBets));
router.get('/bets/:id', auth.verifyUser, asyncHandler(betController.getUserBetById));
router.get('/bets/history', auth.verifyUser, asyncHandler(betController.getUserBetHistory));
router.get('/bets/active', auth.verifyUser, asyncHandler(betController.getUserActiveBets));
router.get('/bets/winners', auth.verifyUser, asyncHandler(betController.getWinningBets));

// Result public routes
router.get('/results/:id', asyncHandler(resultController.getResultById));
router.get('/results/date/:date', asyncHandler(resultController.getResultsByDate));
router.get('/results/province/:province', asyncHandler(resultController.getResultsByProvince));

// Transaction user routes
router.get('/transactions', auth.verifyUser, asyncHandler(transactionController.getUserTransactions));
router.get('/transactions/:id', auth.verifyUser, asyncHandler(transactionController.getUserTransactionById));

// Stats routes
router.get('/stats/user', auth.verifyUser, asyncHandler(statsController.getUserStats));
router.get('/stats/hot-numbers', asyncHandler(statsController.getHotNumbers));
router.get('/stats/system', secureAdminRoutes, asyncHandler(statsController.getSystemStats));

// === ADMIN PAYOUT ROUTES ===
router.get('/admin/payouts/pending', strictSecureAdminRoutes, asyncHandler(adminController.getPendingPayouts));
router.post('/admin/payouts/confirm', strictSecureAdminRoutes, asyncHandler(adminController.confirmPayouts));

// === ADMIN SECURITY ROUTES ===
router.get('/admin/2fa-status', adminAuth.verifyAdmin, asyncHandler(adminController.check2FAStatus));
router.post('/admin/setup-2fa', adminAuth.verifyAdmin, asyncHandler(adminController.setup2FA));
router.post('/admin/activate-2fa', adminAuth.verifyAdmin, asyncHandler(adminController.activate2FA));
router.delete('/admin/disable-2fa', adminAuth.verifyAdmin, asyncHandler(adminController.disable2FA));

module.exports = router;