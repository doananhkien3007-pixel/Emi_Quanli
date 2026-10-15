import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '../../chatgpt-auth';
import { normalizeShop, shopSchema, prepareShopUpdate } from '../../../lib/shop-validation';
import { shopToday } from '../../../lib/analytics';
import { type Shop } from '../../../lib/model';
export const dynamic = 'force-dynamic';
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
// Imported customer records belong to existing owners. Never copy them to a new account.
const emptyShop:Shop={orders:[],expenses:[],products:[],settings:{shipping:0,returnShipping:0,platformRate:0,cardRate:0,returnRateThreshold:15},undatedInbound:0,source:'Chưa nhập dữ liệu'};
export async function GET(){
 const user=await getChatGPTUser();if(!user)return json({error:'Vui lòng đăng nhập để xem dữ liệu.'},401);
 if(!env.DB)return json({error:'Chưa kết nối được cơ sở dữ liệu.'},503);
 await env.DB.prepare('INSERT OR IGNORE INTO shops (owner, data, revision) VALUES (?, ?, 1)').bind(user.userId,JSON.stringify(emptyShop)).run();
 const row=await env.DB.prepare('SELECT data, revision FROM shops WHERE owner = ?').bind(user.userId).first<{data:string;revision:number}>();
 return json({data:normalizeShop(JSON.parse(row!.data) as Shop),revision:row!.revision});
}
export async function PUT(request:Request){
 const user=await getChatGPTUser();if(!user)return json({error:'Phiên đăng nhập đã hết hạn.'},401);
 const origin=request.headers.get('origin');if(origin&&origin!==new URL(request.url).origin)return json({error:'Yêu cầu không hợp lệ.'},403);
 if(!env.DB)return json({error:'Chưa kết nối được cơ sở dữ liệu.'},503);
 let input;try{input=shopSchema.safeParse(await request.json());}catch{return json({error:'Dữ liệu không hợp lệ.'},400);}
 if(!input.success)return json({error:'Kiểm tra lại ngày, số tiền và các trường bắt buộc.'},400);
 const {data,revision}=input.data;
 const current=await env.DB.prepare('SELECT data FROM shops WHERE owner = ?').bind(user.userId).first<{data:string}>();
 const previous=current?normalizeShop(JSON.parse(current.data) as Shop):null;
 if(!previous)return json({error:'Không tìm thấy cửa hàng. Tải lại trước khi lưu.'},409);
 const update=prepareShopUpdate(previous,data as Shop,shopToday());
 if(update.error)return json({error:update.error},400);
 const normalized=update.data;
 const result=await env.DB.prepare('UPDATE shops SET data = ?, revision = revision + 1 WHERE owner = ? AND revision = ?').bind(JSON.stringify(normalized),user.userId,revision).run();
 if(!result.meta.changes)return json({error:'Dữ liệu vừa được cập nhật ở cửa sổ khác. Đóng biểu mẫu và tải lại trước khi lưu.'},409);
 return json({revision:revision+1,data:normalized});
}
