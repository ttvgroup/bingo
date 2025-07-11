const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const ParlaySchema = new Schema({
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  bets: [{
    type: Schema.Types.ObjectId,
    ref: 'Bet'
  }],
  betCount: {
    type: Number,
    required: true,
    min: 2
  },
  totalStake: {
    type: Number,
    required: true,
    min: 1
  },
  baseOdds: {
    type: Number,
    required: true
  },
  bonusFactor: {
    type: Number,
    required: true,
    default: 1.1
  },
  finalOdds: {
    type: Number,
    required: true
  },
  potentialWin: {
    type: Number,
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  status: {
    type: String,
    enum: ['pending', 'partial_win', 'won', 'lost', 'cancelled'],
    default: 'pending'
  },
  resultedAt: {
    type: Date
  },
  actualWinAmount: {
    type: Number,
    default: 0
  },
  description: {
    type: String
  },
  betDetails: [{
    numbers: {
      type: String,
      required: true
    },
    betType: {
      type: String,
      required: true
    },
    amount: {
      type: Number,
      required: true
    },
    provinceCode: {
      type: String,
      required: true
    },
    odds: {
      type: Number,
      required: true
    },
    status: {
      type: String,
      enum: ['pending', 'won', 'lost', 'cancelled'],
      default: 'pending'
    },
    winAmount: {
      type: Number,
      default: 0
    }
  }]
});

// Tạo index để tối ưu truy vấn
ParlaySchema.index({ userId: 1, createdAt: -1 });
ParlaySchema.index({ status: 1 });

// Phương thức tính toán tiền thắng tiềm năng
ParlaySchema.methods.calculatePotentialWin = function() {
  let totalOdds = 1;
  
  this.betDetails.forEach(bet => {
    totalOdds *= bet.odds;
  });
  
  // Hệ số thưởng dựa trên số lượng cược
  const bonusFactor = 1 + (this.betCount - 1) * 0.1;
  
  this.baseOdds = totalOdds;
  this.bonusFactor = bonusFactor;
  this.finalOdds = totalOdds * bonusFactor;
  this.potentialWin = Math.floor(this.totalStake * this.finalOdds);
  
  return this.potentialWin;
};

// Phương thức cập nhật trạng thái của parlay khi có kết quả
ParlaySchema.methods.updateStatus = async function() {
  // Lấy thông tin chi tiết cược liên kết
  await this.populate('bets');
  
  let allWon = true;
  let allLost = true;
  let pendingCount = 0;
  
  // Cập nhật trạng thái của từng cược con
  for (let i = 0; i < this.bets.length; i++) {
    const bet = this.bets[i];
    this.betDetails[i].status = bet.status;
    this.betDetails[i].winAmount = bet.winAmount;
    
    if (bet.status === 'pending') {
      pendingCount++;
      allWon = false;
      allLost = false;
    } else if (bet.status === 'won') {
      allLost = false;
    } else if (bet.status === 'lost') {
      allWon = false;
    }
  }
  
  // Xác định trạng thái chung
  if (pendingCount > 0) {
    this.status = 'pending';
  } else if (allWon) {
    this.status = 'won';
    this.actualWinAmount = this.potentialWin;
  } else if (allLost) {
    this.status = 'lost';
    this.actualWinAmount = 0;
  } else {
    this.status = 'partial_win';
    
    // Tính lại tiền thắng dựa trên các cược thắng
    let winOdds = 1;
    let winCount = 0;
    
    this.betDetails.forEach(detail => {
      if (detail.status === 'won') {
        winOdds *= detail.odds;
        winCount++;
      }
    });
    
    if (winCount > 0) {
      const partialBonusFactor = 1 + (winCount - 1) * 0.1;
      const partialOdds = winOdds * partialBonusFactor;
      this.actualWinAmount = Math.floor(this.totalStake * partialOdds);
    } else {
      this.actualWinAmount = 0;
    }
  }
  
  if (this.status !== 'pending') {
    this.resultedAt = new Date();
  }
  
  return this.save();
};

// Phương thức tạo parlay mới
ParlaySchema.statics.createFromBets = async function(userId, bets, totalStake) {
  if (!Array.isArray(bets) || bets.length < 2) {
    throw new Error('Cần ít nhất 2 cược để tạo cược kết hợp');
  }
  
  const betDetails = bets.map(bet => ({
    numbers: bet.numbers,
    betType: bet.betType,
    amount: bet.amount,
    provinceCode: bet.provinceCode,
    odds: getOddsForBetType(bet.betType),
    status: 'pending',
    winAmount: 0
  }));
  
  const parlay = new this({
    userId,
    betCount: bets.length,
    totalStake,
    betDetails,
    baseOdds: 1,
    bonusFactor: 1.1,
    finalOdds: 1.1,
    potentialWin: 0
  });
  
  // Tính toán odds và tiền thắng tiềm năng
  parlay.calculatePotentialWin();
  
  return parlay.save();
};

// Hàm trợ giúp lấy tỷ lệ cược theo loại
function getOddsForBetType(betType) {
  const payoutRatios = {
    '2D': 70,
    '3D': 600,
    '4D': 5000,
    'Bao lô 2D': 70,
    'Bao lô 3D': 600,
    'Bao lô 4D': 5000
  };
  
  return payoutRatios[betType] || 1;
}

module.exports = mongoose.model('Parlay', ParlaySchema); 