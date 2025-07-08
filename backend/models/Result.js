const mongoose = require('mongoose');

const resultSchema = new mongoose.Schema({
  date: { type: Date, required: true },
  weekday: { type: String, required: true },
  region: { type: String, required: true, default: 'Miền Nam' },
  provinces: [{
    name: { type: String, required: true },
    code: { type: String, required: true },
    info: { type: String },
    results: {
      eighth: { type: String, required: true, match: /^[0-9]{2}$/ },
      seventh: { type: String, required: true, match: /^[0-9]{3}$/ },
      sixth: [{ type: String, match: /^[0-9]{4}$/ }],
      fifth: { type: String, required: true, match: /^[0-9]{4}$/ },
      fourth: [{ type: String, match: /^[0-9]{5}$/ }],
      third: [{ type: String, match: /^[0-9]{5}$/ }],
      second: { type: String, required: true, match: /^[0-9]{5}$/ },
      first: { type: String, required: true, match: /^[0-9]{5}$/ },
      special: { type: String, required: true, match: /^[0-9]{6}$/ }
    }
  }],
  createdAt: { type: Date, default: Date.now },
});

// Để hỗ trợ cũ
resultSchema.virtual('twoDigitNumber').get(function() {
  if (!this.provinces || !this.provinces[0]) return null;
  return this.provinces[0].results.eighth;
});

resultSchema.virtual('threeDigitNumber').get(function() {
  if (!this.provinces || !this.provinces[0]) return null;
  return this.provinces[0].results.seventh;
});

resultSchema.virtual('fourDigitNumber').get(function() {
  if (!this.provinces || !this.provinces[0] || !this.provinces[0].results.sixth[0]) return null;
  return this.provinces[0].results.sixth[0];
});

// Indexes cho hiệu suất
resultSchema.index({ date: -1 });
resultSchema.index({ 'provinces.code': 1 });

module.exports = mongoose.model('Result', resultSchema);