const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const root=path.resolve(__dirname,'..');
const ts=require(root+'/node_modules/typescript');
const sql=new DatabaseSync(':memory:');
for(const f of fs.readdirSync(root+'/drizzle').filter(x=>x.endsWith('.sql')).sort())sql.exec(fs.readFileSync(root+'/drizzle/'+f,'utf8'));
const env={ADMIN_PASSWORD:'test-only-admin',SESSION_SECRET:'test-only-secret',DB:{prepare(query){let args=[];return {bind(...values){args=values;return this},async all(){return {results:sql.prepare(query).all(...args)}},async first(){return sql.prepare(query).get(...args)||null},async run(){return {meta:{changes:Number(sql.prepare(query).run(...args).changes)}}}}}}};
const queued=[];const stubs={'cloudflare:workers':{env,waitUntil(){}},'@/lib/google-calendar':{queueGoogleCalendarSync:async ids=>queued.push(...ids)},'@/lib/admin-push':{notifyAdminPush:async()=>{}},'@/lib/alimtalk':{sendReservationAlimtalk:async()=> 'unconfigured'}};
const cache={};function load(file){if(stubs[file])return stubs[file];if(file==='next/server')return require(root+'/node_modules/next/server');const full=file.startsWith('@/')?root+'/'+file.slice(2)+'.ts':file; if(cache[full])return cache[full].exports;const mod={exports:{}};cache[full]=mod;new Function('require','exports','module',ts.transpileModule(fs.readFileSync(full,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(id=>load(id.startsWith('.')?path.resolve(path.dirname(full),id)+(path.extname(id)?'':'.ts'):id),mod.exports,mod);return mod.exports}
const {NextRequest}=require(root+'/node_modules/next/server');
function req(body,cookie='',origin='https://test.local'){return new NextRequest('https://test.local/api/test',{method:'POST',headers:{origin,'content-type':'application/json',cookie},body:JSON.stringify(body)})}


const student=load(root+'/app/api/bookings/route.ts').POST,admin=load(root+'/app/api/admin/bookings/route.ts');
sql.prepare('INSERT INTO courses(id,title,day,start,end,capacity,weekly_limit,target_grades,schedules,start_date,end_date) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run('course','과학',0,'14:00','18:00',2,0,'["중2"]','[{"day":0,"start":"14:00","end":"18:00"}]','2099-01-01','2099-01-31');
const base={name:'김학생',school:'00중',grade:'중2',phone:'01012345678',date:'2099-02-08',courseId:'course',start:'08:15',end:'09:45'};
async function expect(response,status){assert.equal(response.status,status,await response.clone().text());return await response.json()}
function edit(id,values={}){const old=sql.prepare('SELECT * FROM bookings WHERE id=?').get(id);return {...base,date:old.date,start:old.time_start,end:old.time_end,id,original:JSON.stringify([old.course_id,old.date,old.time_start,old.time_end,old.name,old.school,old.grade,old.phone,old.status,old.attendance,old.requested_date,old.requested_start,old.requested_end,old.admin_memo||'']),...values}}
(async()=>{
 const cookie='admin_session='+await load('@/lib/server').loginCookie();
 await expect(await student(req({...base,adminSchedule:true})),400);
 await expect(await admin.POST(req(base)),401);
 await expect(await load(root+'/app/api/bookings/route.ts').createBooking(req(base),'',false,true),401);
 const created=await expect(await admin.POST(req(base,cookie)),201); // after course end, Sunday, off hours and custom duration
 const earlier={date:'2098-12-28',start:'20:15',end:'23:45'};
 await expect(await admin.PATCH(req(edit(created.id,earlier),cookie)),200); // before course start and outside recurring hours
 await expect(await admin.PATCH(req(edit(created.id,{date:'2020-01-05',start:'07:00',end:'08:30'}),cookie)),200); // past calendar dates
 await expect(await admin.PATCH(req(edit(created.id,{date:'2099-02-29'}),cookie)),400); // invalid date
 await expect(await admin.PATCH(req(edit(created.id,{start:'18:00',end:'17:00'}),cookie)),400);
 sql.prepare('UPDATE courses SET active=0 WHERE id=?').run('course');
 const midnight=await expect(await admin.POST(req({...base,date:'2099-02-09',start:'23:15',end:'24:00'},cookie)),201); // closed course, midnight endpoint
 await expect(await student(req({...base,date:'2099-01-05',start:'14:00',end:'16:00'})),400);
 await expect(await admin.POST(req({...base,date:'2099-02-09',start:'24:00',end:'24:00'},cookie)),400);
 await expect(await admin.POST(req({...base,date:'2099-02-09',start:'22:00',end:'24:01'},cookie)),400);
 await expect(await admin.POST(req({...base,grade:'중1'},cookie)),400);
 sql.prepare("INSERT INTO reservation_blocks(id,date,start,end,reason,created_at) VALUES('block','2099-02-10','08:00','10:00','휴무','2026-10-26')").run();
 await expect(await admin.POST(req({...base,date:'2099-02-10'},cookie)),409);
 await expect(await admin.PATCH(req(edit(midnight.id,{date:'2099-02-10',start:'08:15',end:'09:45'}),cookie)),409);
 await expect(await admin.POST(req({...base,date:'2099-02-09',start:'23:15',end:'24:00'},cookie)),409); // duplicate
 await expect(await admin.POST(req({...base,date:'2099-02-09',name:'두번째학생',start:'23:15',end:'24:00'},cookie)),201);
 await expect(await admin.POST(req({...base,date:'2099-02-09',name:'세번째학생',start:'23:15',end:'24:00'},cookie)),409);
 sql.prepare("UPDATE bookings SET attendance='present' WHERE id=?").run(created.id);
 await expect(await admin.PATCH(req(edit(created.id,{date:'2099-03-01'}),cookie)),400);
 assert.ok(queued.includes(created.id)&&queued.includes(midnight.id));
 console.log('PASS: admin add/edit outside period, weekday, hours, duration; past/closed-course/midnight; student and unauthenticated restrictions; invalid date/time, target grade, block, duplicate, attendance protections; calendar queue.');
})().catch(e=>{console.error(e);process.exitCode=1});
