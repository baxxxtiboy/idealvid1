'use strict';
/* ===== Admin panel ===== */
const AT = [['today', 'Bugun', 'inbox'], ['history', 'Tarix', 'history'], ['products', 'Tovarlar', 'package'], ['users', 'Mijozlar', 'users'], ['settings', 'Sozlama', 'settings']];
const skeleton = (n = 3) => `<div class="page">${'<div class="skel"></div>'.repeat(n)}</div>`;
const errView = (e, retry) => { $('#view').innerHTML = `<div class="page"><div class="empty">${ic('circle-alert')}<h3>Yuklanmadi</h3><p>${esc(e.message)}</p><button class="btn" id="rt">Qayta urinish</button></div></div>`; $('#rt').onclick = retry; };
const chekThumb = (o) => { const p = o.payments.find((x) => x.chek); return p ? `<img class="chek-s" data-lb="${esc(asset(p.chek))}" src="${esc(asset(p.chek))}" alt="chek" style="width:34px;height:34px;border-radius:8px;object-fit:cover;border:1px solid var(--line2)">` : ''; };

function ocHtml(o, hot) {
  const u = o.user || {};
  return `<div class="oc ${hot ? 'hot' : ''}" data-o="${o.id}"><div class="a"><span class="no">№${o.no}</span><span class="dim" style="font-size:11.5px">${fmtDT(o.createdAt)}</span><span class="sp"></span>${stChip(o)}</div>
    <div class="who">${esc(u.name)} <span class="muted" style="font-weight:500">@${esc(u.username)}</span></div>
    <div class="sub">${ic('phone')} ${esc(phoneShow(u.phone))} &nbsp;·&nbsp; ${ic('map-pin')} ${esc(u.region)}</div>
    <div class="its">${o.items.slice(0, 5).map((i) => `<span>${esc(i.name)} × ${fmtNum(i.qty)}</span>`).join('')}${o.items.length > 5 ? `<span>+${o.items.length - 5}</span>` : ''}</div>
    <div class="b">${kindChip(o)}${o.kind === 'debt' && o.owed > 0.004 ? `<span class="warn" style="font-size:11.5px;font-weight:700">qoldiq ${money(o.owed)}</span>` : ''}${chekThumb(o)}<span class="sm">${money(o.total)}</span></div></div>`;
}
function bindOrderList(box, orders, reload) {
  box.onclick = (e) => {
    const lb = e.target.closest('[data-lb]'); if (lb) return lightbox(lb.dataset.lb);
    const c = e.target.closest('[data-o]'); if (c) openAdminOrder(orders.find((o) => o.id === c.dataset.o), reload);
  };
}

/* ---------- Buyurtma tafsiloti (admin) ---------- */
function openAdminOrder(o, reload) {
  if (!o) return;
  const u = o.user || {};
  const lab = { full: "To'liq to'lov", down: "Boshlang'ich to'lov", repay: "Qarz to'lovi" };
  const st = { pending: ['wt', 'Tekshiruvda'], confirmed: ['ok', 'Tasdiqlandi'], rejected: ['er', 'Rad etildi'] };
  const s = openSheet(`${sheetTitle(`Buyurtma №${o.no}`)}
    <div class="row wrap" style="margin-bottom:12px">${stChip(o)}${kindChip(o)}<span class="dim" style="font-size:11.5px">${fmtDT(o.createdAt)}</span></div>
    <div class="kvs"><div><span>Mijoz</span><b>${esc(u.name)} (@${esc(u.username)})</b></div><div><span>Telefon</span><b><a class="gold" href="tel:${esc(u.phone)}">${esc(phoneShow(u.phone))}</a></b></div><div><span>Viloyat</span><b>${esc(u.region)}</b></div>${u.address ? `<div><span>Manzil</span><b>${esc(u.address)}</b></div>` : ''}${o.comment ? `<div><span>Izoh</span><b>${esc(o.comment)}</b></div>` : ''}</div>
    ${excelTable(o.items.map((i) => ({ name: i.name, size: i.size, price: i.price, qty: i.qty, unit: i.unit, sum: i.sum })), o.total)}
    ${o.kind === 'debt' ? `<div class="kvs" style="margin-top:12px"><div><span>To'langan</span><b class="ok">${money(o.paid)}</b></div><div><span>Qoldiq qarz</span><b class="gold">${money(o.owed)}</b></div>${o.debt && o.debt.dueAt ? `<div><span>Muddat</span><b>${fmtD(o.debt.dueAt)}</b></div>` : ''}<div><span>Qarz shartiga rozilik</span><b class="ok">✓ ${fmtDT(o.debt.consentAt)}</b></div></div>` : ''}
    <div class="sect">To'lovlar</div>
    ${o.payments.map((p) => `<div class="pay-row" style="flex-wrap:wrap">${p.chek ? `<img class="chek" data-lb="${esc(asset(p.chek))}" src="${esc(asset(p.chek))}" alt="chek">` : `<span class="icon-btn">${ic('banknote')}</span>`}
      <div style="flex:1;min-width:0"><b>${lab[p.purpose]}</b><div class="dim" style="font-size:11px">${fmtDT(p.at)} · ${METH[p.method] || p.method}${p.note ? ' · ' + esc(p.note) : ''}</div></div>
      <div class="tr"><b class="gold">${money(p.amount)}</b><div><span class="st-chip ${st[p.status][0]}">${st[p.status][1]}</span></div></div>
      ${p.status === 'pending' ? `<div class="acts full" style="width:100%"><button class="btn danger sm" data-act="reject" data-p="${p.id}">${ic('x')} Rad etish</button><button class="btn ok sm" data-act="confirm" data-p="${p.id}">${ic('check')} Tasdiqlash</button></div>` : ''}</div>`).join('')}
    <div class="acts">${o.status === 'accepted' ? `<button class="btn ghost" id="deliv">${ic('package')} Topshirildi</button>` : ''}${o.kind === 'debt' && o.owed > 0.004 ? `<button class="btn ghost" id="cash">${ic('banknote')} Naqd to'lov</button>` : ''}</div>`, { cls: 'wide' });
  const done = (msg) => { s.close(); toast(msg, 'ok'); reload && reload(true); };
  s.el.onclick = async (e) => {
    const lb = e.target.closest('[data-lb]'); if (lb) return lightbox(lb.dataset.lb);
    const b = e.target.closest('[data-act]'); if (!b) return;
    if (b.dataset.act === 'reject' && !(await confirmBox("Chekni rad etish", o.status === 'pending' ? 'Buyurtma bekor qilinadi va mahsulotlar omborga qaytadi.' : "To'lov rad etiladi.", 'Rad etish', true))) return;
    b.classList.add('spin'); b.disabled = true;
    try { await api(`/admin/orders/${o.id}/payments/${b.dataset.p}`, { method: 'POST', body: { action: b.dataset.act } }); done(b.dataset.act === 'confirm' ? 'Tasdiqlandi' : 'Rad etildi'); }
    catch (err) { toast(err.message, 'err'); b.classList.remove('spin'); b.disabled = false; }
  };
  const dv = $('#deliv', s.el);
  if (dv) dv.onclick = async () => { try { await api(`/admin/orders/${o.id}/delivered`, { method: 'POST' }); done('Topshirildi deb belgilandi'); } catch (err) { toast(err.message, 'err'); } };
  const ch = $('#cash', s.el);
  if (ch) ch.onclick = () => {
    const s2 = openSheet(`${sheetTitle("Naqd to'lov kiritish")}<label class="field"><span>Summa ($) — qoldiq ${money(o.owed)}</span><div class="inp np"><input id="ca" inputmode="decimal" value="${fmtNum(o.owed)}"></div></label><button class="btn block" id="cs">${ic('save')} Saqlash</button>`);
    $('#cs', s2.el).onclick = async () => {
      try { await api(`/admin/orders/${o.id}/cash`, { method: 'POST', body: { amount: parseFloat($('#ca', s2.el).value.replace(',', '.')) } }); s2.close(); done("Naqd to'lov qo'shildi"); } catch (err) { toast(err.message, 'err'); }
    };
  };
}

/* ---------- Bugun ---------- */
let todaySig = '';
async function aToday(force) {
  const v = $('#view');
  if (force !== 'bg') v.innerHTML = skeleton();
  let ov, td;
  try { [ov, td] = await Promise.all([api('/admin/overview'), api('/admin/orders?today=1')]); } catch (e) { if (force !== 'bg') errView(e, aToday); return; }
  if (G.atab !== 'today') return;
  const sig = JSON.stringify([ov.pending.map((x) => x.pay.id + x.pay.status), td.orders.map((o) => o.id + o.status + o.payments.length), ov.debtTotal]);
  if (force === 'bg' && sig === todaySig) return;
  todaySig = sig;
  G.reload = aToday;
  const tb = $('#tab-today-bdg'); if (tb) { tb.textContent = ov.pending.length; tb.hidden = !ov.pending.length; }
  v.innerHTML = `<div class="page"><div class="page-title">Bugun <small>${fmtD(Date.now())}</small><span class="sp"></span><button class="link" id="rf">${ic('refresh-cw')} Yangilash</button></div>
    <div class="tiles"><div class="tile">${ic('inbox')}<small>Bugungi zakaz</small><b>${ov.todayOrders}</b></div><div class="tile">${ic('coins')}<small>Bugungi summa</small><b>${money(ov.todaySum)}</b></div>
      <div class="tile">${ic('users')}<small>Mijozlar</small><b>${ov.users}</b></div><div class="tile">${ic('wallet')}<small>Qarzdorlik</small><b>${money(ov.debtTotal)}</b></div></div>
    ${ov.pending.length ? `<div class="sect">Tasdiqlash kutilmoqda (${ov.pending.length})</div><div class="list cols" id="pend">${ov.pending.map(({ order: o, pay: p }) => `<div class="pend" data-o="${o.id}"><div class="row"><span class="no" style="font:700 19px var(--serif)">№${o.no}</span><span class="st-chip gd">${p.purpose === 'full' ? "To'liq" : p.purpose === 'down' ? "Boshlang'ich" : "Qarz to'lovi"}</span><span class="sp"></span><b class="gold" style="font:700 22px var(--serif)">${money(p.amount)}</b></div>
      <div class="row" style="margin-top:8px">${p.chek ? `<img class="chk-img" data-lb="${esc(asset(p.chek))}" src="${esc(asset(p.chek))}" alt="chek">` : ''}<div style="min-width:0"><div style="font-weight:700">${esc(o.user.name)}</div><div class="sub dim" style="font-size:11.5px">${esc(phoneShow(o.user.phone))} · ${esc(o.user.region)}<br>${METH[p.method]} · ${fmtDT(p.at)}</div></div></div>
      <div class="two"><button class="btn danger sm" data-act="reject" data-o="${o.id}" data-p="${p.id}">${ic('x')} Rad</button><button class="btn ok sm" data-act="confirm" data-o="${o.id}" data-p="${p.id}">${ic('check')} Tasdiqlash</button></div></div>`).join('')}</div>` : ''}
    <div class="sect">Bugungi zakazlar (${td.total})</div>
    <div class="list cols" id="tl">${td.orders.length ? td.orders.map((o) => ocHtml(o, o.status === 'pending')).join('') : `<div class="empty" style="grid-column:1/-1;padding:30px 10px">${ic('inbox')}<p style="margin:0">Bugun hali zakaz yo'q</p></div>`}</div></div>`;
  $('#rf').onclick = () => aToday();
  bindOrderList($('#tl'), td.orders, () => aToday());
  const pend = $('#pend');
  if (pend) pend.onclick = async (e) => {
    const lb = e.target.closest('[data-lb]'); if (lb) return lightbox(lb.dataset.lb);
    const b = e.target.closest('[data-act]');
    if (!b) { const c = e.target.closest('[data-o]'); if (c) openAdminOrder(td.orders.find((o) => o.id === c.dataset.o) || ov.pending.find((x) => x.order.id === c.dataset.o).order, () => aToday()); return; }
    if (b.dataset.act === 'reject' && !(await confirmBox('Chekni rad etish', "To'lov rad etiladi (buyurtma bo'lsa — bekor qilinadi).", 'Rad etish', true))) return;
    b.classList.add('spin'); b.disabled = true;
    try { await api(`/admin/orders/${b.dataset.o}/payments/${b.dataset.p}`, { method: 'POST', body: { action: b.dataset.act } }); toast(b.dataset.act === 'confirm' ? 'Tasdiqlandi' : 'Rad etildi', 'ok'); aToday(); }
    catch (err) { toast(err.message, 'err'); b.classList.remove('spin'); b.disabled = false; }
  };
}

/* ---------- Tarix ---------- */
const AH = { from: '', to: '', status: 'all', q: '' };
async function aHistory() {
  const v = $('#view');
  v.innerHTML = `<div class="page"><div class="page-title">Zakazlar tarixi</div>
    <div class="filters"><label class="field" style="margin:0"><span>Dan</span><input class="plain" type="date" id="hf" value="${AH.from}"></label><label class="field" style="margin:0"><span>Gacha</span><input class="plain" type="date" id="ht" value="${AH.to}"></label>
      <div class="inp np"><select id="hs"><option value="all">Hamma holat</option><option value="pending">Tekshirilmoqda</option><option value="accepted">Qabul qilingan</option><option value="delivered">Topshirilgan</option><option value="rejected">Rad etilgan</option><option value="debt">Qarzga</option><option value="full">To'liq to'langan</option></select></div>
      <div class="inp">${ic('search')}<input id="hq" placeholder="№, ism, telefon…" value="${esc(AH.q)}"></div></div>
    <div class="row" style="margin:4px 2px 12px"><span class="muted" id="hsum" style="font-size:12.5px"></span><span class="sp"></span><button class="btn ghost sm" id="csv">${ic('download')} CSV</button></div><div id="hl" class="list cols"></div></div>`;
  $('#hs').value = AH.status;
  let last = [], tm;
  const load = async () => {
    AH.from = $('#hf').value; AH.to = $('#ht').value; AH.status = $('#hs').value; AH.q = $('#hq').value.trim();
    const qs = new URLSearchParams({ from: AH.from, to: AH.to, status: AH.status, q: AH.q });
    try {
      const r = await api('/admin/orders?' + qs);
      last = r.orders;
      $('#hsum').innerHTML = `<b>${r.total}</b> ta zakaz · jami <b class="gold">${money(r.sum)}</b>`;
      $('#hl').innerHTML = r.orders.length ? r.orders.map((o) => ocHtml(o)).join('') : `<div class="empty" style="grid-column:1/-1">${ic('file-text')}<p style="margin:0">Zakaz topilmadi</p></div>`;
    } catch (e) { toast(e.message, 'err'); }
  };
  G.reload = load;
  ['hf', 'ht', 'hs'].forEach((id) => ($('#' + id).onchange = load));
  $('#hq').oninput = () => { clearTimeout(tm); tm = setTimeout(load, 300); };
  $('#hl').onclick = (e) => { const lb = e.target.closest('[data-lb]'); if (lb) return lightbox(lb.dataset.lb); const c = e.target.closest('[data-o]'); if (c) openAdminOrder(last.find((o) => o.id === c.dataset.o), load); };
  $('#csv').onclick = () => {
    if (!last.length) return toast("Yuklash uchun zakaz yo'q", 'info');
    const lines = [['№', 'Sana', 'Mijoz', 'Telefon', 'Viloyat', 'Mahsulotlar', 'Summa $', "To'langan $", 'Turi', 'Holat']];
    for (const o of last) lines.push([o.no, fmtDT(o.createdAt), o.user.name, o.user.phone, o.user.region, o.items.map((i) => `${i.name} x${i.qty}`).join('; '), o.total, o.paid, o.kind === 'debt' ? 'Qarz' : "To'liq", (STATUS[o.status] || [0, o.status])[1]]);
    const csv = '﻿' + lines.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(';')).join('\r\n');
    const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' })); a.download = `zakazlar-${dayKeyT(Date.now())}.csv`; a.click();
  };
  load();
}

/* ---------- Tovarlar + oylik foyda ---------- */
const AP = { seg: 'list', q: '', cat: 'all' };
async function aProducts() {
  const v = $('#view');
  v.innerHTML = `<div class="page"><div class="seg" style="margin-bottom:14px"><button data-s="list" class="${AP.seg === 'list' ? 'on' : ''}">Mahsulotlar</button><button data-s="months" class="${AP.seg === 'months' ? 'on' : ''}">Oylik foyda</button></div><div id="pb">${'<div class="skel"></div>'.repeat(2)}</div></div>`;
  $$('.seg button', v).forEach((b) => (b.onclick = () => { AP.seg = b.dataset.s; aProducts(); }));
  if (AP.seg === 'months') return aMonths();
  let list;
  try { list = (await api('/admin/products')).products; } catch (e) { return errView(e, aProducts); }
  G.reload = aProducts;
  const cats = G.cfg.cats.filter((c) => c.id !== 'new');
  const pb = $('#pb');
  pb.innerHTML = `<div class="row" style="margin-bottom:10px"><div class="tile sp" style="padding:10px 14px"><small>Jami mahsulot</small><b style="font-size:24px">${list.length} <span class="muted" style="font:600 12px Montserrat">faol: ${list.filter((p) => p.active).length}</span></b></div><button class="btn" id="newp">${ic('package-plus')} Yangi</button></div>
    <div class="search" style="margin-bottom:10px">${ic('search')}<input id="pq" placeholder="Mahsulot qidirish…" value="${esc(AP.q)}"></div>
    <div class="chips" style="margin-top:0;margin-bottom:10px">${cats.map((c) => `<button class="chip ${AP.cat === c.id ? 'on' : ''}" data-c="${c.id}">${esc(c.label)}</button>`).join('')}</div><div class="list cols" id="pl"></div>`;
  const draw = () => {
    const q = AP.q.toLowerCase().replace(/\s+/g, '');
    const arr = list.filter((p) => (AP.cat === 'all' || p.cat === AP.cat) && (!q || (p.name + p.size).toLowerCase().replace(/\s+/g, '').includes(q)));
    $('#pl').innerHTML = arr.map((p) => `<div class="prow ${p.active ? '' : 'off'}" data-p="${esc(p.id)}"><div class="th"><img loading="lazy" src="${esc(asset(p.img))}" alt=""></div><div><div class="n">${esc(p.name)}</div><div class="s">${esc(p.size)}${p.active ? '' : ' · yashirin'}</div></div><div class="pr"><b>${money(p.price)}</b><small class="${p.stock <= 0 ? 'z' : ''}">${p.stock <= 0 ? 'qolmagan' : 'qoldiq: ' + qtyStr(p.stock, p.unit)}</small></div></div>`).join('') || `<div class="empty" style="grid-column:1/-1"><p style="margin:0">Topilmadi</p></div>`;
  };
  draw();
  $('#pq').oninput = (e) => { AP.q = e.target.value; draw(); };
  $('.chips', pb).onclick = (e) => { const b = e.target.closest('.chip'); if (!b) return; AP.cat = AP.cat === b.dataset.c ? 'all' : b.dataset.c; $$('.chip', pb).forEach((x) => x.classList.toggle('on', x.dataset.c === AP.cat)); draw(); };
  $('#pl').onclick = (e) => { const r = e.target.closest('[data-p]'); if (r) productForm(list.find((p) => p.id === r.dataset.p), aProducts); };
  $('#newp').onclick = () => productForm(null, aProducts);
}

function productForm(p, done) {
  const isNew = !p;
  p = p || { name: '', size: '', price: '', cost: '', stock: '', unit: 'dona', cat: '', isNew: true, active: true, img: '' };
  let image = null;
  const s = openSheet(`${sheetTitle(isNew ? 'Yangi tovar' : esc(p.name))}<form id="prf" novalidate>
    <label class="upl" id="pimg" style="min-height:120px;margin-bottom:14px">${p.img ? `<img src="${esc(asset(p.img))}" alt="" style="max-height:140px;background:#f4efe0;padding:6px">` : ic('image-plus') + '<b>Rasm yuklash</b>'}<input type="file" accept="image/*" id="pfile"></label>
    <label class="field"><span>Nomi</span><div class="inp np"><input name="name" value="${esc(p.name)}" placeholder="masalan: Db 400" maxlength="80"></div></label>
    <label class="field"><span>O'lchami</span><div class="inp np"><input name="size" value="${esc(p.size)}" placeholder="300 × 800 mm" maxlength="60"></div></label>
    <div style="display:grid;grid-template-columns:1fr 1fr;gap:10px"><label class="field"><span>Narxi ($)</span><div class="inp np"><input name="price" inputmode="decimal" value="${p.price === '' ? '' : fmtNum(p.price)}"></div></label>
      <label class="field"><span>Tan narxi ($)</span><div class="inp np"><input name="cost" inputmode="decimal" value="${p.cost ? fmtNum(p.cost) : ''}" placeholder="foyda uchun"></div></label>
      <label class="field"><span>Qoldiq</span><div class="inp np"><input name="stock" inputmode="decimal" value="${p.stock === '' ? '' : fmtNum(p.stock)}"></div></label>
      <label class="field"><span>Birlik</span><div class="inp np"><select name="unit"><option value="dona" ${p.unit === 'dona' ? 'selected' : ''}>dona</option><option value="metr" ${p.unit === 'metr' ? 'selected' : ''}>metr</option></select></div></label></div>
    <label class="field"><span>Bo'lim</span><div class="inp np"><select name="cat"><option value="">Avtomatik (nomiga qarab)</option>${G.cfg.cats.filter((c) => !['new', 'all'].includes(c.id)).map((c) => `<option value="${c.id}" ${p.cat === c.id ? 'selected' : ''}>${esc(c.label)}</option>`).join('')}</select></div></label>
    <label class="chk" style="margin-bottom:12px"><input type="checkbox" name="isNew" ${p.isNew ? 'checked' : ''}><span class="box">${ic('check')}</span><span class="t">«Yangiliklar» bo'limida ko'rsatish</span></label>
    ${isNew ? '' : `<label class="chk" style="margin-bottom:14px"><input type="checkbox" name="active" ${p.active ? 'checked' : ''}><span class="box">${ic('check')}</span><span class="t">Mijozlarga ko'rinsin (o'chirilsa — yashiriladi)</span></label>`}
    <button class="btn block" type="submit">${ic('save')} Saqlash</button></form>`);
  const f = $('#prf', s.el);
  const bindFile = () => {
    $('#pfile', s.el).onchange = async (e) => {
      const file = e.target.files[0]; if (!file) return;
      try {
        image = await readImage(file, 700, 0.85);
        $('#pimg', s.el).innerHTML = `<img src="${image}" alt="" style="max-height:140px"><input type="file" accept="image/*" id="pfile">`;
        bindFile();
      } catch (err) { toast(err.message, 'err'); }
    };
  };
  bindFile();
  f.onsubmit = async (e) => {
    e.preventDefault();
    const body = { name: f.name.value, size: f.size.value, price: f.price.value, cost: f.cost.value, stock: f.stock.value, unit: f.unit.value, cat: f.cat.value, isNew: f.isNew.checked };
    if (f.active) body.active = f.active.checked;
    if (image) body.image = image;
    const btn = $('button[type=submit]', f); btn.classList.add('spin'); btn.disabled = true;
    try { await api(isNew ? '/admin/products' : '/admin/products/' + encodeURIComponent(p.id), { method: isNew ? 'POST' : 'PUT', body }); s.close(); toast('Saqlandi', 'ok'); done(); }
    catch (err) { toast(err.message, 'err'); btn.classList.remove('spin'); btn.disabled = false; }
  };
}

async function aMonths() {
  let months;
  try { months = (await api('/admin/months')).months; } catch (e) { return errView(e, aProducts); }
  $('#pb').innerHTML = `<p class="muted" style="margin:0 2px 12px;font-size:12px">Hisobot har oy avtomatik yangilanadi va siz o'chirmaguningizcha saqlanadi. <b>Foyda = sotuv narxi − tan narxi</b> (tan narxi tovar sozlamasida kiritiladi).</p>
    <div class="list">${months.map((m) => `<div class="mcard"><div class="mh">${ic('calendar')}<b>${monthName(m.id)}</b><span class="sp"></span><button class="icon-btn" data-r="${m.id}" aria-label="Yangilash">${ic('refresh-cw')}</button><button class="icon-btn" data-d="${m.id}" aria-label="O'chirish" style="color:var(--err)">${ic('trash-2')}</button></div>
      <div class="g"><div><small>Zakazlar soni</small><b>${m.orders}</b></div><div><small>Sotuv summasi</small><b>${money(m.sales)}</b></div><div><small>Foyda</small><b class="ok" style="color:var(--ok)">${money(m.profit)}</b></div><div><small>Kelgan pul</small><b>${money(m.cash)}</b></div></div>
      ${m.noCost ? `<div class="hint warn" style="margin-top:10px">${ic('triangle-alert')} ${m.noCost} ta sotuvda tan narxi kiritilmagan — foyda aniq emas.</div>` : ''}</div>`).join('')}</div>`;
  $('#pb').onclick = async (e) => {
    const r = e.target.closest('[data-r]'), d = e.target.closest('[data-d]');
    if (r) { try { await api(`/admin/months/${r.dataset.r}/refresh`, { method: 'POST' }); toast('Yangilandi', 'ok'); aProducts(); } catch (err) { toast(err.message, 'err'); } }
    if (d && await confirmBox("Hisobotni o'chirish", `${monthName(d.dataset.d)} oyi hisoboti o'chiriladi. Davom etasizmi?`, "O'chirish", true)) {
      try { await api(`/admin/months/${d.dataset.d}`, { method: 'DELETE' }); toast("O'chirildi", 'ok'); aProducts(); } catch (err) { toast(err.message, 'err'); }
    }
  };
}

/* ---------- Mijozlar ---------- */
const AU = { seg: 'users', q: '' };
async function aUsers() {
  const v = $('#view');
  v.innerHTML = `<div class="page"><div class="seg" style="margin-bottom:14px"><button data-s="users" class="${AU.seg === 'users' ? 'on' : ''}">Mijozlar</button><button data-s="debts" class="${AU.seg === 'debts' ? 'on' : ''}">Qarzdorlar</button></div><div id="ub">${'<div class="skel"></div>'.repeat(2)}</div></div>`;
  $$('.seg button', v).forEach((b) => (b.onclick = () => { AU.seg = b.dataset.s; aUsers(); }));
  G.reload = aUsers;
  try {
    if (AU.seg === 'debts') {
      const r = await api('/admin/debts');
      $('#ub').innerHTML = `<div class="tiles" style="margin-bottom:12px"><div class="tile">${ic('wallet')}<small>Jami qarz</small><b>${money(clampR(r.debts.reduce((s, o) => s + o.owed, 0)))}</b></div><div class="tile">${ic('users')}<small>Qarzdorlar</small><b>${r.debts.length}</b></div></div>
        <div class="list cols" id="dl">${r.debts.length ? r.debts.map((o) => ocHtml(o, o.debt.dueAt && o.debt.dueAt < Date.now())).join('') : `<div class="empty" style="grid-column:1/-1">${ic('circle-check')}<p style="margin:0">Qarzdorlar yo'q</p></div>`}</div>`;
      bindOrderList($('#dl'), r.debts, aUsers);
      return;
    }
    const r = await api('/admin/users');
    $('#ub').innerHTML = `<div class="row" style="margin-bottom:10px"><div class="tile sp" style="padding:10px 14px">${ic('users')}<small>Foydalanuvchilar soni</small><b style="font-size:26px">${r.users.length}</b></div></div>
      <div class="search" style="margin-bottom:12px">${ic('search')}<input id="uq" placeholder="Ism, akkaunt yoki telefon…" value="${esc(AU.q)}"></div><div class="list cols" id="ul"></div>`;
    const draw = () => {
      const q = AU.q.toLowerCase().trim();
      const arr = r.users.filter((u) => !q || `${u.name} ${u.username} ${u.phone} ${u.region}`.toLowerCase().includes(q));
      $('#ul').innerHTML = arr.map((u) => `<div class="uc" data-u="${u.id}"><div class="av">${u.avatar ? `<img src="${esc(asset(u.avatar))}" alt="">` : initial(u.name)}</div><div style="min-width:0"><div class="n">${esc(u.name)}${u.blocked ? ' <span class="err">· bloklangan</span>' : ''}</div><div class="s">@${esc(u.username)} · ${esc(phoneShow(u.phone))}</div><div class="s">${esc(u.region)}</div></div>
        <div class="r">${u.consent ? `<span class="st-chip ok">${ic('check')} rozi</span>` : ''}${u.stats.owed > 0 ? `<div class="warn" style="font:700 15px var(--serif);margin-top:4px">${money(u.stats.owed)}</div>` : `<div class="dim" style="font-size:11px;margin-top:4px">${u.stats.orders} zakaz</div>`}</div></div>`).join('') || `<div class="empty" style="grid-column:1/-1"><p style="margin:0">Mijoz topilmadi</p></div>`;
    };
    draw();
    $('#uq').oninput = (e) => { AU.q = e.target.value; draw(); };
    $('#ul').onclick = (e) => { const c = e.target.closest('[data-u]'); if (c) userSheet(c.dataset.u); };
  } catch (e) { errView(e, aUsers); }
}

async function userSheet(id) {
  let r;
  try { r = await api('/admin/users/' + id); } catch (e) { return toast(e.message, 'err'); }
  const u = r.user;
  const s = openSheet(`${sheetTitle(esc(u.name))}
    <div class="me" style="padding:0 0 12px"><div class="ava" style="width:84px;height:84px"><div class="in" style="font-size:34px">${u.avatar ? `<img src="${esc(asset(u.avatar))}" alt="">` : initial(u.name)}</div></div><div class="un" style="margin-top:8px">@${esc(u.username)}</div></div>
    <div class="kvs"><div><span>Telefon</span><b><a class="gold" href="tel:${esc(u.phone)}">${esc(phoneShow(u.phone))}</a></b></div><div><span>Viloyat</span><b>${esc(u.region)}</b></div>${u.address ? `<div><span>Manzil</span><b>${esc(u.address)}</b></div>` : ''}<div><span>Ro'yxatdan o'tgan</span><b>${fmtDT(u.createdAt)}</b></div>
      <div><span>Qarz shartiga rozilik (chekboks)</span><b>${u.consent ? `<span class="ok">✓ Ha</span> · ${fmtDT(u.consent.at)}` : "Yo'q (qarz olmagan)"}</b></div><div><span>Telegram</span><b>${u.tg ? 'ulangan' : 'ulanmagan'}</b></div>
      <div><span>Zakazlar / jami</span><b>${u.stats.orders} ta · ${money(u.stats.spent)}</b></div><div><span>Qarzi</span><b class="${u.stats.owed ? 'warn' : ''}">${money(u.stats.owed)}</b></div></div>
    <div class="acts"><button class="btn ghost" id="blk">${ic('ban')} ${u.blocked ? 'Blokdan chiqarish' : 'Bloklash'}</button><button class="btn ghost" id="rpw">${ic('lock')} Parolni tiklash</button></div>
    <div class="sect">Tarixi (${r.orders.length})</div><div class="list" id="uo">${r.orders.map((o) => ocHtml(o)).join('') || '<p class="muted">Zakaz yo\'q</p>'}</div>`, { cls: 'wide' });
  bindOrderList($('#uo', s.el), r.orders, () => { s.close(); userSheet(id); });
  $('#blk', s.el).onclick = async () => { try { await api(`/admin/users/${id}/block`, { method: 'POST', body: { blocked: !u.blocked } }); s.close(); toast(u.blocked ? 'Blokdan chiqarildi' : 'Bloklandi', 'ok'); aUsers(); } catch (e) { toast(e.message, 'err'); } };
  $('#rpw', s.el).onclick = () => {
    const s2 = openSheet(`${sheetTitle('Yangi parol')}<label class="field"><span>Mijoz uchun yangi parol</span><div class="inp">${ic('lock')}<input id="np" placeholder="kamida 6 ta belgi"></div></label><button class="btn block" id="sv">${ic('save')} Saqlash</button>`);
    $('#sv', s2.el).onclick = async () => { try { await api(`/admin/users/${id}/password`, { method: 'POST', body: { password: $('#np', s2.el).value } }); s2.close(); toast("Parol o'zgartirildi", 'ok'); } catch (e) { toast(e.message, 'err'); } };
  };
}

/* ---------- Sozlamalar / Admin profili ---------- */
async function aSettings() {
  const v = $('#view');
  v.innerHTML = skeleton(4);
  let c;
  try { c = await api('/admin/settings'); } catch (e) { return errView(e, aSettings); }
  G.reload = null;
  const pay = (id, label) => `<div class="mcard" style="margin-bottom:10px"><div class="mh"><b style="font-size:19px">${label}</b></div>
    <label class="field"><span>Karta / telefon raqam</span><div class="inp np"><input name="${id}_card" value="${esc(c.pay[id].card)}" placeholder="8600 0000 0000 0000"></div></label>
    <label class="field"><span>Qabul qiluvchi</span><div class="inp np"><input name="${id}_holder" value="${esc(c.pay[id].holder)}"></div></label>
    <label class="field" style="margin:0"><span>Ilova havolasi (ixtiyoriy)</span><div class="inp np"><input name="${id}_link" value="${esc(c.pay[id].link)}" placeholder="https://..."></div></label></div>`;
  v.innerHTML = `<div class="page"><div class="page-title">Admin profili</div>
    <div class="info"><div class="it">${ic('user')}<div><small>Admin</small>${esc(G.me.username)}</div></div><div class="it">${ic('send')}<div><small>Telegram xabarnomalari</small>${c.telegramLinked ? '<span class="ok">ulangan ✓</span>' : c.hasBot ? '<span class="warn">ulanmagan</span>' : '<span class="dim">bot o\'chiq (BOT_TOKEN yo\'q)</span>'}</div></div></div>
    <div class="acts"><button class="btn ghost" id="apw">${ic('lock')} Parolni o'zgartirish</button><button class="btn ghost" id="alink">${ic('send')} Telegramga ulash</button></div>
    <form id="sf" novalidate><div class="sect">To'lov rekvizitlari</div>${pay('payme', 'Payme')}${pay('click', 'Click')}${pay('paynet', 'Paynet')}
    <div class="sect">Dollar kursi</div><label class="field"><span>1$ = necha so'm</span><div class="inp np"><input name="rate" inputmode="numeric" value="${c.usdRate}"></div></label>
    <div class="sect">Aloqa</div><label class="field"><span>Telefon</span><div class="inp np"><input name="phone" value="${esc(c.contact.phone)}"></div></label>
    <label class="field"><span>WhatsApp raqam (998...)</span><div class="inp np"><input name="wa" value="${esc(c.contact.whatsapp)}"></div></label>
    <label class="field"><span>Telegram username</span><div class="inp np"><input name="tgu" value="${esc(c.contact.telegram)}" placeholder="username"></div></label>
    <label class="field"><span>Instagram username</span><div class="inp np"><input name="ig" value="${esc(c.contact.instagram)}" placeholder="username"></div></label>
    <div class="sect">Qarz shartlari</div><div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px"><label class="field"><span>Boshlang'ich %</span><div class="inp np"><input name="pc" inputmode="numeric" value="${c.debt.percent}"></div></label><label class="field"><span>Muddat (kun)</span><div class="inp np"><input name="dy" inputmode="numeric" value="${c.debt.days}"></div></label><label class="field"><span>Maks. qarz</span><div class="inp np"><input name="mx" inputmode="numeric" value="${c.debt.max}"></div></label></div>
    <label class="field"><span>Rozilik matni (chekboks)</span><textarea class="plain" name="txt" rows="4">${esc(c.debt.text)}</textarea></label>
    <button class="btn block" type="submit">${ic('save')} Saqlash</button></form>
    <button class="btn ghost block" style="margin-top:22px" id="lo">${ic('log-out')} Chiqish</button></div>`;
  $('#apw').onclick = changePassword;
  $('#lo').onclick = async () => { if (await confirmBox('Chiqish', 'Admin paneldan chiqasizmi?', 'Chiqish')) G.logout(); };
  $('#alink').onclick = async () => {
    try {
      const r = await api('/admin/link-code', { method: 'POST' });
      openSheet(`${sheetTitle('Telegramga ulash')}<p class="muted" style="margin:0 0 14px;font-size:13px">Botga o'ting va quyidagi buyruqni yuboring (kod ${r.minutes} daqiqa amal qiladi). Shundan so'ng yangi zakaz va chek shu yerga keladi.</p><div class="req"><div class="r1"><div class="card-no gold">/admin ${r.code}</div></div></div><p class="dim" style="font-size:12px;margin:0">Yoki Telegram ichidagi Mini App orqali admin sifatida kirsangiz, avtomatik ulanadi.</p>`);
    } catch (e) { toast(e.message, 'err'); }
  };
  const f = $('#sf');
  f.onsubmit = async (e) => {
    e.preventDefault();
    const g = (n) => f[n].value;
    const btn = $('button[type=submit]', f); btn.classList.add('spin'); btn.disabled = true;
    try {
      await api('/admin/settings', { method: 'PUT', body: {
        usdRate: g('rate'),
        pay: Object.fromEntries(['payme', 'click', 'paynet'].map((k) => [k, { card: g(k + '_card'), holder: g(k + '_holder'), link: g(k + '_link') }])),
        contact: { phone: g('phone'), whatsapp: g('wa'), telegram: g('tgu'), instagram: g('ig') },
        debt: { percent: g('pc'), days: g('dy'), max: g('mx'), text: g('txt') }
      } });
      G.cfg = await api('/config'); toast('Sozlamalar saqlandi', 'ok');
    } catch (err) { toast(err.message, 'err'); }
    btn.classList.remove('spin'); btn.disabled = false;
  };
}

G.adminViews = { today: aToday, history: aHistory, products: aProducts, users: aUsers, settings: aSettings };
