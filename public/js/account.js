'use strict';
/* ===== Qarzdorlik, Profil, buyurtma tafsilotlari (mijoz uchun) ===== */

function daysLeft(ts) { return Math.ceil((ts - Date.now()) / 86400e3); }
function dueHtml(o) {
  if (o.status === 'pending') return `<div class="due warn">${ic('hourglass')} Boshlang'ich to'lov tekshirilmoqda</div>`;
  if (!o.debt || !o.debt.dueAt) return '';
  const d = daysLeft(o.debt.dueAt);
  return d >= 0
    ? `<div class="due ${d <= 3 ? 'warn' : 'muted'}">${ic('calendar')} Muddat: ${fmtD(o.debt.dueAt)} · ${d} kun qoldi</div>`
    : `<div class="due err">${ic('triangle-alert')} Muddati ${-d} kun oldin o'tgan (${fmtD(o.debt.dueAt)})</div>`;
}
const pendingSum = (o) => clampR(o.payments.filter((p) => p.status === 'pending' && p.purpose === 'repay').reduce((s, p) => s + p.amount, 0));

/* ---------- Qarzdorlik ---------- */
async function viewDebt() {
  const v = $('#view');
  v.innerHTML = `<div class="page"><div class="skel"></div><div class="skel"></div></div>`;
  let r;
  try { r = await api('/debts'); } catch (e) { v.innerHTML = `<div class="page"><div class="empty">${ic('circle-alert')}<h3>Yuklanmadi</h3><p>${esc(e.message)}</p><button class="btn" id="rt">Qayta urinish</button></div></div>`; $('#rt').onclick = viewDebt; return; }
  if (G.tab !== 'debt') return;
  const max = r.max;
  const shownOwed = (o) => (o.status === 'pending' ? clampR(o.total - o.payments.filter((p) => p.purpose === 'down').reduce((s, p) => s + p.amount, 0)) : o.owed);
  const grand = clampR(r.debts.reduce((s, o) => s + shownOwed(o), 0));
  const slots = Array.from({ length: max }, (_, i) => `<i class="${i < r.debts.length ? 'f' : ''}"></i>`).join('');
  v.innerHTML = `<div class="page">
    <div class="dsum"><div><span class="l">Umumiy qarzdorlik</span><b>${money(grand)}</b></div><div style="text-align:right"><div class="slots" style="justify-content:flex-end">${slots}</div><small class="muted" style="font-size:10.5px;display:block;margin-top:6px">${r.debts.length} / ${max} qarz</small></div></div>
    ${r.debts.length ? r.debts.map((o) => {
      const pend = o.status === 'pending';
      const owed = shownOwed(o);
      const paid = pend ? 0 : o.paid;
      const pc = Math.min(100, Math.round((paid / o.total) * 100));
      const ps = pendingSum(o);
      return `<div class="dcard" data-id="${o.id}"><div class="top"><span class="no">№${o.no}</span><span class="dim" style="font-size:11.5px">${fmtDT(o.createdAt)}</span><span class="sp"></span>${stChip(o)}</div>
        <div class="kv"><span>Buyurtma summasi</span><b>${money(o.total)}</b></div>
        <div class="kv"><span>To'langan</span><b class="ok">${money(paid)}</b></div>
        ${ps ? `<div class="kv"><span>Tekshiruvda</span><b class="warn">${money(ps)}</b></div>` : ''}
        <div class="prog"><i style="width:${pc}%"></i></div>
        <div class="rest"><span>Qoldiq qarz</span><b>${money(owed)}</b></div>
        ${dueHtml(o)}
        <button class="btn ghost sm" style="margin-top:12px" data-det="${o.id}">${ic('file-text')} Tarkibi va to'lovlar</button></div>`;
    }).join('') : `<div class="empty">${ic('circle-check')}<h3>Qarzdorlik yo'q</h3><p>Hozircha hech qanday qarzingiz yo'q. «Savat» bo'limida «Qarzga» tugmasi orqali ${G.cfg.debt.percent}% to'lab buyurtma berishingiz mumkin.</p></div>`}
    ${r.debts.length ? `<div class="dpay"><div class="cbox"><textarea class="plain" id="dnote" rows="1" maxlength="300" placeholder="Izoh (ixtiyoriy)…"></textarea><button class="btn" id="dbtn">${ic('credit-card')} To'lov</button></div></div>` : ''}</div>`;
  v.onclick = (e) => {
    const b = e.target.closest('[data-det]'); if (!b) return;
    openOrder(r.debts.find((o) => o.id === b.dataset.det));
  };
  const btn = $('#dbtn');
  if (!btn) return;
  btn.onclick = () => {
    const ok = r.debts.filter((o) => o.status !== 'pending' && o.owed - pendingSum(o) > 0.004);
    if (!ok.length) return toast("Boshlang'ich to'lov tasdiqlanishini kuting yoki barcha qarz uchun chek yuborilgan", 'info');
    const note = $('#dnote').value;
    if (ok.length === 1) return payDebt(ok[0], note);
    const s = openSheet(`${sheetTitle("Qaysi qarz uchun?")}<div class="list">${ok.map((o) => `<button class="oc" data-p="${o.id}" style="text-align:left"><div class="a"><span class="no">№${o.no}</span><span class="sp"></span><b class="gold" style="font:700 22px var(--serif)">${money(o.owed - pendingSum(o))}</b></div><div class="sub">${fmtDT(o.createdAt)} · qoldiq qarz</div></button>`).join('')}</div>`);
    s.el.onclick = (e) => { const b = e.target.closest('[data-p]'); if (!b) return; s.close(); payDebt(ok.find((o) => o.id === b.dataset.p), note); };
  };
}

function payDebt(o, note) {
  const max = clampR(o.owed - pendingSum(o));
  openPay({
    title: `№${o.no} — qarz to'lovi`, amount: max, editable: true, max,
    onSubmit: async (d) => {
      await api(`/orders/${o.id}/pay`, { method: 'POST', body: { amount: d.amount, method: d.method, receipt: d.receipt, comment: note || '' } });
      doneSheet("To'lov yuborildi", "Chekingiz tekshirilmoqda. Tasdiqlangach qarzingiz kamayadi.", () => { if (G.tab === 'debt') viewDebt(); });
    }
  });
}

/* ---------- Buyurtma tafsiloti (mijoz) ---------- */
function paymentsHtml(o) {
  const lab = { full: "To'liq to'lov", down: "Boshlang'ich to'lov", repay: "Qarz to'lovi" };
  const st = { pending: ['wt', 'Tekshiruvda'], confirmed: ['ok', 'Tasdiqlandi'], rejected: ['er', 'Rad etildi'] };
  return o.payments.map((p) => `<div class="pay-row">${p.chek ? `<img class="chek" data-lb="${esc(asset(p.chek))}" src="${esc(asset(p.chek))}" alt="chek">` : `<span class="icon-btn">${ic('banknote')}</span>`}
    <div style="flex:1;min-width:0"><b>${lab[p.purpose] || ''}</b><div class="dim" style="font-size:11px">${fmtDT(p.at)} · ${METH[p.method] || p.method}${p.note ? ' · ' + esc(p.note) : ''}</div></div>
    <div class="tr"><b class="gold">${money(p.amount)}</b><div><span class="st-chip ${st[p.status][0]}">${st[p.status][1]}</span></div></div></div>`).join('');
}
function openOrder(o) {
  if (!o) return;
  const s = openSheet(`${sheetTitle(`Buyurtma №${o.no}`)}
    <div class="row wrap" style="margin-bottom:12px">${stChip(o)}${kindChip(o)}<span class="dim" style="font-size:11.5px">${fmtDT(o.createdAt)}</span></div>
    ${excelTable(o.items.map((i) => ({ name: i.name, size: i.size, price: i.price, qty: i.qty, unit: i.unit, sum: i.sum })), o.total)}
    ${o.comment ? `<div class="kvs" style="margin-top:12px"><div><span>Izoh</span><b>${esc(o.comment)}</b></div></div>` : ''}
    ${o.kind === 'debt' ? `<div class="kvs" style="margin-top:12px"><div><span>To'langan</span><b class="ok">${money(o.paid)}</b></div><div><span>Qoldiq qarz</span><b class="gold">${money(o.owed)}</b></div></div>${dueHtml(o)}` : ''}
    <div class="sect">To'lovlar</div>${paymentsHtml(o)}`, { cls: 'wide' });
  s.el.onclick = (e) => { const i = e.target.closest('[data-lb]'); if (i) lightbox(i.dataset.lb); };
}

/* ---------- Profil ---------- */
async function viewProfile() {
  const v = $('#view'), u = G.me, c = G.cfg.contact;
  v.innerHTML = `<div class="page"><div class="me">
      <div class="ava"><div class="in">${u.avatar ? `<img src="${esc(asset(u.avatar))}" alt="">` : initial(u.name)}</div><span class="cam">${ic('camera')}</span><input type="file" accept="image/*" id="av" aria-label="Rasm tanlash"></div>
      <h2>${esc(u.name)}</h2><div class="un">@${esc(u.username)}</div></div>
    <div class="info"><div class="it">${ic('phone')}<div><small>Telefon</small>${esc(phoneShow(u.phone))}</div></div>
      <div class="it">${ic('map-pin')}<div><small>Viloyat</small>${esc(u.region)}</div></div>
      ${u.address ? `<div class="it">${ic('store')}<div><small>Manzil</small>${esc(u.address)}</div></div>` : ''}
      <div class="it">${ic('calendar')}<div><small>Ro'yxatdan o'tgan</small>${fmtD(u.createdAt)}</div></div></div>
    <div class="row" style="margin-top:12px"><button class="btn ghost sm sp" id="ed">${ic('pencil')} Ma'lumotlarni o'zgartirish</button><button class="btn ghost sm" id="pw">${ic('lock')} Parol</button></div>
    <div class="sect">Buyurtmalar tarixi</div><div id="hist"><div class="skel"></div></div>
    <div class="sect">Aloqa</div>
    <div class="contact"><a href="tel:${esc(c.phone.replace(/\s/g, ''))}">${ic('phone')} Qo'ng'iroq</a>
      ${c.whatsapp ? `<a target="_blank" rel="noopener" href="https://wa.me/${esc(c.whatsapp)}">${ic('message-square')} WhatsApp</a>` : ''}
      ${c.telegram ? `<a target="_blank" rel="noopener" href="https://t.me/${esc(c.telegram)}">${ic('send')} Telegram</a>` : ''}
      ${c.instagram ? `<a target="_blank" rel="noopener" href="https://instagram.com/${esc(c.instagram)}">${ic('camera')} Instagram</a>` : ''}</div>
    <button class="btn ghost block" style="margin-top:22px" id="lo">${ic('log-out')} Akkauntdan chiqish</button></div>`;
  $('#av').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { const img = await readImage(f, 360, 0.86); const r = await api('/me/avatar', { method: 'POST', body: { image: img } }); G.me = r.user; toast('Rasm yangilandi', 'ok'); viewProfile(); } catch (err) { toast(err.message, 'err'); }
  };
  $('#ed').onclick = editProfile; $('#pw').onclick = changePassword;
  $('#lo').onclick = async () => { if (await confirmBox('Chiqish', 'Akkauntdan chiqmoqchimisiz?', 'Chiqish')) G.logout(); };
  try {
    const r = await api('/orders');
    if (G.tab !== 'profile') return;
    $('#hist').innerHTML = r.orders.length ? r.orders.map((o) => `<div class="hist" data-o="${o.id}"><div class="h1"><span class="no">№${o.no}</span><span class="dt">${fmtDT(o.createdAt)}</span><span class="sp"></span>${stChip(o)}</div>
      <div class="h2">${kindChip(o)}${o.kind === 'debt' && o.owed > 0.004 ? `<span class="warn" style="font-size:11.5px;font-weight:700">qoldiq ${money(o.owed)}</span>` : ''}<span class="sm">${money(o.total)}</span></div></div>`).join('')
      : `<div class="empty" style="padding:26px 10px">${ic('file-text')}<p style="margin:0">Hali buyurtma bermagansiz</p></div>`;
    $('#hist').onclick = (e) => { const h = e.target.closest('[data-o]'); if (h) openOrder(r.orders.find((o) => o.id === h.dataset.o)); };
  } catch (e) { $('#hist').innerHTML = `<p class="err">${esc(e.message)}</p>`; }
}

function editProfile() {
  const u = G.me, c = G.cfg, need = c.addressRequired || [];
  const s = openSheet(`${sheetTitle("Akkaunt ma'lumotlari")}<form id="pf" novalidate>
    <label class="field"><span>Akkaunt nomi</span><div class="inp">${ic('user')}<input name="username" value="${esc(u.username)}" autocapitalize="none" maxlength="20"></div></label>
    <label class="field"><span>Ism</span><div class="inp">${ic('user-round')}<input name="name" value="${esc(u.name)}" maxlength="60"></div></label>
    <label class="field"><span>Telefon</span><div class="inp ph"><span class="pre">+998</span><input name="phone" type="tel" inputmode="numeric" value="${esc(u.phone.replace('+998', '').replace(/^(\d{2})(\d{3})(\d{2})(\d{2})$/, '$1 $2 $3 $4'))}"></div></label>
    <label class="field"><span>Viloyat</span><div class="inp">${ic('map-pin')}<select name="region">${c.regions.map((r) => `<option ${r === u.region ? 'selected' : ''}>${esc(r)}</option>`).join('')}</select></div></label>
    <label class="field"><span>Aniq manzil</span><div class="inp">${ic('map-pin')}<input name="address" value="${esc(u.address)}" maxlength="200"></div><div class="hint">Toshkent uchun majburiy</div></label>
    <button class="btn block" type="submit">${ic('save')} Saqlash</button></form>`);
  const f = $('#pf', s.el); phoneInput(f.phone);
  f.onsubmit = async (e) => {
    e.preventDefault();
    const btn = $('button[type=submit]', f); btn.classList.add('spin'); btn.disabled = true;
    try {
      const r = await api('/me', { method: 'PUT', body: { username: f.username.value.trim(), name: f.name.value.trim(), phone: f.phone.value, region: f.region.value, address: f.address.value.trim() } });
      G.me = r.user; s.close(); toast("Ma'lumotlar saqlandi", 'ok'); viewProfile();
    } catch (err) { toast(err.message, 'err'); btn.classList.remove('spin'); btn.disabled = false; }
  };
  void need;
}

function changePassword() {
  const s = openSheet(`${sheetTitle("Parolni o'zgartirish")}<form id="pwf" novalidate>
    <label class="field"><span>Eski parol</span><div class="inp">${ic('lock')}<input name="old" type="password" autocomplete="current-password"></div></label>
    <label class="field"><span>Yangi parol</span><div class="inp">${ic('lock')}<input name="n1" type="password" autocomplete="new-password" placeholder="kamida 6 ta belgi"></div></label>
    <label class="field"><span>Yangi parolni takrorlang</span><div class="inp">${ic('lock')}<input name="n2" type="password" autocomplete="new-password"></div></label>
    <button class="btn block" type="submit">${ic('save')} Saqlash</button></form>`);
  const f = $('#pwf', s.el);
  f.onsubmit = async (e) => {
    e.preventDefault();
    if (f.n1.value.length < 6) return toast('Yangi parol kamida 6 ta belgi bo\'lsin', 'err');
    if (f.n1.value !== f.n2.value) return toast('Yangi parollar bir xil emas', 'err');
    const btn = $('button[type=submit]', f); btn.classList.add('spin'); btn.disabled = true;
    try { await api('/me/password', { method: 'POST', body: { old: f.old.value, password: f.n1.value } }); s.close(); toast("Parol o'zgartirildi", 'ok'); }
    catch (err) { toast(err.message, 'err'); btn.classList.remove('spin'); btn.disabled = false; }
  };
}
