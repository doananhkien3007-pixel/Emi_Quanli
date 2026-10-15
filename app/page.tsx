import Dashboard from './dashboard';
import { requireChatGPTUser } from './chatgpt-auth';
export const dynamic = 'force-dynamic';
export default async function Home(){
 const isVercel=Boolean(process.env.VERCEL);
 if(!isVercel)await requireChatGPTUser('/');
 const hasSupabase=Boolean(process.env.SUPABASE_URL&&process.env.SUPABASE_PUBLISHABLE_KEY&&process.env.SUPABASE_ACCESS_TOKEN);
 return <Dashboard localStorageMode={isVercel&&!hasSupabase}/>;
}
