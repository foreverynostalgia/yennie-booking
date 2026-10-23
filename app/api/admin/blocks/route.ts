import {NextRequest} from 'next/server';
import {admin,db,fail,json,protectedMutation} from '@/lib/server';
import {validDate} from '@/lib/course-period';
export async function GET(req:NextRequest){
 if(!await admin(req))return fail('관리자 로그인이 필요합니다.',401);
 try{return json((await db().prepare('SELECT id,NULL AS course_id,scope_mode,course_ids,date,start,end,reason,created_at FROM reservation_blocks ORDER BY date DESC,start').all()).results)}catch{return fail('예약 차단 목록을 불러오지 못했습니다.',503)}
}
async function save(req:NextRequest,editing=false){
 if(!await protectedMutation(req))return fail('관리자 로그인이 필요합니다.',401);
 try{
  const x=await req.json() as Record<string,unknown>,date=String(x.date||''),start=String(x.start||''),end=String(x.end||''),reason=String(x.reason||'').trim(),mode=x.scopeMode??'all';
  if(!validDate(date)||!/^([01]\d|2[0-3]):[0-5]\d$/.test(start)||!/^(([01]\d|2[0-3]):[0-5]\d|24:00)$/.test(end)||start>=end||reason.length>200)return fail('날짜와 시작·종료 시간을 확인해 주세요.');
  if(!['all','include','exclude'].includes(String(mode)))return fail('차단 적용 방식을 선택해 주세요.');
  const ids=mode==='all'?[]:x.courseIds;
  if(!Array.isArray(ids)||ids.length>500||ids.some(id=>typeof id!=='string'||!id||id.length>100)||new Set(ids).size!==ids.length||(mode==='include'&&!ids.length))return fail('차단할 수업을 하나 이상 선택해 주세요.');
  const serialized=JSON.stringify(ids);
  if(ids.length){const known=await db().prepare('SELECT COUNT(*) AS count FROM courses WHERE id IN (SELECT value FROM json_each(?))').bind(serialized).first<{count:number}>();if(known?.count!==ids.length)return fail('선택한 수업을 찾을 수 없습니다. 새로고침 후 다시 선택해 주세요.',409)}
  const id=editing?new URL(req.url).searchParams.get('id'):crypto.randomUUID();
  if(!id)return fail('차단 항목을 선택해 주세요.');
  if(editing){const result=await db().prepare('UPDATE reservation_blocks SET course_id=NULL,scope_mode=?,course_ids=?,date=?,start=?,end=?,reason=? WHERE id=?').bind(mode,serialized,date,start,end,reason,id).run();if(!result.meta.changes)return fail('차단 항목을 찾을 수 없습니다.',404)}
  else await db().prepare('INSERT INTO reservation_blocks (id,course_id,scope_mode,course_ids,date,start,end,reason,created_at) VALUES (?,NULL,?,?,?,?,?,?,?)').bind(id,mode,serialized,date,start,end,reason,new Date().toISOString()).run();
  return json({ok:true,id},editing?200:201);
 }catch{return fail('예약 차단을 저장하지 못했습니다.',503)}
}
export async function POST(req:NextRequest){return save(req)}
export async function PATCH(req:NextRequest){return save(req,true)}
export async function DELETE(req:NextRequest){
 if(!await protectedMutation(req))return fail('관리자 로그인이 필요합니다.',401);
 try{const id=new URL(req.url).searchParams.get('id');if(!id)return fail('차단 항목을 선택해 주세요.');const r=await db().prepare('DELETE FROM reservation_blocks WHERE id=?').bind(id).run();return r.meta.changes?json({ok:true}):fail('이미 해제된 항목입니다.',404)}catch{return fail('차단을 해제하지 못했습니다.',503)}
}
