'use strict';
/* ===== Kirish / ro'yxat, katalog (Sotuv), savat, to'lov ===== */

/* ---------- Kirish va akkaunt yaratish ---------- */
function renderAuth(mode = 'login') {
  const c = G.cfg;
  const app = $('#app');
  app.className = '';
  app.innerHTML = `<div class="auth">
    <div class="auth-brand"><svg viewBox="0 0 120 100"><use href="#logo-gem"/></svg>
      <h1 class="gold-text">${esc(c.botName)}</h1><p>Faset (bevils) oynalar katalogi</p><div class="orn">◆</div></div>
    <div class="auth-card">
      <div class="seg"><button data-m="login" class="${mode === 'login' ? 'on' : ''}">Kirish</button><button data-m="reg" class="${mode === 'reg' ? 'on' : ''}">Akkaunt yaratish</button></div>
      <form id="f-login" ${mode === 'login' ? '' : 'hidden'} autocomplete="on" novalidate>
        <label class="field"><span>Akkaunt nomi</span><div class="inp">${ic('user')}<input name="username" autocomplete="username" autocapitalize="none" placeholder="masalan: ali_vitraj" required></div></label>
        <label class="field"><span>Parol</span><div class="inp">${ic('lock')}<input name="password" type="password" autocomplete="current-password" placeholder="kamida 6 ta belgi" required><button type="button" class="eye" tabindex="-1">${ic('eye')}</button></div></label>
        <button class="btn block" type="submit">${ic('log-in')} Kirish</button>
      </form>
      <form id="f-reg" ${mode === 'reg' ? '' : 'hidden'} autocomplete="off" novalidate>
        <label class="field"><span>Akkaunt nomi <b>*</b></span><div class="inp">${ic('user')}<input name="username" autocapitalize="none" placeholder="takrorlanmas nom" maxlength="20"><span class="st" id="un-st"></span></div><div class="hint" id="un-hint">Lotin harflari, raqam, nuqta yoki _ (3–20 ta belgi)</div></label>
        <label class="field"><span>Akkaunt paroli <b>*</b></span><div class="inp">${ic('lock')}<input name="password" type="password" autocomplete="new-password" placeholder="kamida 6 ta belgi"><button type="button" class="eye" tabindex="-1">${ic('eye')}</button></div><div class="hint" id="pw-hint"></div></label>
        <label class="field"><span>Ism <b>*</b></span><div class="inp">${ic('user-round')}<input name="name" placeholder="Ismingiz" maxlength="60"></div></label>
        <label class="field"><span>Telefon raqam <b>*</b></span><div class="inp ph"><span class="pre">+998</span><input name="phone" type="tel" inputmode="numeric" placeholder="90 123 45 67"></div></label>
        <label class="field"><span>Viloyat <b>*</b></span><div class="inp">${ic('map-pin')}<select name="region"><option value="">Tanlang…</option>${c.regions.map((r) => `<option>${esc(r)}</option>`).join('')}</select></div></label>
        <label class="field" id="addr-f" hidden><span>Aniq manzil <b>*</b></span><div class="inp">${ic('map-pin')}<input name="address" placeholder="Tuman, ko'cha, uy raqami" maxlength="200"></div><div class="hint">Toshkent uchun aniq manzil majburiy</div></label>
        <button class="btn block" type="submit">${ic('user-plus')} Akkaunt yaratish</button>
      </form>
    </div>
    <div class="auth-foot">Savol bo'lsa: <a class="gold" style="text-decoration:none" href="tel:${esc(c.contact.phone.replace(/\s/g, ''))}">${esc(c.contact.phone)}</a></div>
  </div>`;

  $$('.seg button', app).forEach((b) => (b.onclick = () => renderAuth(b.dataset.m)));
  $$('.eye', app).forEach((b) => (b.onclick = () => { const i = b.parentNode.querySelector('input'); const show = i.type === 'password'; i.type = show ? 'text' : 'password'; b.innerHTML = ic(show ? 'eye-off' : 'eye'); }));
  phoneInput($('#f-reg [name=phone]'));

  async function submit(form, path, body) {
    const btn = $('button[type=submit]', form);
    btn.classList.add('spin'); btn.disabled = true;
    try {
      const r = await api(path, { method: 'POST', body: { ...body, initData: G.tg ? G.tg.initData : undefined } });
      G.token = r.token; G.me = r.user;
      try { localStorage.setItem('giv_token', r.token); } catch { /* */ }
      hap('ok');
      await G.enter();
    } catch (e) { toast(e.message, 'err'); btn.classList.remove('spin'); btn.disabled = false; }
  }
  $('#f-login').onsubmit = (e) => {
    e.preventDefault();
    const f = e.target;
    if (!f.username.value.trim() || !f.password.value) return toast('Akkaunt nomi va parolni kiriting', 'err');
    if (f.password.value.length < 6) return toast("Parol kamida 6 ta belgi bo'ladi", 'err');
    submit(f, '/login', { username: f.username.value.trim(), password: f.password.value });
  };

  const reg = $('#f-reg');
  const need = (c.addressRequired || []);
  reg.region.onchange = () => { $('#addr-f').hidden = !need.includes(reg.region.value); };
  let tm, unOk = false;
  reg.username.oninput = () => {
    const v = reg.username.value.trim(), st = $('#un-st'), h = $('#un-hint');
    unOk = false; st.innerHTML = ''; clearTimeout(tm);
    if (v.length < 3) { h.className = 'hint'; h.textContent = 'Lotin harflari, raqam, nuqta yoki _ (3–20 ta belgi)'; return; }
    if (!/^[a-zA-Z0-9._]+$/.test(v)) { h.className = 'hint bad'; h.textContent = "Faqat lotin harflari, raqam, nuqta yoki _ ishlating"; return; }
    tm = setTimeout(async () => {
      try {
        const r = await api('/username-free?u=' + encodeURIComponent(v));
        if (reg.username.value.trim() !== v) return;
        unOk = r.valid && r.free;
        st.innerHTML = unOk ? `<span class="ok">${ic('circle-check')}</span>` : `<span class="err">${ic('circle-x')}</span>`;
        h.className = 'hint ' + (unOk ? 'good' : 'bad'); h.textContent = unOk ? 'Bu nom bo\'sh ✓' : 'Bu nom band, boshqasini tanlang';
      } catch { /* */ }
    }, 350);
  };
  reg.password.oninput = () => { const h = $('#pw-hint'); const n = reg.password.value.length; h.className = 'hint ' + (n >= 6 ? 'good' : n ? 'bad' : ''); h.textContent = n ? (n >= 6 ? 'Parol yetarli ✓' : `Yana ${6 - n} ta belgi kerak`) : ''; };
  reg.onsubmit = (e) => {
    e.preventDefault();
    const f = reg, v = (k) => f[k].value.trim();
    if (!/^[a-zA-Z0-9._]{3,20}$/.test(v('username'))) return toast('Akkaunt nomini to\'g\'ri kiriting', 'err');
    if (f.password.value.length < 6) return toast("Parol kamida 6 ta belgi bo'lsin", 'err');
    if (v('name').length < 2) return toast('Ismingizni kiriting', 'err');
    if (f.phone.value.replace(/\D/g, '').length !== 9) return toast("Telefon raqamni to'liq kiriting", 'err');
    if (!f.region.value) return toast('Viloyatni tanlang', 'err');
    if (need.includes(f.region.value) && v('address').length < 5) return toast('Toshkent uchun aniq manzilni kiriting', 'err');
    submit(f, '/register', { username: v('username'), password: f.password.value, name: v('name'), phone: f.phone.value, region: f.region.value, address: v('address') });
  };
}

/* ---------- Savat ---------- */
const cartKey = () => 'giv_cart_' + (G.me ? G.me.id : '');
G.loadCart = () => { try { G.cart = JSON.parse(localStorage.getItem(cartKey()) || '{}'); } catch { G.cart = {}; } cleanCart(); };
function cleanCart() {
  for (const id of Object.keys(G.cart)) {
    const p = G.pmap[id];
    if (!p || p.stock <= 0 || !(G.cart[id] > 0)) delete G.cart[id];
    else if (G.cart[id] > p.stock) G.cart[id] = p.stock;
  }
}
function saveCart() { try { localStorage.setItem(cartKey(), JSON.stringify(G.cart)); } catch { /* */ } updateBadge(); }
function updateBadge() {
  const n = Object.keys(G.cart).length, b = $('#cart-bdg');
  if (b) { b.textContent = n; b.hidden = !n; }
}
const cartItems = () => Object.keys(G.cart).map((id) => ({ p: G.pmap[id], qty: G.cart[id] })).filter((x) => x.p).map((x) => ({ ...x, sum: clampR(x.p.price * x.qty) }));
const cartTotal = () => clampR(cartItems().reduce((s, x) => s + x.sum, 0));

G.loadProducts = async () => {
  const r = await api('/products');
  G.products = r.products;
  G.pmap = Object.fromEntries(r.products.map((p) => [p.id, p]));
  cleanCart(); saveCart();
};

function setQty(id, q) {
  const p = G.pmap[id]; if (!p) return;
  const st = stepOf(p);
  q = p.unit === 'metr' ? Math.round(q * 2) / 2 : Math.floor(q);
  if (!(q >= st)) delete G.cart[id];
  else if (q > p.stock) { G.cart[id] = p.stock; toast(`Omborda faqat ${qtyStr(p.stock, p.unit)} bor`, 'err'); }
  else G.cart[id] = q;
  saveCart();
}
function addToCart(id) {
  const p = G.pmap[id]; if (!p) return;
  if (p.stock <= 0) return toast(`${p.name} shu mahsulotdan afsuski qolmadi`, 'err');
  const cur = G.cart[id] || 0, st = stepOf(p);
  if (cur + st > p.stock) return toast(`Omborda faqat ${qtyStr(p.stock, p.unit)} bor`, 'err');
  G.cart[id] = clampR(cur + st);
  saveCart(); hap('light');
  const b = $(`.card[data-id="${CSS.escape(id)}"] .add`);
  if (b) { let c = $('.cnt', b); if (!c) { c = document.createElement('span'); c.className = 'cnt'; b.appendChild(c); } c.textContent = fmtNum(G.cart[id]); }
}

/* ---------- Sotuv (katalog) ---------- */
const catLabel = (id) => ((G.cfg.cats.find((c) => c.id === id) || {}).label || '');
const CAT_ICON = { new: 'sparkles', all: 'layout-grid', bevils: 'gem', jilka: 'link-2', matovka: 'ruler', aksesuar: 'package' };

function stockHtml(p) {
  if (p.stock <= 0) return `<div class="cstock none">${esc(p.name)} shu mahsulotdan afsuski qolmadi</div>`;
  if (p.stock <= 5) return `<div class="cstock low">Mavjud · oxirgi ${qtyStr(p.stock, p.unit)}</div>`;
  return `<div class="cstock okc">Mavjud</div>`;
}
function cardHtml(p, i) {
  const out = p.stock <= 0, n = G.cart[p.id];
  return `<div class="card ${out ? 'out' : ''}" data-id="${esc(p.id)}" style="animation-delay:${Math.min(i, 14) * 25}ms">
    <div class="timg ph">${p.isNew ? '<span class="badge-new">YANGI</span>' : ''}<img loading="lazy" decoding="async" alt="${esc(p.name)}" src="${esc(asset(p.img))}" onload="this.parentNode.classList.remove('ph')" onerror="this.parentNode.classList.remove('ph')"></div>
    <div class="cbody"><div class="cname">${esc(p.name)}</div><div class="csize">${esc(p.size || catLabel(p.cat))}</div>${stockHtml(p)}
      <div class="cfoot"><div class="price">${fmtNum(p.price)}<small>$${p.unit === 'metr' ? ' / m' : ''}</small></div>
      <button class="add" ${out ? 'disabled' : ''} aria-label="Savatga qo'shish">${ic('plus')}${n ? `<span class="cnt">${fmtNum(n)}</span>` : ''}</button></div></div></div>`;
}

function filterProducts() {
  const q = G.q.trim().toLowerCase(), qs = q.replace(/\s+/g, '');
  return G.products.filter((p) => {
    if (G.cat === 'new' ? !p.isNew : G.cat !== 'all' && p.cat !== G.cat) return false;
    if (!q) return true;
    const hay = `${p.name} ${p.size} ${catLabel(p.cat)}`.toLowerCase();
    return q.split(/\s+/).every((t) => hay.includes(t)) || hay.replace(/\s+/g, '').includes(qs);
  });
}

function viewShop() {
  const v = $('#view');
  v.innerHTML = `<div class="tools"><div class="search">${ic('search')}<input id="q" type="search" placeholder="Qidiruv: nomi yoki o'lchami…" value="${esc(G.q)}" autocomplete="off" enterkeyhint="search"><button class="clr" id="qclr" ${G.q ? '' : 'hidden'} aria-label="Tozalash">${ic('x')}</button></div>
    <div class="chips" id="chips">${G.cfg.cats.map((c) => `<button class="chip ${G.cat === c.id ? 'on' : ''}" data-c="${c.id}">${ic(CAT_ICON[c.id])}${esc(c.label)}</button>`).join('')}</div></div>
    <div class="count-line" id="cnt"></div><div class="grid" id="grid"></div>`;
  const grid = $('#grid');
  const draw = () => {
    const list = filterProducts();
    $('#cnt').textContent = list.length ? `${list.length} ta mahsulot` : '';
    grid.innerHTML = list.length ? list.map(cardHtml).join('') : `<div class="empty" style="grid-column:1/-1">${ic('gem')}<h3>${G.cat === 'new' ? 'Hozircha yangilik yo\'q' : 'Hech narsa topilmadi'}</h3><p>${G.q ? 'Boshqa so\'z bilan qidirib ko\'ring' : "Bu bo'limga tez orada mahsulot qo'shiladi"}</p></div>`;
  };
  draw();
  const q = $('#q');
  let tm;
  q.oninput = () => { G.q = q.value; $('#qclr').hidden = !q.value; clearTimeout(tm); tm = setTimeout(draw, 120); };
  $('#qclr').onclick = () => { q.value = ''; G.q = ''; $('#qclr').hidden = true; draw(); q.focus(); };
  $('#chips').onclick = (e) => {
    const b = e.target.closest('.chip'); if (!b) return;
    G.cat = b.dataset.c; $$('.chip').forEach((x) => x.classList.toggle('on', x === b)); draw(); hap('light');
  };
  grid.onclick = (e) => {
    const card = e.target.closest('.card'); if (!card) return;
    if (e.target.closest('.add')) { addToCart(card.dataset.id); return; }
    openProduct(card.dataset.id);
  };
}

function openProduct(id) {
  const p = G.pmap[id]; if (!p) return;
  const s = openSheet('', { cls: '' });
  const draw = () => {
    const n = G.cart[id] || 0, st = stepOf(p), out = p.stock <= 0;
    s.el.innerHTML = `${sheetTitle('')}<div class="pz-img"><img alt="${esc(p.name)}" src="${esc(asset(p.img))}"></div>
      <div class="pz-name">${esc(p.name)}</div>
      <div class="pz-meta">${p.size ? `<span class="tagc">${ic('ruler')} ${esc(p.size)}</span>` : ''}<span class="tagc">${ic(CAT_ICON[p.cat] || 'gem')} ${esc(catLabel(p.cat))}</span>${p.unit === 'metr' ? '<span class="tagc">metr bilan</span>' : ''}${p.isNew ? '<span class="tagc gold">Yangi</span>' : ''}</div>
      <div class="pz-price"><div class="price">${fmtNum(p.price)}<small>$${p.unit === 'metr' ? ' / m' : ''}</small></div><span class="muted" style="font-size:12px">≈ ${uzs(p.price)}</span></div>
      ${stockHtml(p)}
      <div style="margin-top:16px">${out ? `<button class="btn block" disabled>Qolmagan</button>`
        : n ? `<div class="row"><div class="stepper"><button id="m" aria-label="Kamaytirish">${ic(n <= st ? 'trash-2' : 'minus')}</button><input id="qv" inputmode="decimal" value="${fmtNum(n)}"><button id="pl" aria-label="Ko'paytirish">${ic('plus')}</button></div><span class="sp"></span><div class="tr"><small class="muted">Jami</small><div class="price" style="font-size:28px">${money(clampR(n * p.price))}</div></div></div>
          <button class="btn ghost block" style="margin-top:12px" id="gocart">${ic('shopping-cart')} Savatga o'tish</button>`
        : `<button class="btn block" id="addb">${ic('plus')} Savatga qo'shish</button>`}</div>`;
    const set = (q) => { setQty(id, q); draw(); refreshGridBadge(id); };
    const $b = (x) => $(x, s.el);
    if ($b('#addb')) $b('#addb').onclick = () => { addToCart(id); draw(); };
    if ($b('#m')) $b('#m').onclick = () => set(n - st);
    if ($b('#pl')) $b('#pl').onclick = () => set(n + st);
    if ($b('#qv')) $b('#qv').onchange = (e) => set(parseFloat(String(e.target.value).replace(',', '.')) || 0);
    if ($b('#gocart')) $b('#gocart').onclick = () => { s.close(); G.go('cart'); };
  };
  draw();
}
function refreshGridBadge(id) {
  const b = $(`.card[data-id="${CSS.escape(id)}"] .add`); if (!b) return;
  const c = $('.cnt', b), n = G.cart[id];
  if (!n) { if (c) c.remove(); } else if (c) c.textContent = fmtNum(n); else b.insertAdjacentHTML('beforeend', `<span class="cnt">${fmtNum(n)}</span>`);
}

/* ---------- Savat ---------- */
G.comment = '';
function viewCart() {
  const v = $('#view');
  const items = cartItems();
  if (!items.length) {
    v.innerHTML = `<div class="page"><div class="empty">${ic('shopping-cart')}<h3>Savat bo'sh</h3><p>Katalogdan kerakli mahsulotlarni tanlang</p><button class="btn" id="tocat">${ic('store')} Katalogga o'tish</button></div></div>`;
    $('#tocat').onclick = () => G.go('shop');
    return;
  }
  v.innerHTML = `<div class="page"><div class="page-title">Savat <small>${items.length} ta mahsulot</small><span class="sp"></span><button class="link" id="clr">Tozalash</button></div>
    <div id="rows"></div><div id="calc"></div></div>
    <div class="cbar"><div class="cbox"><textarea id="note" rows="1" maxlength="500" placeholder="Izoh: o'z fikringiz yoki so'zingizni qoldiring…">${esc(G.comment)}</textarea>
      <div class="tot"><span>Jami</span><div><b id="tot"></b><small id="tot2"></small></div></div>
      <div class="two"><button class="btn ghost" id="bdebt">${ic('wallet')} Qarzga</button><button class="btn" id="bpay">${ic('credit-card')} To'lash</button></div></div></div>`;
  const rows = $('#rows');
  const drawRows = () => {
    rows.innerHTML = cartItems().map(({ p, qty, sum }) => {
      const st = stepOf(p);
      return `<div class="crow" data-id="${esc(p.id)}"><div class="th"><img alt="" src="${esc(asset(p.img))}"></div>
        <div class="inf"><div class="n">${esc(p.name)}</div><div class="s">${esc(p.size)}</div><div class="p">${money(p.price)}${p.unit === 'metr' ? ' / m' : ''}</div>
        <div class="m ${p.stock <= 5 ? 'warn' : ''}">${p.stock <= 5 ? 'Qoldi: ' + qtyStr(p.stock, p.unit) : 'Mavjud'}</div></div>
        <div class="qc"><div class="stepper sm"><button data-a="m" aria-label="Kamaytirish">${ic(qty <= st ? 'trash-2' : 'minus')}</button><input data-a="v" inputmode="decimal" value="${fmtNum(qty)}"><button data-a="p" aria-label="Ko'paytirish">${ic('plus')}</button></div><div class="sum">${money(sum)}</div></div></div>`;
    }).join('');
  };
  const drawCalc = () => {
    const it = cartItems(), t = cartTotal();
    $('#calc').innerHTML = excelTable(it.map((x) => ({ name: x.p.name, size: x.p.size, price: x.p.price, qty: x.qty, unit: x.p.unit, sum: x.sum })), t);
    $('#tot').textContent = money(t); $('#tot2').textContent = '≈ ' + uzs(t);
  };
  drawRows(); drawCalc();
  rows.onclick = (e) => {
    const row = e.target.closest('.crow'), b = e.target.closest('button'); if (!row || !b) return;
    const id = row.dataset.id, p = G.pmap[id], st = stepOf(p), cur = G.cart[id];
    setQty(id, b.dataset.a === 'p' ? cur + st : cur - st);
    afterChange();
  };
  rows.onchange = (e) => {
    const row = e.target.closest('.crow'); if (!row || e.target.dataset.a !== 'v') return;
    setQty(row.dataset.id, parseFloat(String(e.target.value).replace(',', '.')) || 0); afterChange();
  };
  function afterChange() { if (!cartItems().length) return viewCart(); drawRows(); drawCalc(); }
  $('#clr').onclick = async () => { if (await confirmBox('Savatni tozalash', "Barcha mahsulotlar savatdan olib tashlansinmi?", 'Tozalash', true)) { G.cart = {}; saveCart(); viewCart(); } };
  const note = $('#note');
  const grow = () => { note.style.height = 'auto'; note.style.height = Math.min(110, note.scrollHeight) + 'px'; };
  note.oninput = () => { G.comment = note.value; grow(); }; grow();
  $('#bpay').onclick = () => startCheckout('full');
  $('#bdebt').onclick = () => startCheckout('debt');
}

async function startCheckout(kind) {
  try { await G.loadProducts(); } catch (e) { return toast(e.message, 'err'); }
  const items = cartItems();
  if (!items.length) return viewCart();
  const total = cartTotal();
  if (kind === 'full') return openPay({
    title: "To'lash", amount: total,
    onSubmit: (d) => submitOrder('full', d)
  });
  // ---- qarzga
  let debts;
  try { debts = await api('/debts'); } catch (e) { return toast(e.message, 'err'); }
  const dc = G.cfg.debt;
  if (debts.debts.length >= dc.max) {
    const s = openSheet(`${sheetTitle('Qarz limiti')}<div class="empty" style="padding:10px 0 18px">${ic('triangle-alert')}<p style="margin:0">Sizda allaqachon <b class="gold">${debts.debts.length} ta</b> qarzdorlik bor. Bir vaqtda ko'pi bilan <b>${dc.max} ta</b> qarz olish mumkin. Avval mavjud qarzni to'lang.</p></div>
      <button class="btn block" id="gd">${ic('wallet')} Qarzdorlik bo'limiga o'tish</button>`);
    $('#gd', s.el).onclick = () => { s.close(); G.go('debt'); };
    return;
  }
  const down = clampR((total * dc.percent) / 100), rest = clampR(total - down);
  const s = openSheet(`${sheetTitle('Qarzga olish shartlari')}
    <ol class="rule-list">
      <li>Dastlab <b>${dc.percent}%</b> boshlang'ich to'lov qilasiz: <b>${money(down)}</b> — shundan so'ng buyurtmani qabul qilamiz.</li>
      <li>Qolgan <b>${money(rest)}</b> «Qarzdorlik» bo'limiga yoziladi va <b>${dc.days} kun</b> ichida to'lanadi.</li>
      <li>Bir vaqtda eng ko'pi bilan <b>${dc.max} ta</b> qarzdorlik bo'lishi mumkin.</li></ol>
    <label class="chk"><input type="checkbox" id="agree"><span class="box">${ic('check')}</span><span class="t">${esc(dc.text)}</span></label>
    <div id="go-wrap" style="margin-top:16px"></div>`);
  $('#agree', s.el).onchange = (e) => {
    $('#go-wrap', s.el).innerHTML = e.target.checked ? `<button class="btn block reveal" id="go">${ic('credit-card')} To'lash — ${money(down)}</button>` : '';
    if (e.target.checked) { hap('light'); $('#go', s.el).onclick = () => { s.close(); openPay({ title: `Boshlang'ich to'lov (${dc.percent}%)`, amount: down, onSubmit: (d) => submitOrder('debt', d) }); }; }
  };
}

async function submitOrder(kind, d) {
  const items = cartItems().map((x) => ({ id: x.p.id, qty: x.qty }));
  const r = await api('/orders', { method: 'POST', body: { items, kind, comment: G.comment, method: d.method, receipt: d.receipt, consent: kind === 'debt' } });
  G.cart = {}; G.comment = ''; saveCart();
  G.loadProducts().catch(() => {});
  doneSheet(`Buyurtma №${r.order.no} yuborildi`, kind === 'debt'
    ? "Boshlang'ich to'lov cheki tekshirilmoqda. Tasdiqlangach buyurtma qabul qilinadi va qarz «Qarzdorlik» bo'limida ko'rinadi."
    : "To'lov cheki tekshirilmoqda. Tasdiqlangach buyurtma qabul qilinadi — Telegram orqali xabar beramiz.", () => G.go(kind === 'debt' ? 'debt' : 'profile'));
  return r.order;
}

function doneSheet(title, text, then) {
  hap('ok');
  const s = openSheet(`<div class="done"><div class="ring">${ic('check')}</div><h3>${esc(title)}</h3><p>${esc(text)}</p><button class="btn block" id="dn">Yaxshi</button></div>`, { onClose: () => then && then() });
  $('#dn', s.el).onclick = () => s.close();
}

/* ---------- To'lov oynasi (Payme / Click / Paynet + chek) ---------- */
async function openPay({ title, amount, editable = false, max, onSubmit }) {
  let info;
  try { info = await api('/pay-info'); } catch (e) { return toast(e.message, 'err'); }
  let method = null, receipt = null, amt = amount;
  const c = G.cfg.contact;
  const s = openSheet(`${sheetTitle(esc(title))}
    <div class="amount-big"><b class="gold-text" id="pa">${money(amt)}</b><span id="pa2">≈ ${uzs(amt)}</span></div>
    ${editable ? `<label class="field"><span>To'lov summasi ($)</span><div class="inp np"><input id="amt" inputmode="decimal" value="${fmtNum(amt)}"></div><div class="hint">Ko'pi bilan ${money(max)} to'lash mumkin</div></label>` : ''}
    <div class="sect" style="margin-top:6px">To'lov usuli</div>
    <div class="meth">${G.cfg.methods.map((m) => `<button data-m="${m.id}"><i style="background:${METH_COLOR[m.id]}"></i>${esc(m.label)}</button>`).join('')}</div>
    <div id="req"></div>
    <div class="sect">To'lov cheki <span class="err">*</span></div>
    <label class="upl" id="upl">${ic('image-plus')}<b>Chek rasmini yuklang</b><small>Majburiy · skrinshot yoki foto</small><input type="file" accept="image/*" id="file"></label>
    <button class="btn block" id="send" style="margin-top:16px" disabled>${ic('send')} To'lovni yuborish</button>`);
  const $s = (x) => $(x, s.el);
  const upd = () => { $s('#send').disabled = !(method && receipt && amt >= 0.01); };
  $s('.meth').onclick = (e) => {
    const b = e.target.closest('button'); if (!b) return;
    method = b.dataset.m; $$('.meth button', s.el).forEach((x) => x.classList.toggle('on', x === b)); hap('light');
    const r = info.pay[method] || {};
    $s('#req').innerHTML = r.card || r.link
      ? `<div class="req reveal">${r.card ? `<div class="r1"><div class="card-no">${esc(r.card)}</div><button class="cp" id="cp" aria-label="Nusxalash">${ic('copy')}</button></div>` : ''}${r.holder ? `<div class="muted" style="margin-top:4px">Qabul qiluvchi: <b style="color:var(--txt)">${esc(r.holder)}</b></div>` : ''}${r.link ? `<a class="btn sm ghost" style="margin-top:10px" target="_blank" rel="noopener" href="${esc(r.link)}">${ic('link-2')} ${esc(METH[method])} da ochish</a>` : ''}</div>`
      : `<div class="req reveal muted">${esc(METH[method])} rekvizitlari hali kiritilmagan. Aloqa: <a class="gold" href="tel:${esc(c.phone.replace(/\s/g, ''))}">${esc(c.phone)}</a></div>`;
    const cp = $s('#cp'); if (cp) cp.onclick = () => { (navigator.clipboard ? navigator.clipboard.writeText(r.card.replace(/\s/g, '')) : Promise.reject()).then(() => toast('Karta raqami nusxalandi', 'ok')).catch(() => toast(r.card)); };
    upd();
  };
  if (editable) $s('#amt').oninput = (e) => {
    amt = clampR(parseFloat(String(e.target.value).replace(',', '.')) || 0);
    if (amt > max) amt = max;
    $s('#pa').textContent = money(amt); $s('#pa2').textContent = '≈ ' + uzs(amt); upd();
  };
  // chek tanlanganda input qayta chiziladi, shuning uchun har safar qayta ulanadi
  const rebind = () => { const f = $s('#file'); if (f) f.onchange = handleFile; };
  async function handleFile(e) {
    const f = e.target.files[0]; if (!f) return;
    try {
      receipt = await readImage(f, 1280, 0.8);
      const u = $s('#upl'); u.classList.add('has');
      u.innerHTML = `<img src="${receipt}" alt="chek"><small class="ok">${ic('circle-check')} Chek yuklandi · almashtirish uchun bosing</small><input type="file" accept="image/*" id="file">`;
      rebind();
    } catch (err) { toast(err.message, 'err'); }
    upd();
  }
  rebind();
  $s('#send').onclick = async () => {
    const btn = $s('#send'); btn.classList.add('spin'); btn.disabled = true;
    try { await onSubmit({ method, receipt, amount: amt }); s.close(); }
    catch (e) { toast(e.message, 'err'); btn.classList.remove('spin'); upd(); }
  };
}
