const express = require('express');
const router = express.Router();
const userController = require('../controllers/userController');
const betController = require('../controllers/betController');
const resultController = require('../controllers/resultController');
const statsController = require('../controllers/statsController');
const transactionController = require('../controllers/transactionController');
const adminController = require('../controllers/adminController');
const walletController = require('../controllers/walletController');
const configController = require('../controllers/configController');
const auth = require('../middleware/auth');
const adminAuth = require('../middleware/adminAuth');
const roleAuth = require('../middleware/roleAuth');
const rateLimit = require('../middleware/rateLimit');
const twoFactorAuth = require('../middleware/twoFactorAuth');
const asyncHandler = require('../utils/asyncHandler');
const payoutController = require('../controllers/payoutController');
const rewardController = require('../controllers/rewardController');
const coinController = require('../controllers/coinController');

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

// === ADMIN CONFIG ROUTES ===
router.get('/admin/config', secureAdminRoutes, asyncHandler(configController.getAllConfigs));
router.get('/admin/config/:key', secureAdminRoutes, asyncHandler(configController.getConfigByKey));
router.put('/admin/config/:key', strictSecureAdminRoutes, asyncHandler(configController.updateConfig));

// === ADMIN BETTING CONFIG ROUTES ===
router.get('/admin/config/betting/status', secureAdminRoutes, asyncHandler(configController.getBettingStatus));
router.put('/admin/config/betting/toggle', strictSecureAdminRoutes, asyncHandler(configController.toggleBetting));
router.put('/admin/config/betting/hours', strictSecureAdminRoutes, asyncHandler(configController.updateBettingHours));

// === ADMIN QUOTA CONFIG ROUTES ===
router.get('/admin/config/quota', secureAdminRoutes, asyncHandler(configController.getQuotaConfig));
router.put('/admin/config/quota/toggle', strictSecureAdminRoutes, asyncHandler(configController.toggleQuota));
router.put('/admin/config/quota/bet-type', strictSecureAdminRoutes, asyncHandler(configController.updateBetTypeQuota));
router.put('/admin/config/quota/default', strictSecureAdminRoutes, asyncHandler(configController.updateDefaultNumberQuota));
router.put('/admin/config/quota/number', strictSecureAdminRoutes, asyncHandler(configController.updateNumberQuota));
router.delete('/admin/config/quota/number', strictSecureAdminRoutes, asyncHandler(configController.deleteNumberQuota));
router.put('/admin/config/quota/threshold', strictSecureAdminRoutes, asyncHandler(configController.updateQuotaThreshold));

// === ADMIN REDIS CONFIG ROUTES ===
router.put('/admin/config/quota/redis', strictSecureAdminRoutes, asyncHandler(configController.configureRedis));
router.get('/admin/config/quota/redis/test', strictSecureAdminRoutes, asyncHandler(configController.testRedisConnection));
router.put('/admin/config/quota/anomaly', strictSecureAdminRoutes, asyncHandler(configController.configureAnomalyDetection));

// Admin Points Management Routes
router.post('/admin/points/create', 
  adminAuth.verifyAdminDevice, 
  roleAuth('admin'),
  twoFactorAuth.require2FA,
  twoFactorAuth.requireSecondDeviceQR,
  asyncHandler(adminController.createPoints)
);

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

// Admin wallet routes
router.put('/admin/wallet/transactions/:id', strictSecureAdminRoutes, asyncHandler(walletController.processTransaction));
router.post('/admin/wallet/transfer', strictSecureAdminRoutes, asyncHandler(walletController.adminTransferFunds));

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

// Wallet user routes
router.get('/wallet', auth.verifyUser, asyncHandler(walletController.getWalletInfo));
router.post('/wallet/deposit', auth.verifyUser, asyncHandler(walletController.requestDeposit));
router.post('/wallet/transfer', 
  auth.verifyUser, 
  twoFactorAuth.requireTransactionVerification, 
  asyncHandler(walletController.transferFunds)
);
router.post('/wallet/withdraw', 
  auth.verifyUser, 
  twoFactorAuth.requireTransactionVerification, 
  asyncHandler(walletController.requestWithdraw)
);
router.post('/wallet/transfer-by-qr', 
  auth.verifyUser, 
  twoFactorAuth.requireTransactionVerification, 
  asyncHandler(walletController.transferByQR)
);
router.get('/wallet/transactions', auth.verifyUser, asyncHandler(walletController.getUserWalletHistory));

// User routes
router.get('/user/profile', auth.verifyUser, asyncHandler(userController.getUserProfile));
router.get('/user/receive-qr', auth.verifyUser, asyncHandler(userController.getReceiveQR));

// Transaction user routes
router.get('/transactions', auth.verifyUser, asyncHandler(transactionController.getUserTransactions));
router.get('/transactions/:id', auth.verifyUser, asyncHandler(transactionController.getUserTransactionById));

// Stats routes
router.get('/stats/user', auth.verifyUser, asyncHandler(statsController.getUserStats));
router.get('/stats/hot-numbers', asyncHandler(statsController.getHotNumbers));
router.get('/stats/system', secureAdminRoutes, asyncHandler(statsController.getSystemStats));
router.get('/admin/stats/bets-by-number', secureAdminRoutes, asyncHandler(statsController.getBetStatsByNumber));
router.get('/admin/stats/bets-by-number/paginated', secureAdminRoutes, asyncHandler(statsController.getBetStatsByNumberPaginated));
router.get('/admin/stats/quota-alerts', secureAdminRoutes, asyncHandler(statsController.getQuotaAlerts));
router.post('/admin/stats/send-quota-alerts', strictSecureAdminRoutes, asyncHandler(statsController.sendQuotaAlerts));

// === ADMIN PAYOUT ROUTES ===
router.get('/admin/payouts/pending', strictSecureAdminRoutes, asyncHandler(adminController.getPendingPayouts));
router.post('/admin/payouts/confirm', strictSecureAdminRoutes, asyncHandler(adminController.confirmPayouts));

// === ADMIN SECURITY ROUTES ===
router.get('/admin/2fa-status', adminAuth.verifyAdmin, asyncHandler(adminController.check2FAStatus));
router.post('/admin/setup-2fa', adminAuth.verifyAdmin, asyncHandler(adminController.setup2FA));
router.post('/admin/activate-2fa', adminAuth.verifyAdmin, asyncHandler(adminController.activate2FA));
router.delete('/admin/disable-2fa', adminAuth.verifyAdmin, asyncHandler(adminController.disable2FA));

// === ADMIN POINT CREATION ROUTES ===
router.get('/admin/create-points/qr', adminAuth.verifyAdmin, asyncHandler(adminController.generatePointCreationQR));
router.post('/admin/create-points', 
  adminAuth.verifyAdmin, 
  twoFactorAuth.require2FA, 
  twoFactorAuth.requireSecondDeviceQR, 
  asyncHandler(adminController.createPoints)
);

// 2FA routes
router.post('/auth/2fa/send-code', auth.verifyUser, asyncHandler(twoFactorAuth.sendVerificationCode));
router.get('/auth/2fa/qr-code', auth.verifyUser, asyncHandler(twoFactorAuth.generateQRCode));

// Pool Management Routes
router.get('/admin/pool',
  auth.verifyUser,
  roleAuth.restrictTo('admin'),
  asyncHandler(adminController.getPoolAccount)
);

router.post('/admin/pool/initialize',
  auth.verifyUser,
  roleAuth.restrictTo('admin'),
  asyncHandler(adminController.initializePoolAccount)
);

router.get('/admin/pool/transactions',
  auth.verifyUser,
  roleAuth.restrictTo('admin'),
  asyncHandler(adminController.getPoolTransactions)
);

router.post('/admin/pool/deposit',
  auth.verifyUser,
  roleAuth.restrictTo('admin'),
  asyncHandler(adminController.depositToPool)
);

router.get('/admin/pool/report',
  auth.verifyUser,
  roleAuth.restrictTo('admin'),
  asyncHandler(adminController.getPoolReport)
);

// Payout Management Routes
router.get('/admin/payouts/pending-bets',
  auth.verifyUser,
  roleAuth.restrictTo('admin'),
  asyncHandler(payoutController.getPendingWinningBets)
);

router.post('/admin/payouts/requests',
  auth.verifyUser,
  roleAuth.restrictTo('admin'),
  asyncHandler(payoutController.createPayoutRequest)
);

router.get('/admin/payouts/requests',
  auth.verifyUser,
  roleAuth.restrictTo('admin'),
  asyncHandler(payoutController.getPayoutRequests)
);

router.get('/admin/payouts/requests/:id',
  auth.verifyUser,
  roleAuth.restrictTo('admin'),
  asyncHandler(payoutController.getPayoutRequestDetail)
);

router.post('/admin/payouts/requests/:id/approve',
  auth.verifyUser,
  roleAuth.restrictTo('admin'),
  asyncHandler(payoutController.approvePayoutRequest)
);

router.post('/admin/payouts/requests/:id/reject',
  auth.verifyUser,
  roleAuth.restrictTo('admin'),
  asyncHandler(payoutController.rejectPayoutRequest)
);

// Phần thưởng và hệ thống tính thưởng nâng cao
// Reward routes
router.get('/rewards/loyalty-points', auth.verifyUser, asyncHandler(rewardController.getLoyaltyPoints));
router.post('/rewards/redeem-points', auth.verifyUser, asyncHandler(rewardController.redeemLoyaltyPoints));
router.get('/rewards/jackpot', asyncHandler(rewardController.getJackpot));
router.get('/rewards/bet/:betId/details', auth.verifyUser, asyncHandler(rewardController.getBetRewardDetails));

// Leaderboard APIs (public)
router.get('/rewards/leaderboard', rewardController.getLeaderboardInfo);
router.get('/rewards/leaderboard/betting', rewardController.getTopBettingLeaderboard);
router.get('/rewards/leaderboard/winning', rewardController.getTopWinningLeaderboard);

// Top holders APIs (public)
router.get('/coins/top-holders', coinController.getTopCoinHolders);
router.get('/coins/top-p-holders', coinController.getTopPHolders);

// Coin và Balance routes
router.get('/coins/balance', auth.verifyUser, asyncHandler(coinController.getUserCoinBalance));
router.get('/coins/p-balance', auth.verifyUser, asyncHandler(coinController.getUserPBalance));
router.get('/coins/history', auth.verifyUser, asyncHandler(coinController.getUserCoinHistory));
router.get('/coins/p-history', auth.verifyUser, asyncHandler(coinController.getUserPHistory));

// Admin Coin và Balance routes
router.post('/admin/coins/grant', auth.verifyUser, roleAuth.restrictTo('admin'), asyncHandler(coinController.adminGrantCoins));
router.post('/admin/coins/deduct', auth.verifyUser, roleAuth.restrictTo('admin'), asyncHandler(coinController.adminDeductCoins));
router.post('/admin/p/grant', auth.verifyUser, roleAuth.restrictTo('admin'), asyncHandler(coinController.adminGrantP));
router.post('/admin/p/deduct', auth.verifyUser, roleAuth.restrictTo('admin'), asyncHandler(coinController.adminDeductP));
router.get('/admin/coins/stats', auth.verifyUser, roleAuth.restrictTo('admin'), asyncHandler(coinController.getSystemStats));
router.post('/admin/coins/initialize-daily-bonus', auth.verifyUser, roleAuth.restrictTo('admin'), asyncHandler(coinController.initializeDailyBonus));

module.exports = router;