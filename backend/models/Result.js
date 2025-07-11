const mongoose = require('mongoose');
const Schema = mongoose.Schema;

// Schema cho kết quả từng tỉnh
const ProvinceResultSchema = new Schema({
  name: {
    type: String,
    required: true
  },
  code: {
    type: String,
    required: true
  },
  info: String,
  results: {
    eighth: {
      type: String,
      required: true,
      validate: {
        validator: function(v) {
          return /^\d{2}$/.test(v);
        },
        message: props => `${props.value} không phải là giải 8 hợp lệ (cần 2 chữ số)`
      }
    },
    seventh: {
      type: String,
      required: true,
      validate: {
        validator: function(v) {
          return /^\d{3}$/.test(v);
        },
        message: props => `${props.value} không phải là giải 7 hợp lệ (cần 3 chữ số)`
      }
    },
    sixth: {
      type: [String],
      required: true,
      validate: {
        validator: function(v) {
          if (!Array.isArray(v) || v.length < 3) return false;
          return v.every(num => /^\d{4}$/.test(num));
        },
        message: props => `${props.value} không phải là giải 6 hợp lệ (cần nhiều số 4 chữ số)`
      }
    },
    fifth: {
      type: String,
      required: true,
      validate: {
        validator: function(v) {
          return /^\d{4}$/.test(v);
        },
        message: props => `${props.value} không phải là giải 5 hợp lệ (cần 4 chữ số)`
      }
    },
    fourth: {
      type: [String],
      required: true,
      validate: {
        validator: function(v) {
          if (!Array.isArray(v) || v.length < 4) return false;
          return v.every(num => /^\d{5}$/.test(num));
        },
        message: props => `${props.value} không phải là giải 4 hợp lệ (cần nhiều số 5 chữ số)`
      }
    },
    third: {
      type: [String],
      required: true,
      validate: {
        validator: function(v) {
          if (!Array.isArray(v) || v.length < 2) return false;
          return v.every(num => /^\d{5}$/.test(num));
        },
        message: props => `${props.value} không phải là giải 3 hợp lệ (cần nhiều số 5 chữ số)`
      }
    },
    second: {
      type: String,
      required: true,
      validate: {
        validator: function(v) {
          return /^\d{5}$/.test(v);
        },
        message: props => `${props.value} không phải là giải nhì hợp lệ (cần 5 chữ số)`
      }
    },
    first: {
      type: String,
      required: true,
      validate: {
        validator: function(v) {
          return /^\d{5}$/.test(v);
        },
        message: props => `${props.value} không phải là giải nhất hợp lệ (cần 5 chữ số)`
      }
    },
    special: {
      type: String,
      required: true,
      validate: {
        validator: function(v) {
          return /^\d{6}$/.test(v);
        },
        message: props => `${props.value} không phải là giải đặc biệt hợp lệ (cần 6 chữ số)`
      }
    }
  }
});

// Schema chính cho kết quả xổ số
const ResultSchema = new Schema({
  date: {
    type: Date,
    required: true
  },
  weekday: {
    type: String,
    required: true,
    enum: ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'Chủ nhật']
  },
  region: {
    type: String,
    required: true,
    enum: ['Miền Bắc', 'Miền Trung', 'Miền Nam']
  },
  provinces: {
    type: [ProvinceResultSchema],
    required: true,
    validate: {
      validator: function(v) {
        return Array.isArray(v) && v.length > 0;
      },
      message: 'Phải có ít nhất một tỉnh'
    }
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  updatedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date
  },
  securityHash: {
    type: String
  }
}, {
  timestamps: {
    updatedAt: 'updatedAt'
  }
});

// Tạo index để tối ưu truy vấn
ResultSchema.index({ date: -1 });
ResultSchema.index({ region: 1, date: -1 });
ResultSchema.index({ 'provinces.code': 1, date: -1 });

// Pre-save middleware để tạo hash bảo mật cho kết quả
ResultSchema.pre('save', function(next) {
  if (this.isModified('provinces')) {
    const crypto = require('crypto');
    const resultString = JSON.stringify(this.provinces);
    
    this.securityHash = crypto
      .createHash('sha256')
      .update(resultString + this.date.toISOString())
      .digest('hex');
  }
  next();
});

module.exports = mongoose.model('Result', ResultSchema);