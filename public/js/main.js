'use strict';
/* ===== Ishga tushirish, tab navigatsiya ===== */
const CTABS = [['shop', 'Sotuv', 'store'], ['cart', 'Savat', 'shopping-cart'], ['debt', 'Qarzdorlik', 'wallet'], ['profile', 'Profil', 'user']];
let bgTimer = null;

G.logout = (silent) => {
  G.token = null; G.me = null; G.cart = {};
  try { localStorage.removeItem('giv_token'); } catch { /* */ }
  clearInterval(bgTimer);
  $$('.sheet-back').forEach((s) => s.remove()); document.body.classList.remove('noscroll');
  if (!silent) toast('Chiqdingiz', 'info');
  renderAuth();
};

/** Kirgandan keyin: mahsulotlar va savatni yuklab, kerakli ekranni chizadi */
G.enter = async () => {
  if (G.me.role === 'admin') { G.atab = 'today'; return renderAdmin(); }
  await G.loadProducts();
  G.loadCart();
  G.tab = 'shop';
  renderClient();
};

function tabbarHtml(tabs, cur, wide) {
  return `<nav class="tabbar ${wide ? 'wide' : ''}"><div class="tabbar-in">${tabs.map(([id, label, icon]) => `<button class="tab ${cur === id ? 'on' : ''}" data-t="${id}" aria-label="${label}">${ic(icon)}<span>${label}</span>${id === 'cart' ? '<i class="bdg" id="cart-bdg" hidden></i>' : ''}${id === 'today' ? '<i class="bdg" id="tab-today-bdg" hidden></i>' : ''}</button>`).join('')}</div></nav>`;
}

/* ---------- Mijoz ---------- */
function renderClient() {
  const app = $('#app');
  app.className = '';
  app.innerHTML = `<div class="shell">${brandHtml()}<main id="view"></main></div>${tabbarHtml(CTABS, G.tab)}`;
  $('.tabbar', app).onclick = (e) => { const b = e.target.closest('.tab'); if (b) G.go(b.dataset.t); };
  updateBadge();
  G.go(G.tab, true);
}

G.go = (t, first) => {
  if (G.me && G.me.role === 'admin') return adminGo(t);
  G.tab = t;
  $$('.tabbar .tab').forEach((b) => b.classList.toggle('on', b.dataset.t === t));
  if (!first) window.scrollTo({ top: 0 });
  ({ shop: viewShop, cart: viewCart, debt: viewDebt, profile: viewProfile })[t]();
};

/* ---------- Admin ---------- */
function renderAdmin() {
  const app = $('#app');
  app.className = 'wide';
  app.innerHTML = `<div class="shell">${brandHtml('ADMIN')}<main id="view"></main></div>${tabbarHtml(AT, G.atab, true)}`;
  $('.tabbar', app).onclick = (e) => { const b = e.target.closest('.tab'); if (b) adminGo(b.dataset.t); };
  adminGo(G.atab, true);
  clearInterval(bgTimer);
  bgTimer = setInterval(() => { if (G.atab === 'today' && !document.hidden && sheetCount === 0) aToday('bg'); }, 25000);
}
function adminGo(t, first) {
  G.atab = t;
  $$('.tabbar .tab').forEach((b) => b.classList.toggle('on', b.dataset.t === t));
  if (!first) window.scrollTo({ top: 0 });
  todaySig = '';
  G.adminViews[t]();
}

/* ---------- Boshlash ---------- */
async function boot() {
  const t0 = Date.now();
  const tg = window.Telegram && window.Telegram.WebApp;
  if (tg) { try { tg.ready(); tg.expand(); tg.setHeaderColor('#07070a'); tg.setBackgroundColor('#07070a'); tg.disableVerticalSwipes && tg.disableVerticalSwipes(); } catch { /* */ } }
  const hide = async () => {
    await wait(Math.max(0, 2300 - (Date.now() - t0)));
    const sp = $('#splash'); sp.classList.add('out'); setTimeout(() => sp.remove(), 700);
  };
  try {
    G.cfg = await api('/config');
    try { G.token = localStorage.getItem('giv_token'); } catch { /* */ }
    if (G.token) {
      try { G.me = (await api('/me')).user; await G.enter(); }
      catch (e) { G.token = null; G.me = null; if (e.status && e.status !== 401 && e.status !== 403) throw e; renderAuth(); }
    } else renderAuth();
  } catch (e) {
    $('#app').innerHTML = `<div class="auth"><div class="empty">${ic('circle-alert')}<h3>Server bilan aloqa yo'q</h3><p>${esc(e.message)}</p><button class="btn" onclick="location.reload()">Qayta urinish</button></div></div>`;
  }
  await hide();
}
boot();
