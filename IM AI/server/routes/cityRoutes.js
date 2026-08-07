import express from 'express';
import { DATABASE_UNAVAILABLE_MESSAGE, ensureDatabase } from '../config/db.js';
import City, { normalizeCityName } from '../models/City.js';

const router = express.Router();

router.get('/', async (req, res) => {
  if (!(await ensureDatabase())) {
    return res.status(503).json({
      success: false,
      message: DATABASE_UNAVAILABLE_MESSAGE
    });
  }

  try {
    const countryCode = String(req.query.countryCode || 'IN').trim().toUpperCase();
    const search = String(req.query.search || '').trim();
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 50);

    if (countryCode !== 'IN') {
      return res.json({ success: true, cities: [] });
    }

    const query = { countryCode: 'IN', isActive: true };

    if (search) {
      const normalizedSearch = normalizeCityName(search);
      query.$or = [
        { normalizedName: { $regex: normalizedSearch, $options: 'i' } },
        { state: { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' } }
      ];
    }

    const cities = await City.find(query)
      .sort({ name: 1, state: 1 })
      .limit(limit)
      .select('name state country countryCode')
      .lean();

    res.json({
      success: true,
      cities: cities.map((city) => ({
        id: String(city._id),
        name: city.name,
        state: city.state || '',
        country: city.country || 'India',
        countryCode: city.countryCode || 'IN'
      }))
    });
  } catch (error) {
    console.error('[cities]', error?.message || error);
    res.status(500).json({
      success: false,
      message: 'Unable to load cities. Please try again later.'
    });
  }
});

export default router;
