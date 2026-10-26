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



const courseApi=load(root+'/app/api/admin/courses/route.ts'),book=load(root+'/app/api/bookings/route.ts').POST,slots=load(root+'/lib/booking-slots.ts');
async function expect(response,status){assert.equal(response.status,status,await response.clone().text());return response.json()}
(async()=>{
 const cookie='admin_session='+await load('@/lib/server').loginCookie();
 const form={title:'무료클리닉',color:'#8bc9f0',capacity:10,targetGrades:['중2'],schedules:[{day:0,start:'14:00',end:'18:00'}],startDate:'2099-01-01',endDate:'2099-12-31',bookingMinutes:60};
 const {id}=await expect(await courseApi.POST(req(form,cookie)),200);
 assert.equal(sql.prepare('SELECT booking_minutes FROM courses WHERE id=?').get(id).booking_minutes,60);
 const base={name:'김학생',school:'00중',grade:'중2',phone:'01012345678',date:'2099-01-05',courseId:id,start:'14:00',end:'15:00'};
 const saved=await expect(await book(req(base)),201);
 await expect(await book(req({...base,name:'다른학생',phone:'01022223333',end:'16:00'})),400);
 await expect(await courseApi.POST(req({...form,id,title:'이름 변경',bookingMinutes:90},cookie)),200);
 await expect(await book(req({...base,name:'다른학생',phone:'01022223333',start:'15:00',end:'16:00'})),400);
 await expect(await book(req({...base,name:'다른학생',phone:'01022223333',start:'15:00',end:'16:30'})),201);
 assert.equal(sql.prepare('SELECT time_end FROM bookings WHERE id=?').get(saved.id).time_end,'15:00');
 await expect(await courseApi.POST(req({...form,id,title:'다시 이름 변경',bookingMinutes:undefined},cookie)),200);
 assert.equal(sql.prepare('SELECT booking_minutes FROM courses WHERE id=?').get(id).booking_minutes,90);
 const lookup=load(root+'/app/api/lookup/route.ts'),change=load(root+'/app/api/change/route.ts'),approve=load(root+'/app/api/admin/changes/route.ts');
 const response=await lookup.POST(req({name:base.name,phone:base.phone}));await expect(response,200);const studentCookie=response.headers.get('set-cookie').split(';')[0];
 await expect(await change.POST(req({id:saved.id,name:base.name,phone:base.phone,date:'2099-01-12',start:'14:00',end:'15:00'},studentCookie)),400);
 await expect(await change.POST(req({id:saved.id,name:base.name,phone:base.phone,date:'2099-01-12',start:'14:00',end:'15:30'},studentCookie)),200);
 await expect(await approve.POST(req({id:saved.id,decision:'approve'},cookie)),200);
 assert.equal(sql.prepare('SELECT time_end FROM bookings WHERE id=?').get(saved.id).time_end,'15:30');
 await expect(await courseApi.POST(req({...form,title:'짧은 운영',schedules:[{day:0,start:'21:00',end:'22:00'}]},cookie)),200);
 await expect(await courseApi.POST(req({...form,schedules:[{day:0,start:'21:00',end:'22:00'}],bookingMinutes:120},cookie)),400);
 for(const value of [0,-30,45,301,Infinity])await expect(await courseApi.POST(req({...form,bookingMinutes:value},cookie)),400);
 assert.equal(slots.bookingMinutes('무료클리닉',null),60);assert.equal(slots.bookingMinutes('일반 수업',null),120);assert.equal(slots.bookingMinutes('무료클리닉',120),120);
 assert.equal(slots.bookingSlots('무료클리닉',[{day:0,start:'14:00',end:'16:00'}],90)[0].end,'15:30');
 console.log('PASS: per-course booking duration persisted; student creation enforces configured duration; rename and omitted-field edits preserve setting; existing bookings unchanged; 1h operating window accepted; short windows/invalid values rejected; legacy fallback preserved.');
})().catch(e=>{console.error(e);process.exitCode=1});
