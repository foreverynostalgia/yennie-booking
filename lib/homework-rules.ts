export function homeworkStatus(task:{session_end:string;next_start:string},submitted:string|null,override:string|null=null,now=Date.now()){
 if(override==='insufficient')return 'insufficient';
 if(submitted)return Date.parse(submitted)<=Date.parse(task.session_end)+72*3600000?'ontime':'late';
 if(now>=Date.parse(task.next_start))return 'missing';
 return now>Date.parse(task.session_end)+72*3600000?'overdue':'pending';
}
export function validateHomeworkTimes(end:string,next:string){const e=Date.parse(end),n=Date.parse(next);if(!Number.isFinite(e)||!Number.isFinite(n)||n<=e+72*3600000||n>e+45*86400000)throw Error('다음 수업은 수업 종료 72시간 이후부터 45일 이내로 지정해 주세요.');return {session_end:new Date(e).toISOString(),next_start:new Date(n).toISOString()}}
export function mediaType(b:Uint8Array){const h=Array.from(b.slice(0,12),x=>x.toString(16).padStart(2,'0')).join(''),s=new TextDecoder().decode(b.slice(0,40));if(h.startsWith('ffd8ff'))return 'image/jpeg';if(h.startsWith('89504e470d0a1a0a'))return 'image/png';if(s.startsWith('RIFF')&&s.slice(8,12)==='WEBP')return 'image/webp';if(s.slice(4,8)==='ftyp'){if(/heic|heix|mif1|hevc|avif/.test(s))return 'image/heic';return 'video/mp4'}if(h.startsWith('1a45dfa3'))return 'video/webm';throw Error('JPG·PNG·WEBP·HEIC 사진 또는 MP4·MOV·WEBM 동영상을 올려 주세요.')}
