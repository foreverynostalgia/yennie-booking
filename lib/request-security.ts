// Runs before routing, including malformed/unauthenticated requests.
export function securityHeaders(response:Response,request:Request){
 const headers=new Headers(response.headers),path=new URL(request.url).pathname;
 headers.set('X-Content-Type-Options','nosniff');
 headers.set('Referrer-Policy','strict-origin-when-cross-origin');
 headers.set('Permissions-Policy','camera=(), microphone=(), geolocation=()');
 headers.set('Content-Security-Policy',"object-src 'none'; base-uri 'self'; form-action 'self'");
 if(new URL(request.url).protocol==='https:')headers.set('Strict-Transport-Security','max-age=31536000');
 if(path.startsWith('/api/')||path==='/admin'||path.startsWith('/admin/')||path==='/learning'||path==='/report'||path==='/videos'){
  headers.set('Cache-Control','private, no-store');headers.set('Pragma','no-cache');headers.set('Referrer-Policy','no-referrer');headers.set('X-Robots-Tag','noindex, nofollow');
  headers.set('X-Frame-Options','DENY');
  headers.set('Content-Security-Policy',"object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'");
 }
 if(path==='/videos')headers.set('Content-Security-Policy',"object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; frame-src https://www.youtube-nocookie.com");
 return new Response(response.body,{status:response.status,statusText:response.statusText,headers});
}
export async function guardRequest(request:Request,database:D1Database|undefined):Promise<Response|null>{
 const path=new URL(request.url).pathname;
 if(!path.startsWith('/api/'))return null;
 const reject=(error:string,status:number,headers?:HeadersInit)=>Response.json({error},{status,headers});
 if(!['GET','HEAD','OPTIONS'].includes(request.method)){
  const origin=request.headers.get('origin'),site=request.headers.get('sec-fetch-site');
  if(site==='cross-site'||(origin!==null&&origin!==new URL(request.url).origin))return reject('요청을 확인할 수 없습니다.',403);
  const length=Number(request.headers.get('content-length'));
  if(Number.isFinite(length)&&length>((path==='/api/admin/learning/paper'||path==='/api/admin/learning/ocr'&&request.method==='PUT')?8*1024*1024:512*1024))return reject('요청 크기가 너무 큽니다.',413);
 }
 // D1 counters are shared across isolates and survive deployments. Reuse the
 // existing expiry-based counter table; only hashed IP keys are stored.
 const limit=request.method==='POST'?(path==='/api/admin/login'?10:path==='/api/lookup'?10:0):0;
 if(!limit)return null;
 try{
  if(!database)throw new Error('No rate-limit storage');
  const now=Date.now(),windowMs=15*60*1000;
  const identity=path+':'+(request.headers.get('cf-connecting-ip')||'unknown');
  const key='security:'+Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(identity)))).map(n=>n.toString(16).padStart(2,'0')).join('');
  const row=await database.prepare(`INSERT INTO student_login_attempts(key,attempts,expires_at) VALUES(?,1,?) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN expires_at<=? THEN 1 ELSE attempts+1 END,expires_at=CASE WHEN expires_at<=? THEN excluded.expires_at ELSE expires_at END RETURNING attempts,expires_at`).bind(key,now+windowMs,now,now).first<{attempts:number;expires_at:number}>();
  await database.prepare('DELETE FROM student_login_attempts WHERE expires_at<?').bind(now).run();
  if(!row)throw new Error('No counter');
  if(row.attempts>limit)return reject('입력 시도가 많습니다. 15분 후 다시 시도해 주세요.',429,{'Retry-After':String(Math.max(1,Math.ceil((row.expires_at-now)/1000)))});
 }catch{return reject('접속 보호 기능을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요.',503)}
 return null;
}
