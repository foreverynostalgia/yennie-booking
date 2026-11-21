import {cookies} from 'next/headers';
import {env} from 'cloudflare:workers';
import {notFound,redirect} from 'next/navigation';
import {adminRoleForToken} from '@/lib/server';
import FullAdmin from './full-admin';
export const dynamic='force-dynamic';
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const role=await adminRoleForToken((await cookies()).get('admin_session')?.value||'');
 // No admin session: owners sign in once at the YENNIE SENSE manager, which embeds this page.
 if(!role){const manager=String((env as unknown as Record<string,string>).MANAGER_URL||'');if(/^https:\/\/[a-z0-9.-]+$/.test(manager))redirect(manager+'/#page/reservations');notFound()}
 if(role==='student_manager'){
  const query=await searchParams;
  redirect(query.tab==='students'?'/admin/viewer?tab=students':'/admin/viewer');
 }
 const query=await searchParams;
 return <FullAdmin embeddedInitial={query.embedded==='1'}/>;
}
