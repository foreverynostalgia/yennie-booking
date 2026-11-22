import {NextRequest} from 'next/server';
import {admin,fail,json,protectedMutation} from '@/lib/server';
import {bucket} from '@/lib/learning';
import {limitedBytes} from '@/lib/learning-ocr';
import {EXAM_IMAGE_KEY} from '@/lib/learning-grading';

// Question and explanation images for question papers (문제지).
const MAX_IMAGE_BYTES=5*1024*1024;
function imageType(b:Uint8Array):{ext:string;mime:string}|null{
 if(b[0]===0x89&&b[1]===0x50&&b[2]===0x4e&&b[3]===0x47)return {ext:'png',mime:'image/png'};
 if(b[0]===0xff&&b[1]===0xd8&&b[2]===0xff)return {ext:'jpg',mime:'image/jpeg'};
 if(b[0]===0x52&&b[1]===0x49&&b[2]===0x46&&b[3]===0x46&&b[8]===0x57&&b[9]===0x45&&b[10]===0x42&&b[11]===0x50)return {ext:'webp',mime:'image/webp'};
 if(b[0]===0x47&&b[1]===0x49&&b[2]===0x46&&b[3]===0x38)return {ext:'gif',mime:'image/gif'};
 return null;
}
export async function PUT(req:NextRequest){
 if(!await protectedMutation(req))return fail('전체 관리자 권한이 필요합니다.',403);
 const params=new URL(req.url).searchParams,paper=params.get('paper')||'',slot=params.get('slot')||'';
 if(!/^[a-f0-9-]{36}$/.test(paper)||!/^[qe]-[a-zA-Z0-9_-]{1,64}$/.test(slot))return fail('문항을 확인해 주세요.');
 try{
  const bytes=await limitedBytes(req.body,MAX_IMAGE_BYTES).catch(()=>{throw Error('이미지는 5MB 이하여야 합니다.')});
  const type=imageType(bytes);if(!type)return fail('PNG·JPG·WEBP·GIF 이미지만 올릴 수 있습니다.');
  const key=`exam-images/${paper}/${slot.toLowerCase()}-${crypto.randomUUID().slice(0,8)}.${type.ext}`;
  if(!EXAM_IMAGE_KEY.test(key))return fail('문항을 확인해 주세요.');
  await bucket().put(key,bytes,{httpMetadata:{contentType:type.mime}});
  return json({key});
 }catch(e){return fail(e instanceof Error?e.message:'이미지를 올리지 못했습니다.',400)}
}
export async function GET(req:NextRequest){
 if(!await admin(req))return fail('전체 관리자 권한이 필요합니다.',403);
 const key=new URL(req.url).searchParams.get('key')||'';
 if(!EXAM_IMAGE_KEY.test(key))return fail('이미지를 찾을 수 없습니다.',404);
 const object=await bucket().get(key);if(!object)return fail('이미지를 찾을 수 없습니다.',404);
 return new Response(object.body,{headers:{'Content-Type':object.httpMetadata?.contentType||'application/octet-stream','Cache-Control':'private, max-age=3600','X-Content-Type-Options':'nosniff'}});
}
