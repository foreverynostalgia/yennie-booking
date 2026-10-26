import {env} from 'cloudflare:workers';
import {NextRequest} from 'next/server';
import {fail,json,loginCookie} from '@/lib/server';
// A server-only credential is configured on the owner-private manager and this backend.
// It is never sent to a browser or accepted as a student credential.
export async function POST(req:NextRequest){const key=String((env as unknown as Record<string,string>).MANAGER_SERVICE_KEY||''),provided=req.headers.get('authorization')||'';if(key.length<40||provided.length!==key.length+7)return fail('접근할 수 없습니다.',403);const expected='Bearer '+key;let diff=0;for(let i=0;i<expected.length;i++)diff|=expected.charCodeAt(i)^provided.charCodeAt(i);if(diff)return fail('접근할 수 없습니다.',403);try{return json({token:await loginCookie()})}catch{return fail('관리자 서비스를 확인하지 못했습니다.',503)}}
