// Apps Script ContentService returns its JSON through a one-time Google redirect.
// Only the initial request contains the shared secret or booking data.
export async function requestGoogleScript(url:string,payload:Record<string,unknown>){
 const signal=AbortSignal.timeout(20000);
 let response=await fetch(url,{method:'POST',redirect:'manual',signal,headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});
 const hops:string[]=[];
 for(let i=0;[301,302,303,307,308].includes(response.status)&&i<4;i++){
  const location=response.headers.get('location');if(!location)break;
  const next=new URL(location,url);
  if(next.protocol!=='https:'||next.username||next.password||!['script.googleusercontent.com','script.google.com'].includes(next.hostname))throw Error('Google Script가 로그인 또는 외부 주소로 이동했습니다. 웹 앱 배포 주소와 공개 권한을 확인해 주세요.');
  // Never replay the secret-bearing POST after a redirect, including 307/308.
  if(response.status===307||response.status===308)throw Error('Google Script가 POST 재전송을 요구했습니다. /exec 웹 앱 주소를 확인해 주세요.');
  hops.push(next.hostname);await response.body?.cancel();
  response=await fetch(next.toString(),{method:'GET',redirect:'manual',signal});
 }
 const contentType=response.headers.get('content-type')||'';
 const raw=await response.text();let result:{ok?:boolean;version?:number;error?:string}|null=null;
 try{const parsed=JSON.parse(raw);if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed)&&typeof parsed.ok==='boolean')result=parsed;}catch{}
 const htmlTitle=/<title[^>]*>([^<]*)<\/title>/i.exec(raw)?.[1]?.replace(/&[^;]+;/g,' ').trim().slice(0,100)||null;
 if(!response.ok)throw Error(`Google Script 응답 오류 (HTTP ${response.status}${htmlTitle?'; '+htmlTitle:''})`);
 if(!result){
  const detail=raw.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi,' ').replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&[^;]+;/g,' ').replace(/https?:\/\/[^\s]+/g,'[Google URL]').split(String(payload.token||'__no_token__')).join('[redacted]').replace(/\s+/g,' ').trim().slice(0,450);
  const reason=/accounts\.google\.com|ServiceLogin|sign in|로그인/i.test(raw)?'Google 로그인 페이지가 반환됐습니다.':/unable to open|파일을 열|page not found|찾을 수 없/i.test(raw)?'Google에서 배포 파일을 열지 못했습니다.':'JSON 대신 HTML 또는 다른 형식의 응답이 반환됐습니다.';
  throw Error(`Google Script: ${reason} (HTTP ${response.status}; ${contentType.split(';')[0]||'형식 없음'}${htmlTitle?'; '+htmlTitle:''}) ${detail}`);
 }
 return {result,diagnostics:{status:response.status,contentType:contentType.split(';')[0],redirects:hops}};
}
