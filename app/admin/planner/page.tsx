import {cookies} from 'next/headers';
import {redirect} from 'next/navigation';
import {adminRoleForToken} from '@/lib/server';
import Planner from './planner';
export const dynamic='force-dynamic';
export default async function Page(){
 if(!await adminRoleForToken((await cookies()).get('admin_session')?.value||''))redirect('/admin');
 return <Planner/>;
}
