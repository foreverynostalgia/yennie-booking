const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),ts=require(root+'/node_modules/typescript');
const env={ADMIN_USERNAME:'primary-test',ADMIN_PASSWORD:'primary-test-secret',ADMIN_SECONDARY_USERNAME:'secondary-test',ADMIN_SECONDARY_PASSWORD:'secondary-test-secret',SESSION_SECRET:'session-test-secret'};
const stubs={'cloudflare:workers':{env}};
const cache={};function load(file){if(stubs[file])return stubs[file];if(file==='next/server')return require(root+'/node_modules/next/server');const full=file.startsWith('@/')?root+'/'+file.slice(2)+'.ts':file; if(cache[full])return cache[full].exports;const mod={exports:{}};cache[full]=mod;new Function('require','exports','module',ts.transpileModule(fs.readFileSync(full,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(id=>load(id.startsWith('.')?path.resolve(path.dirname(full),id)+(path.extname(id)?'':'.ts'):id),mod.exports,mod);return mod.exports}
const {NextRequest}=require(root+'/node_modules/next/server');
function req(body,cookie='',origin='https://test.local'){return new NextRequest('https://test.local/api/test',{method:'POST',headers:{origin,'content-type':'application/json',cookie},body:JSON.stringify(body)})}


const login=load(root+'/app/api/admin/login/route.ts').POST;
const server=load(root+'/lib/server.ts');
(async()=>{
 for(const [username,password] of [['primary-test','primary-test-secret'],['secondary-test','secondary-test-secret']]){
  const response=await login(req({username,password}));assert.equal(response.status,200);
  const cookie=response.headers.get('set-cookie');assert.match(cookie,/HttpOnly/i);assert.match(cookie,/Secure/i);
  assert.equal(await server.adminRole(req({},cookie)),username==='primary-test'?'owner':'student_manager');assert.equal(await server.admin(req({},cookie)),username==='primary-test');assert.equal(await server.protectedMutation(req({},cookie)),username==='primary-test');
 }
 for(const body of [{username:'primary-test',password:'secondary-test-secret'},{username:'secondary-test',password:'primary-test-secret'},{username:'unknown',password:'secondary-test-secret'},{username:'secondary-test',password:''},{username:'secondary-test',password:123},{}])assert.equal((await login(req(body))).status,401);
 assert.equal((await login(req({username:'secondary-test',password:'secondary-test-secret'},'','https://other.local'))).status,403);
 delete env.ADMIN_SECONDARY_USERNAME;delete env.ADMIN_SECONDARY_PASSWORD;
 assert.equal((await login(req({username:'primary-test',password:'primary-test-secret'}))).status,200);
 assert.equal((await login(req({username:'secondary-test',password:'secondary-test-secret'}))).status,401);
 console.log('PASS: both administrators can log in with protected sessions; mismatched credentials, invalid input and cross-origin login rejected; primary login works without secondary configuration.');
})().catch(e=>{console.error(e);process.exitCode=1});
