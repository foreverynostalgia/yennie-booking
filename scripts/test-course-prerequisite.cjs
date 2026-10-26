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



env.DB.batch=async statements=>{sql.exec('BEGIN');try{const results=[];for(const statement of statements)results.push(await statement.all());sql.exec('COMMIT');return results}catch(e){sql.exec('ROLLBACK');throw e}};
const bulk=load(root+'/app/api/admin/bookings/cancel/route.ts'),studentBooking=load(root+'/app/api/bookings/route.ts');
const courses=load(root+'/app/api/admin/courses/route.ts'),admin=load(root+'/app/api/admin/bookings/route.ts');
const relation=load(root+'/lib/course-prerequisite.ts');
(async()=>{
 const cookie='admin_session='+await load('@/lib/server').loginCookie();
 const form={title:'영상 수강',color:'#8bc9f0',capacity:10,targetGrades:['중2'],schedules:[{day:0,start:'14:00',end:'22:00'}],startDate:'2099-01-01',endDate:'2099-12-31'};
 async function expect(response,status){assert.equal(response.status,status,await response.clone().text());return response.json()}
 const video=(await expect(await courses.POST(req(form,cookie)),200)).id;
 const feedback=(await expect(await courses.POST(req({...form,title:'피드백',prerequisiteCourseId:video},cookie)),200)).id;
 assert.equal(sql.prepare('SELECT prerequisite_course_id FROM courses WHERE id=?').get(feedback).prerequisite_course_id,video);
 await expect(await courses.POST(req({...form,id:video,prerequisiteCourseId:feedback},cookie)),400);
 await expect(await courses.POST(req({...form,id:feedback,prerequisiteCourseId:feedback},cookie)),400);
 await expect(await courses.POST(req({...form,prerequisiteCourseId:'missing'},cookie)),400);
 const base={name:'김학생',school:'00중',grade:'중2',phone:'01012345678',date:'2099-01-05',start:'14:00',end:'16:00'};
 await expect(await admin.POST(req({...base,courseId:feedback},cookie)),409);
 const first=await expect(await admin.POST(req({...base,courseId:video},cookie)),201);
 await expect(await admin.POST(req({...base,courseId:feedback,start:'15:00',end:'17:00'},cookie)),409);
 await expect(await admin.POST(req({...base,courseId:feedback,phone:'01099999999',start:'16:00',end:'18:00'},cookie)),409);
 const second=await expect(await admin.POST(req({...base,courseId:feedback,start:'16:00',end:'18:00'},cookie)),201);
 await expect(await admin.POST(req({...base,courseId:video,start:'16:00',end:'18:00'},cookie)),409);
 assert.throws(()=>sql.prepare("UPDATE bookings SET status='cancelled' WHERE id=?").run(first.id),/COURSE_PREREQUISITE/);
 assert.throws(()=>sql.prepare("UPDATE bookings SET status='change_pending',requested_date='2099-01-05',requested_start='18:00',requested_end='20:00' WHERE id=?").run(first.id),/COURSE_PREREQUISITE/);
 assert.throws(()=>sql.prepare("UPDATE bookings SET time_start='18:00',time_end='20:00' WHERE id=?").run(first.id),/COURSE_PREREQUISITE/);
 assert.throws(()=>sql.prepare("UPDATE bookings SET status='change_pending',requested_date='2099-01-05',requested_start='15:00',requested_end='17:00' WHERE id=?").run(second.id),/COURSE_PREREQUISITE/);
 await expect(await bulk.POST(req({ids:[first.id]},cookie)),409);
 assert.equal(sql.prepare('SELECT status FROM bookings WHERE id=?').get(first.id).status,'confirmed');
 const cancelled=await expect(await bulk.POST(req({ids:[first.id,second.id]},cookie)),200);assert.equal(cancelled.cancelledIds.length,2);
 const studentBase={...base,name:'이학생',phone:'01022223333'};
 await expect(await studentBooking.POST(req({...studentBase,courseId:feedback,start:'16:00',end:'18:00'})),409);
 await expect(await studentBooking.POST(req({...studentBase,courseId:video})),201);
 await expect(await studentBooking.POST(req({...studentBase,courseId:feedback,start:'15:00',end:'17:00'})),409);
 await expect(await studentBooking.POST(req({...studentBase,courseId:feedback,start:'16:00',end:'18:00'})),201);
 assert.equal(relation.hasPrerequisite(video,'2099-01-05','16:00',[{courseId:video,date:'2099-01-05',end:'16:00'}]),true);
 assert.equal(relation.hasPrerequisite(video,'2099-01-05','15:30',[{courseId:video,date:'2099-01-05',end:'16:00'}]),false);
 assert.equal(relation.hasPrerequisite(video,'2099-01-05','16:00',[{courseId:video,date:'2099-01-05',end:'16:00',status:'cancelled'}]),false);
 console.log('PASS: course prerequisite persistence, cycle/self/missing rejection; administrator bypass denied; same-time and reversed schedules rejected; boundary accepted; other-student isolation; predecessor cancellation/move and pending feedback move protected; cart helper matches server.');
})().catch(e=>{console.error(e);process.exitCode=1});
