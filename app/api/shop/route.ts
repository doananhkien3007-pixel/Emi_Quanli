import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '../../chatgpt-auth';
import { normalizeShop, shopSchema, prepareShopUpdate } from '../../../lib/shop-validation';
import { shopToday } from '../../../lib/analytics';
import { type Shop } from '../../../lib/model';
import { getSupabaseConfig, SupabaseRpcError, supabaseRpc } from '../../../lib/supabase-server';
export const dynamic = 'force-dynamic';
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
// Imported customer records belong to existing owners. Never copy them to a new account.
const emptyShop:Shop={orders:[],expenses:[],products:[],settings:{shipping:0,returnShipping:0,platformRate:0,cardRate:0,returnRateThreshold:15},undatedInbound:0,source:'Chưa nhập dữ liệu'};
// The current production schema stores the business creation value in a DATE
// column, so its time component is lost after a reload. Until the timestamp
// migration is available, keep the explicit timestamp in an internal suffix
// of the order note. The API removes this suffix before returning data to the
// UI, and the timestamp RPC remains the preferred storage once it exists.
const legacyCreationTimeMarker='\n\u2063EMI_CREATED_AT=';
const legacyCreationTimePattern=/\n\u2063EMI_CREATED_AT=([^\s]+)$/;
const unpackLegacyCreationTimes=(shop:Shop):Shop=>({...shop,orders:shop.orders.map(order=>{
 const match=order.note.match(legacyCreationTimePattern);
 const createdAt=match?.[1];
 if(!createdAt||!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(createdAt))return order;
 return {...order,note:order.note.slice(0,match.index),created_at:createdAt};
})});
const packLegacyCreationTimes=(shop:Shop):Shop=>({...shop,orders:shop.orders.map(order=>{
 const cleanNote=order.note.replace(legacyCreationTimePattern,'');
 return order.created_at&&/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(order.created_at)
  ?{...order,note:`${cleanNote}${legacyCreationTimeMarker}${order.created_at}`}
  :{...order,note:cleanNote};
})});
const withOrderCreationTimes=(shop:Shop,times:Record<string,string>)=>({...shop,orders:shop.orders.map(order=>times[order.id]?{...order,created_at:times[order.id]}:order)});
const withProductImages=(shop:Shop,images:Record<string,string>)=>({...shop,products:shop.products.map(product=>images[product.name]?{...product,image:images[product.name]}:product)});
const withMetaAdSpend=(shop:Shop,metaAdSpend:NonNullable<Shop['metaAdSpend']>)=>({...shop,metaAdSpend});
const supabaseErrorField=(error:unknown,field:'code'|'status')=>typeof error==='object'&&error!==null&&field in error?String((error as Record<string,unknown>)[field]):'';
const isMissingRpc=(error:unknown)=>['PGRST202','42883'].includes(supabaseErrorField(error,'code'))||supabaseErrorField(error,'status')==='404';
async function getOrderCreationTimes(slug:string){
 try{return await supabaseRpc<Record<string,string>>('get_emi_order_creation_times',{p_slug:slug});}
 catch(error){if(isMissingRpc(error))return {};throw error;}
}
async function getProductImages(slug:string){
 try{return await supabaseRpc<Record<string,string>>('get_emi_product_images',{p_slug:slug});}
 catch(error){if(isMissingRpc(error))return {};throw error;}
}
async function getMetaAdSpend(slug:string){
 try{return await supabaseRpc<NonNullable<Shop['metaAdSpend']>>('get_emi_meta_ad_spend',{p_slug:slug});}
 catch(error){
  if(!isMissingRpc(error))console.error(JSON.stringify({event:'meta_ad_spend_read_failed',error:error instanceof Error?error.message:'unknown_error'}));
  return [];
 }
}
async function saveSupabaseShop(slug:string,revision:number,data:Shop){
 try{return await supabaseRpc<{data:Shop;revision:number}>('save_emi_shop_with_product_images',{p_slug:slug,p_expected_revision:revision,p_data:data});}
 catch(error){
  if(!isMissingRpc(error))throw error;
  if(data.products.some(product=>product.image))throw new Error('product_image_storage_unavailable');
  try{return await supabaseRpc<{data:Shop;revision:number}>('save_emi_shop_with_creation_times',{p_slug:slug,p_expected_revision:revision,p_data:data});}
  catch(legacyError){
   if(!isMissingRpc(legacyError))throw legacyError;
   return supabaseRpc<{data:Shop;revision:number}>('save_emi_shop',{p_slug:slug,p_expected_revision:revision,p_data:packLegacyCreationTimes(data)});
  }
 }
}
export async function GET(){
 const config=getSupabaseConfig();
 if(config){
  try{const value=await supabaseRpc<{data:Shop;revision:number}>('get_emi_shop',{p_slug:config.slug});const [times,images,metaAdSpend]=await Promise.all([getOrderCreationTimes(config.slug),getProductImages(config.slug),getMetaAdSpend(config.slug)]);return json({data:normalizeShop(withMetaAdSpend(withProductImages(withOrderCreationTimes(unpackLegacyCreationTimes(value.data),times),images),metaAdSpend)),revision:Number(value.revision)});}
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
 const config=getSupabaseConfig();
 if(config){
  try{
   const current=await supabaseRpc<{data:Shop;revision:number}>('get_emi_shop',{p_slug:config.slug});
   if(Number(current.revision)!==revision)return json({error:'Dữ liệu vừa được cập nhật ở cửa sổ khác. Đóng biểu mẫu và tải lại trước khi lưu.'},409);
   const [times,metaAdSpend]=await Promise.all([getOrderCreationTimes(config.slug),getMetaAdSpend(config.slug)]);
   const update=prepareShopUpdate(normalizeShop(withMetaAdSpend(withOrderCreationTimes(unpackLegacyCreationTimes(current.data),times),metaAdSpend)),data as Shop,businessDay);
   if(!update.data)return json({error:update.error},400);
   const saved=await saveSupabaseShop(config.slug,revision,update.data);
   return json({data:normalizeShop(withMetaAdSpend(withProductImages(unpackLegacyCreationTimes(saved.data),Object.fromEntries(update.data.products.filter(product=>product.image).map(product=>[product.name,product.image!]))),metaAdSpend)),revision:Number(saved.revision)});
  }catch(error){
   const code=error instanceof SupabaseRpcError?error.code:'';
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
 if(!update.data)return json({error:update.error},400);
 const normalized=update.data;
 const result=await env.DB.prepare('UPDATE shops SET data = ?, revision = revision + 1 WHERE owner = ? AND revision = ?').bind(JSON.stringify(normalized),user.userId,revision).run();
 if(!result.meta.changes)return json({error:'Dữ liệu vừa được cập nhật ở cửa sổ khác. Đóng biểu mẫu và tải lại trước khi lưu.'},409);
 return json({revision:revision+1,data:normalized});
}
