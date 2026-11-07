'use strict';
/**
 * GLASS-IDEAL_VITRAJ — server (Express) + Telegram bot.
 * Bitta jarayon: veb-ilova (public/), API (/api/*), bot webhook (/tg/*).
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

// .env faylini (agar bor bo'lsa) o'qiydi — dotenv kerak emas
try {
  const f = path.join(__dirname, '..', '.env');
  if (fs.existsSync(f)) {
    for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
      if (/^\s*#/.test(line)) continue;
      const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].replace(/^(["'])(.*)\1$/, '$2');
    }
  }
} catch { /* .env bo'lmasa ham ishlayveradi */ }

const express = require('express');
const { Store } = require('./store');
const U = require('./util');
const createBot = require('./bot');

const PORT = Number(process.env.PORT) || 3000;
const DAY = 86400e3;
const METHODS = { payme: 'Payme', click: 'Click', paynet: 'Paynet' };
const CATS = [
  { id: 'new', label: 'Yangiliklar' }, { id: 'all', label: 'Hammasi' }, { id: 'bevils', label: 'Bevils' },
  { id: 'jilka', label: 'Jilkalar' }, { id: 'matovka', label: 'Matovkalar' }, { id: 'aksesuar', label: 'Aksesuvarlar' }
];
const DEFAULT_CONSENT =
  "Ha, roziman: agar 1–2 hafta ichida qarzimni qaytara olmasam, Tashenov Islomboy Sabirbayevich 102 ga telefon qilishiga roziman.";
const DEFAULT_STOCK = 50;

const store = new Store();
let S;            // sozlamalar hujjati (settings/main)
let SECRET;       // token va fayl imzolari uchun
const now = () => Date.now();
const bad = (msg, status = 400) => Object.assign(new Error(msg), { status });
const str = (v, max = 200) => String(v ?? '').trim().slice(0, max);
const wrap = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const unitLabel = (u) => (u === 'metr' ? 'm' : 'dona');

/* ---------------------------------------------------------------- yordamchilar */
const sign = (s) => crypto.createHmac('sha256', SECRET).update('file:' + s).digest('base64url').slice(0, 22);
const fileUrl = (id) => (id ? `/api/file/${id}?s=${sign(id)}` : null);

function parseImage(dataUrl, maxBytes = 3e6) {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(dataUrl || ''));
  if (!m) throw bad("Rasm noto'g'ri formatda (JPG/PNG)");
  const buf = Buffer.from(m[2], 'base64');
  if (!buf.length || buf.length > maxBytes) throw bad('Rasm juda katta (3 MB dan oshmasin)');
  return { buf, mime: m[1] };
}
async function saveImage(dataUrl) {
  const { buf, mime } = parseImage(dataUrl);
  const id = crypto.randomUUID();
  await store.saveFile(id, buf, mime);
  return id;
}

const rl = new Map();
function limit(req, key, max, windowMs = 10 * 60e3) {
  const k = key + ':' + req.ip;
  const t = now();
  const arr = (rl.get(k) || []).filter((x) => t - x < windowMs);
  if (arr.length >= max) throw bad("Juda ko'p urinish. Birozdan so'ng qayta urinib ko'ring.", 429);
  arr.push(t);
  rl.set(k, arr);
}
setInterval(() => { const t = now(); for (const [k, v] of rl) if (!v.some((x) => t - x < 600e3)) rl.delete(k); }, 600e3).unref();

const findUser = (username) => store.list('users').find((u) => u.username.toLowerCase() === String(username).toLowerCase());
const userOut = (u) => ({
  id: u.id, username: u.username, name: u.name, phone: u.phone, region: u.region, address: u.address || '',
  role: u.role, avatar: fileUrl(u.avatar), createdAt: u.createdAt
});
const productOut = (p) => ({
  id: p.id, name: p.name, size: p.size, price: p.price, stock: p.stock, unit: p.unit, cat: p.cat, isNew: !!p.isNew, img: p.img
});
const paidOf = (o) => U.r2(o.payments.filter((p) => p.status === 'confirmed').reduce((s, p) => s + p.amount, 0));
const owedOf = (o) => (o.kind === 'debt' && (o.status === 'accepted' || o.status === 'delivered') ? Math.max(0, U.r2(o.total - paidOf(o))) : 0);
const isActiveDebt = (o) => o.kind === 'debt' && (o.status === 'pending' || owedOf(o) > 0.004);
const activeDebts = (uid) => store.list('orders').filter((o) => o.userId === uid && isActiveDebt(o));

function orderOut(o, admin = false) {
  const out = {
    id: o.id, no: o.no, createdAt: o.createdAt, acceptedAt: o.acceptedAt || null, status: o.status, kind: o.kind,
    total: o.total, paid: paidOf(o), owed: owedOf(o), comment: o.comment || '', items: o.items,
    debt: o.debt || null,
    payments: o.payments.map((p) => ({
      id: p.id, amount: p.amount, method: p.method, purpose: p.purpose, status: p.status, at: p.at,
      decidedAt: p.decidedAt || null, chek: fileUrl(p.file), note: p.note || ''
    }))
  };
  if (admin) { out.userId = o.userId; out.user = o.userSnap; }
  return out;
}

function makeToken(u) { return U.signToken({ uid: u.id, exp: now() + 30 * DAY }, SECRET); }

function auth(role) {
  return (req, res, next) => {
    const raw = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const p = U.verifyToken(raw, SECRET);
    const u = p && store.get('users', p.uid);
    if (!u) return res.status(401).json({ error: 'Qaytadan kiring', code: 'auth' });
    if (u.blocked) return res.status(403).json({ error: `Akkaunt bloklangan. Aloqa: ${S.contact.phone}`, code: 'blocked' });
    if (role === 'admin' && u.role !== 'admin') return res.status(403).json({ error: "Ruxsat yo'q" });
    req.user = u;
    next();
  };
}

/** Mini App ichidan kirilgan bo'lsa — Telegram ID'ni akkauntga bog'laydi (xabarnomalar uchun) */
async function linkTelegram(u, initData) {
  const tgu = bot.verifyInitData(initData);
  if (!tgu || !tgu.id) return;
  let changed = false;
  if (u.tgId !== tgu.id) { u.tgId = tgu.id; changed = true; }
  if (changed) await store.put('users', u);
  if (u.role === 'admin' && String(S.adminChat) !== String(tgu.id)) { S.adminChat = tgu.id; await store.put('settings', S); }
}

/* ---------------------------------------------------------------- hisobotlar (oylik) */
async function refreshMonth(ym) {
  const prev = store.get('months', ym) || { id: ym, clearedAt: 0 };
  const from = prev.clearedAt || 0;
  let orders = 0, sales = 0, cost = 0, cash = 0, noCost = 0;
  for (const o of store.list('orders')) {
    if (o.acceptedAt && o.acceptedAt > from && U.monthKey(o.acceptedAt) === ym && o.status !== 'rejected') {
      orders++; sales += o.total;
      for (const it of o.items) { cost += (it.cost || 0) * it.qty; if (!it.cost) noCost++; }
    }
    for (const p of o.payments) {
      if (p.status === 'confirmed' && p.decidedAt > from && U.monthKey(p.decidedAt) === ym) cash += p.amount;
    }
  }
  await store.put('months', {
    ...prev, id: ym, orders, sales: U.r2(sales), cost: U.r2(cost), profit: U.r2(sales - cost), cash: U.r2(cash),
    noCost, hidden: !(orders || cash), updatedAt: now()
  });
}

/* ---------------------------------------------------------------- to'lovni tasdiqlash / rad etish */
async function restoreStock(o) {
  for (const it of o.items) {
    const p = store.get('products', it.pid);
    if (p) { p.stock = U.r2(p.stock + it.qty); await store.put('products', p); }
  }
}

async function decidePayment(orderId, payId, action) {
  const o = store.get('orders', String(orderId));
  if (!o) throw bad('Buyurtma topilmadi', 404);
  const p = o.payments.find((x) => x.id === payId);
  if (!p) throw bad("To'lov topilmadi", 404);
  if (p.status !== 'pending') throw bad("Bu to'lov allaqachon ko'rib chiqilgan");
  const first = p.purpose === 'full' || p.purpose === 'down';
  p.decidedAt = now();
  let msg;
  if (action === 'confirm') {
    p.status = 'confirmed';
    if (first) {
      o.status = 'accepted'; o.acceptedAt = now();
      if (o.kind === 'debt') o.debt.dueAt = now() + S.debt.days * DAY;
    }
    const owed = owedOf(o);
    if (first) {
      msg = o.kind === 'debt'
        ? `✅ <b>Buyurtma №${o.no} qabul qilindi!</b>\nBoshlang'ich to'lov tasdiqlandi. Qolgan qarz: <b>${U.money(owed)}</b> (muddat: ${S.debt.days} kun).`
        : `✅ <b>Buyurtma №${o.no} qabul qilindi!</b>\nTo'lovingiz tasdiqlandi. Rahmat!`;
    } else {
      msg = owed > 0.004
        ? `✅ To'lov tasdiqlandi: ${U.money(p.amount)}.\n№${o.no} bo'yicha qolgan qarz: <b>${U.money(owed)}</b>`
        : `🎉 №${o.no} bo'yicha qarz <b>to'liq yopildi</b>. Rahmat!`;
    }
  } else if (action === 'reject') {
    p.status = 'rejected';
    if (first && o.status === 'pending') { o.status = 'rejected'; await restoreStock(o); }
    msg = first
      ? `❌ <b>Buyurtma №${o.no} bekor qilindi.</b>\nTo'lov cheki tasdiqlanmadi. Savol bo'lsa: ${S.contact.phone}`
      : `❌ №${o.no} bo'yicha to'lov cheki tasdiqlanmadi. Qayta yuboring yoki aloqaga chiqing: ${S.contact.phone}`;
  } else throw bad("Noto'g'ri amal");
  await store.put('orders', o);
  if (action === 'confirm') await refreshMonth(U.monthKey(now()));
  const u = store.get('users', o.userId);
  if (u && u.tgId) bot.notifyUser(u.tgId, msg);
  return o;
}

/* ---------------------------------------------------------------- bot */
const bot = createBot({
  botName: () => S.botName,
  verifyLinkCode: (code) => !!(S.linkCode && S.linkCode.exp > now() && S.linkCode.code === String(code || '').trim().toUpperCase()),
  setAdminChat: async (chat) => { S.adminChat = chat; S.linkCode = null; await store.put('settings', S); },
  isAdminChat: (chat) => String(chat) === String(S.adminChat || process.env.ADMIN_CHAT_ID || ''),
  adminChat: () => S.adminChat || process.env.ADMIN_CHAT_ID || null,
  decidePayment
});

async function notifyPayment(o, p, title) {
  const x = o.userSnap;
  const lines = o.items.slice(0, 12).map((i) => `• ${bot.esc(i.name)} × ${i.qty} ${unitLabel(i.unit)} = ${U.money(i.sum)}`);
  if (o.items.length > 12) lines.push(`…va yana ${o.items.length - 12} ta`);
  const text =
    `${title}\n👤 ${bot.esc(x.name)} (@${bot.esc(x.username)})\n📞 ${bot.esc(x.phone)}\n📍 ${bot.esc(x.region)}${x.address ? ', ' + bot.esc(x.address) : ''}\n\n` +
    lines.join('\n') +
    `\n\n🧾 Buyurtma jami: <b>${U.money(o.total)}</b>\n💳 ${p.purpose === 'full' ? "To'liq to'lov" : p.purpose === 'down' ? `Qarzga — boshlang'ich ${o.debt.percent}%` : "Qarz to'lovi"}: <b>${U.money(p.amount)}</b> (${METHODS[p.method] || p.method})` +
    (o.comment ? `\n💬 ${bot.esc(o.comment)}` : '') + (p.note ? `\n💬 ${bot.esc(p.note)}` : '');
  const f = p.file ? await store.getFile(p.file) : null;
  await bot.notifyAdmin(text, { pay: { orderId: o.id, payId: p.id }, chek: f ? { buf: f.buf, mime: f.mime } : null });
}

/* ---------------------------------------------------------------- Express */
const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use((req, res, next) => {          // Live Server (5500) bilan ishlash uchun CORS
  res.set({ 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': 'Authorization, Content-Type', 'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS' });
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use(express.json({ limit: '6mb' }));

app.get('/healthz', (req, res) => res.json({ ok: true, t: now() }));

app.post('/tg/:key', (req, res) => {
  if (!bot.checkHook(req.params.key, req.get('x-telegram-bot-api-secret-token'))) return res.sendStatus(403);
  res.sendStatus(200);
  bot.handleUpdate(req.body || {}).catch((e) => console.error('Bot:', e.message));
});

app.get('/api/file/:id', wrap(async (req, res) => {
  if (req.query.s !== sign(req.params.id)) return res.sendStatus(403);
  const f = await store.getFile(req.params.id);
  if (!f) return res.sendStatus(404);
  res.set({ 'Content-Type': f.mime, 'Cache-Control': 'private, max-age=31536000, immutable' }).send(f.buf);
}));

/* ---- ochiq */
app.get('/api/config', (req, res) => {
  res.json({
    botName: S.botName, regions: U.REGIONS, addressRequired: U.ADDRESS_REQUIRED, cats: CATS,
    debt: S.debt, contact: S.contact, usdRate: S.usdRate,
    methods: Object.entries(METHODS).map(([id, label]) => ({ id, label })), hasBot: bot.enabled
  });
});

app.get('/api/username-free', (req, res) => {
  const u = str(req.query.u, 20);
  res.json({ valid: /^[a-zA-Z0-9._]{3,20}$/.test(u), free: !findUser(u) });
});

app.post('/api/register', wrap(async (req, res) => {
  limit(req, 'reg', 12);
  const b = req.body || {};
  const username = str(b.username, 20), pw = String(b.password || '');
  if (!/^[a-zA-Z0-9._]{3,20}$/.test(username)) throw bad("Akkaunt nomi 3–20 ta belgi: lotin harflari, raqam, nuqta yoki _");
  if (pw.length < 6) throw bad("Parol kamida 6 ta belgidan iborat bo'lsin");
  if (pw.length > 64) throw bad('Parol juda uzun');
  const name = str(b.name, 60);
  if (name.length < 2) throw bad('Ismingizni kiriting');
  const phone = U.normPhone(b.phone);
  if (!phone) throw bad("Telefon raqam noto'g'ri (9 ta raqam kiriting)");
  const region = str(b.region, 40);
  if (!U.REGIONS.includes(region)) throw bad('Viloyatni tanlang');
  const address = str(b.address, 200);
  if (U.ADDRESS_REQUIRED.includes(region) && address.length < 5) throw bad('Toshkent uchun aniq manzilni kiriting');
  if (findUser(username)) throw bad('Bu akkaunt nomi band, boshqasini tanlang');
  const u = {
    id: U.uid(), username, name, phone, region, address, role: 'user', pass: await U.hashPassword(pw),
    avatar: null, createdAt: now(), tgId: null, blocked: false, consent: null
  };
  if (findUser(username)) throw bad('Bu akkaunt nomi band, boshqasini tanlang');
  await store.put('users', u);
  await linkTelegram(u, b.initData);
  res.json({ token: makeToken(u), user: userOut(u) });
}));

app.post('/api/login', wrap(async (req, res) => {
  limit(req, 'login', 25);
  const b = req.body || {};
  const u = findUser(str(b.username, 20));
  if (!u || !(await U.checkPassword(b.password, u.pass))) throw bad("Akkaunt nomi yoki parol noto'g'ri", 401);
  if (u.blocked) throw bad(`Akkaunt bloklangan. Aloqa: ${S.contact.phone}`, 403);
  await linkTelegram(u, b.initData);
  res.json({ token: makeToken(u), user: userOut(u) });
}));

/* ---- mijoz */
app.get('/api/me', auth(), (req, res) => res.json({ user: userOut(req.user) }));

app.put('/api/me', auth(), wrap(async (req, res) => {
  const u = req.user, b = req.body || {};
  if (b.name !== undefined) { const n = str(b.name, 60); if (n.length < 2) throw bad('Ismingizni kiriting'); u.name = n; }
  if (b.phone !== undefined) { const p = U.normPhone(b.phone); if (!p) throw bad("Telefon raqam noto'g'ri"); u.phone = p; }
  if (b.region !== undefined) { const r = str(b.region, 40); if (!U.REGIONS.includes(r)) throw bad('Viloyatni tanlang'); u.region = r; }
  if (b.address !== undefined) u.address = str(b.address, 200);
  if (U.ADDRESS_REQUIRED.includes(u.region) && (u.address || '').length < 5) throw bad('Toshkent uchun aniq manzilni kiriting');
  if (b.username !== undefined && b.username !== u.username) {
    if (u.role === 'admin') throw bad("Admin nomini o'zgartirib bo'lmaydi");
    const nu = str(b.username, 20);
    if (!/^[a-zA-Z0-9._]{3,20}$/.test(nu)) throw bad("Akkaunt nomi 3–20 ta belgi: lotin harflari, raqam, nuqta yoki _");
    const ex = findUser(nu);
    if (ex && ex.id !== u.id) throw bad('Bu akkaunt nomi band');
    u.username = nu;
  }
  await store.put('users', u);
  res.json({ user: userOut(u) });
}));

app.post('/api/me/password', auth(), wrap(async (req, res) => {
  limit(req, 'pw', 10);
  const b = req.body || {};
  if (!(await U.checkPassword(b.old, req.user.pass))) throw bad("Eski parol noto'g'ri");
  const np = String(b.password || '');
  if (np.length < 6) throw bad("Yangi parol kamida 6 ta belgidan iborat bo'lsin");
  req.user.pass = await U.hashPassword(np);
  await store.put('users', req.user);
  res.json({ ok: true });
}));

app.post('/api/me/avatar', auth(), wrap(async (req, res) => {
  parseImage(req.body && req.body.image, 1.5e6);
  req.user.avatar = await saveImage(req.body.image);
  await store.put('users', req.user);
  res.json({ user: userOut(req.user) });
}));

app.get('/api/products', auth(), (req, res) => {
  res.json({ products: store.list('products').filter((p) => p.active).sort((a, b) => a.sort - b.sort).map(productOut) });
});

app.get('/api/pay-info', auth(), (req, res) => res.json({ pay: S.pay, usdRate: S.usdRate }));

app.get('/api/orders', auth(), (req, res) => {
  const list = store.list('orders').filter((o) => o.userId === req.user.id).sort((a, b) => b.createdAt - a.createdAt);
  res.json({ orders: list.map((o) => orderOut(o)) });
});

app.get('/api/debts', auth(), (req, res) => {
  const list = activeDebts(req.user.id).sort((a, b) => a.createdAt - b.createdAt);
  res.json({
    debts: list.map((o) => orderOut(o)),
    total: U.r2(list.reduce((s, o) => s + owedOf(o), 0)), max: S.debt.max
  });
});

app.post('/api/orders', auth(), wrap(async (req, res) => {
  const u = req.user, b = req.body || {};
  if (u.role === 'admin') throw bad('Admin buyurtma bera olmaydi');
  limit(req, 'order', 20);
  const kind = b.kind === 'debt' ? 'debt' : 'full';
  if (!METHODS[b.method]) throw bad("To'lov usulini tanlang");
  if (!Array.isArray(b.items) || !b.items.length) throw bad("Savat bo'sh");
  if (b.items.length > 120) throw bad('Juda ko\'p mahsulot');
  const img = parseImage(b.receipt);
  if (kind === 'debt') {
    if (b.consent !== true) throw bad('Shartlarga rozilik belgisini qo\'ying');
    if (activeDebts(u.id).length >= S.debt.max) throw bad(`Sizda allaqachon ${S.debt.max} ta qarz bor. Avval qarzni to'lang.`);
  }
  const chekId = crypto.randomUUID();
  await store.saveFile(chekId, img.buf, img.mime);

  // ---- sinxron bo'lim: tekshirish + ombordan ayirish + yozish (orada await yo'q)
  const items = [], seen = new Set();
  let total = 0;
  for (const r of b.items) {
    const p = store.get('products', String(r.id));
    if (!p || !p.active) throw bad('Mahsulot topilmadi');
    if (seen.has(p.id)) throw bad('Mahsulot takrorlangan');
    seen.add(p.id);
    let qty = Number(r.qty);
    if (!(qty > 0)) throw bad("Miqdor noto'g'ri");
    qty = p.unit === 'metr' ? Math.round(qty * 2) / 2 : Math.floor(qty);
    if (qty <= 0) throw bad("Miqdor noto'g'ri");
    if (qty > p.stock) throw bad(p.stock > 0 ? `${p.name}: omborda faqat ${p.stock} ${unitLabel(p.unit)} bor` : `${p.name} shu mahsulotdan afsuski qolmadi`);
    const sum = U.r2(p.price * qty);
    total = U.r2(total + sum);
    items.push({ pid: p.id, name: p.name, size: p.size || '', unit: p.unit, price: p.price, cost: p.cost || 0, qty, sum });
  }
  if (kind === 'debt' && activeDebts(u.id).length >= S.debt.max) throw bad(`Sizda allaqachon ${S.debt.max} ta qarz bor.`);
  const amount = kind === 'debt' ? Math.max(0.01, U.r2((total * S.debt.percent) / 100)) : total;
  for (const it of items) { const p = store.get('products', it.pid); p.stock = U.r2(p.stock - it.qty); }
  S.seq = (S.seq || 1000) + 1;
  const pay = {
    id: crypto.randomBytes(4).toString('hex'), amount, method: b.method, purpose: kind === 'debt' ? 'down' : 'full',
    status: 'pending', at: now(), file: chekId
  };
  const order = {
    id: String(S.seq), no: S.seq, userId: u.id,
    userSnap: { name: u.name, username: u.username, phone: u.phone, region: u.region, address: u.address || '' },
    items, total, comment: str(b.comment, 500), kind, status: 'pending', createdAt: now(), acceptedAt: null,
    payments: [pay],
    debt: kind === 'debt' ? { percent: S.debt.percent, days: S.debt.days, dueAt: null, consentAt: now(), consentText: S.debt.text || DEFAULT_CONSENT } : null
  };
  if (kind === 'debt') u.consent = { at: now(), text: order.debt.consentText, count: ((u.consent && u.consent.count) || 0) + 1 };
  // ----
  for (const it of items) await store.put('products', store.get('products', it.pid));
  await store.put('settings', S);
  await store.put('users', u);
  await store.put('orders', order);
  res.json({ order: orderOut(order) });
  notifyPayment(order, pay, `🆕 <b>Yangi buyurtma №${order.no}</b>`).catch((e) => console.error('notify:', e.message));
}));

app.post('/api/orders/:id/pay', auth(), wrap(async (req, res) => {
  limit(req, 'pay', 30);
  const o = store.get('orders', req.params.id), b = req.body || {};
  if (!o || o.userId !== req.user.id) throw bad('Buyurtma topilmadi', 404);
  if (o.kind !== 'debt' || !['accepted', 'delivered'].includes(o.status)) throw bad("Bu buyurtma bo'yicha qarz yo'q");
  if (!METHODS[b.method]) throw bad("To'lov usulini tanlang");
  const owed = owedOf(o);
  const pendingSum = U.r2(o.payments.filter((p) => p.status === 'pending').reduce((s, p) => s + p.amount, 0));
  const amount = U.r2(Number(b.amount));
  if (!(amount >= 0.01)) throw bad("To'lov summasini kiriting");
  if (amount > U.r2(owed - pendingSum) + 0.004) throw bad(`Summa qarzdan oshib ketdi (to'lash mumkin: ${U.money(Math.max(0, owed - pendingSum))})`);
  parseImage(b.receipt);
  const file = await saveImage(b.receipt);
  const p = { id: crypto.randomBytes(4).toString('hex'), amount, method: b.method, purpose: 'repay', status: 'pending', at: now(), file, note: str(b.comment, 300) };
  o.payments.push(p);
  await store.put('orders', o);
  res.json({ order: orderOut(o) });
  notifyPayment(o, p, `💸 <b>Qarz to'lovi — №${o.no}</b>`).catch((e) => console.error('notify:', e.message));
}));

/* ---- admin */
const admin = express.Router();
admin.use(auth('admin'));
app.use('/api/admin', admin);

const dayRange = (day) => { const t = Date.parse(day + 'T00:00:00Z') - 5 * 3600e3; return [t, t + DAY]; };

admin.get('/overview', (req, res) => {
  const orders = store.list('orders');
  const today = U.dayKey(now());
  const t = orders.filter((o) => U.dayKey(o.createdAt) === today && o.status !== 'rejected');
  const pending = [];
  for (const o of orders) for (const p of o.payments) if (p.status === 'pending') pending.push({ order: orderOut(o, true), pay: orderOut(o, true).payments.find((x) => x.id === p.id) });
  pending.sort((a, b) => a.pay.at - b.pay.at);
  const debts = orders.filter((o) => owedOf(o) > 0.004);
  res.json({
    users: store.list('users').filter((u) => u.role !== 'admin').length,
    products: store.list('products').length,
    todayOrders: t.length, todaySum: U.r2(t.reduce((s, o) => s + o.total, 0)),
    debtTotal: U.r2(debts.reduce((s, o) => s + owedOf(o), 0)), debtCount: debts.length,
    pending
  });
});

admin.get('/orders', (req, res) => {
  const { from, to, status, q, today } = req.query;
  let list = store.list('orders');
  if (today) list = list.filter((o) => U.dayKey(o.createdAt) === U.dayKey(now()));
  if (from && /^\d{4}-\d\d-\d\d$/.test(from)) list = list.filter((o) => o.createdAt >= dayRange(from)[0]);
  if (to && /^\d{4}-\d\d-\d\d$/.test(to)) list = list.filter((o) => o.createdAt < dayRange(to)[1]);
  if (status && status !== 'all') {
    list = list.filter((o) => (status === 'debt' ? o.kind === 'debt' : status === 'full' ? o.kind === 'full' : o.status === status));
  }
  if (q) {
    const s = String(q).toLowerCase();
    list = list.filter((o) => `${o.no} ${o.userSnap.name} ${o.userSnap.username} ${o.userSnap.phone} ${o.userSnap.region}`.toLowerCase().includes(s));
  }
  list = list.sort((a, b) => b.createdAt - a.createdAt);
  res.json({ total: list.length, sum: U.r2(list.filter((o) => o.status !== 'rejected').reduce((s, o) => s + o.total, 0)), orders: list.slice(0, 400).map((o) => orderOut(o, true)) });
});

admin.post('/orders/:id/payments/:pid', wrap(async (req, res) => {
  const o = await decidePayment(req.params.id, req.params.pid, req.body && req.body.action);
  res.json({ order: orderOut(o, true) });
}));

admin.post('/orders/:id/delivered', wrap(async (req, res) => {
  const o = store.get('orders', req.params.id);
  if (!o) throw bad('Buyurtma topilmadi', 404);
  if (o.status !== 'accepted') throw bad("Faqat qabul qilingan buyurtmani 'topshirildi' deb belgilash mumkin");
  o.status = 'delivered'; o.deliveredAt = now();
  await store.put('orders', o);
  const u = store.get('users', o.userId);
  if (u && u.tgId) bot.notifyUser(u.tgId, `📦 <b>Buyurtma №${o.no} topshirildi.</b> Rahmat!`);
  res.json({ order: orderOut(o, true) });
}));

admin.post('/orders/:id/cash', wrap(async (req, res) => {
  const o = store.get('orders', req.params.id);
  if (!o || o.kind !== 'debt' || !['accepted', 'delivered'].includes(o.status)) throw bad("Bu buyurtmada qarz yo'q");
  const amount = U.r2(Number(req.body && req.body.amount));
  if (!(amount >= 0.01) || amount > owedOf(o) + 0.004) throw bad("Summa noto'g'ri");
  o.payments.push({ id: crypto.randomBytes(4).toString('hex'), amount, method: 'naqd', purpose: 'repay', status: 'confirmed', at: now(), decidedAt: now(), file: null, note: 'Naqd (admin kiritdi)' });
  await store.put('orders', o);
  await refreshMonth(U.monthKey(now()));
  const u = store.get('users', o.userId);
  if (u && u.tgId) {
    const owed = owedOf(o);
    bot.notifyUser(u.tgId, owed > 0.004 ? `✅ Naqd to'lov qabul qilindi: ${U.money(amount)}. №${o.no} bo'yicha qolgan qarz: <b>${U.money(owed)}</b>` : `🎉 №${o.no} bo'yicha qarz to'liq yopildi. Rahmat!`);
  }
  res.json({ order: orderOut(o, true) });
}));

admin.get('/debts', (req, res) => {
  const list = store.list('orders').filter((o) => owedOf(o) > 0.004).sort((a, b) => (a.debt.dueAt || 0) - (b.debt.dueAt || 0));
  res.json({ debts: list.map((o) => orderOut(o, true)) });
});

function userStats(u) {
  const orders = store.list('orders').filter((o) => o.userId === u.id);
  const ok = orders.filter((o) => o.status === 'accepted' || o.status === 'delivered');
  return {
    orders: orders.length, spent: U.r2(ok.reduce((s, o) => s + o.total, 0)),
    owed: U.r2(orders.reduce((s, o) => s + owedOf(o), 0)), last: orders.reduce((m, o) => Math.max(m, o.createdAt), 0) || null
  };
}
const adminUserOut = (u) => ({ ...userOut(u), blocked: !!u.blocked, consent: u.consent || null, tg: !!u.tgId, stats: userStats(u) });

admin.get('/users', (req, res) => {
  const list = store.list('users').filter((u) => u.role !== 'admin').sort((a, b) => b.createdAt - a.createdAt);
  res.json({ users: list.map(adminUserOut) });
});
admin.get('/users/:id', (req, res) => {
  const u = store.get('users', req.params.id);
  if (!u) throw bad('Topilmadi', 404);
  const orders = store.list('orders').filter((o) => o.userId === u.id).sort((a, b) => b.createdAt - a.createdAt);
  res.json({ user: adminUserOut(u), orders: orders.map((o) => orderOut(o, true)) });
});
admin.post('/users/:id/block', wrap(async (req, res) => {
  const u = store.get('users', req.params.id);
  if (!u || u.role === 'admin') throw bad('Topilmadi', 404);
  u.blocked = !!(req.body && req.body.blocked);
  await store.put('users', u);
  res.json({ user: adminUserOut(u) });
}));
admin.post('/users/:id/password', wrap(async (req, res) => {
  const u = store.get('users', req.params.id);
  const pw = String((req.body && req.body.password) || '');
  if (!u || u.role === 'admin') throw bad('Topilmadi', 404);
  if (pw.length < 6) throw bad('Parol kamida 6 ta belgi');
  u.pass = await U.hashPassword(pw);
  await store.put('users', u);
  res.json({ ok: true });
}));

const adminProduct = (p) => ({ ...productOut(p), cost: p.cost || 0, active: !!p.active, page: p.page || null });
admin.get('/products', (req, res) => {
  res.json({ products: store.list('products').sort((a, b) => a.sort - b.sort).map(adminProduct) });
});

async function applyProduct(p, b) {
  if (b.name !== undefined) { const n = str(b.name, 80); if (!n) throw bad('Mahsulot nomini kiriting'); p.name = n; }
  if (b.size !== undefined) p.size = str(b.size, 60);
  if (b.unit !== undefined) p.unit = b.unit === 'metr' ? 'metr' : 'dona';
  if (b.price !== undefined) { const v = U.r2(Number(String(b.price).replace(',', '.'))); if (!(v > 0)) throw bad("Narx noto'g'ri"); p.price = v; }
  if (b.cost !== undefined) { const v = U.r2(Number(String(b.cost || 0).replace(',', '.'))); if (!(v >= 0)) throw bad("Tan narxi noto'g'ri"); p.cost = v; }
  if (b.stock !== undefined) { const v = U.r2(Number(String(b.stock).replace(',', '.'))); if (!(v >= 0)) throw bad("Qoldiq noto'g'ri"); p.stock = v; }
  if (b.cat !== undefined) p.cat = CATS.some((c) => c.id === b.cat && !['new', 'all'].includes(c.id)) ? b.cat : U.autoCategory(p.name);
  if (b.isNew !== undefined) p.isNew = !!b.isNew;
  if (b.active !== undefined) p.active = !!b.active;
  if (b.image) { const id = await saveImage(b.image); p.img = fileUrl(id); }
}

admin.post('/products', wrap(async (req, res) => {
  const b = req.body || {};
  const name = str(b.name, 80);
  if (!name) throw bad('Mahsulot nomini kiriting');
  let id = U.slug(name), n = 2;
  while (store.get('products', id)) id = U.slug(name) + '-' + n++;
  const minSort = store.list('products').reduce((m, p) => Math.min(m, p.sort), 0);
  const p = {
    id, name, size: '', price: 0, cost: 0, stock: 0, unit: 'dona', cat: U.autoCategory(name), isNew: true, active: true,
    img: null, sort: minSort - 1, createdAt: now()
  };
  if (b.unit === undefined && /^(мат|mat|sf)/i.test(name)) b.unit = 'metr';
  await applyProduct(p, { ...b, cat: b.cat || U.autoCategory(name) });
  await store.put('products', p);
  res.json({ product: adminProduct(p) });
}));
admin.put('/products/:id', wrap(async (req, res) => {
  const p = store.get('products', req.params.id);
  if (!p) throw bad('Topilmadi', 404);
  await applyProduct(p, req.body || {});
  await store.put('products', p);
  res.json({ product: adminProduct(p) });
}));
admin.delete('/products/:id', wrap(async (req, res) => {
  const p = store.get('products', req.params.id);
  if (!p) throw bad('Topilmadi', 404);
  p.active = false;                 // buyurtmalar tarixi buzilmasligi uchun faqat yashiriladi
  await store.put('products', p);
  res.json({ product: adminProduct(p) });
}));

admin.get('/months', (req, res) => {
  const cur = U.monthKey(now());
  const list = store.list('months').filter((m) => !m.hidden);
  if (!list.some((m) => m.id === cur)) list.push({ id: cur, orders: 0, sales: 0, cost: 0, profit: 0, cash: 0, noCost: 0 });
  res.json({ months: list.sort((a, b) => (a.id < b.id ? 1 : -1)) });
});
admin.post('/months/:id/refresh', wrap(async (req, res) => {
  if (!/^\d{4}-\d\d$/.test(req.params.id)) throw bad("Noto'g'ri oy");
  await refreshMonth(req.params.id);
  res.json({ ok: true });
}));
admin.delete('/months/:id', wrap(async (req, res) => {
  const m = store.get('months', req.params.id);
  if (m) await store.put('months', { id: m.id, clearedAt: now(), orders: 0, sales: 0, cost: 0, profit: 0, cash: 0, noCost: 0, hidden: true });
  res.json({ ok: true });
}));

const settingsOut = () => ({
  botName: S.botName, usdRate: S.usdRate, pay: S.pay, contact: S.contact, debt: S.debt,
  telegramLinked: !!(S.adminChat || process.env.ADMIN_CHAT_ID), hasBot: bot.enabled
});
admin.get('/settings', (req, res) => res.json(settingsOut()));
admin.put('/settings', wrap(async (req, res) => {
  const b = req.body || {};
  if (b.usdRate !== undefined) { const v = Number(b.usdRate); if (!(v > 0)) throw bad("Dollar kursi noto'g'ri"); S.usdRate = v; }
  if (b.pay) for (const k of Object.keys(METHODS)) if (b.pay[k]) S.pay[k] = { card: str(b.pay[k].card, 40), holder: str(b.pay[k].holder, 60), link: str(b.pay[k].link, 300) };
  if (b.contact) S.contact = {
    phone: str(b.contact.phone, 30), whatsapp: str(b.contact.whatsapp, 20).replace(/\D/g, ''),
    telegram: str(b.contact.telegram, 60).replace(/^@/, ''), instagram: str(b.contact.instagram, 60).replace(/^@/, '')
  };
  if (b.debt) {
    const pc = Number(b.debt.percent), dy = Number(b.debt.days), mx = Number(b.debt.max);
    if (!(pc > 0 && pc < 100) || !(dy >= 1 && dy <= 365) || !(mx >= 1 && mx <= 10)) throw bad("Qarz sozlamalari noto'g'ri");
    S.debt = { percent: pc, days: Math.round(dy), max: Math.round(mx), text: str(b.debt.text, 600) || DEFAULT_CONSENT };
  }
  await store.put('settings', S);
  res.json(settingsOut());
}));
admin.post('/link-code', wrap(async (req, res) => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const code = Array.from(crypto.randomBytes(6), (b) => chars[b % chars.length]).join('');
  S.linkCode = { code, exp: now() + 10 * 60e3 };
  await store.put('settings', S);
  res.json({ code, minutes: 10 });
}));

/* ---- statik fayllar */
const PUB = path.join(__dirname, '..', 'public');
app.use(express.static(PUB, {
  setHeaders: (res, p) => {
    if (/\.(webp|woff2|png|jpg|svg)$/i.test(p)) res.set('Cache-Control', 'public, max-age=604800');
    else res.set('Cache-Control', 'no-cache');
  }
}));
app.get(/^\/(?!api\/|tg\/).*/, (req, res) => res.sendFile(path.join(PUB, 'index.html')));

app.use((err, req, res, next) => {  // eslint-disable-line no-unused-vars
  const status = err.status || (err.type === 'entity.too.large' ? 413 : 500);
  if (status >= 500) console.error(err);
  res.status(status).json({ error: status === 413 ? 'Rasm juda katta' : status >= 500 ? 'Server xatosi, qayta urinib ko\'ring' : err.message });
});

/* ---------------------------------------------------------------- boshlash */
async function remindDebts() {
  const t = now(), day = U.dayKey(t), late = [];
  for (const o of store.list('orders')) {
    const owed = owedOf(o);
    if (owed <= 0.004 || !o.debt || !o.debt.dueAt || o.debt.dueAt > t || o.debt.lastRemind === day) continue;
    o.debt.lastRemind = day;
    await store.put('orders', o);
    late.push({ o, owed });
    const u = store.get('users', o.userId);
    if (u && u.tgId) bot.notifyUser(u.tgId, `⏰ <b>Qarz eslatmasi</b>\n№${o.no} buyurtma bo'yicha <b>${U.money(owed)}</b> qarzingiz muddati o'tdi. Iltimos, to'lovni amalga oshiring.`);
  }
  if (late.length) {
    bot.notifyAdmin(`⚠️ <b>Muddati o'tgan qarzlar (${late.length})</b>\n` +
      late.map(({ o, owed }) => `• №${o.no} — ${bot.esc(o.userSnap.name)} ${bot.esc(o.userSnap.phone)} — ${U.money(owed)}`).join('\n'));
  }
}

async function seed() {
  const defaults = {
    id: 'main', botName: 'GLASS-IDEAL_VITRAJ', seq: 1000, usdRate: 12500, adminChat: null, linkCode: null,
    pay: { payme: { card: '', holder: '', link: '' }, click: { card: '', holder: '', link: '' }, paynet: { card: '', holder: '', link: '' } },
    contact: { phone: '+998 98 307 14 14', whatsapp: '998983071414', telegram: '', instagram: '' },
    debt: { percent: 30, days: 14, max: 2, text: DEFAULT_CONSENT },
    secret: crypto.randomBytes(32).toString('hex')
  };
  S = store.get('settings', 'main');
  if (!S) { S = defaults; await store.put('settings', S); }
  else { let ch = false; for (const k of Object.keys(defaults)) if (S[k] === undefined) { S[k] = defaults[k]; ch = true; } if (ch) await store.put('settings', S); }
  SECRET = process.env.SECRET || S.secret;

  if (!store.list('users').some((u) => u.role === 'admin')) {
    await store.put('users', {
      id: U.uid(), username: 'admin', name: 'Admin', phone: '', region: '', address: '', role: 'admin',
      pass: await U.hashPassword(process.env.ADMIN_PASSWORD || 'admin1414'), avatar: null, createdAt: now(), tgId: null, blocked: false
    });
    console.log("Admin akkaunti yaratildi: admin / " + (process.env.ADMIN_PASSWORD ? '(ADMIN_PASSWORD)' : 'admin1414'));
  }

  if (!store.list('products').length) {
    const seedFile = path.join(__dirname, 'seed', 'products.json');
    const list = JSON.parse(fs.readFileSync(seedFile, 'utf8'));
    let i = 0;
    for (const s of list) {
      const id = s.image.replace(/\.webp$/, '');
      await store.put('products', {
        id, name: s.name, size: s.size || '', price: s.price, cost: 0, stock: DEFAULT_STOCK,
        unit: 'dona', cat: U.autoCategory(s.name), isNew: s.page === 1, active: true,
        img: '/img/products/' + s.image, page: s.page, sort: i++, createdAt: now()
      });
    }
    console.log(`Katalog yuklandi: ${list.length} ta mahsulot`);
  }
}

(async () => {
  await store.init();
  await seed();
  app.listen(PORT, () => console.log(`GLASS-IDEAL_VITRAJ ishga tushdi → http://localhost:${PORT}`));
  bot.start();
  setTimeout(() => remindDebts().catch((e) => console.error('remind:', e.message)), 15e3).unref();
  setInterval(() => remindDebts().catch((e) => console.error('remind:', e.message)), 3600e3).unref();
})().catch((e) => { console.error(e); process.exit(1); });
