import {cookies} from 'next/headers';
import {redirect} from 'next/navigation';
import {adminRoleForToken} from '@/lib/server';
import Viewer from './viewer';
export const dynamic='force-dynamic';
export default async function Page(){
 const role=await adminRoleForToken((await cookies()).get('admin_session')?.value||'');
 if(!role)redirect('/admin');
 return <Viewer/>;
}
