'use strict';
const crypto = require('crypto');
const { promisify } = require('util');
const scrypt = promisify(crypto.scrypt);

const REGIONS = [
  'Toshkent shahri', 'Toshkent viloyati', 'Andijon', 'Buxoro', "Farg'ona", 'Jizzax', 'Xorazm',
  'Namangan', 'Navoiy', 'Qashqadaryo', "Qoraqalpog'iston", 'Samarqand', 'Sirdaryo', 'Surxondaryo'
];
// Shu viloyatlar uchun aniq manzil majburiy
const ADDRESS_REQUIRED = ['Toshkent shahri', 'Toshkent viloyati'];

const r2 = (x) => Math.round((Number(x) + Number.EPSILON) * 100) / 100;
const slug = (s) => String(s).toLowerCase().replace(/[^a-z0-9а-яё]+/g, '-').replace(/^-+|-+$/g, '') || 'item';
const uid = () => crypto.randomUUID();

/**
 * Mahsulot nomiga qarab bo'limni aniqlaydi (admin qo'lda o'zgartira oladi).
 *  - MATOVKALAR: nomi "мат..." / "mat..." / "SF" bilan boshlansa (metr bilan o'lchanadi)
 *  - JILKALAR : SO, DECRALED, REGALED, "oyzuvi" va "jilka/жилка" so'zlari bor bo'lsa
 *  - BEVILS   : DB, RB, VB, VE, OYR va shunga o'xshash kod (harf + raqam), masalan "Db 395"
 *  - AKSESUVARLAR: qolgan hamma narsa
 */
function autoCategory(name) {
  const n = String(name || '').trim().toLowerCase();
  if (/^(мат|mat)/.test(n) || /^sf(?=$|[\s\-_.\d])/.test(n)) return 'matovka';
  if (/(decraled|decra|regaled|regalead|oyzuvi|жилк|jilka)/.test(n) || /^so(?=$|[\s\-_.\d])/.test(n)) return 'jilka';
  if (/^(db|rb|vb|ve|oyr|oyh|oh|ob|ch|roc)(?=$|[\s\-_.\d])/.test(n) || /^[a-z]{1,4}\s?[-_]?\s?\d/.test(n)) return 'bevils';
  return 'aksesuar';
}

async function hashPassword(pw) {
  const salt = crypto.randomBytes(16).toString('hex');
  const h = (await scrypt(pw, salt, 64)).toString('hex');
  return `${salt}:${h}`;
}
async function checkPassword(pw, stored) {
  const [salt, h] = String(stored || '').split(':');
  if (!salt || !h) return false;
  const t = await scrypt(String(pw), salt, 64);
  const b = Buffer.from(h, 'hex');
  return b.length === t.length && crypto.timingSafeEqual(b, t);
}

function signToken(payload, secret) {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  return body + '.' + sig;
}
function verifyToken(tok, secret) {
  if (!tok || !tok.includes('.')) return null;
  const [body, sig] = tok.split('.');
  const exp = crypto.createHmac('sha256', secret).update(body).digest('base64url');
  const a = Buffer.from(sig || ''), b = Buffer.from(exp);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (p.exp && p.exp < Date.now()) return null;
    return p;
  } catch { return null; }
}

// Toshkent vaqti (UTC+5)
const TZ = 5 * 3600e3;
const dayKey = (ts) => new Date(ts + TZ).toISOString().slice(0, 10);
const monthKey = (ts) => new Date(ts + TZ).toISOString().slice(0, 7);

const money = (n) => String(r2(n)).replace('.', ',') + '$';
const uzs = (n, rate) => Math.round(n * rate).toLocaleString('ru-RU') + " so'm";

function normPhone(v) {
  let d = String(v || '').replace(/\D/g, '');
  if (d.length === 12 && d.startsWith('998')) d = d.slice(3);
  if (d.length !== 9) return null;
  return '+998' + d;
}

module.exports = {
  REGIONS, ADDRESS_REQUIRED, r2, slug, uid, autoCategory, hashPassword, checkPassword,
  signToken, verifyToken, dayKey, monthKey, money, uzs, normPhone
};
