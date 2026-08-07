import mongoose from 'mongoose';

export function normalizeCityName(name) {
  return String(name || '').trim().replace(/\s+/g, ' ').toLowerCase();
}

const citySchema = new mongoose.Schema({
  name: { type: String, required: true, trim: true },
  state: { type: String, default: '', trim: true },
  country: { type: String, default: 'India', trim: true },
  countryCode: { type: String, default: 'IN', trim: true, uppercase: true },
  normalizedName: { type: String, required: true, trim: true },
  isActive: { type: Boolean, default: true }
}, {
  timestamps: true
});

citySchema.index({ normalizedName: 1, state: 1, countryCode: 1 });

citySchema.pre('validate', function normalizeCity(next) {
  this.name = String(this.name || '').trim().replace(/\s+/g, ' ');
  this.state = String(this.state || '').trim().replace(/\s+/g, ' ');
  this.country = String(this.country || 'India').trim() || 'India';
  this.countryCode = String(this.countryCode || 'IN').trim().toUpperCase() || 'IN';
  this.normalizedName = normalizeCityName(this.name);
  next();
});

export default mongoose.model('City', citySchema);
