const fs=require('node:fs'),ts=require('typescript'),assert=require('node:assert/strict');
const mod={exports:{}};new Function('exports','module',ts.transpileModule(fs.readFileSync('lib/google-script-http.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(mod.exports,mod);
const run=mod.exports.requestGoogleScript,url='https://script.google.com/macros/s/example/exec',payload={token:'test-secret',action:'diagnose'};
(async()=>{
 let calls=[];global.fetch=async(u,o)=>{calls.push({u,o});return calls.length===1?new Response(null,{status:302,headers:{location:'https://script.googleusercontent.com/macros/echo?key=test'}}):new Response('{"ok":true,"version":5}',{headers:{'content-type':'text/plain'}})};
 const x=await run(url,payload);assert.equal(x.result.version,5);assert.equal(calls[0].o.redirect,'manual');assert.equal(calls[1].o.method,'GET');assert.equal(calls[1].o.body,undefined);assert.equal(calls[1].o.headers,undefined);
 global.fetch=async()=>new Response(null,{status:302,headers:{location:'https://accounts.google.com/login'}});await assert.rejects(()=>run(url,payload),/로그인 또는 외부/);
 global.fetch=async()=>new Response(null,{status:307,headers:{location:'https://script.googleusercontent.com/macros/echo'}});await assert.rejects(()=>run(url,payload),/POST 재전송/);
 global.fetch=async()=>new Response('<html><title>Google Drive</title>Unable to open file</html>',{headers:{'content-type':'text/html'}});await assert.rejects(()=>run(url,payload),/배포 파일을 열지/);
 global.fetch=async()=>new Response('<html>ServiceLogin</html>');await assert.rejects(()=>run(url,payload),/로그인 페이지/);
 global.fetch=async()=>Response.json({foo:'bar'});await assert.rejects(()=>run(url,payload),/다른 형식/);
 global.fetch=async()=>new Response('{"ok":false,"error":"예약 ID 오류"}',{headers:{'content-type':'application/json'}});assert.equal((await run(url,payload)).result.error,'예약 ID 오류');
 console.log('PASS ContentService POST→302→GET, JSON with nonstandard MIME, secret isolation, login/307/HTML/schema errors');
})().catch(e=>{console.error(e);process.exitCode=1});
