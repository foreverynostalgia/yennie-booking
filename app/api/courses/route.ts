import { db,json } from '@/lib/server';
export async function GET(){try{const result=await db().prepare('SELECT id,title,day,start,end,capacity FROM courses WHERE active=1 ORDER BY day,start').all();return json(result.results)}catch{return json({error:'수업 목록을 불러오지 못했습니다.'},503)}}
