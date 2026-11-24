import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
const source = (await readFile(new URL('../../formwink-retro-preview/assets/formwink-cart.js', import.meta.url),'utf8')).replace("import { CartLinesUpdateEvent } from '@shopify/events';", `const CartLinesUpdateEvent = globalThis.TestCartEvent;`);
class TestCartEvent {
  constructor(payload) {Object.assign(this,payload)}
  static createPromise() {let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});promise.catch(()=>{});return {promise,resolve,reject}}
  static createCartFromAjaxResponse(cart) {return {totalQuantity:cart.item_count}}
}
globalThis.TestCartEvent=TestCartEvent;
globalThis.window={Shopify:{routes:{root:'/' }},location:{pathname:'/'}};
globalThis.document={querySelectorAll:()=>[{dataset:{sectionId:'cart-drawer-section'}}]};
const {addFormwinkItems}=await import('data:text/javascript,'+encodeURIComponent(source));
let events=[];
const element={dataset:{syncMessage:'Added; reload before retry'},dispatchEvent:e=>events.push(e)};
const item=[{id:51412705312804,quantity:1}];
let calls=0;
globalThis.fetch=async()=>{calls++;return {ok:false,json:async()=>({description:'Sold out'})}};
await assert.rejects(addFormwinkItems(element,item),/Sold out/);
assert.equal(calls,1);
assert.equal(events.length,1);
await assert.rejects(events[0].promise,/Sold out/);
console.log('PASS: sold-out response rejects without success or retry');
calls=0;
globalThis.fetch=async()=>{calls++;throw new TypeError('Failed to fetch')};
await assert.rejects(addFormwinkItems(element,item),/Failed to fetch/);
assert.equal(calls,1);
console.log('PASS: offline before add fails and releases lock');
calls=0;
globalThis.fetch=async()=>{calls++;if(calls===1)return {ok:true,json:async()=>({sections:{}})};throw new Error('offline')};
await assert.rejects(addFormwinkItems(element,item),/Added; reload before retry/);
assert.equal(calls,2);
console.log('PASS: failure after successful add does not repeat mutation');
let release;
calls=0;
globalThis.fetch=async()=>{calls++;if(calls===1)await new Promise(r=>release=r);return {ok:true,json:async()=>calls===1?{sections:{}}:{item_count:1}}};
const first=addFormwinkItems(element,item);
await assert.rejects(addFormwinkItems(element,item),/in progress/);
assert.equal(calls,1);
release();
await first;
assert.equal(calls,2);
console.log('PASS: simultaneous clicks cause one add request');
