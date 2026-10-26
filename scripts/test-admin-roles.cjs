const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const root=path.resolve(__dirname,'..');
const ts=require(root+'/node_modules/typescript');
const sql=new DatabaseSync(':memory:');
for(const f of fs.readdirSync(root+'/drizzle').filter(x=>x.endsWith('.sql')).sort())sql.exec(fs.readFileSync(root+'/drizzle/'+f,'utf8'));
const env={ADMIN_USERNAME:'test-admin',ADMIN_PASSWORD:'test-only-admin',ADMIN_SECONDARY_USERNAME:'1630sci',ADMIN_SECONDARY_PASSWORD:'viewer-test-secret',SESSION_SECRET:'test-only-secret',DB:{prepare(query){let args=[];return {bind(...values){args=values;return this},async all(){return {results:sql.prepare(query).all(...args)}},async first(){return sql.prepare(query).get(...args)||null},async run(){return {meta:{changes:Number(sql.prepare(query).run(...args).changes)}}}}}}};
env.DB.batch=async statements=>{sql.exec('BEGIN');try{const values=[];for(const statement of statements)values.push(await statement.run());sql.exec('COMMIT');return values}catch(e){sql.exec('ROLLBACK');throw e}};
const queued=[];const stubs={'cloudflare:workers':{env,waitUntil(){}},'@/lib/google-calendar':{queueGoogleCalendarSync:async ids=>queued.push(...ids)},'@/lib/admin-push':{notifyAdminPush:async()=>{}},'@/lib/alimtalk':{sendReservationAlimtalk:async()=> 'unconfigured'}};
const cache={};function load(file){if(stubs[file])return stubs[file];if(file==='next/server')return require(root+'/node_modules/next/server');if(file==='react'||file==='react/jsx-runtime')return require(root+'/node_modules/'+file);let full=file.startsWith('@/')?root+'/'+file.slice(2):file;if(!path.extname(full)){if(fs.existsSync(full+'.ts'))full+='.ts';else if(fs.existsSync(full+'.tsx'))full+='.tsx';else return require(full)} if(cache[full])return cache[full].exports;const mod={exports:{}};cache[full]=mod;new Function('require','exports','module',ts.transpileModule(fs.readFileSync(full,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,target:ts.ScriptTarget.ES2022}}).outputText)(id=>load(id.startsWith('.')?path.resolve(path.dirname(full),id)+(path.extname(id)?'':'.ts'):id),mod.exports,mod);return mod.exports}
const {NextRequest}=require(root+'/node_modules/next/server');
function req(body,cookie='',origin='https://test.local'){return new NextRequest('https://test.local/api/test',{method:'POST',headers:{origin,'content-type':'application/json',cookie},body:JSON.stringify(body)})}




stubs['@/lib/alimtalk'].alimtalkConfigured=()=>false;
const server=load(root+'/lib/server.ts'),login=load(root+'/app/api/admin/login/route.ts').POST;
function request(url,method,cookie,body={}){return new NextRequest('https://test.local'+url,{method,headers:{origin:'https://test.local',cookie,'content-type':'application/json'},...(method==='GET'?{}:{body:JSON.stringify(body)})})}
function routeFiles(dir){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(entry=>entry.isDirectory()?routeFiles(path.join(dir,entry.name)):entry.name==='route.ts'?[path.join(dir,entry.name)]:[])}
(async()=>{
 const owner='admin_session='+await server.loginCookie();
 const response=await login(req({username:'1630sci',password:'viewer-test-secret'}));assert.equal(response.status,200);assert.equal((await response.json()).role,'viewer');
 const viewer=response.headers.get('set-cookie').split(';')[0];
 assert.equal(await server.adminRole(req({},owner)),'owner');assert.equal(await server.adminRole(req({},viewer)),'viewer');assert.equal(await server.admin(req({},viewer)),false);assert.equal(await server.protectedMutation(req({},viewer)),false);
 assert.equal(await server.adminRole(req({},viewer.replace('1630sci','test-admin'))),null);assert.equal(await server.adminRole(req({},viewer+'x')),null);
 // Old indistinguishable sessions must be revoked, even with a previously valid MAC.
 const secretKey=await crypto.subtle.importKey('raw',new TextEncoder().encode(env.SESSION_SECRET),{name:'HMAC',hash:'SHA-256'},false,['sign']);const expiry=String(Date.now()+100000);const mac=Buffer.from(await crypto.subtle.sign('HMAC',secretKey,new TextEncoder().encode(expiry))).toString('hex');assert.equal(await server.adminRole(req({},'admin_session='+expiry+'.'+mac)),null);
 let denied=0;
 for(const file of routeFiles(root+'/app/api/admin')){
  const endpoint='/api/admin/'+path.relative(root+'/app/api/admin',path.dirname(file)).replaceAll(path.sep,'/');
  if(endpoint.endsWith('/login')||endpoint.endsWith('/logout'))continue;
  const module=load(file);
  for(const method of ['POST','PUT','PATCH','DELETE'])if(module[method]){const result=await module[method](request(endpoint,method,viewer));assert.ok([401,403].includes(result.status),endpoint+' '+method+' must be denied');denied++}
 }
 for(const endpoint of ['blocks','push','google-calendar']){const result=await load(root+'/app/api/admin/'+endpoint+'/route.ts').GET(request('/api/admin/'+endpoint,'GET',viewer));assert.ok([401,403].includes(result.status),endpoint+' settings must be private')}
 for(const [route,query] of [['calendar','?month=2099-01'],['planner','?start=2099-01-01&days=7'],['students','']]){
  const result=await load(root+'/app/api/admin/'+route+'/route.ts').GET(request('/api/admin/'+route+query,'GET',viewer));assert.equal(result.status,200,route);assert.equal(result.headers.get('cache-control'),'no-store');
 }
 const data=load(root+'/app/api/admin/data/route.ts');const limited=await data.GET(request('/api/admin/data','GET',viewer));assert.deepEqual(await limited.json(),{role:'viewer',courses:[],bookings:[],alimtalkConfigured:false});
 const full=await data.GET(request('/api/admin/data','GET',owner));assert.equal(full.status,200);assert.equal((await full.json()).role,'owner');
 const students=load(root+'/app/api/admin/students/route.ts');const saved=await students.POST(request('/api/admin/students','POST',owner,{nickname:'권한테스트',name:'김학생',school:'00중',grade:'중2',phone:'01012345678'}));assert.equal(saved.status,200);
 const list=await students.GET(request('/api/admin/students','GET',viewer));const records=(await list.json()).students;assert.equal(records.length,1);assert.equal(records[0].name,'김학생');assert.ok(!('pin_hash' in records[0]));
 // Read-only rendering contains filters and list, and no enrollment/import/PIN actions.
 const React=require(root+'/node_modules/react'),{renderToStaticMarkup}=require(root+'/node_modules/react-dom/server');stubs['@/hooks/use-live-refresh']={useLiveRefresh(){},announceBookingChange(){}};
 const component=load(root+'/app/admin/students-manager.tsx').default;
 const html=renderToStaticMarkup(React.createElement(component,{readOnly:true}));assert.ok(html.includes('등록 학생 목록'));assert.ok(!html.includes('학생 개별 등록'));assert.ok(!html.includes('type="file"'));assert.ok(!html.includes('CSV 양식 내려받기'));
 console.log(`PASS: viewer calendar/planner/student reads; ${denied} admin mutation methods denied; settings and full reservation data blocked; full owner control preserved; cookie role tamper and legacy sessions rejected; student viewer UI hides write actions.`);
})().catch(e=>{console.error(e);process.exitCode=1});
