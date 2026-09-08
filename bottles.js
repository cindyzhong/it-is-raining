(() => {
  const api = (window.BOTTLES_API_URL || '').replace(/\/$/, '');
  const demo = !api;
  const key = 'rain-bottles-v1';
  let state;
  try {
    state = JSON.parse(localStorage.getItem(key) || 'null') || {};
    if (!state.token) state.token = Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join('');
    localStorage.setItem(key, JSON.stringify(state));
  } catch { state = null; }
  const save = () => localStorage.setItem(key, JSON.stringify(state));
  const launcher = document.createElement('button');
  launcher.className = 'bottle-launcher'; launcher.textContent = '♧ 漂流瓶 · Bottles';
  launcher.setAttribute('aria-haspopup', 'dialog');
  const dialog = document.createElement('dialog'); dialog.className = 'bottle-dialog';
  dialog.setAttribute('aria-labelledby', 'bottle-title');
  dialog.innerHTML = `<header><div><p class="bottle-eyebrow">LET A LITTLE KINDNESS DRIFT</p><h2 id="bottle-title">雨中的漂流瓶</h2></div><button type="button" class="bottle-close" aria-label="Close">×</button></header>
    <p class="bottle-intro">留一句话，给另一个听雨的人。<br><span>Leave a thought for someone listening to the rain.</span></p>
    <p class="bottle-demo" ${demo ? '' : 'hidden'}>本地预览 · Demo — messages stay in this browser until Cloudflare is connected.</p>
    <nav aria-label="Bottles"><button data-view="pick">捞一个 · Find</button><button data-view="write">扔一个 · Write</button><button data-view="mine">我的瓶子 · Mine</button></nav>
    <p class="bottle-status" role="status" aria-live="polite"></p><section class="bottle-content"></section>
    <p class="bottle-note">瓶子与回复在此浏览器中找回。清除浏览器数据会失去入口。<br>Return here for replies. No email or notifications while you’re away.</p>`;
  document.body.append(launcher, dialog);
  const content = dialog.querySelector('.bottle-content');
  const status = dialog.querySelector('.bottle-status');
  let busy = false;
  const seeds = [
    { id: 'demo-1', name: '听雨的人', message: '希望你今天也有一个可以安心发呆的角落。', created_at: Date.now(), owner: 'sample' },
    { id: 'demo-2', name: 'Somewhere', message: 'It is raining here too. Wherever you are, I hope tonight feels a little softer.', created_at: Date.now(), owner: 'sample' }
  ];
  async function request(path, body) {
    if (!demo) {
      const response = await fetch(api + path, { method: body ? 'POST' : 'GET', headers: { Authorization: 'Bearer ' + state.token, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(12000) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || 'Please try again later.');
      return data;
    }
    state.bottles ||= []; state.replies ||= [];
    if (path === '/bottles/random') { const bottle = { ...seeds[Math.floor(Math.random() * seeds.length)] }; bottle.replied = state.replies.some(r => r.bottle_id === bottle.id); return { bottle }; }
    if (path === '/bottles/mine') return { bottles: state.bottles.slice().reverse(), replies: state.replies.filter(r => state.bottles.some(b => b.id === r.bottle_id)) };
    const item = { ...body, id: crypto.randomUUID(), created_at: Date.now() };
    if (path === '/bottles') state.bottles.push(item);
    else {
      item.bottle_id = path.split('/')[2];
      if (state.replies.some(r => r.bottle_id === item.bottle_id)) throw new Error('You have already replied to this bottle.');
      state.replies.push(item);
    }
    save(); return item;
  }
  const text = (tag, value, className) => { const el = document.createElement(tag); el.textContent = value; if (className) el.className = className; return el; };
  function card(item) {
    const article = document.createElement('article'); article.className = 'bottle-card';
    article.append(text('p', item.message, 'bottle-message'), text('p', '— ' + item.name, 'bottle-author'), text('time', new Date(item.created_at).toLocaleDateString(), 'bottle-date'));
    return article;
  }
  async function run(action) {
    if (busy) return;
    busy = true; status.textContent = '漂流中… · One moment…';
    dialog.setAttribute('aria-busy', 'true');
    dialog.querySelectorAll('nav button').forEach(b => b.disabled = true);
    try { await action(); } catch (error) { status.textContent = error.name === 'TimeoutError' ? 'Taking too long. Please try again.' : error.message; }
    finally { busy = false; dialog.removeAttribute('aria-busy'); dialog.querySelectorAll('nav button').forEach(b => b.disabled = false); }
  }
  function form(bottle) {
    const el = document.createElement('form'); el.className = 'bottle-form';
    el.innerHTML = `<label>你的名字 · Nickname<input name="nickname" required maxlength="24" autocomplete="nickname" placeholder="听雨的人"></label><label>${bottle ? '回一句 · A reply' : '想说的话 · Your message'}<textarea name="message" required maxlength="300" rows="4" placeholder="此刻，你想说些什么？"></textarea></label><p class="bottle-note">${bottle ? 'Only the bottle’s author can read your reply. One reply per browser.' : 'Your bottle can be found by other visitors.'}</p><button class="bottle-primary" type="submit">${bottle ? '寄出回复 · Send reply' : '让它漂走 · Release'}</button>`;
    el.elements.nickname.value = state.name || '';
    el.addEventListener('submit', event => {
      event.preventDefault();
      if (busy) return;
      const name = el.elements.nickname.value.trim(), message = el.elements.message.value.trim();
      if (!name || !message) { status.textContent = 'Please enter a nickname and message.'; return; }
      run(async () => {
        const button = el.querySelector('button'); button.disabled = true;
        try {
          await request(bottle ? `/bottles/${bottle.id}/replies` : '/bottles', { name, message });
          state.name = name; save();
          content.replaceChildren(text('p', bottle ? '回复已漂向对方。Your reply is on its way.' : '瓶子已漂走。Someone may find your words in the rain.', 'bottle-empty'));
          status.textContent = demo ? 'Saved in this browser only · 本地预览' : '已送出 · Sent';
        } finally { button.disabled = false; }
      });
    });
    return el;
  }
  async function view(which) {
    dialog.querySelectorAll('nav button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === which)));
    content.replaceChildren();
    if (which === 'write') { content.append(form()); status.textContent = ''; return; }
    if (which === 'pick') {
      const { bottle } = await request('/bottles/random');
      status.textContent = '';
      if (!bottle) content.append(text('p', '海面还很安静。Be the first to send a bottle.', 'bottle-empty'));
      else { content.append(card(bottle)); content.append(bottle.replied ? text('p', '你已经回复过这个瓶子。You’ve replied to this bottle.', 'bottle-note') : form(bottle)); }
      const next = text('button', '再捞一个 · Find another'); next.className = 'bottle-next'; next.onclick = () => run(() => view('pick')); content.append(next);
    } else {
      const { bottles, replies } = await request('/bottles/mine');
      const unread = replies.filter(r => r.created_at > (state.seen || 0)).length;
      status.textContent = unread ? `${unread} 条新回复 · new replies` : 'Your latest 50 bottles · 最近的瓶子';
      if (!bottles.length) content.append(text('p', '还没有放出的瓶子。Write a little something first.', 'bottle-empty'));
      for (const bottle of bottles) {
        const article = card(bottle);
        const received = replies.filter(r => r.bottle_id === bottle.id).sort((a,b) => a.created_at - b.created_at);
        for (const reply of received) { const r = card(reply); r.classList.add('bottle-reply'); if (reply.created_at > (state.seen || 0)) r.prepend(text('small', '新回复 · New')); article.append(r); }
        if (!received.length) article.append(text('p', '还在漂流，等待回音。Waiting for a reply.', 'bottle-note'));
        if (demo && !received.length) {
          const simulate = text('button', 'Preview a received reply');
          simulate.onclick = () => run(async () => { state.replies.push({ id: crypto.randomUUID(), bottle_id: bottle.id, name: 'Demo visitor', message: '收到你的瓶子了。愿你今晚有个好梦。', created_at: Date.now() }); save(); await view('mine'); }); article.append(simulate);
        }
        content.append(article);
      }
      state.seen = Date.now(); save();
    }
  }
  launcher.onclick = () => { dialog.showModal(); if (!state) { status.textContent = 'Please allow browser storage to keep your bottles and replies.'; return; } run(() => view('pick')); };
  dialog.querySelector('.bottle-close').onclick = () => dialog.close();
  dialog.querySelectorAll('nav button').forEach(button => button.onclick = () => { if (state) run(() => view(button.dataset.view)); });
})();
