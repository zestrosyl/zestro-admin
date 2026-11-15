import test from 'node:test';
import assert from 'node:assert/strict';

const base = process.env.STAGING_CUSTOMER_API_URL;
const restaurant = process.env.STAGING_RESTAURANT_SLUG || 'zestro-customer-staging';
test('staging customer authentication integration', async (t) => {
  assert.ok(base, 'STAGING_CUSTOMER_API_URL must be set to the staging Worker only');
  assert.match(base, /staging/i, 'staging API URL must clearly identify staging');
  const origin = 'https://zestro-customer-website-staging.pages.dev';
  const headers = { 'content-type':'application/json', origin, 'x-restaurant-slug':restaurant };
  let cookie = '';
  const email = `auth-test-${crypto.randomUUID()}@example.invalid`;
  const password = 'A-long-staging-only-passphrase-2048!';
  const call = async (path, method='GET', body) => {
    const response = await fetch(`${base.replace(/\/+$/,'')}${path}`, {
      method, headers:{...headers,...(cookie?{cookie}:{})},
      ...(body === undefined ? {} : {body:JSON.stringify(body)})
    });
    const data = await response.json().catch(()=>({}));
    const setCookie=response.headers.get('set-cookie');
    if(setCookie && /zestro_customer_session=/.test(setCookie)) cookie=setCookie.split(';')[0];
    return {response,data};
  };
  await t.test('signup creates a customer and HttpOnly session cookie', async()=>{
    const {response,data}=await call('/api/customer/auth/signup','POST',{name:'Staging Customer',email,password,phone:'+8801700000000',defaultAddress:'Staging only'});
    assert.equal(response.status,201,JSON.stringify(data));
    assert.equal(data.customer.email,email);
    assert.match(response.headers.get('set-cookie')||/ /,/zestro_customer_session=.*HttpOnly/i);
  });
  await t.test('duplicate email is rejected', async()=>{
    const {response}=await call('/api/customer/auth/signup','POST',{name:'Duplicate',email,password});
    assert.equal(response.status,409);
  });
  await t.test('session restores the matching customer', async()=>{
    const {response,data}=await call('/api/customer/me');
    assert.equal(response.status,200);
    assert.equal(data.customer.email,email);
  });
  await t.test('profile update requires session and persists', async()=>{
    const {response,data}=await call('/api/customer/profile','PATCH',{displayName:'Updated Staging',phone:'+8801800000000',defaultAddress:'New staging address'});
    assert.equal(response.status,200,JSON.stringify(data));
    assert.equal(data.customer.displayName,'Updated Staging');
  });
  await t.test('wrong password is rejected', async()=>{
    const {response}=await call('/api/customer/auth/login','POST',{email,password:'wrong-password'});
    assert.equal(response.status,401);
  });
  await t.test('logout revokes the session', async()=>{
    const {response}=await call('/api/customer/auth/logout','POST',{});
    assert.equal(response.status,200);
    cookie='';
    const {response:me}=await call('/api/customer/me');
    assert.equal(me.status,401);
  });
});
