const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');const root=path.resolve(__dirname,'..'),ts=require(root+'/node_modules/typescript');
const sql=new DatabaseSync(':memory:');for(const f of fs.readdirSync(root+'/drizzle').filter(x=>x.endsWith('.sql')).sort())sql.exec(fs.readFileSync(root+'/drizzle/'+f,'utf8'));
const env={DB:{prepare(query){let args=[];return {bind(...v){args=v;return this},async first(){return sql.prepare(query).get(...args)||null},async all(){return {results:sql.prepare(query).all(...args)}},async run(){return {meta:{changes:Number(sql.prepare(query).run(...args).changes)}}}}}}};
const stubs={'cloudflare:workers':{env,waitUntil(){}},'@/lib/script-calendar':{getScriptConnection:async()=>({secret:'test-secret',url:'https://script.google.com/macros/s/test/exec'})},'@/lib/admin-push':{notifyAdminPush:async()=>{}},'@/lib/alimtalk':{sendReservationAlimtalk:async()=>{}}};
const cache={};function load(file){if(stubs[file])return stubs[file];if(file==='next/server')return require(root+'/node_modules/next/server');const full=file.startsWith('@/')?root+'/'+file.slice(2)+'.ts':file;if(cache[full])return cache[full].exports;const mod={exports:{}};cache[full]=mod;new Function('require','exports','module',ts.transpileModule(fs.readFileSync(full,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(id=>load(id.startsWith('.')?path.resolve(path.dirname(full),id)+(path.extname(id)?'':'.ts'):id),mod.exports,mod);return mod.exports}
const {NextRequest}=require(root+'/node_modules/next/server');const {POST}=load(root+'/app/api/calendar/inbound/route.ts');
function request(x,secret='test-secret'){return new NextRequest('https://test.local/api/calendar/inbound',{method:'POST',headers:{'content-type':'application/json','x-ye-calendar-token':secret},body:JSON.stringify(x)})}
async function call(x,status=200,secret){const response=await POST(request(x,secret));assert.equal(response.status,status,await response.clone().text());return response.json()}
const cid=crypto.randomUUID(),sid=crypto.randomUUID(),date='2099-04-05';
sql.prepare("INSERT INTO courses(id,title,day,start,end,capacity,weekly_limit,schedules,target_grades,active) VALUES(?,?,?,?,?,?,?,?,?,1)").run(cid,'무료클리닉',0,'14:00','22:00',1,1,'[]','["중2"]');
sql.prepare('INSERT INTO students(id,nickname,name,school,grade,phone,pin_hash,active,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)').run(sid,'별이','김학생','00중','중2','01012345678','hash',1,'2099-01-01','2099-01-01');
(async()=>{
 const eventId='test-12345@google.com',create={action:'create',eventId,title:'예약추가 | 별이 | 무료클리닉',date,start:'14:00',end:'15:00'};
 await call(create,401,'wrong');assert.equal(sql.prepare('SELECT COUNT(*) n FROM bookings').get().n,0);
 await call({action:'heartbeat'});assert.equal(sql.prepare("SELECT webhook_encrypted FROM calendar_settings WHERE id='google_inbound_health'").get().webhook_encrypted,'ok');
 const saved=await call(create);assert.equal(saved.title,'김학생');assert.equal(sql.prepare('SELECT student_id,notification_status FROM bookings WHERE id=?').get(saved.bookingId).student_id,sid);
 assert.equal((await call(create)).bookingId,saved.bookingId);assert.equal(sql.prepare('SELECT COUNT(*) n FROM bookings').get().n,1);
 const another={...create,eventId:'another-12345@google.com',start:'14:30',end:'15:30'};await call(another,409);
 await call({action:'update',eventId,bookingId:saved.bookingId,date,start:'16:00',end:'17:00'});
 assert.equal(sql.prepare('SELECT time_start FROM bookings WHERE id=?').get(saved.bookingId).time_start,'16:00');
 sql.prepare('INSERT INTO reservation_blocks(id,date,start,end,created_at) VALUES(?,?,?,?,?)').run(crypto.randomUUID(),date,'18:00','20:00','2099-01-01');
 await call({action:'update',eventId,bookingId:saved.bookingId,date,start:'18:00',end:'19:00'},409);
 assert.equal(sql.prepare('SELECT time_start FROM bookings WHERE id=?').get(saved.bookingId).time_start,'16:00');
 // Attendance-only updates work for past lessons, even when an existing slot is blocked.
 const attendanceUpdate={action:'update',eventId,bookingId:saved.bookingId,date,start:'16:00',end:'17:00'};
 await call({...attendanceUpdate,attendance:'present'});
 assert.equal(sql.prepare('SELECT attendance FROM bookings WHERE id=?').get(saved.bookingId).attendance,'present');
 await call({...attendanceUpdate,attendance:'invalid'},409);
 await call({...attendanceUpdate,attendance:'late'});
 assert.equal(sql.prepare('SELECT attendance FROM bookings WHERE id=?').get(saved.bookingId).attendance,'late');
 await call({...attendanceUpdate,date:'2026-01-05',attendance:'absent'});
 assert.equal(sql.prepare('SELECT date,attendance FROM bookings WHERE id=?').get(saved.bookingId).date,'2026-01-05');
 await call({...attendanceUpdate,date:'2026-01-05',attendance:'unmarked'});
 await call({...attendanceUpdate,date:'2026-01-05',attendance:'excused'});
 await call({action:'delete',eventId,bookingId:saved.bookingId});assert.equal(sql.prepare('SELECT status FROM bookings WHERE id=?').get(saved.bookingId).status,'cancelled');
 await call({action:'delete',eventId,bookingId:saved.bookingId});
 assert.equal(sql.prepare('SELECT attendance FROM bookings WHERE id=?').get(saved.bookingId).attendance,'excused');
 await call({...create,eventId:'new-12345@google.com',start:'16:00',end:'17:00'});
 assert.equal(sql.prepare('SELECT COUNT(*) n FROM bookings WHERE status=\'confirmed\'').get().n,1);
 console.log('PASS: signed calendar callback; explicit nickname/class creation; idempotent retry; time changes; block rejection; deletion and rebooking');
})().catch(e=>{console.error(e);process.exitCode=1});
