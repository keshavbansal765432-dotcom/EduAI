import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
export default async function Home(){const c=await getCurrentUser();if(!c?.user)redirect('/login');redirect(c.profile?.role==='admin'?'/admin':'/teacher')}
