// 문제지 (question papers): validation, save/update/delete, images, grading.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{DatabaseSync}=require('node:sqlite');const root=path.resolve(__dirname,'..'),ts=require(root+'/node_modules/typescript'),sql=new DatabaseSync(':memory:');for(const f of fs.readdirSync(root+'/drizzle').filter(x=>x.endsWith('.sql')).sort())sql.exec(fs.readFileSync(root+'/drizzle/'+f,'utf8'));
const files=new Map(),deleted=[];
const env={ADMIN_USERNAME:'test-admin',ADMIN_PASSWORD:'test-only',SESSION_SECRET:'test-secret',LEARNING_FILES:{async put(k,v,o){files.set(k,{bytes:v,type:o?.httpMetadata?.contentType})},async get(k){const f=files.get(k);return f?{body:new Blob([f.bytes]).stream(),httpMetadata:{contentType:f.type}}:null},async delete(keys){for(const k of [].concat(keys)){deleted.push(k);files.delete(k)}},async list({prefix}){return {objects:[...files.keys()].filter(k=>k.startsWith(prefix)).map(key=>({key}))}}},DB:{prepare(q){let args=[];return {bind(...v){args=v;return this},async all(){return {results:sql.prepare(q).all(...args)}},async first(){return sql.prepare(q).get(...args)||null},async run(){return {meta:{changes:Number(sql.prepare(q).run(...args).changes)}}}}},async batch(list){sql.exec('BEGIN');try{for(const s of list)await s.run();sql.exec('COMMIT')}catch(e){sql.exec('ROLLBACK');throw e}}}};
const cache={};function load(file){if(file==='cloudflare:workers')return {env,waitUntil(){}};if(file==='next/server')return require(root+'/node_modules/next/server');const full=file.startsWith('@/')?root+'/'+file.slice(2)+'.ts':file;if(cache[full])return cache[full].exports;const mod={exports:{}};cache[full]=mod;new Function('require','exports','module',ts.transpileModule(fs.readFileSync(full,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText)(load,mod.exports,mod);return mod.exports}
const {NextRequest}=require(root+'/node_modules/next/server');const server=load('@/lib/server'),grading=load('@/lib/learning-grading'),learning=load('@/lib/learning'),admin=load(root+'/app/api/admin/learning/route.ts'),image=load(root+'/app/api/admin/learning/image/route.ts');
const PNG=new Uint8Array([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a,1,2,3]);
(async()=>{
 const cookie='admin_session='+await server.loginCookie();
 const post=(body)=>admin.POST(new NextRequest('https://test.local/api/admin/learning',{method:'POST',headers:{origin:'https://test.local',cookie,'Content-Type':'application/json'},body:JSON.stringify(body)}));
 const expect=async(r,status)=>{assert.equal(r.status,status,await r.clone().text());return r.json()};
 // --- validation
 const v=grading.validQuestions;
 const imgKey=id=>`exam-images/11111111-1111-4111-8111-111111111111/q-${id}-abcd1234.png`;
 const choiceImg=v([{id:'q1',type:'choice',prompt:'',imageKey:imgKey('q1'),points:5,answers:['3','1']}])[0];
 assert.deepEqual(choiceImg.answers,['1','3'],'multiple correct answers, sorted');assert.equal(choiceImg.choices,undefined);
 assert.throws(()=>v([{id:'q1',type:'choice',prompt:'',points:5,answers:['1']}]),/문항 형식/,'needs text or image');
 assert.throws(()=>v([{id:'q1',type:'choice',prompt:'p',choices:['a','b','','',''],points:5,answers:['1']}]),/모두 입력하거나 모두 비워/);
 assert.throws(()=>v([{id:'q1',type:'choice',prompt:'p',points:5,answers:[]}]),/정답 번호/);
 assert.throws(()=>v([{id:'q1',type:'choice',prompt:'p',points:5,answers:['6']}]),/정답 번호/);
 assert.throws(()=>v([{id:'q1',type:'short',prompt:'p',imageKey:'../../etc/passwd',points:5,answers:['a']}]),/이미지/);
 assert.equal(v(Array.from({length:200},(_,i)=>({id:'q'+(i+1),type:'ox',prompt:'p',points:1,answers:['O']}))).length,200);
 assert.throws(()=>v(Array.from({length:201},(_,i)=>({id:'q'+(i+1),type:'ox',prompt:'p',points:1,answers:['O']}))),/1~200/);
 const full=v([{id:'q1',type:'short',prompt:'p',points:5,answers:['산화'],explanation:'전자를 잃음',tag:'개념 이해',explanationImageKey:imgKey('e1').replace('q-e1','e-q1')}])[0];
 assert.equal(full.tag,'개념 이해');assert.equal(full.explanation,'전자를 잃음');
 const safe=learning.studentQuestions([full,choiceImg]);
 for(const k of ['answers','explanation','explanationImageKey','tag','imageKey'])assert.ok(!(k in safe[0]),k+' hidden from students');
 assert.deepEqual(safe[1].choices,['①','②','③','④','⑤'],'image-only choice gets numbered options');
 // multiple correct answers both score
 const g=grading.gradeAnswers([choiceImg],{q1:'3'});assert.equal(g.score,100);assert.equal(grading.gradeAnswers([choiceImg],{q1:'2'}).score,0);
 // --- images
 const paperId='22222222-2222-4222-8222-222222222222';
 const put=(slot,bytes,id=paperId)=>image.PUT(new NextRequest(`https://test.local/api/admin/learning/image?paper=${id}&slot=${slot}`,{method:'PUT',headers:{origin:'https://test.local',cookie},body:bytes}));
 const up=await expect(await put('q-q1',PNG),200);assert.match(up.key,/^exam-images\/22222222-2222-4222-8222-222222222222\/q-q1-[a-f0-9]{8}\.png$/);
 await expect(await put('q-q1',new TextEncoder().encode('<svg onload=1>')),400);
 await expect(await put('q-q1',new Uint8Array(5*1024*1024+10).fill(0x89)),400);
 await expect(await put('../x',PNG),400);await expect(await put('q-q1',PNG,'not-a-uuid'),400);
 const noAuth=await image.PUT(new NextRequest(`https://test.local/api/admin/learning/image?paper=${paperId}&slot=q-q1`,{method:'PUT',headers:{origin:'https://test.local'},body:PNG}));assert.equal(noAuth.status,403);
 const got=await image.GET(new NextRequest('https://test.local/api/admin/learning/image?key='+encodeURIComponent(up.key),{headers:{cookie}}));assert.equal(got.status,200);assert.equal(got.headers.get('content-type'),'image/png');assert.equal((await got.arrayBuffer()).byteLength,PNG.length);
 assert.equal((await image.GET(new NextRequest('https://test.local/api/admin/learning/image?key=exams/x.pdf',{headers:{cookie}}))).status,404);
 // --- save (create) without a class
 const qs=[{id:'q1',type:'choice',prompt:'',imageKey:up.key,points:50,answers:['2'],tag:'자료 해석'},{id:'q2',type:'essay',prompt:'설명하시오',points:50,answers:['모범답안'],keywords:[{text:'전자',points:20}]}];
 await expect(await post({action:'paper-save',id:paperId,title:'5주차 주간지',questions:qs,cropMargin:12}),200);
 const row=sql.prepare('SELECT * FROM learning_exams WHERE id=?').get(paperId);assert.equal(row.course_id,'paper-library');assert.equal(row.student_ids,'[]');assert.equal(row.crop_margin,12);assert.equal(row.published,0);
 await expect(await post({action:'paper-save',id:paperId,title:'',questions:qs}),400);
 await expect(await post({action:'paper-save',id:'x',title:'t',questions:qs}),400);
 // saving a paper made from a recognised file removes that OCR job (and its files)
 const job=(id,src)=>{sql.prepare("INSERT INTO learning_ocr_jobs(id,filename,mime,source_key,request_id,status,draft,error,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)").run(id,'a.pdf','application/pdf',src,'r','ready','{}',null,'t','t');files.set(src,{bytes:new Uint8Array([1])});files.set('ocr-results/'+id+'/1.json',{bytes:new Uint8Array([1])})};
 const j1='33333333-3333-4333-8333-333333333333',j2='44444444-4444-4444-8444-444444444444';job(j1,'ocr-sources/'+j1+'.pdf');job(j2,'ocr-sources/'+j2+'.pdf');
 sql.prepare("INSERT INTO learning_exams(id,course_id,title,questions,student_ids,paper_key,published,created_at) VALUES('old-exam','paper-library','옛 시험','[]','[]',?,0,'t')").run('ocr-sources/'+j2+'.pdf');
 const p2='55555555-5555-4555-8555-555555555555',p3='66666666-6666-4666-8666-666666666666';
 await expect(await post({action:'paper-save',id:p2,title:'인식 문제지',questions:[qs[1]],ocrJobId:j1}),200);
 assert.equal(sql.prepare('SELECT count(*) n FROM learning_ocr_jobs WHERE id=?').get(j1).n,0,'job removed from OCR list');assert.ok(!files.has('ocr-sources/'+j1+'.pdf')&&!files.has('ocr-results/'+j1+'/1.json'),'job files removed');
 await expect(await post({action:'paper-save',id:p3,title:'인식 문제지2',questions:[qs[1]],ocrJobId:j2}),200);
 assert.equal(sql.prepare('SELECT count(*) n FROM learning_ocr_jobs WHERE id=?').get(j2).n,0);assert.ok(files.has('ocr-sources/'+j2+'.pdf'),'original kept while an older exam uses it');assert.ok(!files.has('ocr-results/'+j2+'/1.json'));
 sql.prepare("DELETE FROM learning_exams WHERE id IN ('old-exam',?,?)").run(p2,p3);
 // library course never appears in course lists
 assert.equal(sql.prepare("SELECT count(*) n FROM courses WHERE active>=0 AND id='paper-library'").get().n,0);
 // update: replacing an image deletes the old object
 const up2=await expect(await put('q-q1',PNG),200);const orphan=await expect(await put('q-q2',PNG),200);
 await expect(await post({action:'paper-save',id:paperId,title:'5주차 주간지 (수정)',questions:[{...qs[0],imageKey:up2.key},qs[1]]}),200);
 assert.ok(deleted.includes(up.key),'old image removed');assert.ok(deleted.includes(orphan.key)&&!files.has(orphan.key),'unused upload (re-crop) removed');assert.ok(files.has(up2.key));
 // once answers exist, scoring changes are blocked but explanations/tags may change
 sql.prepare("INSERT INTO courses(id,title,day,start,end,capacity) VALUES('c','과학',1,'16:00','18:30',10)").run();
 sql.prepare("INSERT INTO students(id,nickname,name,school,grade,phone,pin_hash,active,created_at,updated_at) VALUES('s','nick','학생','00중','중3','01000000000','x',1,'t','t')").run();
 sql.prepare("INSERT INTO learning_attempts(id,exam_id,student_id,answers,grading,score,pending,created_at) VALUES('a1',?,'s','{}','[]',0,0,'t')").run(paperId);
 const current=JSON.parse(sql.prepare('SELECT questions FROM learning_exams WHERE id=?').get(paperId).questions);
 const blocked=await expect(await post({action:'paper-save',id:paperId,title:'t',questions:[{...current[0],answers:['3']},current[1]]}),409);assert.match(blocked.error,/복사해서/);
 await expect(await post({action:'paper-save',id:paperId,title:'t',questions:[{...current[0],explanation:'해설 추가',tag:'개념'},current[1]]}),200);
 // delete: papers with answers are kept; others go with their files
 const other='33333333-3333-4333-8333-333333333333';const otherImg=await expect(await put('q-q1',PNG,other),200);
 await expect(await post({action:'paper-save',id:other,title:'빈 문제지',questions:[{id:'q1',type:'ox',prompt:'',imageKey:otherImg.key,points:100,answers:['O']}]}),200);
 const del=await expect(await post({action:'paper-delete',ids:[paperId,other]}),200);
 assert.deepEqual(del.deleted,[other]);assert.deepEqual(del.kept,['t']);assert.ok(!sql.prepare('SELECT 1 FROM learning_exams WHERE id=?').get(other));assert.ok(deleted.includes(otherImg.key));
 console.log('Question paper checks passed: image-only/multi-answer choice, 200 limit, hidden explanations, image upload validation, classless save, image replacement cleanup, answer-key lock after submissions, safe delete.');
})().catch(e=>{console.error(e);process.exit(1)});
