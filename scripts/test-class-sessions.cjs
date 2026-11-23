// 수업 관리 회차 ↔ 시험 · 성적표: roster links, exam swap/remove guards, report publish/unpublish, student view isolation.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{DatabaseSync}=require('node:sqlite');const root=path.resolve(__dirname,'..'),ts=require(root+'/node_modules/typescript'),sql=new DatabaseSync(':memory:');for(const f of fs.readdirSync(root+'/drizzle').filter(x=>x.endsWith('.sql')).sort())sql.exec(fs.readFileSync(root+'/drizzle/'+f,'utf8'));
const files=new Map(),deleted=[];
const env={ADMIN_USERNAME:'test-admin',ADMIN_PASSWORD:'test-only',SESSION_SECRET:'test-secret',LEARNING_FILES:{async put(k,v,o){files.set(k,{bytes:v,type:o?.httpMetadata?.contentType})},async get(k){const f=files.get(k);return f?{body:new Blob([f.bytes]).stream(),httpMetadata:{contentType:f.type}}:null},async delete(keys){for(const k of [].concat(keys)){deleted.push(k);files.delete(k)}},async list({prefix}){return {objects:[...files.keys()].filter(k=>k.startsWith(prefix)).map(key=>({key}))}}},DB:{prepare(q){let args=[];return {bind(...v){args=v;return this},async all(){return {results:sql.prepare(q).all(...args)}},async first(){return sql.prepare(q).get(...args)||null},async run(){return {meta:{changes:Number(sql.prepare(q).run(...args).changes)}}}}},async batch(list){sql.exec('BEGIN');try{for(const s of list)await s.run();sql.exec('COMMIT')}catch(e){sql.exec('ROLLBACK');throw e}}}};
const cache={};function load(file){if(file==='cloudflare:workers')return {env,waitUntil(){}};if(file==='next/server')return require(root+'/node_modules/next/server');const full=file.startsWith('@/')?root+'/'+file.slice(2)+'.ts':file;if(cache[full])return cache[full].exports;const mod={exports:{}};cache[full]=mod;new Function('require','exports','module',ts.transpileModule(fs.readFileSync(full,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(load,mod.exports,mod);return mod.exports}
const {NextRequest,NextResponse}=require(root+'/node_modules/next/server');const server=load('@/lib/server'),students=load('@/lib/students'),admin=load(root+'/app/api/admin/learning/route.ts'),omr=load(root+'/app/api/student/learning/route.ts'),reports=load(root+'/app/api/student/reports/route.ts');
(async()=>{
 const cookie='admin_session='+await server.loginCookie();
 const post=(body)=>admin.POST(new NextRequest('https://test.local/api/admin/learning',{method:'POST',headers:{origin:'https://test.local',cookie,'Content-Type':'application/json'},body:JSON.stringify(body)}));
 const expect=async(r,status)=>{assert.equal(r.status,status,await r.clone().text());return r.json()};
 for(const [id,nick] of [['sa','nicka'],['sb','nickb'],['sc','nickc']])sql.prepare("INSERT INTO students(id,nickname,name,school,grade,phone,pin_hash,active,created_at,updated_at) VALUES(?,?,?,?,?,?,?,1,'t','t')").run(id,nick,'학생'+id,'00중','중3','0100000000'+id.length,'x');
 const studentCookie=async id=>{const s=sql.prepare('SELECT * FROM students WHERE id=?').get(id);const res=NextResponse.json({});await students.setStudentSession(res,new NextRequest('https://test.local/x'),s,true);return res.headers.get('set-cookie').split(';')[0]};
 const asStudent=async(id,route,url)=>route.GET(new NextRequest('https://test.local'+url,{headers:{cookie:await studentCookie(id)}}));
 const paperA='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',paperB='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
 for(const id of [paperA,paperB])await expect(await post({action:'paper-save',id,title:'문제지 '+id[0],questions:[{id:'q1',type:'choice',prompt:'1번',points:100,answers:['2']}]}),200);
 // distribute to a 회차 of one 분반: roster = sa, sb
 const base={classId:'cls_sat',sessionId:'ses_3',label:'[중3] 통합과학 (토) · 3회차'};
 await expect(await post({...base,action:'session-exam',examId:paperA,studentIds:['sa','zz']}),400);
 const {linkId}=await expect(await post({...base,action:'session-exam',examId:paperA,studentIds:['sa','sb']}),200);
 assert.equal(sql.prepare('SELECT published FROM learning_exams WHERE id=?').get(paperA).published,1);
 const link=sql.prepare('SELECT * FROM learning_exam_links WHERE id=?').get(linkId);assert.equal(link.course_id,'class-sessions');assert.equal(link.class_id,'cls_sat');
 // the same 회차 again updates roster (no second link); another 분반 gets its own link
 await expect(await post({...base,action:'session-exam',examId:paperA,studentIds:['sa','sb','sc']}),200);assert.equal(sql.prepare("SELECT count(*) n FROM learning_exam_links WHERE class_id='cls_sat'").get().n,1);
 await expect(await post({...base,action:'session-exam',examId:paperA,studentIds:['sa','sb']}),200);
 const other=await expect(await post({classId:'cls_mon',sessionId:'ses_3',label:'[중3] 통합과학 (월) · 3회차',action:'session-exam',examId:paperA,studentIds:['sc']}),200);assert.notEqual(other.linkId,linkId);
 // OMR access follows the roster, not bookings; label shown instead of lesson number
 const okA=await expect(await asStudent('sa',omr,'/api/student/learning?assignment='+linkId),200);assert.equal(okA.exam.courseTitle,base.label);assert.equal(okA.exam.lessonNo,null);
 await expect(await asStudent('sc',omr,'/api/student/learning?assignment='+linkId),403);
 await expect(await asStudent('sc',omr,'/api/student/learning?assignment='+other.linkId),200);
 // submit, then swapping/removing the paper is blocked
 const submit=await omr.POST(new NextRequest('https://test.local/api/student/learning',{method:'POST',headers:{origin:'https://test.local',cookie:await studentCookie('sa'),'Content-Type':'application/json'},body:JSON.stringify({examId:paperA,assignmentId:linkId,answers:{q1:'2'}})}));assert.equal(submit.status,200,await submit.clone().text());
 const att=sql.prepare('SELECT * FROM learning_attempts WHERE link_id=?').get(linkId);assert.equal(att.score,100);
 await expect(await post({...base,action:'session-exam',examId:paperB,studentIds:['sa','sb']}),409);
 await expect(await post({...base,action:'session-exam-remove'}),409);
 // a 회차 without answers can switch paper or be unlinked
 await expect(await post({classId:'cls_mon',sessionId:'ses_3',label:'월 3회차',action:'session-exam',examId:paperB,studentIds:['sc']}),200);assert.equal(sql.prepare('SELECT exam_id FROM learning_exam_links WHERE id=?').get(other.linkId).exam_id,paperB);
 assert.equal((await expect(await post({classId:'cls_mon',sessionId:'ses_3',action:'session-exam-remove'}),200)).removed,true);
 // admin data lists links with roster info
 const data=await expect(await admin.GET(new NextRequest('https://test.local/api/admin/learning',{headers:{cookie}})),200);assert.ok(data.links.some(l=>l.id===linkId&&l.session_id==='ses_3'));assert.deepEqual(data.sessionReports,[]);
 // publish a report card: each student sees only their own row
 const items=[{id:'att',name:'출결',type:'list'},{id:'score',name:'테스트 점수',type:'score'},{id:'memo',name:'개별 전달 사항',type:'text'}];
 const report={...base,action:'session-report-publish',title:'3회차',className:'[중3] 통합과학 (토)',date:'2026-08-01',items,rows:{sa:{att:'출석',score:'100',memo:'잘했어요',unknown:'x'},sb:{att:'지각',score:'70'}},materials:{notes:'교재 12~15쪽',items:[{title:'복습 영상',url:'https://www.youtube.com/watch?v=abc',kind:'video'}]}};
 await expect(await post({...report,materials:{items:[{title:'x',url:'http://insecure.test'}]}}),400);
 await expect(await post({...report,rows:{zz:{}}}),400);
 await expect(await post(report),200);
 const ra=await expect(await asStudent('sa',reports,'/api/student/reports'),200);assert.equal(ra.reports.length,1);assert.deepEqual(ra.reports[0].items.map(i=>i.value),['출석','100','잘했어요']);assert.equal(ra.reports[0].materials.items[0].kind,'video');assert.ok(!JSON.stringify(ra).includes('지각'),'no other student data');
 const rb=await expect(await asStudent('sb',reports,'/api/student/reports'),200);assert.deepEqual(rb.reports[0].items.map(i=>i.name),['출결','테스트 점수']);
 assert.equal((await expect(await asStudent('sc',reports,'/api/student/reports'),200)).reports.length,0);
 assert.equal((await reports.GET(new NextRequest('https://test.local/api/student/reports'))).status,401);
 // re-publish updates in place; unpublish hides it
 await expect(await post({...report,rows:{sa:{score:'90'}}}),200);assert.equal(sql.prepare('SELECT count(*) n FROM learning_session_reports').get().n,1);
 assert.equal((await expect(await asStudent('sb',reports,'/api/student/reports'),200)).reports.length,0,'removed from roster');
 await expect(await post({...base,action:'session-report-unpublish'}),200);assert.equal((await expect(await asStudent('sa',reports,'/api/student/reports'),200)).reports.length,0);
 // the hidden course never shows up as a real course
 assert.equal(sql.prepare("SELECT active FROM courses WHERE id='class-sessions'").get().active,-1);
 console.log('Class session checks passed: roster-scoped exam links, label display, swap/remove guarded by answers, report cards per student, https-only materials, unpublish.');
})().catch(e=>{console.error(e);process.exit(1)});
