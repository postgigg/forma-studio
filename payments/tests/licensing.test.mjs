import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,unlink,rmdir} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {randomBytes, randomUUID, generateKeyPairSync, sign} from 'node:crypto';
import pg from 'pg';
import Stripe from 'stripe';
import {LicenseService} from '../lib/licenses.mjs';
import {createApi} from '../lib/http.mjs';
import {loadConfig} from '../lib/config.mjs';
import {signer, protocol} from '../lib/crypto.mjs';
import clientModule from '../../desktop/license-client.cjs';
import {encryptKey,decryptKey} from '../lib/crypto.mjs';

const accountId='acct_1IsDPbCGBVW3jPje';
const product='forma-studio-mac';
const origin='https://tryformastudio.netlify.app';
const issuerPair=generateKeyPairSync('ed25519');
const issuer={id:'test-only', publicKey:issuerPair.publicKey.export({type:'spki',format:'pem'})};
const protocolSettings={product,currentIssuerId:issuer.id,issuers:[issuer]};
const signGrant=signer(issuerPair.privateKey.export({type:'pkcs8',format:'pem'}),protocolSettings);
const connectionString=process.env.FORMA_LICENSE_TEST_DB || 'postgres://postgres:forma-license-test-only@127.0.0.1:55435/forma_license_test';
const dbUrl=new URL(connectionString);
if(dbUrl.pathname!=='/forma_license_test' || !['127.0.0.1','localhost'].includes(dbUrl.hostname)) throw Error('Use the isolated local forma_license_test database.');
const admin=new pg.Pool({connectionString});
test.after(()=>admin.end());
async function fixture(t){
  const schema='license_test_'+randomUUID().replaceAll('-','');
  await admin.query(`CREATE SCHEMA "${schema}"`);
  const pool=new pg.Pool({connectionString,options:`-c search_path=${schema}`,max:12});
  t.after(async()=>{await pool.end();await admin.query(`DROP SCHEMA "${schema}" CASCADE`);});
  await pool.query(await readFile(new URL('../netlify/database/migrations/20261017220000_mac_licenses.sql',import.meta.url),'utf8'));
  const sessions=new Map();let createdParameters;
  const stripe={accounts:{retrieve:async()=>({id:accountId,charges_enabled:true})},prices:{retrieve:async()=>({active:true,type:'one_time',currency:'usd',unit_amount:4900})},checkout:{sessions:{
    create:async params=>{createdParameters=params;const id='cs_test_'+randomUUID();sessions.set(id,{id,mode:'payment',currency:'usd',amount_subtotal:4900,amount_total:4900,payment_status:'paid',metadata:params.metadata,line_items:{data:[{price:{id:'price_testonly'},quantity:1}],has_more:false},payment_intent:{id:'pi_'+randomUUID(),status:'succeeded',latest_charge:{refunded:false,disputed:false,amount_refunded:0}},customer_details:{email:'test@example.invalid'}});return{id,url:'https://checkout.stripe.com/c/pay/'+id};},
    retrieve:async id=>structuredClone(sessions.get(id)),
    list:async params=>({data:[...sessions.values()].filter(session=>session.payment_intent.id===params.payment_intent)}),
  }}};
  const service=new LicenseService({pool,stripe,pepper:randomBytes(32).toString('hex'),deliveryKey:randomBytes(32),signGrant,priceId:'price_testonly',product,accountId,release:{ready:false},origin});
  const checkout=await service.createCheckout();
  const session=sessions.values().next().value;
  const event=()=>({id:'evt_'+randomUUID(),type:'checkout.session.completed',data:{object:{id:session.id}}});
  const paid=async()=>{await service.fulfill(event());return(await service.receipt(checkout.id,checkout.cookie)).licenseKey;};
  return{pool,stripe,service,checkout,session,event,paid,createdParameters};
}
function device(){const pair=generateKeyPairSync('ed25519');return{privateKey:pair.privateKey,publicKey:pair.publicKey.export({type:'spki',format:'pem'}),hardwareHash:protocol.digest(randomUUID())};}
async function activation(service,licenseKey,mac=device()){
  const challenge=await service.challenge(mac);
  const signature=sign(null,protocol.activationMessage({...challenge,...mac,licenseKey}),mac.privateKey).toString('base64url');
  return{mac,challenge,request:{licenseKey,challengeId:challenge.id,publicKey:mac.publicKey,hardwareHash:mac.hardwareHash,signature}};
}
test('checkout is $49 once, invoice enabled, no recurring plan or fixed payment-method list',async t=>{
  const f=await fixture(t);assert.equal(f.createdParameters.mode,'payment');assert.equal(f.createdParameters.invoice_creation.enabled,true);assert.equal('payment_method_types' in f.createdParameters,false);assert.match(f.createdParameters.integration_identifier,/^forma_mac_[a-z]{8}$/);assert.match(f.createdParameters.success_url,/^https:\/\/tryformastudio.netlify.app\/mac.html\?purchase=/);assert.equal((await f.service.receipt(f.checkout.id,f.checkout.cookie)).status,'pending');
});
test('verified duplicate events issue exactly one payment and key, including concurrent event deliveries',async t=>{
  const f=await fixture(t);const e=f.event();await Promise.all([f.service.fulfill(e),f.service.fulfill(e),f.service.fulfill(f.event())]);
  assert.equal((await f.pool.query('SELECT count(*)::int n FROM forma_mac_payments')).rows[0].n,1);assert.equal((await f.pool.query('SELECT count(*)::int n FROM forma_mac_licenses')).rows[0].n,1);
  const receipt=await f.service.receipt(f.checkout.id,f.checkout.cookie);assert.equal(receipt.status,'paid');assert.match(receipt.licenseKey,/^FORMA-MAC-/);
  assert.equal((await f.pool.query('SELECT key_hash,key_ciphertext FROM forma_mac_licenses')).rows[0].key_ciphertext.includes(receipt.licenseKey),false);
});
test('unpaid, wrong price, wrong merchant, unrelated product and failed asynchronous payments do not issue keys',async t=>{
  const f=await fixture(t);f.session.payment_status='unpaid';assert.deepEqual(await f.service.fulfill(f.event()),{pending:true});
  await f.service.fulfill({...f.event(),type:'checkout.session.async_payment_failed'});assert.equal((await f.service.receipt(f.checkout.id,f.checkout.cookie)).status,'failed');
  f.session.payment_status='paid';f.session.amount_subtotal=1900;await assert.rejects(f.service.fulfill(f.event()),{code:'PAYMENT_NOT_ELIGIBLE'});
  f.session.amount_subtotal=4900;f.session.line_items.data[0].price.id='price_different';await assert.rejects(f.service.fulfill(f.event()),{code:'PAYMENT_NOT_ELIGIBLE'});
  f.session.line_items.data[0].price.id='price_testonly';await assert.rejects(f.service.fulfill({...f.event(),account:'acct_other'}),{code:'PAYMENT_NOT_ELIGIBLE'});
  f.session.metadata.forma_product='other-product';assert.deepEqual(await f.service.fulfill(f.event()),{ignored:true});
  f.service.accountVerifiedUntil=0;f.stripe.accounts.retrieve=async()=>({id:'acct_other',charges_enabled:true});await assert.rejects(f.service.createCheckout(),{code:'CHECKOUT_UNAVAILABLE'});
  assert.equal((await f.pool.query('SELECT count(*)::int n FROM forma_mac_licenses')).rows[0].n,0);
});
test('only the original browser cookie can retrieve a purchased key; a success URL grants nothing',async t=>{
  const f=await fixture(t);await f.paid();await assert.rejects(f.service.receipt(f.checkout.id,''),{code:'PURCHASE_NOT_FOUND'});await assert.rejects(f.service.receipt(f.checkout.id,randomBytes(32).toString('hex')),{code:'PURCHASE_NOT_FOUND'});
  await f.pool.query("UPDATE forma_mac_checkout_attempts SET expires_at=now()-interval '1 second'");await assert.rejects(f.service.receipt(f.checkout.id,f.checkout.cookie),{code:'PURCHASE_NOT_FOUND'});
});
test('two Macs racing one key yield exactly one activation; the exact network retry recovers the same grant',async t=>{
  const f=await fixture(t),key=await f.paid(),a=await activation(f.service,key),b=await activation(f.service,key);
  const results=await Promise.allSettled([f.service.activate(a.request),f.service.activate(b.request)]);
  assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.equal(results.find(r=>r.status==='rejected').reason.code,'KEY_ALREADY_USED');
  const winner=results[0].status==='fulfilled'?a:b,grant=results.find(r=>r.status==='fulfilled').value.license;
  protocol.verifyEntitlement(grant,{...protocolSettings,...winner.mac});
  await assert.rejects(async()=>protocol.verifyEntitlement(grant,{...protocolSettings,...(winner===a?b:a).mac}));
  const retry=await f.service.activate(winner.request);assert.equal(retry.license,grant);assert.equal(retry.recovered,true);
  const fresh=await activation(f.service,key,winner.mac);await assert.rejects(f.service.activate(fresh.request),{code:'KEY_ALREADY_USED'});
  const receipt=await f.service.receipt(f.checkout.id,f.checkout.cookie);assert.equal(receipt.status,'activated');assert.equal(receipt.licenseKey,null);
  assert.equal((await f.pool.query('SELECT key_ciphertext FROM forma_mac_licenses')).rows[0].key_ciphertext,null);
});
test('expired or forged activation proofs cannot consume a key; signer failures roll back the claim',async t=>{
  const f=await fixture(t),key=await f.paid(),a=await activation(f.service,key);
  await assert.rejects(f.service.activate({...a.request,hardwareHash:protocol.digest('different')}),{code:'INVALID_CHALLENGE'});
  await assert.rejects(f.service.activate({...a.request,signature:randomBytes(64).toString('base64url')}),{code:'INVALID_PROOF'});
  await f.pool.query("UPDATE forma_mac_activation_challenges SET expires_at=now()-interval '1 second' WHERE id=$1",[a.challenge.id]);await assert.rejects(f.service.activate(a.request),{code:'NONCE_EXPIRED'});
  const b=await activation(f.service,key);f.service.signGrant=()=>{throw Error('signer failure');};await assert.rejects(f.service.activate(b.request),/signer failure/);
  assert.equal((await f.pool.query('SELECT state FROM forma_mac_licenses')).rows[0].state,'issued');assert.equal((await f.pool.query('SELECT consumed_at FROM forma_mac_activation_challenges WHERE id=$1',[b.challenge.id])).rows[0].consumed_at,null);
  f.service.signGrant=signGrant;await f.service.activate(b.request);
});
test('signed offline grants reject tampering, unknown issuers and another Mac',async t=>{
  const f=await fixture(t),key=await f.paid(),a=await activation(f.service,key),{license}=await f.service.activate(a.request);
  const [encoded,sig]=license.split('.'),payload=JSON.parse(Buffer.from(encoded,'base64url'));payload.hardwareHash=protocol.digest('forged');
  assert.throws(()=>protocol.verifyEntitlement(Buffer.from(JSON.stringify(payload)).toString('base64url')+'.'+sig,{...protocolSettings,...a.mac}));
  assert.throws(()=>protocol.verifyEntitlement(license,{issuers:[],product,...a.mac}));
  assert.throws(()=>protocol.verifyEntitlement(license,{...protocolSettings,...a.mac,hardwareHash:protocol.digest('other-mac')}));
});
test('refunds and disputes block unused keys and cannot be lost when delivered before fulfillment',async t=>{
  const f=await fixture(t);const refund={id:'evt_'+randomUUID(),type:'charge.refunded',data:{object:{payment_intent:f.session.payment_intent.id}}};
  await f.service.fulfill(refund);assert.deepEqual(await f.service.fulfill(f.event()),{revoked:true});assert.equal((await f.service.receipt(f.checkout.id,f.checkout.cookie)).status,'unavailable');
  const g=await fixture(t),key=await g.paid();await g.service.fulfill({id:'evt_'+randomUUID(),type:'charge.dispute.created',data:{object:{payment_intent:g.session.payment_intent.id}}});
  const a=await activation(g.service,key);await assert.rejects(g.service.activate(a.request),{code:'INVALID_KEY'});
  const unrelated={id:'evt_'+randomUUID(),type:'charge.refunded',data:{object:{payment_intent:'pi_otherproduct'}}};
  assert.deepEqual(await g.service.fulfill(unrelated),{ignored:true});assert.equal((await g.pool.query('SELECT count(*)::int n FROM forma_mac_payment_blocks WHERE payment_intent_id=$1',['pi_otherproduct'])).rows[0].n,0);
});
test('rate limits and nonces are persisted rather than trusted to one function instance',async t=>{
  const f=await fixture(t);await f.service.rateLimit('127.0.0.99','activate',1);await assert.rejects(f.service.rateLimit('127.0.0.99','activate',1),{code:'RATE_LIMITED'});
  const stored=(await f.pool.query('SELECT client_hash FROM forma_mac_rate_limits')).rows[0];assert.notEqual(stored.client_hash,'127.0.0.99');
});
test('HTTP signature verification, origin checks, body limits and closed checkout fail safely without issuing anything',async()=>{
  const stripe=new Stripe('test-only-not-a-credential'),webhookSecret='webhook-test-only';let fulfilled=0;
  const config={origin,checkoutReady:false,licenseReady:true,providerReady:true,release:{ready:false},webhookSecret};
  const api=createApi({config,stripe,getService:()=>({fulfill:async()=>fulfilled++,rateLimit:async()=>{}})});
  const req=(path,value,headers={})=>new Request(origin+path,{method:'POST',headers:{'content-type':'application/json',origin,...headers},body:JSON.stringify(value)});
  const status=await(await api(new Request(origin+'/api/mac/status'))).json();assert.equal(status.available,false);assert.equal(status.price.amount,4900);
  assert.equal((await api(req('/api/mac/checkout',{}))).status,503);assert.equal((await api(req('/api/mac/receipt',{}, {origin:'https://attacker.invalid'}))).status,403);
  assert.equal((await api(req('/api/mac/activate',{x:'x'.repeat(9000)}))).status,413);
  const raw=JSON.stringify({id:'evt_test',type:'checkout.session.completed',data:{object:{id:'cs_test'}}});
  assert.equal((await api(new Request(origin+'/api/mac/webhook',{method:'POST',body:raw}))).status,400);assert.equal(fulfilled,0);
  const signature=stripe.webhooks.generateTestHeaderString({payload:raw,secret:webhookSecret});
  assert.equal((await api(new Request(origin+'/api/mac/webhook',{method:'POST',body:raw,headers:{'stripe-signature':signature}}))).status,200);assert.equal(fulfilled,1);
  const offline=createApi({config:{...config,licenseReady:false},stripe,getService:()=>{throw Error('must not touch DB');}});
  assert.equal((await offline(req('/api/mac/checkout',{}))).status,503);assert.equal((await offline(new Request(origin+'/api/mac/status'))).status,200);
});
test('unconfigured production remains closed and contains no private credentials in its public response',()=>{
  const config=loadConfig({CONTEXT:'production',MAC_CHECKOUT_ENABLED:'1'});assert.equal(config.checkoutReady,false);assert.equal(config.release.ready,false);
});
test('desktop stores activation encrypted, recovers a lost response after restart and refuses a copied profile on another Mac',async t=>{
  const f=await fixture(t),licenseKey=await f.paid(),folder=await mkdtemp(path.join(os.tmpdir(),'forma-license-test-')),file=path.join(folder,'activation.bin');
  t.after(async()=>{for(const name of ['activation.bin','activation.bin.pending'])await unlink(path.join(folder,name)).catch(e=>{if(e.code!=='ENOENT')throw e;});await rmdir(folder);});
  const encryptionKey=randomBytes(32),safeStorage={isEncryptionAvailable:()=>true,encryptString:value=>Buffer.from(encryptKey(value,encryptionKey)),decryptString:bytes=>decryptKey(bytes.toString(),encryptionKey)};
  const hardwareHash=protocol.digest('test-mac-a');let loseResponse=true,firstRequest;
  const request=async(endpoint,value)=>{if(endpoint.endsWith('/challenge'))return f.service.challenge(value);firstRequest ||= structuredClone(value);const result=await f.service.activate(value);if(loseResponse){loseResponse=false;throw Error('response lost after server commit');}assert.deepEqual(value,firstRequest);return result;};
  const options={file,safeStorage,hardwareHash,config:protocolSettings,request};
  const first=new clientModule.MacLicenseClient(options);assert.equal(await first.load(),false);await assert.rejects(first.activate(licenseKey),/response lost/);
  const encrypted=await readFile(file,'utf8');assert.equal(encrypted.includes(licenseKey),false);assert.equal(encrypted.includes('PRIVATE KEY'),false);
  const restarted=new clientModule.MacLicenseClient(options);assert.equal(await restarted.load(),false);await restarted.activate(licenseKey);assert.equal(restarted.valid(),true);assert.equal(restarted.profile.pending,undefined);
  const offline=new clientModule.MacLicenseClient({...options,request:()=>{throw Error('must work offline');}});assert.equal(await offline.load(),true);
  const copied=new clientModule.MacLicenseClient({...options,hardwareHash:protocol.digest('test-mac-b')});await assert.rejects(copied.load(),{code:'PROFILE_UNAVAILABLE'});
  const locked=new clientModule.MacLicenseClient({...options,safeStorage:{isEncryptionAvailable:()=>false}});await assert.rejects(locked.load(),{code:'KEYCHAIN_UNAVAILABLE'});
});
