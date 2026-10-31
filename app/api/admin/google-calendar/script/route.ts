import {NextRequest} from 'next/server';
import {admin,fail,json,protectedMutation} from '@/lib/server';
import {prepareScript,saveScriptUrl,removeScriptConnection} from '@/lib/script-calendar';
import {removeMakeWebhook} from '@/lib/make-calendar';

export async function POST(req:NextRequest){
 if(!await protectedMutation(req))return fail('관리자 로그인이 필요합니다.',401);
 try{const code=await prepareScript(new URL(req.url).origin);await removeMakeWebhook();return json({code})}catch{return fail('스크립트를 준비하지 못했습니다.',500)}
}
export async function PUT(req:NextRequest){
 if(!await protectedMutation(req))return fail('관리자 로그인이 필요합니다.',401);
 try{const {url}=await req.json() as {url?:string};await saveScriptUrl(String(url||'').trim());return json({ok:true})}catch(error){return fail(error instanceof Error?error.message:'주소를 저장하지 못했습니다.')}
}
export async function DELETE(req:NextRequest){
 if(!await protectedMutation(req))return fail('관리자 로그인이 필요합니다.',401);
 await removeScriptConnection();return json({ok:true})
}
