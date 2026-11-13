const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),ts=require(root+'/node_modules/typescript');
let mode='script',last;
const booking={id:'test-booking',course_id:'course',color:'#8BC9F0',calendar_label:'A',date:'2026-11-10',name:'김학생',school:'중학교',grade:'중3',status:'confirmed',attendance:'present',start:'16:00',end:'18:00'};
const stubs={'cloudflare:workers':{env:{},waitUntil(){}},'@/lib/server':{db:()=>({prepare:()=>({bind(){return this},first:async()=>booking,run:async()=>({})})})},'@/lib/script-calendar':{getScriptConnection:async()=>mode==='script'?{url:'https://example.test/script',secret:'test'}:null},'@/lib/make-calendar':{getMakeWebhook:async()=>mode==='make'?'https://example.test/make':null}};
const cache={};function load(file){if(stubs[file])return stubs[file];const full=file.startsWith('@/')?root+'/'+file.slice(2)+'.ts':file;if(cache[full])return cache[full].exports;const mod={exports:{}};cache[full]=mod;new Function('require','exports','module',ts.transpileModule(fs.readFileSync(full,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(id=>load(id.startsWith('.')?path.resolve(path.dirname(full),id)+(path.extname(id)?'':'.ts'):id),mod.exports,mod);return mod.exports}
const {calendarBookingTitle}=load(root+'/lib/calendar-display.ts');
for(const [state,text] of [['present','출석'],['absent','결석'],['late','지각'],['excused','사유 결석']])assert.equal(calendarBookingTitle('김학생','A',state),`김학생 (${text})`);
assert.equal(calendarBookingTitle('김학생',null,'late'),'김학생 (지각)');
assert.equal(calendarBookingTitle('김학생','A','unmarked'),'김학생');
assert.equal(calendarBookingTitle('김학생','A','unknown'),'김학생');
global.fetch=async(url,options)=>{last=JSON.parse(options.body);return new Response(JSON.stringify({ok:true,version:3}),{headers:{'content-type':'application/json'}})};
(async()=>{const {syncGoogleCalendarBooking}=load(root+'/lib/google-calendar.ts');for(mode of ['script','make']){await syncGoogleCalendarBooking(booking.id);assert.equal(last.eventTitle,'김학생 (출석)');assert.equal(last.name,last.eventTitle);assert.equal(last.studentName,'김학생');booking.attendance='late';await syncGoogleCalendarBooking(booking.id);assert.equal(last.eventTitle,'김학생 (지각)');booking.attendance='unmarked';await syncGoogleCalendarBooking(booking.id);assert.equal(last.eventTitle,'김학생');booking.attendance='present';}console.log('PASS calendar attendance titles, status replacement/reset, Script and Make payloads');})().catch(e=>{console.error(e);process.exitCode=1});
