import { createRemoteJWKSet, jwtVerify } from 'jose';

interface Env {
  DB: D1Database;
  MEDIA: R2Bucket;
  ACCESS_TEAM_DOMAIN: string;
  ACCESS_AUD: string;
  ALLOWED_ORIGINS: string;
}
interface Member { id:string; restaurant_id:string; auth_subject:string; email:string; display_name:string; role:'owner'|'admin'|'manager'|'staff'|'viewer'; restaurant_name:string; restaurant_status:string }
const json=(data:unknown,status=200)=>new Response(JSON.stringify(data),{status,headers:{'content-type':'application/json; charset=utf-8','cache-control':'no-store'}});
const fail=(message:string,status=400)=>json({error:message},status);
const id=()=>crypto.randomUUID();
const allowed=(env:Env)=>env.ALLOWED_ORIGINS.split(',').map(x=>x.trim()).filter(Boolean);
function withCors(response:Response,origin:string|null,env:Env){const h=new Headers(response.headers);if(origin&&allowed(env).includes(origin)){h.set('access-control-allow-origin',origin);h.set('vary','Origin');h.set('access-control-allow-credentials','true');}h.set('access-control-allow-methods','GET,POST,PATCH,DELETE,OPTIONS');h.set('access-control-allow-headers','Content-Type,x-file-name');h.set('x-content-type-options','nosniff');h.set('referrer-policy','strict-origin-when-cross-origin');return new Response(response.body,{status:response.status,headers:h});}
async function authenticate(req:Request,env:Env):Promise<Member|null>{
  const token=req.headers.get('Cf-Access-Jwt-Assertion'); if(!token||!env.ACCESS_TEAM_DOMAIN||!env.ACCESS_AUD||env.ACCESS_AUD.startsWith('replace-'))return null;
  try{
    const issuer=`https://${env.ACCESS_TEAM_DOMAIN}`;
    const jwks=createRemoteJWKSet(new URL(`${issuer}/cdn-cgi/access/certs`));
    const {payload}=await jwtVerify(token,jwks,{issuer,audience:env.ACCESS_AUD});
    const subject=String(payload.sub||''); const email=String(payload.email||'').toLowerCase();
    if(!subject||!email)return null;
    const member=await env.DB.prepare(`SELECT m.id,m.restaurant_id,m.auth_subject,m.email,m.display_name,m.role,r.name AS restaurant_name,r.status AS restaurant_status FROM memberships m JOIN restaurants r ON r.id=m.restaurant_id WHERE m.auth_subject=? AND lower(m.email)=? AND m.status='active' LIMIT 1`).bind(subject,email).first<Member>();
    return member?.restaurant_status==='active'?member:null;
  }catch{return null;}
}
const canWrite=(m:Member)=>['owner','admin','manager'].includes(m.role);
async function audit(env:Env,m:Member,action:string,type:string,resourceId:string|null){await env.DB.prepare('INSERT INTO audit_logs(id,restaurant_id,membership_id,action,resource_type,resource_id) VALUES(?,?,?,?,?,?)').bind(id(),m.restaurant_id,m.id,action,type,resourceId).run();}
async function route(req:Request,env:Env):Promise<Response>{
 const url=new URL(req.url),path=url.pathname;
 if(req.method==='OPTIONS')return new Response(null,{status:204});
 if(path==='/health'&&req.method==='GET')return json({ok:true,service:'zestro-admin-api',time:new Date().toISOString()});
 if(!path.startsWith('/api/'))return fail('Not found',404);
 const member=await authenticate(req,env);if(!member)return fail('Authentication required',401);
 if(path==='/api/me'&&req.method==='GET')return json({user:{id:member.id,email:member.email,name:member.display_name,role:member.role},restaurant:{id:member.restaurant_id,name:member.restaurant_name}});

 if(path==='/api/categories'&&req.method==='GET'){
  const rows=await env.DB.prepare('SELECT id,name,slug,description,sort_order AS sortOrder,active FROM menu_categories WHERE restaurant_id=? ORDER BY sort_order,name').bind(member.restaurant_id).all<any>();
  return json(rows.results.map((x:any)=>({...x,active:Boolean(x.active)})));
 }
 if(path==='/api/categories'&&req.method==='POST'){
  if(!canWrite(member))return fail('Insufficient permissions',403);
  const b=await req.json<Record<string,unknown>>(),name=String(b.name||'').trim();
  if(!name)return fail('Category name is required');
  const categoryId=id(),slug=String(b.slug||name.toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||categoryId).slice(0,80);
  await env.DB.prepare('INSERT INTO menu_categories(id,restaurant_id,name,slug,description,sort_order,active) VALUES(?,?,?,?,?,?,?)').bind(categoryId,member.restaurant_id,name,slug,String(b.description||''),Math.max(0,Number(b.sortOrder)||0),b.active===false?0:1).run();
  await audit(env,member,'menu.category.created','menu_category',categoryId);return json({id:categoryId},201);
 }
 const categoryMatch=path.match(/^\\/api\\/categories\\/([a-f0-9-]+)$/i);
 if(categoryMatch&&req.method==='PATCH'){
  if(!canWrite(member))return fail('Insufficient permissions',403);
  const b=await req.json<Record<string,unknown>>(),categoryId=categoryMatch[1];
  const old=await env.DB.prepare('SELECT id FROM menu_categories WHERE id=? AND restaurant_id=?').bind(categoryId,member.restaurant_id).first();if(!old)return fail('Category not found',404);
  const name=b.name===undefined?null:String(b.name).trim(),slug=b.slug===undefined?null:String(b.slug),desc=b.description===undefined?null:String(b.description);
  await env.DB.prepare('UPDATE menu_categories SET name=COALESCE(?,name),slug=COALESCE(?,slug),description=COALESCE(?,description),sort_order=COALESCE(?,sort_order),active=COALESCE(?,active),updated_at=CURRENT_TIMESTAMP WHERE id=? AND restaurant_id=?').bind(name,slug,desc,b.sortOrder===undefined?null:Number(b.sortOrder),b.active===undefined?null:(b.active?1:0),categoryId,member.restaurant_id).run();
  await audit(env,member,'menu.category.updated','menu_category',categoryId);return json({ok:true});
 }
 if(categoryMatch&&req.method==='DELETE'){
  if(!canWrite(member))return fail('Insufficient permissions',403);
  const result=await env.DB.prepare('DELETE FROM menu_categories WHERE id=? AND restaurant_id=?').bind(categoryMatch[1],member.restaurant_id).run();if(!result.meta.changes)return fail('Category not found',404);
  await audit(env,member,'menu.category.deleted','menu_category',categoryMatch[1]);return json({ok:true});
 }
 if(path==='/api/orders'&&req.method==='GET'){
  const rows=await env.DB.prepare("SELECT o.*,t.table_code FROM orders o LEFT JOIN restaurant_tables t ON t.id=o.table_id WHERE o.restaurant_id=? ORDER BY o.created_at DESC LIMIT 200").bind(member.restaurant_id).all<any>();
  const result=[] as any[];
  for(const o of rows.results){
   const lines=await env.DB.prepare('SELECT menu_item_id,item_name_snapshot,quantity,unit_price_minor FROM order_items WHERE order_id=? AND restaurant_id=?').bind(o.id,member.restaurant_id).all<any>();
   let note:any={};try{note=JSON.parse(o.customer_note||'{}')}catch{}
   const statusMap:any={pending:'Pending',accepted:'Preparing',preparing:'Preparing',ready:'Ready',served:'Served',cancelled:'Cancelled'};
   result.push({id:o.id,orderNumber:o.order_number,tableNumber:o.table_code?String(o.table_code).replace(/^T[-_]?/i,''):'Pickup',customerName:o.customer_name,orderType:o.order_type==='dine_in'?'Dine-In':o.order_type==='delivery'?'Delivery':'Takeaway',items:lines.results.map((x:any)=>({menuItemId:x.menu_item_id||'',name:x.item_name_snapshot,quantity:x.quantity,unitPrice:Number(x.unit_price_minor)/100})),subtotal:Number(o.subtotal_minor)/100,tax:Number(o.tax_minor)/100,serviceCharge:Number(o.service_charge_minor)/100,total:Number(o.total_minor)/100,status:statusMap[o.status]||'Pending',notes:note.customerNote||'',createdAt:o.created_at});
  }
  return json(result);
 }
 const orderMatch=path.match(/^\\/api\\/orders\\/([a-f0-9-]+)$/i);
 if(orderMatch&&req.method==='PATCH'){
  if(!canWrite(member))return fail('Insufficient permissions',403);
  const b=await req.json<Record<string,unknown>>(),map:any={Pending:'pending',Preparing:'preparing',Ready:'ready',Served:'served',Cancelled:'cancelled',pending:'pending',preparing:'preparing',ready:'ready',served:'served',cancelled:'cancelled'};
  const status=map[String(b.status||'')];if(!status)return fail('Invalid order status');
  const result=await env.DB.prepare('UPDATE orders SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=? AND restaurant_id=?').bind(status,orderMatch[1],member.restaurant_id).run();if(!result.meta.changes)return fail('Order not found',404);
  await audit(env,member,'order.status.updated','order',orderMatch[1]);return json({ok:true});
 }
 if(path==='/api/tables'&&req.method==='GET'){
  const rows=await env.DB.prepare('SELECT id,table_code AS number,zone,capacity,status FROM restaurant_tables WHERE restaurant_id=? ORDER BY table_code').bind(member.restaurant_id).all<any>();
  return json(rows.results.map((x:any)=>({id:x.id,number:x.number,zone:x.zone,capacity:x.capacity,status:x.status==='occupied'?'Occupied':x.status==='reserved'?'Reserved':x.status==='cleaning'?'Cleaning':'Available',qrPath:'/?table='+encodeURIComponent(String(x.number).replace(/^T[-_]?/i,''))})));
 }
 if(path==='/api/tables'&&req.method==='POST'){
  if(!canWrite(member))return fail('Insufficient permissions',403);
  const b=await req.json<Record<string,unknown>>(),number=String(b.number||'').trim();if(!number)return fail('Table number is required');
  const tableId=id(),status=String(b.status||'Available').toLowerCase();
  const allowedStatus:any={available:'available',occupied:'occupied',reserved:'reserved',cleaning:'cleaning'};
  await env.DB.prepare('INSERT INTO restaurant_tables(id,restaurant_id,table_code,zone,capacity,status) VALUES(?,?,?,?,?,?)').bind(tableId,member.restaurant_id,number,String(b.zone||'Main Dining'),Math.max(1,Number(b.capacity)||2),allowedStatus[status]||'available').run();
  await audit(env,member,'table.created','restaurant_table',tableId);return json({id:tableId},201);
 }
 const tableMatch=path.match(/^\\/api\\/tables\\/([a-f0-9-]+)$/i);
 if(tableMatch&&req.method==='PATCH'){
  if(!canWrite(member))return fail('Insufficient permissions',403);
  const b=await req.json<Record<string,unknown>>(),status=String(b.status||'Available').toLowerCase(),allowedStatus:any={available:'available',occupied:'occupied',reserved:'reserved',cleaning:'cleaning'};
  const result=await env.DB.prepare('UPDATE restaurant_tables SET table_code=COALESCE(?,table_code),zone=COALESCE(?,zone),capacity=COALESCE(?,capacity),status=COALESCE(?,status),updated_at=CURRENT_TIMESTAMP WHERE id=? AND restaurant_id=?').bind(b.number===undefined?null:String(b.number),b.zone===undefined?null:String(b.zone),b.capacity===undefined?null:Math.max(1,Number(b.capacity)||2),b.status===undefined?null:(allowedStatus[status]||'available'),tableMatch[1],member.restaurant_id).run();if(!result.meta.changes)return fail('Table not found',404);
  await audit(env,member,'table.updated','restaurant_table',tableMatch[1]);return json({ok:true});
 }
 if(tableMatch&&req.method==='DELETE'){
  if(!canWrite(member))return fail('Insufficient permissions',403);
  const result=await env.DB.prepare('DELETE FROM restaurant_tables WHERE id=? AND restaurant_id=?').bind(tableMatch[1],member.restaurant_id).run();if(!result.meta.changes)return fail('Table not found',404);
  await audit(env,member,'table.deleted','restaurant_table',tableMatch[1]);return json({ok:true});
 }
 if(path==='/api/waiter-calls'&&req.method==='GET'){
  const rows=await env.DB.prepare('SELECT w.id,w.request_type,w.note,w.status,w.created_at,t.table_code FROM waiter_calls w LEFT JOIN restaurant_tables t ON t.id=w.table_id WHERE w.restaurant_id=? ORDER BY w.created_at DESC LIMIT 200').bind(member.restaurant_id).all<any>();
  return json(rows.results.map((x:any)=>({id:x.id,tableNumber:x.table_code?String(x.table_code).replace(/^T[-_]?/i,''):'?',requestType:x.request_type,note:x.note,status:x.status==='acknowledged'?'Acknowledged':x.status==='resolved'?'Resolved':'Incoming',createdAt:x.created_at})));
 }
 const waiterMatch=path.match(/^\\/api\\/waiter-calls\\/([a-f0-9-]+)$/i);
 if(waiterMatch&&req.method==='PATCH'){
  if(!canWrite(member))return fail('Insufficient permissions',403);
  const b=await req.json<Record<string,unknown>>(),status=String(b.status||'').toLowerCase(),map:any={incoming:'incoming',acknowledged:'acknowledged',resolved:'resolved'};
  if(!map[status])return fail('Invalid waiter-call status');
  const result=await env.DB.prepare('UPDATE waiter_calls SET status=?,resolved_at=CASE WHEN ?=\'resolved\' THEN CURRENT_TIMESTAMP ELSE resolved_at END WHERE id=? AND restaurant_id=?').bind(map[status],map[status],waiterMatch[1],member.restaurant_id).run();if(!result.meta.changes)return fail('Waiter call not found',404);
  await audit(env,member,'waiter_call.status.updated','waiter_call',waiterMatch[1]);return json({ok:true});
 }
 if(path==='/api/menu'&&req.method==='GET'){
  const rows=await env.DB.prepare('SELECT id,category_id AS categoryId,name,description,price_minor AS priceMinor,image_key AS imageKey,available,featured,prep_minutes AS prepMinutes FROM menu_items WHERE restaurant_id=? ORDER BY created_at DESC').bind(member.restaurant_id).all();return json(rows.results);
 }
 if(path==='/api/menu'&&req.method==='POST'){
  if(!canWrite(member))return fail('Insufficient permissions',403);const b=await req.json<Record<string,unknown>>();
  const name=String(b.name||'').trim(),price=Number(b.priceMinor);if(!name||!Number.isSafeInteger(price)||price<0)return fail('Valid name and priceMinor are required');
  const itemId=id();await env.DB.prepare('INSERT INTO menu_items(id,restaurant_id,category_id,name,description,price_minor,image_key,available,featured,prep_minutes) VALUES(?,?,?,?,?,?,?,?,?,?)').bind(itemId,member.restaurant_id,b.categoryId?String(b.categoryId):null,name,String(b.description||''),price,b.imageKey?String(b.imageKey):null,b.available===false?0:1,b.featured?1:0,Math.max(0,Number(b.prepMinutes)||0)).run();await audit(env,member,'menu.item.created','menu_item',itemId);return json({id:itemId},201);
 }
 const itemMatch=path.match(/^\/api\/menu\/([a-f0-9-]+)$/i);
 if(itemMatch&&req.method==='PATCH'){
  if(!canWrite(member))return fail('Insufficient permissions',403);const b=await req.json<Record<string,unknown>>();const itemId=itemMatch[1];
  const existing=await env.DB.prepare('SELECT id FROM menu_items WHERE id=? AND restaurant_id=?').bind(itemId,member.restaurant_id).first();if(!existing)return fail('Menu item not found',404);
  const fields=['name','description','priceMinor','categoryId','imageKey','available','featured','prepMinutes'];const vals=fields.map(k=>b[k]);
  await env.DB.prepare('UPDATE menu_items SET name=COALESCE(?,name),description=COALESCE(?,description),price_minor=COALESCE(?,price_minor),category_id=COALESCE(?,category_id),image_key=COALESCE(?,image_key),available=COALESCE(?,available),featured=COALESCE(?,featured),prep_minutes=COALESCE(?,prep_minutes),updated_at=CURRENT_TIMESTAMP WHERE id=? AND restaurant_id=?').bind(vals[0]??null,vals[1]??null,vals[2]??null,vals[3]??null,vals[4]??null,vals[5]===undefined?null:(vals[5]?1:0),vals[6]===undefined?null:(vals[6]?1:0),vals[7]??null,itemId,member.restaurant_id).run();await audit(env,member,'menu.item.updated','menu_item',itemId);return json({ok:true});
 }
 if(itemMatch&&req.method==='DELETE'){
  if(!canWrite(member))return fail('Insufficient permissions',403);const itemId=itemMatch[1];const result=await env.DB.prepare('DELETE FROM menu_items WHERE id=? AND restaurant_id=?').bind(itemId,member.restaurant_id).run();if(!result.meta.changes)return fail('Menu item not found',404);await audit(env,member,'menu.item.deleted','menu_item',itemId);return json({ok:true});
 }
 if(path==='/api/media'&&req.method==='POST'){
  if(!canWrite(member))return fail('Insufficient permissions',403);const type=req.headers.get('content-type')||'';if(!['image/jpeg','image/png','image/webp','image/avif'].includes(type))return fail('Unsupported image type');const body=await req.arrayBuffer();if(body.byteLength<1||body.byteLength>5*1024*1024)return fail('Image must be 1 byte to 5 MB');
  const key=`restaurants/${member.restaurant_id}/${id()}`;await env.MEDIA.put(key,body,{httpMetadata:{contentType:type}});await env.DB.prepare('INSERT INTO media_assets(id,restaurant_id,object_key,title,folder,mime_type,size_bytes) VALUES(?,?,?,?,?,?,?)').bind(id(),member.restaurant_id,key,req.headers.get('x-file-name')||'Upload','general',type,body.byteLength).run();await audit(env,member,'media.uploaded','media_asset',key);return json({key,size:body.byteLength},201);
 }
 return fail('Route not found',404);
}
export default {async fetch(req:Request,env:Env):Promise<Response>{const origin=req.headers.get('Origin');if(origin&&!allowed(env).includes(origin))return fail('Origin not allowed',403);try{return withCors(await route(req,env),origin,env);}catch(e){console.error('ZESTRO API error',e);return withCors(fail('Internal server error',500),origin,env);}}};
