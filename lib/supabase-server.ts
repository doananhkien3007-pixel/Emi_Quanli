export type SupabaseConfig={url:string;key:string;accessToken:string;slug:string};

export function getSupabaseConfig():SupabaseConfig|null{
 const url=process.env.SUPABASE_URL?.replace(/\/$/,'');
 const key=process.env.SUPABASE_PUBLISHABLE_KEY;
 const accessToken=process.env.SUPABASE_ACCESS_TOKEN;
 const slug=process.env.SUPABASE_SHOP_SLUG||'emi-house';
 return url&&key&&accessToken?{url,key,accessToken,slug}:null;
}

export class SupabaseRpcError extends Error{
 readonly code:string;
 readonly status:number;
 constructor(message:string,code='',status=500){super(message);this.name='SupabaseRpcError';this.code=code;this.status=status;}
}

export async function supabaseRpc<T>(name:string,body:Record<string,unknown>):Promise<T>{
 const config=getSupabaseConfig();
 if(!config)throw new SupabaseRpcError('supabase_not_configured','',503);
 const response=await fetch(`${config.url}/rest/v1/rpc/${name}`,{
  method:'POST',cache:'no-store',headers:{apikey:config.key,'Content-Type':'application/json'},body:JSON.stringify({...body,p_access_token:config.accessToken}),
 });
 const value=await response.json().catch(()=>({})) as T&{code?:string;message?:string};
 if(!response.ok)throw new SupabaseRpcError(value.message||'supabase_request_failed',value.code||'',response.status);
 return value;
}
