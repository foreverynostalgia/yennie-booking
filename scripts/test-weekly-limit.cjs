const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const root=path.resolve(__dirname,'..');
const ts=require(root+'/node_modules/typescript');
const sql=new DatabaseSync(':memory:');
for(const f of fs.readdirSync(root+'/drizzle').filter(x=>x.endsWith('.sql')).sort())sql.exec(fs.readFileSync(root+'/drizzle/'+f,'utf8'));
const env={ADMIN_USERNAME:'test-admin',ADMIN_PASSWORD:'test-only-admin',SESSION_SECRET:'test-only-secret',DB:{prepare(query){let args=[];return {bind(...values){args=values;return this},async all(){return {results:sql.prepare(query).all(...args)}},async first(){return sql.prepare(query).get(...args)||null},async run(){return {meta:{changes:Number(sql.prepare(query).run(...args).changes)}}}}}}};
const queued=[];const stubs={'cloudflare:workers':{env,waitUntil(){}},'@/lib/google-calendar':{queueGoogleCalendarSync:async ids=>queued.push(...ids)},'@/lib/admin-push':{notifyAdminPush:async()=>{}},'@/lib/alimtalk':{sendReservationAlimtalk:async()=> 'unconfigured'}};
const cache={};function load(file){if(stubs[file])return stubs[file];if(file==='next/server')return require(root+'/node_modules/next/server');const full=file.startsWith('@/')?root+'/'+file.slice(2)+'.ts':file; if(cache[full])return cache[full].exports;const mod={exports:{}};cache[full]=mod;new Function('require','exports','module',ts.transpileModule(fs.readFileSync(full,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(id=>load(id.startsWith('.')?path.resolve(path.dirname(full),id)+(path.extname(id)?'':'.ts'):id),mod.exports,mod);return mod.exports}
const {NextRequest}=require(root+'/node_modules/next/server');
function req(body,cookie='',origin='https://test.local'){return new NextRequest('https://test.local/api/test',{method:'POST',headers:{origin,'content-type':'application/json',cookie},body:JSON.stringify(body)})}

const student=load(root+'/app/api/bookings/route.ts').POST,admin=load(root+'/app/api/admin/bookings/route.ts'),courses=load(root+'/app/api/admin/courses/route.ts');
const schedules=Array.from({length:6},(_,day)=>({day,start:'14:00',end:'22:00'}));
const base={name:'김학생',school:'00중',grade:'중2',phone:'01012345678',date:'2099-01-05',courseId:'course',start:'14:00',end:'16:00'};
sql.prepare('INSERT INTO courses(id,title,day,start,end,capacity,weekly_limit,target_grades,schedules) VALUES(?,?,?,?,?,?,?,?,?)').run('course','과학',0,'14:00','22:00',10,1,'["중1","중2","중3"]',JSON.stringify(schedules));
async function expect(response,status){assert.equal(response.status,status,await response.clone().text());return await response.json()}
(async()=>{
 const cookie='admin_session='+await load('@/lib/server').loginCookie();
 await expect(await student(req(base)),201);
 const next={...base,date:'2099-01-06'};
 await expect(await student(req({...next,overrideWeeklyLimit:true})),409);
 await expect(await admin.POST(req({...next,overrideWeeklyLimit:true})),401);
 await expect(await admin.POST(req(next,cookie)),409);
 const added=await expect(await admin.POST(req({...next,overrideWeeklyLimit:true,memo:'보강 예외'},cookie)),201);
 assert.equal(sql.prepare('SELECT admin_memo FROM bookings WHERE id=?').get(added.id).admin_memo,'보강 예외');
 await expect(await admin.POST(req({...next,overrideWeeklyLimit:true},cookie)),409); // duplicate
 await expect(await student(req({...next,date:'2099-01-07',overrideWeeklyLimit:true},cookie)),409); // public route never accepts option
 const old=sql.prepare('SELECT * FROM bookings WHERE id=?').get(added.id);
 const original=JSON.stringify([old.course_id,old.date,old.time_start,old.time_end,old.name,old.school,old.grade,old.phone,old.status,old.attendance,old.requested_date,old.requested_start,old.requested_end,old.admin_memo||'']);
 const patch={...base,date:'2099-01-07',id:added.id,original,memo:'변경 예외'};
 await expect(await admin.PATCH(req(patch,cookie)),409);
 await expect(await admin.PATCH(req({...patch,overrideWeeklyLimit:true},cookie)),200);
 assert.equal(sql.prepare('SELECT date FROM bookings WHERE id=?').get(added.id).date,'2099-01-07');
 sql.prepare("INSERT INTO reservation_blocks(id,date,start,end,reason,created_at) VALUES('block','2099-01-08','14:00','16:00','휴무','2026-10-25')").run();
 await expect(await admin.POST(req({...base,date:'2099-01-08',overrideWeeklyLimit:true},cookie)),409);
 sql.prepare('UPDATE courses SET capacity=1 WHERE id=?').run('course');
 await expect(await admin.POST(req({...base,name:'다른학생',overrideWeeklyLimit:true},cookie)),409); // full
 await expect(await admin.POST(req({...base,date:'2099-01-08',start:'24:00',end:'25:00',overrideWeeklyLimit:true},cookie)),400); // invalid slot
 await expect(await student(req({...base,date:'2099-01-12'})),201); // following week
 const settings={title:'새 과학',capacity:10,weeklyLimit:2,targetGrades:['중2'],startDate:'2099-01-01',endDate:'2099-02-28',schedules,color:'#8bc9f0'};
 const created=await expect(await courses.POST(req(settings,cookie)),200);
 assert.equal(sql.prepare('SELECT weekly_limit FROM courses WHERE id=?').get(created.id).weekly_limit,2);
 const two={...base,courseId:created.id,name:'두번학생'};
 await expect(await student(req(two)),201);await expect(await student(req({...two,date:'2099-01-06'})),201);await expect(await student(req({...two,date:'2099-01-07'})),409);
 await expect(await courses.POST(req({...settings,id:created.id,weeklyLimit:0},cookie)),200);
 await expect(await student(req({...two,date:'2099-01-07'})),201);
 await expect(await courses.POST(req({...settings,weeklyLimit:1.5},cookie)),400);
 await expect(await courses.POST(req({...settings,weeklyLimit:31},cookie)),400);
 console.log('PASS: course weekly limit create/update and unlimited; student limits enforced; admin-only explicit bypass on add/edit; duplicate, capacity, blocked times and valid slots still enforced; next-week allowance.');
})().catch(e=>{console.error(e);process.exitCode=1});
