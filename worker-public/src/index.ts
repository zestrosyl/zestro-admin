interface Env {
  DB: D1Database;
  MEDIA: R2Bucket;
  RESTAURANT_ID: string;
  ALLOWED_ORIGINS: string;
  WHATSAPP_NUMBER: string;
}
type ProductRow = {id:string;category_id:string|null;name:string;description:string;price_minor:number;image_key:string|null;available:number;featured:number;prep_minutes:number;dietary_tags_json:string};
const json=(data:unknown,status=200,origin:string|null=null,env?:Env)=>{const h=new Headers({'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'});if(env&&origin&&env.ALLOWED_ORIGINS.split(',').map(x=>x.trim()).includes(origin)){h.set('access-control-allow-origin',origin);h.set('vary','Origin');}h.set('access-control-allow-methods','GET,POST,OPTIONS');h.set('access-control-allow-headers','Content-Type,Idempotency-Key');return new Response(JSON.stringify(data),{status,headers:h});};
const err=(message:string,status=400)=>({error:message});
const uid=()=>crypto.randomUUID();
const localized=(s:string)=>({en:s,bn:s,ar:s});
function normalizeCode(v:string){return v.trim().replace(/^table[-_\s]*/i,'').replace(/^T[-_\s]*/i,'').padStart(2,'0');}
async function handle(req:Request,env:Env):Promise<Response>{
 const origin=req.headers.get('Origin');
 if(req.method==='OPTIONS')return json({ok:true},204,origin,env);
 const url=new URL(req.url),p=url.pathname, rid=env.RESTAURANT_ID;
 if(p==='/health'&&req.method==='GET')return json({ok:true,service:'zestro-customer-api'},200,origin,env);
 if(p==='/api/catalog'&&req.method==='GET'){
   const [cats,items,settingsRow,promos,rest]=await Promise.all([
    env.DB.prepare('SELECT id,name,description,sort_order,active FROM menu_categories WHERE restaurant_id=? AND active=1 ORDER BY sort_order,name').bind(rid).all<any>(),
    env.DB.prepare('SELECT id,category_id,name,description,price_minor,image_key,available,featured,prep_minutes,dietary_tags_json FROM menu_items WHERE restaurant_id=? AND available=1 ORDER BY featured DESC,name').bind(rid).all<ProductRow>(),
    env.DB.prepare('SELECT settings_json FROM restaurant_settings WHERE restaurant_id=?').bind(rid).first<{settings_json:string}>(),
    env.DB.prepare('SELECT id,title,code,discount_type,discount_value_minor,min_order_minor,valid_until,active FROM promotions WHERE restaurant_id=? AND active=1').bind(rid).all<any>(),
    env.DB.prepare('SELECT name,currency,status FROM restaurants WHERE id=?').bind(rid).first<any>()
   ]);
   let settings:any={};try{settings=JSON.parse(settingsRow?.settings_json||'{}');}catch{}
   const categories=(cats.results||[]).map((c:any,i:number)=>({id:c.id,name:localized(c.name),type:'food',displayOrder:c.sort_order??i+1,active:Boolean(c.active)}));
   const products=(items.results||[]).map((x:ProductRow,i:number)=>({id:x.id,categoryId:x.category_id||'',name:localized(x.name),description:localized(x.description||''),price:Number(x.price_minor)/100,image:x.image_key?'/api/media?key='+encodeURIComponent(x.image_key):undefined,available:Boolean(x.available),featured:Boolean(x.featured),popular:Boolean(x.featured),displayOrder:i+1,variants:[],customisationGroupIds:[],dietaryTags:JSON.parse(x.dietary_tags_json||'[]')}));
   const promotions=(promos.results||[]).map((x:any)=>({id:x.id,title:localized(x.title),description:localized(''),code:x.code,active:Boolean(x.active),discountType:x.discount_type==='percentage'?'percent':'fixed',discountValue:x.discount_type==='percentage'?Number(x.discount_value_minor)/100:Number(x.discount_value_minor)/100,minOrderAmount:Number(x.min_order_minor)/100,validUntil:x.valid_until||''}));
   return json({categories,products,promotions,settings:{restaurantName:settings.restaurantName||rest?.name||'Zestro',whatsappNumber:settings.whatsappNumber||env.WHATSAPP_NUMBER,contactPhone:settings.contactPhone||env.WHATSAPP_NUMBER,address:settings.address||{en:'',bn:'',ar:''},openingHours:settings.openingHours||{en:'',bn:'',ar:''},socialLinks:settings.socialLinks||{},deliveryFee:Number(settings.deliveryFee)||0,minOrderAmount:Number(settings.minOrderAmount)||0,taxPercent:Number(settings.taxPercent)||0,serviceChargePercent:Number(settings.serviceChargePercent)||0,currency:settings.currency||rest?.currency||'BDT',defaultLanguage:settings.defaultLanguage||'en',acceptingOrders:settings.acceptingOrders!==false,reviews:settings.reviews||[]}},200,origin,env);
 }
 if(p==='/api/tables/verify'&&req.method==='POST'){
   const b=await req.json<any>();const tableId=String(b.tableId||'');const tableNumber=String(b.tableNumber||b.table||b.number||'');const token=tableNumber||tableId;if(!token)return json(err('Table identifier is required'),400,origin,env);
   const code=normalizeCode(token);
   const t=await env.DB.prepare('SELECT id,table_code,zone FROM restaurant_tables WHERE restaurant_id=? AND (id=? OR table_code=? OR table_code=? OR table_code=?) LIMIT 1').bind(rid,tableId,token,code,'T-'+code).first<any>();
   if(!t)return json(err('Table not found. Please contact staff.'),404,origin,env);
   return json({ok:true,tableId:t.id,tableNumber:t.table_code.replace(/^T[-_]?/i,''),tableName:'Table '+t.table_code},200,origin,env);
 }
 if(p==='/api/waiter-calls'&&req.method==='POST'){
   const b=await req.json<any>();const tableId=String(b.tableId||'');const requestType=String(b.requestType||'Table Assistance').slice(0,80);const note=String(b.note||'').slice(0,300);
   const table=await env.DB.prepare('SELECT id FROM restaurant_tables WHERE id=? AND restaurant_id=?').bind(tableId,rid).first();
   if(!table)return json(err('Verified table is required'),404,origin,env);
   const recent=await env.DB.prepare("SELECT id FROM waiter_calls WHERE table_id=? AND restaurant_id=? AND created_at>=datetime('now','-60 seconds') ORDER BY created_at DESC LIMIT 1").bind(tableId,rid).first();
   if(recent)return json({ok:false,error:'Please wait before sending another request.',remainingSeconds:60},429,origin,env);
   const id=uid();await env.DB.prepare("INSERT INTO waiter_calls(id,restaurant_id,table_id,request_type,note,status) VALUES(?,?,?,?,?,'incoming')").bind(id,rid,tableId,requestType,note).run();
   return json({ok:true,id},201,origin,env);
 }
 if(p==='/api/orders/prepare'&&req.method==='POST'){
   const b=await req.json<any>();const name=String(b.customerName||'').trim();const phone=String(b.customerPhone||'').trim();const type=String(b.orderType||'takeaway');
   if(!name||!phone)return json(err('Customer name and phone are required'),400,origin,env);
   if(!['dine_in','takeaway','delivery'].includes(type))return json(err('Invalid order type'),400,origin,env);
   if(type==='delivery'&&!String(b.deliveryAddress||'').trim())return json(err('Delivery address is required'),400,origin,env);
   const rawItems=Array.isArray(b.items)?b.items:[];if(!rawItems.length||rawItems.length>30)return json(err('Your cart is empty or too large'),400,origin,env);
   const tableId=type==='dine_in'?String(b.tableId||''):'';let table:any=null;
   if(type==='dine_in'&&tableId){table=await env.DB.prepare('SELECT id,table_code FROM restaurant_tables WHERE id=? AND restaurant_id=?').bind(tableId,rid).first<any>();if(!table)return json(err('Table QR is no longer valid. Please scan again.'),400,origin,env);}
   const items:any[]=[];let subtotalMinor=0;
   for(const entry of rawItems){
     const productId=String(entry.productId||'');const qty=Number(entry.quantity);
     if(!productId||!Number.isInteger(qty)||qty<1||qty>50)return json(err('Invalid cart item'),400,origin,env);
     if(entry.variantId||Array.isArray(entry.customisations)&&entry.customisations.length)return json(err('This item has options that are not yet configured in the live menu. Please refresh the menu.'),422,origin,env);
     const product=await env.DB.prepare('SELECT id,name,price_minor,available FROM menu_items WHERE id=? AND restaurant_id=?').bind(productId,rid).first<any>();
     if(!product||!product.available)return json(err('An item is unavailable. Please refresh your menu.'),409,origin,env);
     const unit=Number(product.price_minor),line=unit*qty;subtotalMinor+=line;items.push({productId:product.id,name:product.name,quantity:qty,unitPrice:unit/100,lineTotal:line/100,unitPriceMinor:unit,lineTotalMinor:line});
   }
   const sr=await env.DB.prepare('SELECT settings_json FROM restaurant_settings WHERE restaurant_id=?').bind(rid).first<{settings_json:string}>();let st:any={};try{st=JSON.parse(sr?.settings_json||'{}')}catch{}
   const deliveryFeeMinor=type==='delivery'?Math.round((Number(st.deliveryFee)||0)*100):0;
   const taxMinor=Math.round(subtotalMinor*(Number(st.taxPercent)||0)/100);
   const serviceMinor=Math.round(subtotalMinor*(Number(st.serviceChargePercent)||0)/100);
   const totalMinor=subtotalMinor+deliveryFeeMinor+taxMinor+serviceMinor;
   const orderId=uid();const orderRef='ZST-'+new Date().toISOString().replace(/\D/g,'').slice(0,8)+'-'+crypto.randomUUID().slice(0,5).toUpperCase();
   const note=JSON.stringify({customerPhone:phone,deliveryAddress:String(b.deliveryAddress||''),customerNote:String(b.notes||'').slice(0,1000),deliveryFee:deliveryFeeMinor/100,promoCode:String(b.promoCode||''),source:'customer-website'});
   const key=req.headers.get('Idempotency-Key')||uid();
   try{
     await env.DB.prepare("INSERT INTO orders(id,restaurant_id,order_number,table_id,customer_name,order_type,status,subtotal_minor,tax_minor,service_charge_minor,total_minor,customer_note,idempotency_key) VALUES(?,?,?,?,?,?,'pending',?,?,?,?,?,?)").bind(orderId,rid,orderRef,table?.id||null,name,type,subtotalMinor,taxMinor,serviceMinor,totalMinor,note,key).run();
     for(const item of items)await env.DB.prepare('INSERT INTO order_items(id,restaurant_id,order_id,menu_item_id,item_name_snapshot,quantity,unit_price_minor,line_total_minor) VALUES(?,?,?,?,?,?,?,?)').bind(uid(),rid,orderId,item.productId,item.name,item.quantity,item.unitPriceMinor,item.lineTotalMinor).run();
   }catch(e){console.error('order create failed',e);return json(err('Could not save your order. Please try again.'),500,origin,env);}
   return json({orderId,orderRef,orderType:type,customerName:name,customerPhone:phone,deliveryAddress:String(b.deliveryAddress||''),tableNumber:table?.table_code?.replace(/^T[-_]?/i,'')||String(b.tableNumber||''),items:items.map(({unitPriceMinor,lineTotalMinor,...x})=>x),subtotal:subtotalMinor/100,deliveryFee:deliveryFeeMinor/100,serviceCharge:serviceMinor/100,taxAmount:taxMinor/100,discountAmount:0,redeemedPoints:0,loyaltyDiscountAmount:0,total:totalMinor/100,whatsappNumber:st.whatsappNumber||env.WHATSAPP_NUMBER},201,origin,env);
 }
 if(p==='/api/media'&&req.method==='GET'){
   const key=url.searchParams.get('key')||'';if(!key.startsWith('restaurants/'+rid+'/'))return json(err('Not found'),404,origin,env);
   const object=await env.MEDIA.get(key);if(!object)return json(err('Not found'),404,origin,env);
   const h=new Headers();object.writeHttpMetadata(h);h.set('cache-control','public, max-age=3600');h.set('access-control-allow-origin',origin||'*');return new Response(object.body,{headers:h});
 }
 return json(err('Not found'),404,origin,env);
}
export default {async fetch(req:Request,env:Env){const origin=req.headers.get('Origin');const allowed=env.ALLOWED_ORIGINS.split(',').map(x=>x.trim());if(origin&&!allowed.includes(origin))return json({error:'Origin not allowed'},403,origin,env);try{return await handle(req,env)}catch(e){console.error('ZESTRO public API error',e);return json({error:'Internal server error'},500,origin,env)}}};
