import {NextRequest} from 'next/server';import {json,sameOrigin} from '@/lib/server';
export async function POST(req:NextRequest){if(!sameOrigin(req))return json({error:'요청을 확인할 수 없습니다.'},403);const r=json({ok:true});r.cookies.delete('admin_session');return r}
