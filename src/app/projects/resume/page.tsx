import Link from 'next/link';
import {redirect} from 'next/navigation';
import {createClient} from '@/lib/supabase/server';
import {lastAccessibleWorkspace} from '@/lib/workspaces';
export const dynamic='force-dynamic';
export default async function Resume(){const c=await createClient();const u=c?(await c.auth.getUser()).data.user:null;if(!u)redirect('/login?next=/projects/resume');let href='';try{href=(await lastAccessibleWorkspace(u.id))?.href||'';}catch{return <main className="light-surface p-8"><h1 className="text-xl">Your last workspace could not be checked</h1><p className="my-4">Please retry, or browse your saved work.</p><Link className="underline" href="/projects">All Projects</Link></main>;}redirect(href||'/projects');}
