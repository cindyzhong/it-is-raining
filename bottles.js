(() => {
  const api = (window.BOTTLES_API_URL || '').replace(/\/$/, '');
  const demo = !api;
  const seen = new Set();
  const state = { token: Array.from(crypto.getRandomValues(new Uint8Array(32)), b => b.toString(16).padStart(2, '0')).join(''), bottles: [], replies: [], name: '' };
  const encouragements = Array.isArray(window.RAIN_ENCOURAGEMENTS) && window.RAIN_ENCOURAGEMENTS.length ? window.RAIN_ENCOURAGEMENTS : ['雨会经过屋檐，也会带走一点疲惫。'];
  const launcher = document.createElement('button'); launcher.className = 'bottle-launcher'; launcher.setAttribute('aria-label', '漂流瓶 · Bottles'); launcher.setAttribute('aria-haspopup', 'dialog'); launcher.title = '漂流瓶 · Bottles';
  launcher.innerHTML = `<svg class="bottle-launcher-icon" viewBox="0 0 48 56" fill="none" aria-hidden="true"><g transform="rotate(14 24 28)"><rect x="19" y="3" width="10" height="8" rx="2" fill="#bc9566" stroke="#ead0a0"/><path d="M18 10h12v11c0 3 9 5 9 12v13c0 4-3 6-7 6H16c-4 0-7-2-7-6V33c0-7 9-9 9-12V10Z" fill="#ffffff" fill-opacity=".04" stroke="#ffffff" stroke-width="2"/><path d="M11 39c7-5 17 5 26 0v7c0 3-2 4-5 4H16c-3 0-5-1-5-4v-7Z" fill="#ffffff" fill-opacity=".08"/><rect x="18" y="27" width="13" height="18" rx="2" transform="rotate(-12 18 27)" fill="#f1dfb5"/><path d="m21 32 6-1m-5 5 6-1" stroke="#a58961" stroke-linecap="round"/><path d="M14 33v9M21 14v6" stroke="#ffffff" stroke-width="2" stroke-linecap="round" opacity=".75"/></g></svg>`;
  const dialog = document.createElement('dialog'); dialog.className = 'bottle-dialog'; dialog.setAttribute('aria-labelledby', 'bottle-title');
  dialog.innerHTML = `<header><div><p class="bottle-eyebrow">LET A LITTLE KINDNESS DRIFT</p><h2 id="bottle-title">雨中的漂流瓶</h2></div><button type="button" class="bottle-close" aria-label="Close">×</button></header><p class="bottle-intro">留一句话，给另一个听雨的人。<br><span>Leave a thought for someone listening to the rain.</span></p><p class="bottle-demo" ${demo ? '' : 'hidden'}>本地预览 · Demo — messages stay in this browser until Cloudflare is connected.</p><nav aria-label="Bottles"><button data-view="pick">捞一个 · Find</button><button data-view="write">扔一个 · Write</button></nav><p class="bottle-status" role="status" aria-live="polite"></p><section class="bottle-content"></section><p class="bottle-note">每次捞到的瓶子都会显示全部回复。刷新页面后会获得新的临时身份。<br>Each bottle shows all replies. Refreshing starts a new temporary identity.</p>`;
  document.body.append(launcher, dialog);
  const content = dialog.querySelector('.bottle-content'), status = dialog.querySelector('.bottle-status'); let busy = false;
  const text = (tag, value, className) => { const el = document.createElement(tag); el.textContent = value; if (className) el.className = className; return el; };
  async function request(path, body) {
    if (!demo) {
      const controller = new AbortController();
      let timedOut = false;
      const timer = setTimeout(() => { timedOut = true; controller.abort(); }, 25000);
      const payload = path === '/bottles/random' ? { seen: [...seen] } : body;
      try {
        const response = await fetch(api + path, { method: payload ? 'POST' : 'GET', headers: { Authorization: 'Bearer ' + state.token, ...(payload ? { 'Content-Type': 'application/json' } : {}) }, body: payload ? JSON.stringify(payload) : undefined, signal: controller.signal });
        if (!response.headers.get('Content-Type')?.includes('application/json')) throw new Error('接口返回了非消息页面，请检查网络或登录拦截。Unexpected API response.');
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Please try again later.');
        if (path === '/bottles/random' && data.bottle) { if (data.restarted) seen.clear(); seen.add(data.bottle.id); }
        return data;
      } catch (error) {
        if (timedOut) { const timeout = new Error('连接超时，请重试或切换 Wi-Fi / 移动数据。Connection timed out; try another network.'); timeout.name = 'NetworkTimeout'; throw timeout; }
        throw error;
      } finally { clearTimeout(timer); }
    }
    if (path === '/bottles/random') {
      const pool = state.bottles.length ? state.bottles : [{ id: 'demo-1', name: '听雨的人', message: '希望你今天也有一个可以安心发呆的角落。', created_at: Date.now() }, { id: 'demo-2', name: 'Somewhere', message: 'It is raining here too. Wherever you are, I hope tonight feels a little softer.', created_at: Date.now() }];
      let available = pool.filter(bottle => !seen.has(bottle.id));
      if (!available.length) { const last = [...seen].pop(); seen.clear(); available = pool.filter(bottle => bottle.id !== last); if (!available.length) available = pool; }
      const bottle = { ...available[Math.floor(Math.random() * available.length)] };
      bottle.replies = state.replies.filter(r => r.bottle_id === bottle.id);
      bottle.replied = bottle.replies.some(r => r.owner === state.token);
      seen.add(bottle.id);
      return { bottle };
    }
    const item = { ...body, id: crypto.randomUUID(), created_at: Date.now(), owner: state.token }; if (path === '/bottles') state.bottles.push(item); else { item.bottle_id = path.split('/')[2]; if (state.replies.some(r => r.bottle_id === item.bottle_id && r.owner === state.token)) throw new Error('You have already replied to this bottle in this session.'); state.replies.push(item); } return item;
  }
  function card(item, reply = false) { const article = document.createElement('article'); article.className = reply ? 'bottle-card bottle-reply' : 'bottle-card'; article.append(text('p', item.message, 'bottle-message'), text('p', '— ' + (item.name || '匿名 · Anonymous'), 'bottle-author'), text('time', new Date(item.created_at).toLocaleDateString(), 'bottle-date')); return article; }
  async function run(action) { if (busy) return; busy = true; status.textContent = '漂流中… · One moment…'; dialog.setAttribute('aria-busy', 'true'); dialog.querySelectorAll('nav button').forEach(b => b.disabled = true); try { await action(); } catch (error) { status.textContent = error.name === 'TimeoutError' ? '连接超时，请稍后再试。Taking too long. Please try again.' : error instanceof TypeError ? '暂时无法连接漂流瓶，请稍后重试。Unable to connect.' : error.message; } finally { busy = false; dialog.removeAttribute('aria-busy'); dialog.querySelectorAll('nav button').forEach(b => b.disabled = false); } }
  function form(bottle) { const el = document.createElement('form'); el.className = 'bottle-form'; el.innerHTML = `<label>你的名字 · Nickname <span class="bottle-optional">可选 · Optional</span><input name="nickname" maxlength="24" autocomplete="nickname" placeholder="不填写则显示匿名 · Anonymous"></label><label>${bottle ? '回一句 · A reply' : '想说的话 · Your message'}<textarea name="message" required maxlength="300" rows="4" placeholder="此刻，你想说些什么？"></textarea></label><p class="bottle-note">${bottle ? '同一页面内只能回复一次，刷新后可以再次回复。' : '你的瓶子会被其他人随机捞到。'}</p><button class="bottle-primary" type="submit">${bottle ? '寄出回复 · Send reply' : '让它漂走 · Release'}</button>`; el.elements.nickname.value = state.name; el.addEventListener('submit', event => { event.preventDefault(); const name = el.elements.nickname.value.trim(), message = el.elements.message.value.trim(); if (!message) { status.textContent = 'Please enter a message.'; return; } run(async () => { await request(bottle ? `/bottles/${bottle.id}/replies` : '/bottles', { name, message }); state.name = name; if (bottle) await view('pick'); else content.replaceChildren(text('p', '瓶子已漂走。Someone may find your words in the rain.', 'bottle-empty')); status.textContent = '已送出 · Sent'; }); }); return el; }
  async function view(which) { dialog.querySelectorAll('nav button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === which))); content.replaceChildren(); if (which === 'write') { content.append(form()); status.textContent = ''; return; } const { bottle } = await request('/bottles/random'); if (!bottle) { const line = encouragements[Math.floor(Math.random() * encouragements.length)]; status.textContent = line; content.append(text('p', '海面还很安静。' + line, 'bottle-empty')); return; } content.append(card(bottle)); const replies = bottle.replies || []; if (replies.length) { content.append(text('p', `${replies.length} 条回复 · ${replies.length} replies`, 'bottle-status')); const replyList = document.createElement('div'); replyList.className = 'bottle-replies'; const renderReplies = items => items.forEach(reply => replyList.append(card(reply, true))); renderReplies(replies.slice(0, 10)); content.append(replyList); if (replies.length > 10) { const more = text('button', `展开其余 ${replies.length - 10} 条回复 · Show more`); more.className = 'bottle-more'; more.onclick = () => { renderReplies(replies.slice(10)); more.remove(); }; content.append(more); } } else content.append(text('p', '还没有回复，留下第一句话吧。Be the first to reply.', 'bottle-note')); if (!bottle.replied) content.append(form(bottle)); const next = text('button', '再捞一个 · Find another'); next.className = 'bottle-next'; next.onclick = () => run(() => view('pick')); content.append(next); status.textContent = ''; }
  launcher.onclick = () => { dialog.showModal(); run(() => view('pick')); }; dialog.querySelector('.bottle-close').onclick = () => dialog.close(); dialog.querySelectorAll('nav button').forEach(button => button.onclick = () => run(() => view(button.dataset.view)));
})();
