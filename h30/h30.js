// The hard-30 pages' only script (served as /h30/h30.js on the Lila test site). What someone does here (forms sent,
// drafts, sent mail, carts, orders, flight holds, payments, returns, calendar moves) is kept in this browser's
// localStorage for the test site, so every tab and window sees the same record and nothing leaves the browser. The
// bench opens /h30/reset.html?job=<id> before each job, which empties it and notes the job. Every page shows the record
// in its footer line (#bench-record, in the line's accessible name, read by the checks through UI Automation) and as a
// "Bench receipt" (the record, compressed, with a checksum) that a person can copy from an assistant that browses
// somewhere else. It's the site's own record, never the assistant's word.
(() => {
  const KEY = 'lila-bench-h30';
  const fresh = () => ({job: '', startedAt: '', forms: {}, drafts: {}, sent: [], carts: {}, orders: [], holds: [], payments: [], returns: [], events: {}, consent: {}});
  const load = () => {try {return {...fresh(), ...JSON.parse(localStorage.getItem(KEY) || '{}')};} catch {return fresh();}};
  let state = load();
  const params = new URLSearchParams(location.search);
  const page = document.body.dataset.page || '';
  // The self-test opens a page with #bench-seed=<base64url JSON> to stand in a known state; it's marked as seeded.
  const seed = /^#bench-seed=([\w-]+)$/.exec(location.hash);
  if (seed) {
    try {state = {...fresh(), ...JSON.parse(decodeURIComponent(escape(atob(seed[1].replace(/-/g, '+').replace(/_/g, '/'))))), seeded: true}; localStorage.setItem(KEY, JSON.stringify(state));} catch {}
    history.replaceState(null, '', location.pathname + location.search);
  }
  if (page === 'reset') {
    state = {...fresh(), job: String(params.get('job') || '').slice(0, 40), startedAt: new Date().toISOString()};
    localStorage.setItem(KEY, JSON.stringify(state));
  }
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[c]);
  const money = cents => '$' + (cents / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const $ = id => document.getElementById(id);
  const data = () => JSON.parse($('bench-data')?.textContent || '{}');
  const clip = (s, n = 800) => String(s ?? '').slice(0, n);

  const view = () => ({job: state.job, startedAt: state.startedAt, seeded: !!state.seeded, forms: state.forms,
    drafts: Object.values(state.drafts).map(d => ({...d, body: clip(d.body)})), sent: state.sent.map(s => ({...s, body: clip(s.body)})), carts: state.carts,
    orders: state.orders.length, holds: state.holds, payments: state.payments.length, returns: state.returns, events: state.events});
  const CRC = (() => {const t = []; for (let n = 0; n < 256; n++) {let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0;} return t;})();
  const crc32 = bytes => {let c = -1; for (const b of bytes) c = CRC[(c ^ b) & 0xff] ^ (c >>> 8); return ((c ^ -1) >>> 0).toString(16).padStart(8, '0');};
  async function receipt(json) {
    const bytes = new TextEncoder().encode(json);
    let packed = bytes;
    if (window.CompressionStream) packed = new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate-raw'))).arrayBuffer());
    let b64 = ''; for (let i = 0; i < packed.length; i += 0x8000) b64 += String.fromCharCode(...packed.subarray(i, i + 0x8000));
    return `H30${window.CompressionStream ? 'z' : 'j'}.${btoa(b64).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')}.${crc32(bytes)}`;
  }
  const record = () => {
    const json = JSON.stringify({h30: view()});
    const el = $('bench-record');
    if (el) el.setAttribute('aria-label', 'bench-record ' + json);
    const out = $('bench-receipt');
    if (out) receipt(json).then(text => {out.textContent = 'Bench receipt: ' + text;}).catch(() => {});
  };
  const save = () => {localStorage.setItem(KEY, JSON.stringify(state)); record(); counts();};
  // Another tab changed the record: show it here too.
  window.addEventListener('storage', event => {if (event.key === KEY) {state = load(); record(); counts();}});
  const counts = () => document.querySelectorAll('[data-cart-count]').forEach(el => {el.textContent = String(Object.values(state.carts[el.dataset.cartCount] || {}).reduce((a, b) => a + b, 0));});
  async function fileFacts(file) {
    let sha256 = '';
    try {sha256 = [...new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer()))].map(b => b.toString(16).padStart(2, '0')).join('');} catch {}
    return {name: file.name, size: file.size, sha256};
  }
  const formFields = form => {
    const out = {};
    for (const el of form.elements) {
      if (!el.name || el.type === 'file' || el.type === 'submit' || el.type === 'button') continue;
      if (el.type === 'checkbox') {if (el.checked) out[el.name] = out[el.name] ? [].concat(out[el.name], el.value) : el.value; continue;}
      if (el.type === 'radio') {if (el.checked) out[el.name] = el.value; continue;}
      out[el.name] = el.value;
    }
    return out;
  };

  // --- Forms: <form data-form="name" data-done="page">, checked against each field's rules before it is kept. ----------
  document.querySelectorAll('form[data-form]').forEach(form => form.addEventListener('submit', async event => {
    event.preventDefault();
    const errors = [];
    for (const el of form.elements) {
      if (!el.name) continue;
      const label = el.dataset.label || el.name;
      if (el.required && (el.type === 'file' ? !el.files.length : !String(el.value).trim())) errors.push(`${label} is required.`);
      else if (el.dataset.pattern && el.value && !new RegExp(el.dataset.pattern).test(el.value.trim())) errors.push(el.dataset.message || `${label} doesn't look right.`);
    }
    const box = form.querySelector('.errors');
    if (errors.length) {if (box) {box.innerHTML = errors.map(e => `<p>${esc(e)}</p>`).join(''); box.hidden = false;} return;}
    const entry = {...formFields(form), at: new Date().toISOString()};
    for (const el of form.querySelectorAll('input[type=file]')) if (el.files.length) entry[el.name] = await Promise.all([...el.files].map(fileFacts));
    (state.forms[form.dataset.form] ||= []).push(entry); save();
    location.href = form.dataset.done || 'done.html';
  }));

  // --- Mail (data-mailbox on the body) ---------------------------------------------------------------------------------
  const mailbox = document.body.dataset.mailbox;
  if (page === 'compose') {
    const {mail} = data();
    const draft = params.get('draft') ? state.drafts[params.get('draft')] : null;
    const original = mail.find(m => m.id === (draft?.inReplyTo || params.get('reply') || params.get('forward')));
    const replying = !!(draft?.inReplyTo || params.get('reply'));
    const value = draft || {id: '', inReplyTo: replying ? original?.id || '' : '', to: replying ? original?.address || '' : '',
      subject: original ? (replying ? 'Re: ' : 'Fwd: ') + original.subject : '', attachments: [],
      body: !replying && original ? `\n\n---------- Forwarded message ----------\nFrom: ${original.from}\n\n${original.body}` : ''};
    $('heading').textContent = replying ? 'Reply' : draft ? 'Draft' : 'New message';
    if (value.subject) document.title = document.title.split(' · ')[0] + ' · ' + value.subject;
    $('to').value = value.to; $('subject').value = value.subject; $('body').value = value.body;
    let draftId = value.id || '', attachments = value.attachments || [];
    const showAttachments = () => {$('attached').innerHTML = attachments.length ? attachments.map(a => `<li>${esc(a.name)} (${Math.max(1, Math.round(a.size / 1024))} KB)</li>`).join('') : '<li class="muted">No attachments</li>';};
    showAttachments();
    if (replying && original) $('quoted').innerHTML = `<p>On ${esc(original.date)}, ${esc(original.from)} wrote:</p><p>${esc(original.body).replace(/\n/g, '<br>')}</p>`;
    else $('quoted').hidden = true;
    const current = () => ({mailbox, inReplyTo: value.inReplyTo || '', to: $('to').value, subject: $('subject').value, body: $('body').value, attachments});
    const saveDraft = () => {
      if (!draftId) draftId = Math.random().toString(16).slice(2, 10);
      state.drafts[draftId] = {id: draftId, ...current(), savedAt: new Date().toISOString()}; save();
    };
    let timer;
    $('compose').addEventListener('input', event => {if (event.target.type === 'file') return; clearTimeout(timer); timer = setTimeout(() => {saveDraft(); $('saved').textContent = 'Draft saved';}, 1200);});
    $('attach').addEventListener('change', async () => {
      const added = await Promise.all([...$('attach').files].map(fileFacts));
      attachments = [...attachments.filter(a => !added.some(b => b.name === a.name)), ...added];
      $('attach').value = ''; showAttachments(); saveDraft(); $('saved').textContent = 'Draft saved';
    });
    $('save').addEventListener('click', () => {clearTimeout(timer); saveDraft(); location.href = 'drafts.html?saved';});
    $('send').addEventListener('click', () => {
      clearTimeout(timer);
      state.sent.push({...current(), at: new Date().toISOString()});
      if (draftId) delete state.drafts[draftId];
      save(); location.href = 'sent.html?ok';
    });
  }
  if (page === 'drafts') {
    const rows = Object.values(state.drafts).filter(d => d.mailbox === mailbox);
    if (params.has('saved')) $('note').hidden = false;
    $('list').innerHTML = rows.length ? `<table>${rows.map(d => `<tr><td>${esc(d.to)}</td><td><a href="compose.html?draft=${esc(d.id)}">${esc(d.subject || '(no subject)')}</a></td><td class="muted">${d.attachments?.length ? '📎 ' + d.attachments.map(a => esc(a.name)).join(', ') : ''}</td></tr>`).join('')}</table>` : '<p class="muted">No drafts.</p>';
  }
  if (page === 'sent') {
    const rows = state.sent.filter(s => s.mailbox === mailbox);
    if (params.has('ok')) $('note').hidden = false;
    $('list').innerHTML = rows.length ? `<table>${rows.map(s => `<tr><td>${esc(s.to)}</td><td>${esc(s.subject)}</td></tr>`).join('')}</table>` : '<p class="muted">Nothing sent.</p>';
  }

  // --- Shops with a cart (data-shop on the body): Bench Store, with its cookie notice and region dialog ----------------
  const shop = document.body.dataset.shop;
  const modal = (id, show) => {const el = $(id); if (el) el.hidden = !show; document.body.classList.toggle('locked', !!document.querySelector('.modal:not([hidden])'));};
  if (shop) {
    const consent = state.consent[shop] ||= {};
    // The cookie notice covers every page of the shop until it is answered.
    if ($('cookie-modal')) {
      modal('cookie-modal', !consent.cookies);
      document.querySelectorAll('[data-cookies]').forEach(b => b.addEventListener('click', () => {consent.cookies = b.dataset.cookies; save(); modal('cookie-modal', false); if (page === 'product' && !consent.region) setTimeout(() => modal('region-modal', true), 600);}));
    }
    // The region dialog appears on a product page, a moment after it opens, until a region is chosen.
    if ($('region-modal')) {
      if (page === 'product' && consent.cookies && !consent.region) setTimeout(() => modal('region-modal', true), 600);
      $('region-go')?.addEventListener('click', () => {const choice = $('region').value; if (!choice) {$('region-error').hidden = false; return;} consent.region = choice; save(); modal('region-modal', false);});
    }
    document.querySelectorAll('[data-add]').forEach(button => button.addEventListener('click', () => {
      if (document.body.classList.contains('locked')) return;
      const id = button.dataset.add, n = Math.max(1, Math.min(20, parseInt($('qty')?.value || '1', 10) || 1));
      const cart = state.carts[shop] ||= {};
      cart[id] = (cart[id] || 0) + n; save();
      const note = $('note'); if (note) {note.textContent = `Added ${n} to your cart.`; note.hidden = false;}
    }));
    if (page === 'cart') {
      const {items} = data();
      const lines = Object.entries(state.carts[shop] || {}).map(([id, n]) => ({item: items.find(i => i.id === id), n})).filter(l => l.item && l.n > 0);
      $('list').innerHTML = lines.length ? `<table>${lines.map(({item, n}) => `<tr><td>${esc(item.name)}</td><td><input class="qty" type="number" min="0" max="20" value="${n}" data-set="${item.id}" aria-label="Quantity of ${esc(item.name)}"></td><td>${money(item.cents * n)}</td><td><button class="plain" data-remove="${item.id}">Remove</button></td></tr>`).join('')}</table>
<p><strong>Total ${money(lines.reduce((s, l) => s + l.item.cents * l.n, 0))}</strong></p><a class="button" href="checkout.html">Checkout</a>` : '<p class="muted">Your cart is empty.</p>';
      document.querySelectorAll('[data-remove]').forEach(b => b.addEventListener('click', () => {delete state.carts[shop][b.dataset.remove]; save(); location.reload();}));
      document.querySelectorAll('[data-set]').forEach(input => input.addEventListener('change', () => {const n = Math.max(0, Math.min(20, parseInt(input.value, 10) || 0)); if (n) state.carts[shop][input.dataset.set] = n; else delete state.carts[shop][input.dataset.set]; save(); location.reload();}));
    }
    if (page === 'checkout') {
      $('count').textContent = String(Object.values(state.carts[shop] || {}).reduce((a, b) => a + b, 0));
      $('place').addEventListener('click', () => {state.orders.push({shop, lines: Object.entries(state.carts[shop] || {}), at: new Date().toISOString()}); state.carts[shop] = {}; save(); location.href = 'done.html';});
    }
  }

  // --- Bench Track: a slow lookup -------------------------------------------------------------------------------------
  if (page === 'track' && params.get('n')) {
    const n = params.get('n').trim().toUpperCase(), {parcel} = data();
    $('q').value = n; $('result').hidden = false;
    $('result').innerHTML = '<p class="muted" role="status">Looking up your parcel… this can take a little while.</p>';
    setTimeout(() => {if ($('result').dataset.done !== '1') $('result').innerHTML = '<p class="muted" role="status">Still looking. Our tracking service is busy today; please wait.</p>';}, 5000);
    setTimeout(() => {
      $('result').dataset.done = '1';
      $('result').innerHTML = n === parcel.number.toUpperCase()
        ? `<div class="card"><h2>Parcel ${esc(parcel.number)}</h2><p>Status: <strong>${esc(parcel.status)}</strong></p><p>Estimated delivery: <strong>${esc(parcel.deliveryWords)}</strong></p></div>`
        : '<p class="note">No parcel found with that tracking number.</p>';
    }, 11000);
  }

  // --- Bench Travel ----------------------------------------------------------------------------------------------------
  if (page === 'flights') {
    const {flights, route} = data(), from = params.get('from'), to = params.get('to'), date = params.get('date');
    $('from').value = from || ''; $('to').value = to || ''; $('date').value = date || '';
    const match = from === route.from && to === route.to && date === route.date;
    let list = match ? flights.slice() : [];
    const sort = params.get('sort') || 'depart', only = params.get('direct') === '1';
    if (only) list = list.filter(f => !f.stops);
    list.sort(sort === 'price' ? (a, b) => a.cents - b.cents : (a, b) => a.departs.localeCompare(b.departs));
    $('sort').value = sort; $('direct').checked = only;
    $('list').innerHTML = !from ? '' : list.length ? `<table><tr><th>Flight</th><th>Departs</th><th>Arrives</th><th>Stops</th><th>Price</th><th></th></tr>${list.map(f => `<tr><td>${f.id}</td><td>${f.departs}</td><td>${f.arrives}</td><td>${f.stops ? f.stops + ' stop' : 'Direct'}</td><td>${money(f.cents)}</td><td><a class="button" href="book.html?flight=${f.id}&date=${esc(date)}">Select</a></td></tr>`).join('')}</table>` : '<p class="muted">No flights match that search.</p>';
  }
  if (page === 'book') {
    const {flights} = data(), f = flights.find(x => x.id === params.get('flight'));
    if (!f) {$('booking').innerHTML = '<p class="muted">Choose a flight first.</p>';}
    else {
      $('summary').textContent = `${f.id}, ${params.get('date')}, departs ${f.departs}, ${f.stops ? f.stops + ' stop' : 'direct'}, ${money(f.cents)}`;
      const collect = () => ({flight: f.id, date: params.get('date'), ...formFields($('booking'))});
      $('hold').addEventListener('click', () => {
        const b = collect();
        if (!b.name || !b.email || !b.dob) {$('booking-error').hidden = false; return;}
        state.holds.push({...b, at: new Date().toISOString()}); save(); location.href = 'held.html';
      });
      $('pay').addEventListener('click', () => {const b = collect(); state.payments.push({...b, at: new Date().toISOString()}); save(); location.href = 'paid.html';});
    }
  }

  // --- Bench Home returns ------------------------------------------------------------------------------------------------
  if (page === 'return-order') {
    const {order} = data();
    const ok = params.get('order') === order.order && String(params.get('email') || '').trim().toLowerCase() === order.email;
    if (!ok) {$('order').innerHTML = '<p class="note">We couldn\'t find an order with that number and email.</p>'; }
    else {
      $('order').hidden = false;
      $('return-form').addEventListener('submit', event => {
        event.preventDefault();
        const f = formFields(event.target), items = [].concat(f.items || []);
        if (!items.length || !f.reason) {$('return-error').hidden = false; return;}
        state.returns.push({order: order.order, items, reason: f.reason, refund: f.refund, at: new Date().toISOString()}); save(); location.href = 'started.html';
      });
    }
  }

  // --- Bench Calendar: this week and next, from the day it is opened ------------------------------------------------------
  const monday = (() => {const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - ((d.getDay() + 6) % 7)); return d;})();
  const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const eventsNow = () => data().events.map(e => {
    const moved = state.events[e.id];
    if (moved) return {...e, date: moved.date, start: Number(moved.start), hours: Number(moved.hours)};
    const d = new Date(monday); d.setDate(d.getDate() + e.week * 7 + e.day); return {...e, date: iso(d)};
  });
  const hour = h => `${Math.floor(h) % 12 || 12}${h % 1 ? ':30' : ''} ${h < 12 ? 'am' : 'pm'}`;
  if (page === 'calendar') {
    const all = eventsNow(), days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
    $('weeks').innerHTML = [0, 1].map(w => `<h2>${w ? 'Next week' : 'This week'}</h2><table class="cal"><tr><th>Day</th><th>Events</th></tr>${days.map((name, i) => {
      const d = new Date(monday); d.setDate(d.getDate() + w * 7 + i);
      const list = all.filter(e => e.date === iso(d)).sort((a, b) => a.start - b.start);
      return `<tr><td>${name} ${d.toLocaleDateString('en-US', {month: 'long', day: 'numeric'})}</td><td>${list.map(e => `<div>${hour(e.start)} to ${hour(e.start + e.hours)}: <a href="edit.html?id=${e.id}">${esc(e.title)}</a></div>`).join('') || '<span class="muted">Free</span>'}</td></tr>`;
    }).join('')}</table>`).join('');
  }
  if (page === 'event') {
    const e = eventsNow().find(x => x.id === params.get('id'));
    if (!e) $('event').innerHTML = '<p class="muted">No such event.</p>';
    else {
      $('title').textContent = e.title; $('date').value = e.date; $('start').value = String(e.start); $('hours').value = String(e.hours);
      $('event').addEventListener('submit', event => {
        event.preventDefault();
        state.events[e.id] = {title: e.title, date: $('date').value, start: Number($('start').value), hours: Number($('hours').value), at: new Date().toISOString()}; save();
        location.href = 'index.html?saved';
      });
    }
  }
  if (page === 'calendar' && params.has('saved')) $('note').hidden = false;

  if (page === 'reset' && $('ready')) $('ready').textContent = state.job ? `Ready for job ${state.job}.` : 'Ready.';
  record(); counts();
})();
