'use strict';
/* ===== Umumiy yordamchilar: holat, API, oynalar, formatlar ===== */
const G = {
  cfg: null, me: null, token: null, products: [], pmap: {}, cart: {},
  tab: 'shop', cat: 'all', q: '', atab: 'today',
  tg: window.Telegram && window.Telegram.WebApp && window.Telegram.WebApp.initData ? window.Telegram.WebApp : null
};
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const ic = (n, c = '') => `<svg class="ic ${c}" aria-hidden="true"><use href="#i-${n}"/></svg>`;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const API = (location.port === '5500' || location.protocol === 'file:') ? 'http://localhost:3000' : '';
const asset = (p) => (p && p.startsWith('/') ? API + p : p || '');

const fmtNum = (n) => String(Math.round((+n + Number.EPSILON) * 100) / 100).replace('.', ',');
const money = (n) => fmtNum(n) + '$';
const uzs = (n) => Math.round(n * (G.cfg ? G.cfg.usdRate : 12500)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + " so'm";
const unitOf = (u) => (u === 'metr' ? 'm' : 'dona');
const qtyStr = (q, u) => fmtNum(q) + ' ' + unitOf(u);
const stepOf = (p) => (p.unit === 'metr' ? 0.5 : 1);
const clampR = (n) => Math.round(n * 100) / 100;

const dtf = new Intl.DateTimeFormat('ru-RU', { timeZone: 'Asia/Tashkent', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
const df = new Intl.DateTimeFormat('ru-RU', { timeZone: 'Asia/Tashkent', day: '2-digit', month: '2-digit', year: 'numeric' });
const fmtDT = (t) => (t ? dtf.format(t).replace(',', '') : '—');
const fmtD = (t) => (t ? df.format(t) : '—');
const dayKeyT = (t) => new Date(t + 5 * 3600e3).toISOString().slice(0, 10);
const MONTHS = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avgust', 'Sentabr', 'Oktabr', 'Noyabr', 'Dekabr'];
const monthName = (ym) => MONTHS[+ym.slice(5, 7) - 1] + ' ' + ym.slice(0, 4);

function hap(kind = 'light') {
  try { if (G.tg && G.tg.HapticFeedback) { kind === 'ok' ? G.tg.HapticFeedback.notificationOccurred('success') : kind === 'err' ? G.tg.HapticFeedback.notificationOccurred('error') : G.tg.HapticFeedback.impactOccurred(kind); } } catch { /* */ }
  try { if (navigator.vibrate && kind !== 'light') navigator.vibrate(kind === 'err' ? [20, 40, 20] : 12); } catch { /* */ }
}

/* ---------- API ---------- */
async function api(path, opt = {}) {
  let r;
  try {
    r = await fetch(API + '/api' + path, {
      method: opt.method || 'GET',
      headers: { 'Content-Type': 'application/json', ...(G.token ? { Authorization: 'Bearer ' + G.token } : {}) },
      body: opt.body ? JSON.stringify(opt.body) : undefined
    });
  } catch { throw new Error("Internet aloqasi yo'q yoki server javob bermayapti"); }
  let j = {};
  try { j = await r.json(); } catch { /* bo'sh javob */ }
  if (!r.ok) {
    if (r.status === 401 && j.code === 'auth' && G.token) { G.logout && G.logout(true); }
    throw Object.assign(new Error(j.error || 'Xatolik yuz berdi'), { status: r.status });
  }
  return j;
}

/* ---------- Toast ---------- */
function toast(msg, type = 'info') {
  const box = $('#toasts');
  const el = document.createElement('div');
  el.className = 'toast ' + type;
  el.innerHTML = ic(type === 'err' ? 'circle-alert' : type === 'ok' ? 'circle-check' : 'info') + `<span>${esc(msg)}</span>`;
  box.appendChild(el);
  hap(type === 'err' ? 'err' : 'light');
  setTimeout(() => { el.classList.add('out'); setTimeout(() => el.remove(), 260); }, type === 'err' ? 3800 : 2200);
}

/* ---------- Pastdan chiquvchi oyna ---------- */
let sheetCount = 0;
function openSheet(html, { cls = '', onClose } = {}) {
  const back = document.createElement('div');
  back.className = 'sheet-back';
  back.innerHTML = `<div class="sheet ${cls}" role="dialog" aria-modal="true"><div class="sheet-grab"></div><div class="sheet-body">${html}</div></div>`;
  document.body.appendChild(back);
  document.body.classList.add('noscroll');
  sheetCount++;
  requestAnimationFrame(() => requestAnimationFrame(() => back.classList.add('show')));
  let closed = false;
  const s = {
    root: back, el: back.querySelector('.sheet-body'),
    close(res) {
      if (closed) return;
      closed = true;
      back.classList.remove('show');
      setTimeout(() => { back.remove(); if (--sheetCount <= 0) { sheetCount = 0; document.body.classList.remove('noscroll'); } }, 300);
      if (onClose) onClose(res);
    }
  };
  back.addEventListener('mousedown', (e) => { if (e.target === back) s.close(); });
  back.addEventListener('touchstart', (e) => { if (e.target === back) s.close(); }, { passive: true });
  s.el.addEventListener('click', (e) => { if (e.target.closest('[data-close]')) s.close(); });
  return s;
}
const sheetTitle = (t, x = true) => `<div class="sh-title"><span>${t}</span>${x ? `<button class="x" data-close aria-label="Yopish">${ic('x')}</button>` : ''}</div>`;

function confirmBox(title, text, ok = 'Ha', danger = false) {
  return new Promise((resolve) => {
    let val = false;
    const s = openSheet(`${sheetTitle(esc(title))}<p class="muted" style="margin:0 0 18px;font-size:13.5px">${esc(text)}</p>
      <div class="two" style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><button class="btn ghost" data-close>Bekor</button><button class="btn ${danger ? 'danger' : ''}" id="cf-ok">${esc(ok)}</button></div>`,
    { onClose: () => resolve(val) });
    $('#cf-ok', s.el).onclick = () => { val = true; s.close(); };
  });
}

function lightbox(src) {
  const lb = document.createElement('div');
  lb.className = 'lightbox';
  lb.innerHTML = `<img src="${esc(src)}" alt="">`;
  lb.onclick = () => lb.remove();
  document.body.appendChild(lb);
}

/* ---------- Rasmni kichraytirish (chek, avatar, mahsulot) ---------- */
function readImage(file, max = 1280, q = 0.82) {
  return new Promise((resolve, reject) => {
    if (!file || !/^image\//.test(file.type)) return reject(new Error('Faqat rasm fayli tanlang'));
    const fr = new FileReader();
    fr.onerror = () => reject(new Error("Rasmni o'qib bo'lmadi"));
    fr.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Rasm formati qo'llab-quvvatlanmaydi"));
      img.onload = () => {
        const k = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        const x = c.getContext('2d');
        x.fillStyle = '#fff'; x.fillRect(0, 0, c.width, c.height);
        x.drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', q));
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}

/* ---------- Kichik UI bo'laklari ---------- */
const brandHtml = (tag) => `<header class="head"><div class="brand gold-text"><svg viewBox="0 0 120 100"><use href="#logo-gem"/></svg><span>${esc(G.cfg ? G.cfg.botName : 'GLASS-IDEAL_VITRAJ')}</span></div>${tag ? `<span class="tag">${tag}</span>` : ''}</header>`;

function phoneInput(el) {
  el.addEventListener('input', () => {
    let d = el.value.replace(/\D/g, '');
    if (d.startsWith('998') && d.length > 9) d = d.slice(3);
    d = d.slice(0, 9);
    const p = [d.slice(0, 2), d.slice(2, 5), d.slice(5, 7), d.slice(7, 9)].filter(Boolean);
    el.value = p.join(' ');
  });
}
const phoneShow = (p) => (p ? p.replace(/^\+998(\d{2})(\d{3})(\d{2})(\d{2})$/, '+998 $1 $2 $3 $4') : '—');
const initial = (n) => esc((n || '?').trim().charAt(0).toUpperCase());

const STATUS = {
  pending: ['wt', 'Tekshirilmoqda'], accepted: ['ok', 'Qabul qilindi'], delivered: ['ok', 'Topshirildi'], rejected: ['er', 'Rad etildi']
};
const stChip = (o) => { const s = STATUS[o.status] || ['gr', o.status]; return `<span class="st-chip ${s[0]}">${s[1]}</span>`; };
const kindChip = (o) => {
  if (o.kind === 'debt') return `<span class="st-chip gd">${ic('wallet')} Qarzga</span>`;
  return `<span class="st-chip ok">${ic('circle-check')} To'liq to'langan</span>`;
};
const METH = { payme: 'Payme', click: 'Click', paynet: 'Paynet', naqd: 'Naqd' };
const METH_COLOR = { payme: '#33cccc', click: '#2a90ff', paynet: '#ffcb05' };

/** Excel ko'rinishidagi hisob jadvali. rows: [{name,size,price,qty,unit,sum}] */
function excelTable(rows, total, { bar = true } = {}) {
  const n = rows.length;
  const body = rows.map((r, i) => `<tr><td>${i + 1}</td><td class="nm">${esc(r.name)}${r.size ? `<small>${esc(r.size)}</small>` : ''}</td><td class="r">${money(r.price)}</td><td class="r">${fmtNum(r.qty)}${r.unit === 'metr' ? ' m' : ''}</td><td class="r"><b>${money(r.sum)}</b></td></tr>`).join('');
  return `<div class="xl">${bar ? `<div class="xl-bar"><span class="fx">fx</span><code>=SUM(E3:E${n + 2})</code><span class="sp"></span><b class="gold">${money(total)}</b></div>` : ''}
  <table class="xl-tbl"><thead><tr class="cols"><th></th><th>A</th><th>B</th><th>C</th><th>D</th></tr><tr class="ttl"><th>№</th><th>Mahsulot</th><th class="r">Narx</th><th class="r">Soni</th><th class="r">Summa</th></tr></thead>
  <tbody>${body}</tbody><tfoot><tr><td></td><td colspan="3">JAMI</td><td class="r big">${money(total)}</td></tr></tfoot></table></div>`;
}
