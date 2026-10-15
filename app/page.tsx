import Dashboard from './dashboard';
import { requireChatGPTUser } from './chatgpt-auth';
export const dynamic = 'force-dynamic';
export default async function Home(){
 const isVercel=Boolean(process.env.VERCEL);
 if(!isVercel)await requireChatGPTUser('/');
 return <Dashboard localStorageMode={isVercel}/>;
}
