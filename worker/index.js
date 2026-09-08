const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
async function hash(value) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), b => b.toString(16).padStart(2, '0')).join('');
}
export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    const allowed = env.ALLOWED_ORIGINS.split(',');
    const pathname = new URL(request.url).pathname;
    if (!pathname.startsWith('/admin') && !allowed.includes(origin)) return json({ error: 'Origin not allowed.' }, 403);
    let response;
    try { response = request.method === 'OPTIONS' ? new Response(null, { status: 204 }) : await route(request, env); }
    catch (error) { console.error('Bottle request failed', error.message); response = json({ error: 'The bottles are resting. Please try again later.' }, 503); }
    if (origin) {
      response.headers.set('Access-Control-Allow-Origin', origin);
      response.headers.set('Vary', 'Origin');
      response.headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
      response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    }
    return response;
  }
};
async function route(request, env) {
  const path = new URL(request.url).pathname;
  const adminEmail = request.headers.get('Cf-Access-Authenticated-User-Email');
  if (path === '/admin' || path === '/admin/' || path.startsWith('/admin/')) {
    if (adminEmail?.toLowerCase() !== env.ADMIN_EMAIL.toLowerCase()) return json({ error: 'Administrator access required.' }, 403);
    if (path === '/admin' || path === '/admin/') return adminPage();
    if (request.method === 'GET' && path === '/admin/messages') {
      const { results: bottles } = await env.DB.prepare('SELECT id,name,message,created_at,hidden FROM bottles ORDER BY created_at DESC LIMIT 500').all();
      const { results: replies } = await env.DB.prepare('SELECT id,bottle_id,name,message,created_at,hidden FROM replies ORDER BY created_at DESC LIMIT 1000').all();
      return json({ bottles, replies });
    }
    const hide = path.match(/^\/admin\/(bottles|replies)\/([a-f0-9-]{36})$/);
    if (request.method === 'POST' && hide) {
      const body = await request.json();
      await env.DB.prepare(`UPDATE ${hide[1]} SET hidden=? WHERE id=?`).bind(body.hidden ? 1 : 0, hide[2]).run();
      return json({ ok: true });
    }
    return json({ error: 'Not found.' }, 404);
  }
  const token = (request.headers.get('Authorization') || '').replace(/^Bearer /, '');
  if (!/^[a-f0-9]{64}$/.test(token)) return json({ error: 'A browser identity is required.' }, 401);
  const owner = await hash(token);
  const db = env.DB;
  if (request.method === 'GET' && path === '/bottles/random') {
    const pivot = Math.random();
    const query = `SELECT id,name,message,created_at FROM bottles WHERE hidden=0 AND random_key>=? ORDER BY random_key LIMIT 1`;
    let bottle = await db.prepare(query).bind(pivot).first();
    if (!bottle) bottle = await db.prepare(query).bind(0).first();
    if (bottle) {
      const { results: replies } = await db.prepare('SELECT id,name,message,created_at,owner FROM replies WHERE bottle_id=? AND hidden=0 ORDER BY created_at ASC').bind(bottle.id).all();
      bottle.replies = replies.map(reply => ({ ...reply, replied: reply.owner === owner }));
      bottle.replied = replies.some(reply => reply.owner === owner);
      bottle.replies.forEach(reply => delete reply.owner);
    }
    return json({ bottle });
  }
  const replyMatch = path.match(/^\/bottles\/([a-f0-9-]{36})\/replies$/);
  if (request.method !== 'POST' || (path !== '/bottles' && !replyMatch)) return json({ error: 'Not found.' }, 404);
  if (!request.headers.get('Content-Type')?.includes('application/json')) return json({ error: 'JSON required.' }, 415);
  // Bound the actual stream, not only the caller-supplied Content-Length.
  const reader = request.body?.getReader();
  if (!reader) return json({ error: 'Message required.' }, 400);
  let raw = '', bytes = 0;
  const decoder = new TextDecoder();
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytes += value.length;
    if (bytes > 4096) { await reader.cancel(); return json({ error: 'Message too long.' }, 413); }
    raw += decoder.decode(value, { stream: true });
  }
  raw += decoder.decode();
  let body;
  try { body = JSON.parse(raw); } catch { return json({ error: 'Invalid message.' }, 400); }
  const name = typeof body?.name === 'string' ? body.name.trim() : '';
  const message = typeof body?.message === 'string' ? body.message.trim() : '';
  if ([...name].length > 24 || !message || [...message].length > 300) return json({ error: 'Use an optional nickname of up to 24 characters and a message of 1–300 characters.' }, 400);
  if (replyMatch) {
    const bottle = await db.prepare('SELECT owner FROM bottles WHERE id=? AND hidden=0').bind(replyMatch[1]).first();
    if (!bottle) return json({ error: 'This bottle is no longer available.' }, 404);
    if (bottle.owner === owner) return json({ error: 'Pick another visitor’s bottle to reply.' }, 400);
  }
  const now = Date.now();
  const bucket = Math.floor(now / 3600000);
  const ip = await hash(request.headers.get('CF-Connecting-IP') || 'local');
  const counts = await db.batch([owner, ip].map(key => db.prepare(`INSERT INTO rate_limits(key,count,expires) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET count=count+1 RETURNING count`).bind(`${key}:${bucket}`, (bucket + 1) * 3600000)));
  if (counts.some(result => result.results[0].count > 20)) return json({ error: 'Please let the bottles drift. Try again next hour.' }, 429);
  await db.prepare('DELETE FROM rate_limits WHERE expires<?').bind(now).run();
  const id = crypto.randomUUID();
  if (replyMatch) {
    const result = await db.prepare('INSERT INTO replies(id,bottle_id,owner,name,message,created_at) VALUES(?,?,?,?,?,?) ON CONFLICT(bottle_id,owner) DO NOTHING').bind(id, replyMatch[1], owner, name, message, now).run();
    if (!result.meta.changes) return json({ error: 'You have already replied to this bottle.' }, 409);
  } else {
    await db.prepare('INSERT INTO bottles(id,owner,name,message,created_at,random_key) VALUES(?,?,?,?,?,?)').bind(id, owner, name, message, now, Math.random()).run();
  }
  return json({ id }, 201);
}

function adminPage() {
  return new Response(`<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Rain bottles admin</title><style>body{margin:0;background:#101114;color:#eee;font:14px system-ui;padding:28px}main{max-width:900px;margin:auto}h1{font-weight:400}.muted{color:#999}.item{border:1px solid #ffffff24;border-radius:12px;padding:14px;margin:10px 0;background:#ffffff08}.msg{white-space:pre-wrap;margin:8px 0;line-height:1.6}.meta{color:#aaa;font-size:12px}.reply{margin-left:24px;border-left:2px solid #ffffff55}.actions button{margin-right:8px;padding:6px 10px;border:1px solid #ffffff44;border-radius:7px;background:#ffffff12;color:#fff;cursor:pointer}.hidden{opacity:.45}</style><main><h1>Rain bottles</h1><p class="muted">管理员：x3zhong@gmail.com · <button id="reload">刷新</button></p><p id="status" class="muted"></p><section id="list"></section></main><script>
const list=document.querySelector('#list'),status=document.querySelector('#status');
const esc=s=>String(s??'');
async function load(){status.textContent='Loading…';const r=await fetch('/admin/messages');if(!r.ok){status.textContent='Access denied. Sign in with the administrator Google account.';return}const d=await r.json();const replies=new Map();d.replies.forEach(x=>(replies.get(x.bottle_id)||replies.set(x.bottle_id,[]).get(x.bottle_id)).push(x));list.replaceChildren();d.bottles.forEach(b=>{const el=document.createElement('article');el.className='item '+(b.hidden?'hidden':'');el.innerHTML='<div class="meta">'+new Date(b.created_at).toLocaleString()+' · '+(esc(b.name)||'匿名')+'</div><div class="msg"></div><div class="actions"><button data-kind="bottles" data-id="'+b.id+'">'+(b.hidden?'Restore':'Hide')+'</button></div>';el.querySelector('.msg').textContent=b.message;(replies.get(b.id)||[]).forEach(x=>{const r=document.createElement('div');r.className='item reply '+(x.hidden?'hidden':'');r.innerHTML='<div class="meta">回复 · '+new Date(x.created_at).toLocaleString()+' · '+(esc(x.name)||'匿名')+'</div><div class="msg"></div><div class="actions"><button data-kind="replies" data-id="'+x.id+'">'+(x.hidden?'Restore':'Hide')+'</button></div>';r.querySelector('.msg').textContent=x.message;el.append(r)});list.append(el)});status.textContent=d.bottles.length+' bottles · '+d.replies.length+' replies'}
list.addEventListener('click',async e=>{if(!e.target.matches('button[data-id]'))return;await fetch('/admin/'+e.target.dataset.kind+'/'+e.target.dataset.id,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({hidden:e.target.textContent==='Hide'})});load()});document.querySelector('#reload').onclick=load;load();</script>`, { headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } });
}
