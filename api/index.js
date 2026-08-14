import app from '../server.js';
import { ensureDB } from '../db.js';

export default async function handler(req, res) {
  try {
    await ensureDB();
  } catch (err) {
    console.error('Vercel API DB Init Error:', err);
  }
  return app(req, res);
}
