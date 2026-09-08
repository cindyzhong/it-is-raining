import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import assert from 'node:assert/strict';
import worker from './index.js';
const sqlite = new DatabaseSync(':memory:');
sqlite.exec(readFileSync(new URL('./migrations/0001_bottles.sql', import.meta.url), 'utf8'));
const DB = { prepare(sql) { return { bind(...values) { const stmt = sqlite.prepare(sql); return { async first() { return stmt.get(...values) ?? null; }, async all() { return { results: stmt.all(...values) }; }, async run() { const r = stmt.run(...values); return { meta: { changes: r.changes } }; } }; } }; }, async batch(statements) { return Promise.all(statements.map(s => s.all())); } };
async function call(path, who = 'a', body, origin = 'http://localhost:8080') {
 return worker.fetch(new Request('http://test' + path, { method: body ? 'POST' : 'GET', headers: { Origin: origin, Authorization: 'Bearer ' + who.repeat(64), 'Content-Type': 'application/json', 'CF-Connecting-IP': who }, body: body ? JSON.stringify(body) : undefined }), { DB, ALLOWED_ORIGINS: 'http://localhost:8080' });
}
assert.equal((await call('/bottles/random', 'a', undefined, 'https://evil.test')).status, 403);
assert.equal((await call('/bottles/random', 'x')).status, 401);
assert.equal((await call('/bottles', 'a', {name:'A',message:'x'.repeat(301)})).status, 400);
const created = await call('/bottles', 'a', { name:' ', message:'你好 🌧️ <script>' }); assert.equal(created.status,201);
const {id} = await created.json();
assert.equal((await (await call('/bottles/random')).json()).bottle,null);
assert.equal((await (await call('/bottles/random','b')).json()).bottle.id,id);
assert.equal((await call(`/bottles/${id}/replies`,'a',{name:'A',message:'self'})).status,400);
assert.equal((await call(`/bottles/${id}/replies`,'b',{name:'B',message:'hello'})).status,201);
assert.equal((await call(`/bottles/${id}/replies`,'b',{name:'Changed',message:'again'})).status,409);
assert.equal((await call(`/bottles/${id}/replies`,'c',{name:'C',message:'another visitor'})).status,201);
assert.equal((await (await call('/bottles/mine','a')).json()).replies.length,2);
assert.equal((await (await call('/bottles/mine','b')).json()).replies.length,0);
assert.equal((await (await call('/bottles/random','b')).json()).bottle.replied,true);
for(let i=0;i<20;i++) assert.equal((await call('/bottles','d',{name:'D',message:'test'})).status,201);
assert.equal((await call('/bottles','d',{name:'D',message:'limited'})).status,429);
sqlite.prepare('UPDATE bottles SET hidden=1 WHERE id=?').run(id);
assert.equal((await call(`/bottles/${id}/replies`,'e',{name:'E',message:'hidden'})).status,404);
console.log('Passed: validation, identity, ownership, random discovery, reply uniqueness, inbox isolation, rate limit, hidden bottles.');
