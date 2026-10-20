(() => {
  const KEY = 'lila-bench-cf', steps = JSON.parse(document.getElementById('cf-steps').textContent);
  const params = new URLSearchParams(location.search);
  const fresh = () => ({job: '', startedAt: '', submitted: null, claimNumber: null, step: 1, rows: 1, errors: []});
  if (params.has('reset')) {localStorage.setItem(KEY, JSON.stringify({...fresh(), job: String(params.get('job') || '').slice(0, 40), startedAt: new Date().toISOString()})); history.replaceState(null, '', location.pathname);}
  let state; try {state = {...fresh(), ...JSON.parse(localStorage.getItem(KEY) || '{}')};} catch {state = fresh();}
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const save = () => {localStorage.setItem(KEY, JSON.stringify(state)); $('#bench-record').setAttribute('aria-label', 'bench-record ' + JSON.stringify({cf: state}));};
  const files = {};
  const valueOf = id => {
    const radios = $$('input[type=radio][name="' + id + '"]');
    if (radios.length) return radios.find(r => r.checked)?.value || '';
    const el = document.getElementById(id);
    if (!el) return undefined;
    if (el.type === 'checkbox') return el.checked;
    if (el.type === 'file') return el.files?.[0]?.name || '';
    return el.value;
  };
  const allValues = () => {
    const out = {};
    for (const s of steps) {for (const f of s.fields) out[f.id] = valueOf(f.id); if (s.rows) for (let n = 1; n <= state.rows; n++) for (const f of s.rows.fields) out[s.rows.id + n + '_' + f.id] = valueOf(s.rows.id + n + '_' + f.id);}
    return out;
  };
  const conditions = () => $$('[data-show-if]').forEach(el => {const [id, want] = el.dataset.showIf.split('='); el.hidden = valueOf(id) !== want;});
  const visible = step => [...step.querySelectorAll('[data-field]')].filter(el => !el.hidden && !el.closest('[hidden]'));
  const problemsOf = (i) => {
    const s = steps[i - 1], section = $('[data-step="' + i + '"]'), out = [];
    const defs = Object.fromEntries(s.fields.map(f => [f.id, f]));
    if (s.rows) for (let n = 1; n <= state.rows; n++) for (const f of s.rows.fields) defs[s.rows.id + n + '_' + f.id] = {...f, label: f.label.replace('{n}', n)};
    for (const el of visible(section)) {
      const id = el.dataset.field, f = defs[id]; if (!f) continue;
      const v = valueOf(id);
      if (f.required && (v === '' || v === false || v === undefined)) out.push(f.label + ' is required.');
      else if (f.pattern && v && !new RegExp(f.pattern).test(v)) out.push(f.label + ' does not look right.');
      else if (f.type === 'number' && v && !/^\d+(?:\.\d{1,2})?$/.test(v)) out.push(f.label + ' must be a number.');
    }
    return out;
  };
  const addRow = () => {
    const t = document.getElementById('cost-row'), rows = document.getElementById('cost-rows');
    if (!t || rows.children.length >= Number(rows.dataset.most)) return;
    const n = rows.children.length + 1;
    rows.insertAdjacentHTML('beforeend', t.innerHTML.replaceAll('{n}', String(n)));
    state.rows = n; save();
  };
  const review = () => {
    const values = allValues(), list = [];
    for (const s of steps.slice(0, -1)) {
      for (const f of s.fields) {const el = document.querySelector('[data-field="' + f.id + '"]'); if (el?.hidden || f.type === 'password') continue; const v = values[f.id]; if (v === '' || v === undefined) continue; list.push([f.label, f.type === 'file' ? v + ' (attached)' : v]);}
      if (s.rows) for (let n = 1; n <= state.rows; n++) for (const f of s.rows.fields) {const v = values[s.rows.id + n + '_' + f.id]; if (v) list.push([f.label.replace('{n}', n), v]);}
    }
    $('#review').innerHTML = list.map(([k, v]) => '<dt>' + k.replace(/[&<>]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;'})[c]) + '</dt><dd>' + String(v).replace(/[&<>]/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;'})[c]) + '</dd>').join('');
  };
  const show = i => {
    $$('.step').forEach(s => {s.hidden = s.dataset.step !== String(i);});
    state.step = i; save();
    if (i === steps.length) review();
    history.replaceState(null, '', location.pathname + '#step-' + i);
    document.title = 'Quillfeather claim, step ' + i + ' of ' + steps.length + ' (test site)';
  };
  async function sha(file) {try {return [...new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer()))].map(b => b.toString(16).padStart(2, '0')).join('');} catch {return '';}}
  document.addEventListener('change', async event => {
    conditions();
    const el = event.target;
    if (el.type === 'file' && el.files?.[0]) files[el.id] = {name: el.files[0].name, size: el.files[0].size, sha256: await sha(el.files[0])};
    const submit = $('#submit'); if (submit) submit.disabled = !(valueOf('certify') === true && String(valueOf('signature') || '').trim());
  });
  document.addEventListener('input', () => {const submit = $('#submit'); if (submit) submit.disabled = !(valueOf('certify') === true && String(valueOf('signature') || '').trim());});
  $$('[data-next]').forEach(b => b.addEventListener('click', () => {
    const i = Number(b.closest('.step').dataset.step), problems = problemsOf(i);
    b.closest('.step').querySelector('.problems').textContent = problems.join(' ');
    if (problems.length) {state.errors.push({step: i, problems}); save(); return;}
    show(i + 1);
  }));
  $$('[data-back]').forEach(b => b.addEventListener('click', () => show(Number(b.closest('.step').dataset.step) - 1)));
  document.getElementById('cost-add')?.addEventListener('click', addRow);
  $('#submit')?.addEventListener('click', () => {
    if (valueOf('certify') !== true || !String(valueOf('signature') || '').trim()) return;
    state.submitted = {...allValues(), files: {...files}, at: new Date().toISOString()};
    delete state.submitted.track_password;
    state.claimNumber = 'QF-WEB-' + String(Math.floor(10000 + Math.random() * 89999));
    $('#claim-number').textContent = 'Your claim number is ' + state.claimNumber + '.';
    save(); show('done');
  });
  addRow();
  conditions(); save(); show(1);
})();
