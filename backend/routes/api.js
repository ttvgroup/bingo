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

// User routes
router.post('/users/register', userController.register);
router.post('/users/login', userController.login);
router.get('/users/me', auth, userController.getProfile);
router.put('/users/me', auth, userController.updateProfile);

// Bet routes
router.post('/bets', auth, betController.placeBet);
router.get('/bets', auth, betController.getUserBets);
router.get('/bets/:id', auth, betController.getBetById);
router.get('/bet-types', betController.getBetTypes);

// Result routes
router.get('/results/latest', resultController.getLatestResult);
router.get('/results/:id', resultController.getResultById);
router.get('/results/date/:date', resultController.getResultByDate);

// Lọc kết quả theo chữ số cuối
router.get('/results/:resultId/filter', resultController.filterByLastDigit);
router.get('/results/:resultId/filter-multi', resultController.filterByMultipleLastDigits);
router.get('/results/statistics/frequency', resultController.getLastDigitFrequency);

// Transaction routes
router.get('/transactions', auth, transactionController.getUserTransactions);
router.post('/transactions/deposit', auth, transactionController.createDeposit);
router.post('/transactions/withdraw', auth, transactionController.createWithdrawal);

// Stats routes
router.get('/stats/user', auth, statsController.getUserStats);
router.get('/stats/public', statsController.getPublicStats);

// Admin routes
router.post('/admin/results', adminAuth, resultController.createResult);
router.put('/admin/results/:id', adminAuth, resultController.updateResult);
router.delete('/admin/results/:id', adminAuth, resultController.deleteResult);

router.get('/admin/users', adminAuth, adminController.getAllUsers);
router.get('/admin/bets', adminAuth, adminController.getAllBets);
router.get('/admin/transactions', adminAuth, adminController.getAllTransactions);
router.put('/admin/users/:id', adminAuth, adminController.updateUser);
router.put('/admin/transactions/:id/approve', adminAuth, adminController.approveTransaction);
router.put('/admin/transactions/:id/reject', adminAuth, adminController.rejectTransaction);

module.exports = router;