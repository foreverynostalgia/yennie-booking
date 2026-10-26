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



const manage=load(root+'/app/api/admin/students/route.ts'),session=load(root+'/app/api/student/session/route.ts'),book=load(root+'/app/api/bookings/route.ts'),lookup=load(root+'/app/api/lookup/route.ts'),cancel=load(root+'/app/api/cancel/route.ts'),change=load(root+'/app/api/change/route.ts');
const studentLib=load(root+'/lib/students.ts');
const reveal=load(root+'/app/api/admin/students/pin/route.ts').GET;
const pinRequest=(id,cookie='')=>new NextRequest('https://test.local/api/admin/students/pin?id='+encodeURIComponent(id),{headers:{cookie}});
const imports=load(root+'/lib/student-import.ts');
const one={nickname:'호랑이12',name:'김학생',school:'00중',grade:'중2',phone:'01012345678',pin:'012345'};
const two={nickname:'토끼12',name:'이학생',school:'11중',grade:'중2',phone:'01022223333',pin:'654321'};
const booking={courseId:'course',date:'2099-01-05',start:'14:00',end:'16:00',studentSession:true};
sql.prepare('INSERT INTO courses(id,title,day,start,end,capacity,weekly_limit,target_grades,schedules,start_date,end_date) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run('course','과학',0,'14:00','22:00',10,1,'["중2"]','[{"day":0,"start":"14:00","end":"22:00"}]','2099-01-01','2099-12-31');
sql.prepare('INSERT INTO bookings(id,course_id,date,time_start,time_end,name,school,grade,phone,access_code,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?)').run('legacy','course','2099-01-12','14:00','16:00',one.name,one.school,one.grade,one.phone,'YE0001','2026-10-26');
async function expect(response,status){assert.equal(response.status,status,JSON.stringify(await response.clone().json()));return response.json()}
const cookieOf=r=>r.headers.get('set-cookie').split(';')[0];
(async()=>{
 const adminCookie='admin_session='+await load(root+'/lib/server.ts').loginCookie();
 await expect(await manage.GET(req({})),401);await expect(await manage.POST(req(one)),401);
 const saved=await expect(await manage.POST(req({students:[one,two]},adminCookie)),200);assert.equal(saved.saved,2);for(const item of saved.credentials)assert.match(item.pin,/^YE\d{4}$/);one.pin=saved.credentials[0].pin;two.pin=saved.credentials[1].pin;
 assert.ok(await studentLib.verifyPin('ye0007',await studentLib.pinHash('YE0007')));assert.ok(await studentLib.verifyPin('012345',await studentLib.pinHash('012345')));assert.equal(await studentLib.verifyPin('YE12',await studentLib.pinHash('YE0012')),false);
 const first=sql.prepare('SELECT * FROM students WHERE nickname=?').get(one.nickname);assert.notEqual(first.pin_hash,one.pin);assert.ok(!first.pin_hash.includes(one.pin));assert.equal(sql.prepare('SELECT student_id FROM bookings WHERE id=?').get('legacy').student_id,first.id);
 const preserved=await expect(await manage.POST(req({...one,id:first.id,pin:'YE9999'},adminCookie)),200);assert.deepEqual(preserved.credentials,[]);assert.equal(sql.prepare('SELECT pin_hash FROM students WHERE id=?').get(first.id).pin_hash,first.pin_hash);
 const encrypted=sql.prepare('SELECT pin_encrypted FROM students WHERE id=?').get(first.id).pin_encrypted;assert.ok(encrypted&&!encrypted.includes(one.pin));
 await expect(await reveal(pinRequest(first.id)),403);
 const pinResponse=await reveal(pinRequest(first.id,adminCookie));assert.match(pinResponse.headers.get('Cache-Control'),/no-store/);assert.equal((await expect(pinResponse,200)).pin,one.pin);
 const savedCipher=encrypted;sql.prepare('UPDATE students SET pin_encrypted=NULL WHERE id=?').run(first.id);assert.equal((await expect(await reveal(pinRequest(first.id,adminCookie)),200)).pin,null);sql.prepare('UPDATE students SET pin_encrypted=? WHERE id=?').run(savedCipher,first.id);
 await expect(await reveal(pinRequest('unknown',adminCookie)),404);
 const list=await expect(await manage.GET(req({},adminCookie)),200);assert.ok(list.students.every(s=>!('pin_hash' in s)&&!('pin' in s)&&!('pin_encrypted' in s)));
 await expect(await manage.POST(req({...two,nickname:one.nickname},adminCookie)),409);
 await expect(await manage.POST(req({students:[{...one,nickname:'new01',phone:'01033334444'},{...two,nickname:'x'}]},adminCookie)),400);assert.equal(sql.prepare('SELECT COUNT(*) n FROM students').get().n,2);
 await expect(await session.POST(req({nickname:one.nickname,pin:'000000'})),401);
 await expect(await session.POST(req({nickname:one.nickname,pin:one.pin},'','https://elsewhere.local')),403);
 let response=await session.POST(req({nickname:one.nickname,pin:one.pin.toLowerCase(),remember:true}));const a=cookieOf(response),safe=await expect(response,200);assert.deepEqual(safe.student,{nickname:one.nickname,grade:'중2'});assert.match(response.headers.get('set-cookie'),/HttpOnly/i);assert.match(response.headers.get('set-cookie'),/Max-Age=2592000/);
 assert.equal((await expect(await session.GET(req({},a)),200)).student.nickname,one.nickname);
 assert.equal((await expect(await session.GET(req({},a+'x')),200)).student,null);
 await expect(await book.POST(req(booking)),401);
 await expect(await book.POST(req({...booking,...one,studentSession:false})),401); // legacy identity cannot bypass enrollment
 const created=await expect(await book.POST(req({...booking,name:two.name,phone:two.phone,grade:'중3'},a)),201);const stored=sql.prepare('SELECT * FROM bookings WHERE id=?').get(created.id);assert.equal(stored.name,one.name);assert.equal(stored.phone,one.phone);assert.equal(stored.student_id,first.id);
 await expect(await book.POST(req({...booking,start:'16:00',end:'18:00'},a)),409); // weekly limit
 const rows=await expect(await lookup.POST(req({},a)),200);assert.equal(rows.length,2);assert.ok(rows.every(b=>!('name' in b)&&!('phone' in b)&&!('school' in b)&&!('access_code' in b)));
 await expect(await lookup.POST(req({name:one.name,phone:one.phone})),401);
 const secondResponse=await session.POST(req({nickname:two.nickname,pin:two.pin}));const b=cookieOf(secondResponse);await expect(secondResponse,200);
 await expect(await cancel.POST(req({id:created.id,name:one.name,phone:one.phone},b)),404);
 await expect(await change.POST(req({id:created.id,date:'2099-01-06',start:'14:00',end:'16:00'},b)),404);
 await expect(await change.POST(req({id:created.id,date:'2099-01-05',start:'16:00',end:'18:00'},a)),200);assert.equal(sql.prepare('SELECT status FROM bookings WHERE id=?').get(created.id).status,'change_pending');
 await expect(await cancel.POST(req({id:'legacy'},a)),200);assert.equal(sql.prepare('SELECT status FROM bookings WHERE id=?').get('legacy').status,'cancel_pending');
 // Academy is optional, bounded, retained by old clients, and never included in student sessions.
 await expect(await manage.POST(req({...one,id:first.id,academy:'산본 과학학원'},adminCookie)),200);
 assert.equal(sql.prepare('SELECT academy FROM students WHERE id=?').get(first.id).academy,'산본 과학학원');
 await expect(await manage.POST(req({...one,id:first.id},adminCookie)),200);assert.equal(sql.prepare('SELECT academy FROM students WHERE id=?').get(first.id).academy,'산본 과학학원');
 await expect(await manage.POST(req({...one,id:first.id,academy:'x'.repeat(81)},adminCookie)),400);
 assert.equal((await expect(await session.GET(req({},a)),200)).student.academy,undefined);
 assert.equal(imports.parseStudentImport('닉네임,이름,학교,학년,연락처,소속 학원\n학원테스트,김학생,00중,중2,01012345678,산본 과학학원')[0].academy,'산본 과학학원');
 // Identity changes keep access to linked reservation history; a new PIN revokes existing sessions.
 await expect(await manage.POST(req({...one,id:first.id,name:'김새이름',phone:'01099998888',pin:''},adminCookie)),200);
 assert.equal((await expect(await lookup.POST(req({},a)),200)).length,2);
 const reset=await expect(await manage.POST(req({...one,id:first.id,resetPin:true},adminCookie)),200);assert.match(reset.credentials[0].pin,/^YE\d{4}$/);assert.notEqual(reset.credentials[0].pin,one.pin);assert.equal((await expect(await session.GET(req({},a)),200)).student,null);assert.equal((await expect(await reveal(pinRequest(first.id,adminCookie)),200)).pin,reset.credentials[0].pin);
 await expect(await manage.POST(req({...one,id:first.id,pin:'',active:false},adminCookie)),200);
 await expect(await session.POST(req({nickname:one.nickname,pin:reset.credentials[0].pin})),401);
 sql.prepare('DELETE FROM student_login_attempts').run();for(let i=0;i<5;i++)await expect(await session.POST(req({nickname:'unknown',pin:'000000'})),401);await expect(await session.POST(req({nickname:'unknown',pin:'000000'})),429);
 const parsed=imports.parseStudentImport('\uFEFF닉네임,이름,학교,학년,연락처,예약PIN\r\n호랑이12,김학생,"00중, 분교",중2,01012345678,012345\r\n');assert.equal(parsed[0].school,'00중, 분교');assert.equal(parsed[0].pin,'012345');assert.equal(parsed[0].phone,'01012345678');assert.throws(()=>imports.parseStudentImport('이름,학교\n김학생,00중'));assert.throws(()=>imports.parseStudentImport('닉네임,이름,학교,학년,연락처\n"oops'));
 console.log('PASS: protected student CRUD/import and duplicate validation; hashed PIN, masked sessions, brute-force limits; legacy linking; nickname booking uses server identity and weekly limits; isolated lookup/cancel/change; profile updates, PIN revocation and inactive student rejection; CSV quoting/BOM/leading zero validation.');
})().catch(e=>{console.error(e);process.exitCode=1});
