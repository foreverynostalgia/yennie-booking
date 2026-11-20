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




const studentPin=load(root+'/lib/student-pin.ts'),students=load(root+'/lib/students.ts');
const session=load(root+'/app/api/student/session/route.ts'),reservation=load(root+'/app/api/student/reservation-session/route.ts');
const reveal=load(root+'/app/api/admin/students/pin/route.ts').GET;
const server=load(root+'/lib/server.ts');
(async()=>{
 const view=async id=>(await reveal(new NextRequest('https://test.local/api/admin/students/pin?id='+id,{headers:{cookie:ownerCookie}}))).json();
 // Student migrated from the old host: hash works, encrypted copy made with the OLD key.
 env.SESSION_SECRET='old-host-secret-0123456789abcdef0123456789';
 const oldCopy=await studentPin.encryptStudentPin('YE1234','s-mig');
 const oldCopy2=await studentPin.encryptStudentPin('YE5678','s-mig2');
 env.SESSION_SECRET='new-host-secret-fedcba9876543210fedcba9876';
 const ownerCookie='admin_session='+await server.loginCookie();
 const now=new Date().toISOString();
 for(const [id,nick,pin,copy] of [['s-mig','migrated','YE1234',oldCopy],['s-mig2','migrated2','YE5678',oldCopy2],['s-none','nocopy','YE4321',null]])
  sql.prepare('INSERT INTO students(id,nickname,name,school,academy,grade,phone,pin_hash,pin_encrypted,active,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,1,?,?)').run(id,nick,'가상'+id,'학교','','중3','0100000'+id.length+nick.length,await students.pinHash(pin),copy,now,now);
 // Before any login: admin sees a clear pending message, not a server error.
 const before=await view('s-mig');assert.equal(before.pin,null);assert.equal(before.pending,true);assert.match(before.message,/한 번 로그인/);
 // Wrong PIN never touches the stored copy.
 assert.equal((await session.POST(req({nickname:'migrated',pin:'YE9999'}))).status,401);
 assert.equal(sql.prepare('SELECT pin_encrypted p FROM students WHERE id=?').get('s-mig').p,oldCopy);
 // Correct PIN login (lower-case input) succeeds and heals the copy.
 assert.equal((await session.POST(req({nickname:'migrated',pin:' ye1234 '}))).status,200);
 const healed=sql.prepare('SELECT pin_encrypted p FROM students WHERE id=?').get('s-mig').p;assert.notEqual(healed,oldCopy);
 assert.deepEqual(await view('s-mig'),{nickname:'migrated',pin:'YE1234'});
 // Logging in again leaves an already-valid copy alone.
 assert.equal((await session.POST(req({nickname:'migrated',pin:'YE1234'}))).status,200);
 assert.equal(sql.prepare('SELECT pin_encrypted p FROM students WHERE id=?').get('s-mig').p,healed);
 // Reservation-lookup login path heals too.
 assert.equal((await reservation.POST(req({nickname:'migrated2',credential:'YE5678'}))).status,200);
 assert.deepEqual(await view('s-mig2'),{nickname:'migrated2',pin:'YE5678'});
 // Students with no stored copy gain one after logging in.
 assert.equal((await view('s-none')).pin,null);
 assert.equal((await session.POST(req({nickname:'nocopy',pin:'YE4321'}))).status,200);
 assert.deepEqual(await view('s-none'),{nickname:'nocopy',pin:'YE4321'});
 // Healing failure (e.g. DB write error) never blocks the login itself.
 const original=env.DB.prepare;env.DB.prepare=q=>{if(/^UPDATE students SET pin_encrypted/.test(q))throw new Error('write failed');return original.call(env.DB,q)};
 sql.prepare('UPDATE students SET pin_encrypted=? WHERE id=?').run(oldCopy,'s-mig');
 assert.equal((await session.POST(req({nickname:'migrated',pin:'YE1234'}))).status,200);
 env.DB.prepare=original;
 console.log('PIN copy refresh checks passed: pending message, wrong PIN untouched, heal on login and reservation lookup, idempotent, missing copy filled, failure does not block login.');
})().catch(e=>{console.error(e);process.exit(1)});
