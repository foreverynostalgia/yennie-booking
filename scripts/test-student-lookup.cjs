const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const root=path.resolve(__dirname,'..');
const ts=require(root+'/node_modules/typescript');
const sql=new DatabaseSync(':memory:');
for(const f of fs.readdirSync(root+'/drizzle').filter(x=>x.endsWith('.sql')).sort())sql.exec(fs.readFileSync(root+'/drizzle/'+f,'utf8'));
const env={SESSION_SECRET:'test-only-secret',DB:{prepare(query){let args=[];return {bind(...values){args=values;return this},async all(){return {results:sql.prepare(query).all(...args)}},async first(){return sql.prepare(query).get(...args)||null},async run(){return {meta:{changes:Number(sql.prepare(query).run(...args).changes)}}}}}}};
const queued=[];const stubs={'cloudflare:workers':{env,waitUntil(){}},'@/lib/google-calendar':{queueGoogleCalendarSync:async ids=>queued.push(...ids)},'@/lib/admin-push':{notifyAdminPush:async()=>{}}};
const cache={};function load(file){if(stubs[file])return stubs[file];if(file==='next/server')return require(root+'/node_modules/next/server');const full=file.startsWith('@/')?root+'/'+file.slice(2)+'.ts':file; if(cache[full])return cache[full].exports;const mod={exports:{}};cache[full]=mod;new Function('require','exports','module',ts.transpileModule(fs.readFileSync(full,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(load,mod.exports,mod);return mod.exports}
const {NextRequest}=require(root+'/node_modules/next/server');
function req(body,cookie='',origin='https://test.local'){return new NextRequest('https://test.local/api/test',{method:'POST',headers:{origin,'content-type':'application/json',cookie},body:JSON.stringify(body)})}
const lookup=load(root+'/app/api/lookup/route.ts').POST,cancel=load(root+'/app/api/cancel/route.ts').POST,change=load(root+'/app/api/change/route.ts').POST;
sql.prepare('INSERT INTO courses(id,title,day,start,end,capacity,weekly_limit,target_grades) VALUES(?,?,?,?,?,?,?,?)').run('course','과학',0,'14:00','22:00',10,0,'["중1","중2","중3"]');
function booking(id,name,phone,code,date='2099-01-05'){sql.prepare('INSERT INTO bookings(id,course_id,date,time_start,time_end,name,school,grade,phone,access_code,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run(id,'course',date,'14:00','16:00',name,'00중','중2',phone,code,'2026-10-24')}
booking('old-1','김학생','01012345678','YE0001');booking('old-2','김학생','01012345678','abcdef0123456789','2099-01-12');booking('other-name','이학생','01012345678','YE0003');booking('other-phone','김학생','01099998888','YE0004');
(async()=>{
 let r=await lookup(req({name:' 김학생 ',phone:'010-1234-5678'}));assert.equal(r.status,200);let rows=await r.json();assert.deepEqual(rows.map(x=>x.id),['old-1','old-2']);assert.ok(rows.every(x=>!('access_code' in x)&&!('phone' in x)));assert.equal(r.headers.get('cache-control'),'no-store');const set=r.headers.get('set-cookie');assert.match(set,/HttpOnly/i);assert.match(set,/Secure/i);const cookie=set.split(';')[0];
 r=await lookup(req({name:'김학생',phone:'5678'}));assert.equal(r.status,400);
 r=await lookup(req({name:'김학생',phone:'01000000000'}));assert.deepEqual(await r.json(),[]);
 r=await lookup(req({name:'김학생',phone:'01012345678'},'','https://elsewhere.local'));assert.equal(r.status,403);
 const identity={name:'김학생',phone:'010-1234-5678'};
 r=await cancel(req({id:'old-1',...identity}));assert.equal(r.status,401);
 r=await cancel(req({id:'other-name',...identity},cookie));assert.equal(r.status,404);
 r=await cancel(req({id:'old-1',name:'이학생',phone:identity.phone},cookie));assert.equal(r.status,401);
 r=await cancel(req({id:'old-1',...identity},cookie+'x'));assert.equal(r.status,401);
 r=await cancel(req({id:'old-1',...identity},cookie));assert.equal(r.status,200);assert.equal(sql.prepare('SELECT status FROM bookings WHERE id=?').get('old-1').status,'cancel_pending');
 r=await cancel(req({id:'old-1',...identity},cookie));assert.equal(r.status,409);
 const target='2099-01-19';assert.equal(new Date(target+'T12:00:00+09:00').getUTCDay(),1);
 r=await change(req({id:'old-2',...identity,date:target,start:'16:00',end:'18:00'},cookie));assert.equal(r.status,200,await r.text());assert.equal(sql.prepare('SELECT status FROM bookings WHERE id=?').get('old-2').status,'change_pending');
 assert.deepEqual(queued,['old-1','old-2']);
 const auth=load('@/lib/student-lookup').studentLookupAuthorized;const originalNow=Date.now;Date.now=()=>originalNow()+3601000;assert.equal(await auth(req({},cookie),'김학생','01012345678'),false);Date.now=originalNow;
 console.log('PASS: existing multi-booking lookup without code; identity isolation; invalid input/origin; signed session/tamper/expiry; cancellation and change stay pending approval; calendar sync queued.');
})().catch(e=>{console.error(e);process.exitCode=1});
