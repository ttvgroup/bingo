const User = require('../models/User');

// Sửa từ exports.adminAuth thành module.exports
module.exports = async (req, res, next) => {
  try {
    const telegramId = req.user.id;
    const user = await User.findOne({ telegramId });
    if (!user) {
      return res.status(404).json({ message: 'User not found' });
    }
    if (user.role !== 'admin') {
      return res.status(403).json({ message: 'Access denied: Admin only' });
    }
    req.userData = user;
    next();
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};