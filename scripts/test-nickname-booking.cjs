const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const root=path.resolve(__dirname,'..');
const ts=require(root+'/node_modules/typescript');
const sql=new DatabaseSync(':memory:');
for(const f of fs.readdirSync(root+'/drizzle').filter(x=>x.endsWith('.sql')).sort())sql.exec(fs.readFileSync(root+'/drizzle/'+f,'utf8'));
const env={ADMIN_USERNAME:'test-admin',ADMIN_PASSWORD:'test-only-admin',SESSION_SECRET:'test-only-secret',DB:{prepare(query){let args=[];return {bind(...values){args=values;return this},async all(){return {results:sql.prepare(query).all(...args)}},async first(){return sql.prepare(query).get(...args)||null},async run(){return {meta:{changes:Number(sql.prepare(query).run(...args).changes)}}}}}}};
env.DB.batch=async statements=>{sql.exec('BEGIN');try{const values=[];for(const statement of statements)values.push(await statement.run());sql.exec('COMMIT');return values}catch(e){sql.exec('ROLLBACK');throw e}};
const queued=[];const stubs={'cloudflare:workers':{env,waitUntil(){}},'@/lib/google-calendar':{queueGoogleCalendarSync:async ids=>queued.push(...ids)},'@/lib/admin-push':{notifyAdminPush:async()=>{}},'@/lib/alimtalk':{sendReservationAlimtalk:async()=> 'unconfigured'}};
const cache={};function load(file){if(stubs[file])return stubs[file];if(file==='next/server')return require(root+'/node_modules/next/server');const full=file.startsWith('@/')?root+'/'+file.slice(2)+'.ts':file; if(cache[full])return cache[full].exports;const mod={exports:{}};cache[full]=mod;new Function('require','exports','module',ts.transpileModule(fs.readFileSync(full,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(id=>load(id.startsWith('.')?path.resolve(path.dirname(full),id)+(path.extname(id)?'':'.ts'):id),mod.exports,mod);return mod.exports}
const {NextRequest}=require(root+'/node_modules/next/server');
function req(body,cookie='',origin='https://test.local'){return new NextRequest('https://test.local/api/test',{method:'POST',headers:{origin,'content-type':'application/json',cookie},body:JSON.stringify(body)})}




const manage=load(root+'/app/api/admin/students/route.ts'),bookingSession=load(root+'/app/api/student/booking-session/route.ts'),verify=load(root+'/app/api/student/reservation-session/route.ts'),lookup=load(root+'/app/api/lookup/route.ts'),book=load(root+'/app/api/bookings/route.ts'),cancel=load(root+'/app/api/cancel/route.ts'),change=load(root+'/app/api/change/route.ts'),availability=load(root+'/app/api/student/availability/route.ts'),scopes=load(root+'/lib/reservation-session.ts');
const cookieOf=(r,name)=>{const c=r.cookies.getAll().find(c=>c.name===name&&c.value);assert.ok(c,name+' cookie');return name+'='+c.value};
async function expect(r,status){assert.equal(r.status,status,await r.clone().text());return r.json()}
const getReq=cookie=>new NextRequest('https://test.local/api/lookup',{headers:{cookie}});
(async()=>{
 const admin='admin_session='+await load('@/lib/server').loginCookie();
 const one={nickname:'호랑이12',name:'김학생',school:'00중',grade:'중2',phone:'01012345678'},two={nickname:'토끼12',name:'이학생',school:'11중',grade:'중2',phone:'01022223333'};
 const saved=await expect(await manage.POST(req({students:[one,two]},admin)),200);const pin=saved.credentials[0].pin;
 for(const [id,title,parent] of [['video','영상 수강',null],['feedback','피드백 관리','video']])sql.prepare('INSERT INTO courses(id,title,prerequisite_course_id,day,start,end,capacity,weekly_limit,target_grades,schedules,start_date,end_date) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(id,title,parent,0,'14:00','22:00',10,1,'["중2"]','[{"day":0,"start":"14:00","end":"22:00"}]','2099-01-01','2099-12-31');
 let response=await bookingSession.POST(req({nickname:one.nickname,pin,verified:true}));const limited=cookieOf(response,'student_booking');assert.deepEqual(await expect(response,200),{student:{nickname:one.nickname,grade:'중2',verified:false}});
 assert.equal(await scopes.getReservationStudent(req({},limited)),null);assert.equal(await load('@/lib/students').getStudentSession(req({},limited)),null);
 await expect(await lookup.GET(getReq(limited)),401);await expect(await lookup.POST(req(one,limited)),401);
 const base={courseId:'video',date:'2099-01-05',start:'14:00',end:'16:00',studentSession:true};
 const planned=await expect(await book.POST(req({...base,name:two.name,phone:two.phone,grade:'중3'},limited)),201);
 const actual=sql.prepare('SELECT * FROM bookings WHERE id=?').get(planned.id);assert.equal(actual.name,one.name);assert.equal(actual.phone,one.phone);assert.equal(actual.grade,'중2');assert.ok(actual.student_id);
 await expect(await book.POST(req({...base,date:'2099-01-06'},limited)),400);
 await expect(await cancel.POST(req({id:planned.id,...one},limited)),401);await expect(await change.POST(req({id:planned.id,...one,date:'2099-01-12',start:'14:00',end:'16:00'},limited)),401);
 const allowed=await expect(await availability.POST(req({courseId:'feedback',date:'2099-01-05',cart:[]},limited)),200);assert.deepEqual(Object.keys(allowed),['allowedStarts']);assert.ok(allowed.allowedStarts.includes('16:00'));assert.ok(!allowed.allowedStarts.includes('15:00'));
 const feedback=await expect(await book.POST(req({...base,courseId:'feedback',start:'16:00',end:'18:00'},limited)),201);
 const swapped=limited.replace('student_booking=','student_reservation=');await expect(await lookup.GET(getReq(swapped)),401);
 await expect(await verify.POST(req({nickname:one.nickname,credential:'9999'})),401);
 response=await verify.POST(req({nickname:one.nickname,credential:'5678',remember:true}));const verified=cookieOf(response,'student_reservation');assert.deepEqual(await expect(response,200),{student:{nickname:one.nickname,grade:'중2',verified:true}});assert.match(response.headers.get('set-cookie'),/HttpOnly/i);assert.match(response.headers.get('set-cookie'),/Secure/i);assert.match(response.headers.get('set-cookie'),/Max-Age=2592000/);
 assert.equal(await load('@/lib/students').getStudentSession(req({},verified)),null,'reservation verification must not grant OMR authentication');
 const rows=await expect(await lookup.GET(getReq(verified)),200);assert.equal(rows.length,2);assert.ok(rows.every(b=>!('name' in b)&&!('school' in b)&&!('phone' in b)&&!('access_code' in b)));
 await expect(await cancel.POST(req({id:feedback.id,studentSession:true},verified)),200);
 response=await verify.POST(req({nickname:one.nickname,credential:pin.toLowerCase()}));const byPin=cookieOf(response,'student_reservation');await expect(response,200);await expect(await lookup.GET(getReq(byPin)),200);
 response=await bookingSession.POST(req({nickname:two.nickname},verified));const other=cookieOf(response,'student_booking');await expect(response,200);assert.equal(response.cookies.get('student_reservation').value,'');assert.equal(response.cookies.get('student_profile').value,'');assert.equal(response.cookies.get('student_lookup').value,'');await expect(await lookup.GET(getReq(other)),401);
 assert.deepEqual(await expect(await availability.POST(req({courseId:'feedback',date:'2099-01-05'},other)),200),{allowedStarts:[]});
 assert.equal(await scopes.getReservationStudent(req({},byPin+'x')),null);
 sql.prepare('DELETE FROM student_login_attempts').run();for(let i=0;i<5;i++)await expect(await verify.POST(req({nickname:one.nickname,credential:'9999'})),401);await expect(await verify.POST(req({nickname:one.nickname,credential:'5678'})),429);
 sql.prepare('DELETE FROM student_login_attempts').run();await expect(await verify.POST(req({nickname:one.nickname,credential:'5678'},'','https://elsewhere.local')),403);
 sql.prepare('DELETE FROM student_login_attempts').run();for(let i=0;i<10;i++){const request=req({nickname:one.nickname,credential:'9999'});request.headers.set('cf-connecting-ip','192.0.2.'+(i+1));await expect(await verify.POST(request),401)}const blocked=req({nickname:one.nickname,credential:'5678'});blocked.headers.set('cf-connecting-ip','192.0.2.99');await expect(await verify.POST(blocked),429);
 sql.prepare('UPDATE students SET phone=? WHERE nickname=?').run('01012340000',one.nickname);assert.equal(await scopes.getReservationStudent(req({},verified)),null);assert.equal(await scopes.getBookingStudent(req({},limited)),null);
 sql.prepare('UPDATE students SET active=0 WHERE nickname=?').run(two.nickname);await expect(await bookingSession.POST(req({nickname:two.nickname})),401);
 console.log('PASS: nickname-only booking with server-owned identity; no history/cancel/change/OMR access; scoped-cookie forgery rejection; prerequisite availability without history; PIN or phone-suffix verification; private lookup and pending cancellation; rate limit/origin checks; account-switch cookie clearing; phone changes and deactivation revoke scopes.');
})().catch(e=>{console.error(e);process.exitCode=1});
