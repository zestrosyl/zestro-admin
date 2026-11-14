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
function withCors(response:Response,origin:string|null,env:Env){const h=new Headers(response.headers);if(origin&&allowed(env).includes(origin)){h.set('access-control-allow-origin',origin);h.set('vary','Origin');h.set('access-control-allow-credentials','true');}h.set('access-control-allow-methods','GET,POST,PATCH,DELETE,OPTIONS');h.set('access-control-allow-headers','Content-Type');h.set('x-content-type-options','nosniff');h.set('referrer-policy','strict-origin-when-cross-origin');return new Response(response.body,{status:response.status,headers:h});}
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
