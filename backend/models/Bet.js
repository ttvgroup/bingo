const mongoose = require('mongoose');

const betSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  numbers: { type: String, required: true },
  betType: { 
    type: String, 
    enum: ['2D', '3D', '4D', 'Bao lô 2D', 'Bao lô 3D', 'Bao lô 4D'], 
    required: true 
  },
  amount: { type: Number, required: true },
  createdAt: { type: Date, default: Date.now },
  resultId: { type: mongoose.Schema.Types.ObjectId, ref: 'Result', default: null },
  status: { type: String, enum: ['pending', 'won', 'lost'], default: 'pending' },
  provinceCode: { type: String, default: null }, // Mã tỉnh (nếu đặt cược cho tỉnh cụ thể)
  winAmount: { type: Number, default: 0 }, // Số tiền thắng (nếu trúng)
});

// Indexes for performance
betSchema.index({ userId: 1 });
betSchema.index({ resultId: 1 });
betSchema.index({ status: 1 });
betSchema.index({ betType: 1 });
betSchema.index({ provinceCode: 1 });

module.exports = mongoose.model('Bet', betSchema);