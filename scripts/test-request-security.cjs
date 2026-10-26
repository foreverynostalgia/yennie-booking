const assert=require('node:assert/strict'),fs=require('node:fs'),ts=require('../node_modules/typescript'),{DatabaseSync}=require('node:sqlite');
const mod={exports:{}};new Function('exports','module',ts.transpileModule(fs.readFileSync('lib/request-security.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(mod.exports,mod);
const {guardRequest,securityHeaders}=mod.exports,sql=new DatabaseSync(':memory:');sql.exec('CREATE TABLE student_login_attempts(key TEXT PRIMARY KEY,attempts INTEGER NOT NULL,expires_at INTEGER NOT NULL)');
const db={prepare(q){let args=[];return {bind(...v){args=v;return this},async first(){return sql.prepare(q).get(...args)},async run(){return sql.prepare(q).run(...args)}}}};
const req=(path='/api/admin/login',ip='1.2.3.4',headers={})=>new Request('https://test.local'+path,{method:'POST',headers:{'cf-connecting-ip':ip,origin:'https://test.local',...headers}});
(async()=>{
 assert.equal((await guardRequest(req(undefined,undefined,{origin:'https://evil.local'}),db)).status,403);
 assert.equal((await guardRequest(req(undefined,undefined,{'sec-fetch-site':'cross-site'}),db)).status,403);
 assert.equal((await guardRequest(req(undefined,undefined,{'content-length':'524289'}),db)).status,413);
 for(let i=0;i<10;i++)assert.equal(await guardRequest(req(),db),null);
 const limited=await guardRequest(req(),db);assert.equal(limited.status,429);assert.ok(Number(limited.headers.get('retry-after'))>0);
 assert.equal(await guardRequest(req(undefined,'2.3.4.5'),db),null);
 assert.equal(await guardRequest(req('/api/lookup'),db),null);
 sql.prepare('UPDATE student_login_attempts SET expires_at=0').run();assert.equal(await guardRequest(req(),db),null);
 assert.equal((await guardRequest(req(),undefined)).status,503);
 assert.ok(!JSON.stringify(sql.prepare('SELECT * FROM student_login_attempts').all()).includes('1.2.3.4'));
 const r=securityHeaders(Response.json({ok:true}),req());assert.equal(r.headers.get('cache-control'),'private, no-store');assert.equal(r.headers.get('x-frame-options'),'DENY');assert.match(r.headers.get('content-security-policy'),/frame-ancestors 'none'/);assert.equal(r.headers.get('x-content-type-options'),'nosniff');assert.deepEqual(await r.json(),{ok:true});
 console.log('PASS: durable throttling, IP/path isolation, expiry, fail-closed storage, cross-origin rejection, large-body header rejection, private cache/security headers.');
})().catch(e=>{console.error(e);process.exitCode=1});
