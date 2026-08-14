import app from '../server.js';
import { ensureDB } from '../db.js';

export const config = {
  api: {
    bodyParser: false,
  },
};

export default async function handler(req, res) {
  try {
    await ensureDB();
  } catch (err) {
    console.error('Vercel API DB Init Error:', err);
  }
  return app(req, res);
}
