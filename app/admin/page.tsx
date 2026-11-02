import {cookies} from 'next/headers';
import {notFound,redirect} from 'next/navigation';
import {adminRoleForToken} from '@/lib/server';
import FullAdmin from './full-admin';
export const dynamic='force-dynamic';
export default async function Page({searchParams}:{searchParams:Promise<Record<string,string|string[]|undefined>>}){
 const role=await adminRoleForToken((await cookies()).get('admin_session')?.value||'');
 if(!role)notFound();
 if(role==='student_manager'){
  const query=await searchParams;
  redirect(query.tab==='students'?'/admin/viewer?tab=students':'/admin/viewer');
 }
 return <FullAdmin/>;
}
