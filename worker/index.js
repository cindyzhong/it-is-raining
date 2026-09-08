const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' } });
async function hash(value) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))), b => b.toString(16).padStart(2, '0')).join('');
}
export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin');
    const allowed = env.ALLOWED_ORIGINS.split(',');
    if (!allowed.includes(origin)) return json({ error: 'Origin not allowed.' }, 403);
    let response;
    try { response = request.method === 'OPTIONS' ? new Response(null, { status: 204 }) : await route(request, env); }
    catch (error) { console.error('Bottle request failed', error.message); response = json({ error: 'The bottles are resting. Please try again later.' }, 503); }
    response.headers.set('Access-Control-Allow-Origin', origin);
    response.headers.set('Vary', 'Origin');
    response.headers.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    return response;
  }
};
async function route(request, env) {
  const token = (request.headers.get('Authorization') || '').replace(/^Bearer /, '');
  if (!/^[a-f0-9]{64}$/.test(token)) return json({ error: 'A browser identity is required.' }, 401);
  const owner = await hash(token);
  const path = new URL(request.url).pathname;
  const db = env.DB;
  if (request.method === 'GET' && path === '/bottles/random') {
    const pivot = Math.random();
    const query = `SELECT id,name,message,created_at FROM bottles WHERE hidden=0 AND owner!=? AND random_key>=? ORDER BY random_key LIMIT 1`;
    let bottle = await db.prepare(query).bind(owner, pivot).first();
    if (!bottle) bottle = await db.prepare(query).bind(owner, 0).first();
    if (bottle) bottle.replied = !!await db.prepare('SELECT id FROM replies WHERE bottle_id=? AND owner=?').bind(bottle.id, owner).first();
    return json({ bottle });
  }
  if (request.method === 'GET' && path === '/bottles/mine') {
    const { results: bottles } = await db.prepare('SELECT id,name,message,created_at FROM bottles WHERE owner=? AND hidden=0 ORDER BY created_at DESC LIMIT 50').bind(owner).all();
    const { results: replies } = await db.prepare(`SELECT r.id,r.bottle_id,r.name,r.message,r.created_at FROM replies r JOIN bottles b ON b.id=r.bottle_id WHERE b.owner=? AND b.hidden=0 AND r.hidden=0 ORDER BY r.created_at DESC LIMIT 200`).bind(owner).all();
    return json({ bottles, replies });
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
