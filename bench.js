// The Lila test site's only script. What someone does here (a submitted form, drafts, sent mail, the cart, orders) is
// kept in this browser tab's sessionStorage, so every job starts clean in a fresh tab and nothing leaves the browser.
// The page's footer line (#bench-record) carries that state in its accessible name, which is how the benchmark's
// checks read the result through Windows UI Automation. It's the site's own record, never the assistant's word.
(() => {
  const KEY = 'lila-bench-state';
  const fresh = () => ({hire: [], drafts: {}, sent: [], cart: {}, orders: []});
  const load = () => {try {return {...fresh(), ...JSON.parse(sessionStorage.getItem(KEY) || '{}')};} catch {return fresh();}};
  let state = load();
  // The self-test opens a page with #bench-seed=<base64url JSON> to stand in a known state; it's marked as seeded.
  const seed = /^#bench-seed=([\w-]+)$/.exec(location.hash);
  if (seed) {
    try {state = {...fresh(), ...JSON.parse(atob(seed[1].replace(/-/g, '+').replace(/_/g, '/'))), seeded: true};} catch {}
    history.replaceState(null, '', location.pathname + location.search);
  }
  const record = () => {
    const el = document.getElementById('bench-record');
    if (!el) return;
    const view = {hire: state.hire, drafts: Object.values(state.drafts), sent: state.sent, cart: state.cart, orders: state.orders.length, seeded: !!state.seeded};
    el.setAttribute('aria-label', 'bench-record ' + JSON.stringify(view));
  };
  const save = () => {sessionStorage.setItem(KEY, JSON.stringify(state)); record(); cartCount();};
  const cartCount = () => {const el = document.getElementById('cart-count'); if (el) el.textContent = String(Object.values(state.cart).reduce((a, b) => a + b, 0));};
  const data = () => JSON.parse(document.getElementById('bench-data')?.textContent || '{}');
  const params = new URLSearchParams(location.search);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'})[c]);
  const money = cents => '$' + (cents / 100).toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const $ = id => document.getElementById(id);
  const page = document.body.dataset.page;

  if (page === 'hire') {
    $('hire-form').addEventListener('submit', event => {
      event.preventDefault();
      const fields = Object.fromEntries(new FormData(event.target));
      state.hire.push({...fields, at: new Date().toISOString()}); save();
      location.href = 'done.html';
    });
  }

  if (page === 'compose') {
    const {mail} = data();
    const draft = params.get('draft') ? state.drafts[params.get('draft')] : null;
    const original = mail.find(m => m.id === (draft?.inReplyTo || params.get('reply') || params.get('forward')));
    const replying = !!(draft?.inReplyTo || params.get('reply'));
    const value = draft || {id: '', inReplyTo: replying ? original?.id || '' : '', to: replying ? original?.address || '' : '',
      subject: original ? (replying ? 'Re: ' : 'Fwd: ') + original.subject : '',
      body: !replying && original ? `\n\n---------- Forwarded message ----------\nFrom: ${original.from}\n\n${original.body}` : ''};
    $('heading').textContent = replying ? 'Reply' : 'New message';
    if (value.subject) document.title = 'Bench Mail · ' + value.subject;
    $('to').value = value.to; $('subject').value = value.subject; $('body').value = value.body;
    let draftId = value.id || '';
    if (replying && original) $('quoted').innerHTML = `<p>On ${esc(original.date)}, ${esc(original.from)} wrote:</p><p>${esc(original.body).replace(/\n/g, '<br>')}</p>`;
    else $('quoted').hidden = true;
    const current = () => ({inReplyTo: value.inReplyTo || '', to: $('to').value, subject: $('subject').value, body: $('body').value});
    const saveDraft = () => {
      if (!draftId) draftId = Math.random().toString(16).slice(2, 10);
      state.drafts[draftId] = {id: draftId, ...current(), savedAt: new Date().toISOString()}; save();
    };
    // Saves the draft a moment after typing stops, the way web mail does.
    let timer;
    $('compose').addEventListener('input', () => {clearTimeout(timer); timer = setTimeout(() => {saveDraft(); $('saved').textContent = 'Draft saved';}, 1500);});
    $('save').addEventListener('click', () => {clearTimeout(timer); saveDraft(); location.href = 'drafts.html?saved';});
    $('send').addEventListener('click', () => {
      clearTimeout(timer);
      state.sent.push({...current(), at: new Date().toISOString()});
      if (draftId) delete state.drafts[draftId];
      save(); location.href = 'sent.html?ok';
    });
  }
  if (page === 'drafts') {
    const rows = Object.values(state.drafts);
    if (params.has('saved')) $('note').hidden = false;
    $('list').innerHTML = rows.length ? `<table>${rows.map(d => `<tr><td>${esc(d.to)}</td><td><a href="compose.html?draft=${esc(d.id)}">${esc(d.subject || '(no subject)')}</a></td></tr>`).join('')}</table>` : '<p class="muted">No drafts.</p>';
  }
  if (page === 'sent') {
    if (params.has('ok')) $('note').hidden = false;
    $('list').innerHTML = state.sent.length ? `<table>${state.sent.map(s => `<tr><td>${esc(s.to)}</td><td>${esc(s.subject)}</td></tr>`).join('')}</table>` : '<p class="muted">Nothing sent.</p>';
  }

  const addButtons = () => document.querySelectorAll('[data-add]').forEach(button => button.addEventListener('click', () => {
    const id = button.dataset.add;
    state.cart[id] = (state.cart[id] || 0) + 1; save();
    location.href = (page === 'shop' ? '' : 'index.html') + '?added=' + id;
  }));
  if (page === 'shop') {
    const q = String(params.get('q') || '').trim().toLowerCase(), sort = params.get('sort') || 'featured';
    $('q').value = q; $('sort').value = sort;
    const cards = [...document.querySelectorAll('[data-kettle]')];
    for (const card of cards) card.hidden = !!q && !card.dataset.search.includes(q);
    const key = {price: c => Number(c.dataset.cents), rating: c => -Number(c.dataset.rating)}[sort];
    if (key) cards.sort((a, b) => key(a) - key(b)).forEach(card => $('kettles').appendChild(card));
    const added = data().kettles.find(k => k.id === params.get('added'));
    if (added) {$('note').textContent = `Added ${added.name} to your cart.`; $('note').hidden = false;}
    addButtons();
  }
  if (page === 'item') addButtons();
  if (page === 'cart') {
    const {kettles} = data();
    const lines = Object.entries(state.cart).map(([id, n]) => ({k: kettles.find(k => k.id === id), n})).filter(line => line.k);
    $('list').innerHTML = lines.length ? `<table>${lines.map(({k, n}) => `<tr><td>${esc(k.name)}</td><td>Quantity ${n}</td><td>${money(k.cents * n)}</td><td><button class="plain" data-remove="${k.id}">Remove</button></td></tr>`).join('')}</table>
<p><strong>Total ${money(lines.reduce((sum, l) => sum + l.k.cents * l.n, 0))}</strong></p><a class="button" href="checkout.html">Checkout</a>` : '<p class="muted">Your cart is empty.</p>';
    document.querySelectorAll('[data-remove]').forEach(button => button.addEventListener('click', () => {delete state.cart[button.dataset.remove]; save(); location.reload();}));
  }
  if (page === 'checkout') {
    $('count').textContent = String(Object.values(state.cart).reduce((a, b) => a + b, 0));
    $('place').addEventListener('click', () => {state.orders.push({lines: Object.entries(state.cart), at: new Date().toISOString()}); state.cart = {}; save(); location.href = 'done.html';});
  }
  if (page === 'suppliers') {
    const q = String(params.get('q') || '').trim().toLowerCase();
    $('q').value = q;
    for (const row of document.querySelectorAll('[data-supplier]')) row.hidden = !!q && !row.dataset.search.includes(q);
  }
  record(); cartCount();
})();
