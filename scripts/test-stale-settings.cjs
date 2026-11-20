const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const {DatabaseSync}=require('node:sqlite');
const root=path.resolve(__dirname,'..');
const ts=require(root+'/node_modules/typescript');
const sql=new DatabaseSync(':memory:');
for(const f of fs.readdirSync(root+'/drizzle').filter(x=>x.endsWith('.sql')).sort())sql.exec(fs.readFileSync(root+'/drizzle/'+f,'utf8'));
const env={SESSION_SECRET:'old-host-secret-0123456789abcdef0123456789',DB:{prepare(query){let args=[];return {bind(...values){args=values;return this},async all(){return {results:sql.prepare(query).all(...args)}},async first(){return sql.prepare(query).get(...args)||null},async run(){return {meta:{changes:Number(sql.prepare(query).run(...args).changes)}}}}}}};
const stubs={'cloudflare:workers':{env,waitUntil(){}}};
const cache={};function load(file){if(stubs[file])return stubs[file];if(file==='next/server')return require(root+'/node_modules/next/server');const full=file.startsWith('@/')?root+'/'+file.slice(2)+'.ts':file;if(cache[full])return cache[full].exports;const mod={exports:{}};cache[full]=mod;new Function('require','exports','module',ts.transpileModule(fs.readFileSync(full,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(id=>load(id.startsWith('.')?path.resolve(path.dirname(full),id)+(path.extname(id)?'':'.ts'):id),mod.exports,mod);return mod.exports}
const script=load(root+'/lib/script-calendar.ts'),make=load(root+'/lib/make-calendar.ts'),ocr=load(root+'/lib/learning-ocr.ts'),pin=load(root+'/lib/student-pin.ts');
(async()=>{
 // Settings written under the previous host's key...
 await script.prepareScript('https://old.example');
 await make.storeMakeWebhook('https://hook.eu1.make.com/abcdefghijklmnopqrstuvwx').catch(()=>{});
 sql.prepare("INSERT INTO learning_ocr_settings(id,key_encrypted,updated_at) VALUES('upstage',?,?)").run(await pin.encryptStudentPin('up_test_key_0123456789','learning-ocr-upstage-v1'),new Date().toISOString());
 // ...are read after moving to a new key.
 env.SESSION_SECRET='new-host-secret-fedcba9876543210fedcba9876';
 assert.equal(await script.getScriptConnection(),null,'stale script setting reads as not connected');
 assert.equal(await make.getMakeWebhook(),null,'stale Make webhook reads as not connected');
 assert.equal(await ocr.ocrKey(),null,'stale OCR key reads as not configured');
 // Preparing a new script replaces the stale row with one readable under the new key.
 const code=await script.prepareScript('https://new.example');
 assert.match(code,/https:\/\/new\.example/);
 const again=await script.prepareScript('https://new.example');
 assert.equal(again,code,'same secret reused once readable');
 console.log('Stale settings checks passed: script, Make and OCR settings from a previous server key read as unconfigured, and re-preparing the script works.');
})().catch(e=>{console.error(e);process.exit(1)});
