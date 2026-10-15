import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '../../chatgpt-auth';
import { normalizeShop, shopSchema, prepareShopUpdate } from '../../../lib/shop-validation';
import { shopToday } from '../../../lib/analytics';
import { type Shop } from '../../../lib/model';
export const dynamic = 'force-dynamic';
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
const supabaseConfig=()=>{
 const url=process.env.SUPABASE_URL?.replace(/\/$/,'');
 const key=process.env.SUPABASE_PUBLISHABLE_KEY;
 const accessToken=process.env.SUPABASE_ACCESS_TOKEN;
 const slug=process.env.SUPABASE_SHOP_SLUG||'emi-house';
 return url&&key&&accessToken?{url,key,accessToken,slug}:null;
};
async function supabaseRpc<T>(name:string,body:Record<string,unknown>){
 const config=supabaseConfig();
 if(!config)throw new Error('supabase_not_configured');
 const response=await fetch(`${config.url}/rest/v1/rpc/${name}`,{
  method:'POST',cache:'no-store',headers:{apikey:config.key,'Content-Type':'application/json'},body:JSON.stringify({...body,p_access_token:config.accessToken})
 });
 const value=await response.json().catch(()=>({})) as T&{code?:string;message?:string};
 if(!response.ok)throw Object.assign(new Error(value.message||'supabase_request_failed'),{code:value.code,status:response.status});
 return value;
}
// Imported customer records belong to existing owners. Never copy them to a new account.
const emptyShop:Shop={orders:[],expenses:[],products:[],settings:{shipping:0,returnShipping:0,platformRate:0,cardRate:0,returnRateThreshold:15},undatedInbound:0,source:'Chưa nhập dữ liệu'};
const withOrderCreationTimes=(shop:Shop,times:Record<string,string>)=>({...shop,orders:shop.orders.map(order=>times[order.id]?{...order,created_at:times[order.id]}:order)});
const supabaseErrorField=(error:unknown,field:'code'|'status')=>typeof error==='object'&&error!==null&&field in error?String((error as Record<string,unknown>)[field]):'';
const isMissingRpc=(error:unknown)=>['PGRST202','42883'].includes(supabaseErrorField(error,'code'))||supabaseErrorField(error,'status')==='404';
async function getOrderCreationTimes(slug:string){
 try{return await supabaseRpc<Record<string,string>>('get_emi_order_creation_times',{p_slug:slug});}
 catch(error){if(isMissingRpc(error))return {};throw error;}
}
async function saveSupabaseShop(slug:string,revision:number,data:Shop){
 try{return await supabaseRpc<{data:Shop;revision:number}>('save_emi_shop_with_creation_times',{p_slug:slug,p_expected_revision:revision,p_data:data});}
 catch(error){
  if(!isMissingRpc(error))throw error;
  return supabaseRpc<{data:Shop;revision:number}>('save_emi_shop',{p_slug:slug,p_expected_revision:revision,p_data:data});
 }
}
export async function GET(){
 const config=supabaseConfig();
 if(config){
  try{const value=await supabaseRpc<{data:Shop;revision:number}>('get_emi_shop',{p_slug:config.slug});const times=await getOrderCreationTimes(config.slug);return json({data:normalizeShop(withOrderCreationTimes(value.data,times)),revision:Number(value.revision)});}
  catch{return json({error:'Chưa tải được dữ liệu từ Supabase.'},503);}
 }
 const user=await getChatGPTUser();if(!user)return json({error:'Vui lòng đăng nhập để xem dữ liệu.'},401);
 if(!env.DB)return json({error:'Chưa kết nối được cơ sở dữ liệu.'},503);
 await env.DB.prepare('INSERT OR IGNORE INTO shops (owner, data, revision) VALUES (?, ?, 1)').bind(user.userId,JSON.stringify(emptyShop)).run();
 const row=await env.DB.prepare('SELECT data, revision FROM shops WHERE owner = ?').bind(user.userId).first<{data:string;revision:number}>();
 return json({data:normalizeShop(JSON.parse(row!.data) as Shop),revision:row!.revision});
}
export async function PUT(request:Request){
 const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)return json({error:'Yêu cầu không hợp lệ.'},403);
 let input;try{input=shopSchema.safeParse(await request.json());}catch{return json({error:'Dữ liệu không hợp lệ.'},400);}
 if(!input.success)return json({error:'Kiểm tra lại ngày, số tiền và các trường bắt buộc.'},400);
 const {data,revision}=input.data;
 const businessDay=shopToday();
 const config=supabaseConfig();
 if(config){
  try{
   const current=await supabaseRpc<{data:Shop;revision:number}>('get_emi_shop',{p_slug:config.slug});
   if(Number(current.revision)!==revision)return json({error:'Dữ liệu vừa được cập nhật ở cửa sổ khác. Đóng biểu mẫu và tải lại trước khi lưu.'},409);
   const times=await getOrderCreationTimes(config.slug);
   const update=prepareShopUpdate(normalizeShop(withOrderCreationTimes(current.data,times)),data as Shop,businessDay);
   if(update.error)return json({error:update.error},400);
   const saved=await saveSupabaseShop(config.slug,revision,update.data);
   return json({data:normalizeShop(saved.data),revision:Number(saved.revision)});
  }catch(error){
   const code=error instanceof Error&&'code' in error?String(error.code):'';
   if(code==='40001')return json({error:'Dữ liệu vừa được cập nhật ở cửa sổ khác. Đóng biểu mẫu và tải lại trước khi lưu.'},409);
   return json({error:'Chưa lưu được dữ liệu vào Supabase.'},503);
  }
 }
 const user=await getChatGPTUser();if(!user)return json({error:'Phiên đăng nhập đã hết hạn.'},401);
 if(!env.DB)return json({error:'Chưa kết nối được cơ sở dữ liệu.'},503);
 const current=await env.DB.prepare('SELECT data FROM shops WHERE owner = ?').bind(user.userId).first<{data:string}>();
 const previous=current?normalizeShop(JSON.parse(current.data) as Shop):null;
 if(!previous)return json({error:'Không tìm thấy cửa hàng. Tải lại trước khi lưu.'},409);
 const update=prepareShopUpdate(previous,data as Shop,businessDay);
 if(update.error)return json({error:update.error},400);
 const normalized=update.data;
 const result=await env.DB.prepare('UPDATE shops SET data = ?, revision = revision + 1 WHERE owner = ? AND revision = ?').bind(JSON.stringify(normalized),user.userId,revision).run();
 if(!result.meta.changes)return json({error:'Dữ liệu vừa được cập nhật ở cửa sổ khác. Đóng biểu mẫu và tải lại trước khi lưu.'},409);
 return json({revision:revision+1,data:normalized});
}
