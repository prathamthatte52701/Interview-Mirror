import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import mongoose from 'mongoose';
import '../lib/env.js';
import City, { normalizeCityName } from '../models/City.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataPath = path.join(__dirname, '..', 'data', 'indiaCities.json');

function cleanText(value, fallback = '') {
  return String(value || fallback).trim().replace(/\s+/g, ' ');
}

async function main() {
  if (!process.env.MONGO_URI) {
    console.error('MONGO_URI missing. Add it to .env before running city seed.');
    process.exitCode = 1;
    return;
  }

  let inserted = 0;
  let updatedOrSkipped = 0;

  try {
    await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 8000 });

    const raw = await fs.readFile(dataPath, 'utf8');
    const cities = JSON.parse(raw);

    for (const item of cities) {
      const name = cleanText(item.name);
      const state = cleanText(item.state);
      const country = cleanText(item.country, 'India');
      const countryCode = cleanText(item.countryCode, 'IN').toUpperCase();
      const normalizedName = normalizeCityName(name);

      if (!name || countryCode !== 'IN') continue;

      const result = await City.updateOne(
        { normalizedName, state, countryCode },
        {
          $set: {
            name,
            state,
            country,
            countryCode,
            normalizedName,
            isActive: true
          }
        },
        { upsert: true }
      );

      if (result.upsertedCount > 0) inserted += 1;
      else updatedOrSkipped += 1;
    }

    console.log(`India city seed complete.`);
    console.log(`Total cities processed: ${cities.length}`);
    console.log(`Inserted: ${inserted}`);
    console.log(`Updated/skipped: ${updatedOrSkipped}`);
  } catch (error) {
    console.error('India city seed failed:', error?.message || error);
    process.exitCode = 1;
  } finally {
    await mongoose.connection.close().catch(() => {});
  }
}

main();
