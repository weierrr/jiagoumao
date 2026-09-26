import { test } from 'node:test'
import assert from 'node:assert/strict'
import { analyzeShopify } from '../lib/analyze.mjs'
import { isPrivateAddress, safeFetch, validatePublicUrl, requestText } from '../lib/public-http.mjs'
import http from 'node:http'
import { createPublicProxy } from '../lib/browser-proxy.mjs'
import { detectJourneySignals } from '../lib/journey-signals.mjs'
import { aggregateJourneys } from '../lib/journey-result.mjs'
import { applyJourneyToReport, formatMoney } from '../lib/report.mjs'

const publicDns = async () => [{ address:'8.8.8.8',family:4 }]
import { fixtureAnalysis } from './fixtures.mjs'

test('private and non-public IPv4/IPv6 destinations are rejected',async () => {
  for (const address of ['127.0.0.1','0.0.0.0','10.0.0.1','100.64.0.1','169.254.169.254','172.16.0.1','192.168.1.1','::1','fc00::1','fe80::1','::ffff:7f00:1']) assert.equal(isPrivateAddress(address),true,address)
  for (const address of ['8.8.8.8','2606:4700:4700::1111']) assert.equal(isPrivateAddress(address),false,address)
  await assert.rejects(validatePublicUrl('file:///etc/passwd',publicDns))
  await assert.rejects(validatePublicUrl('http://user:password@example.com',publicDns))
  await assert.rejects(validatePublicUrl('http://example.com',async () => [{address:'8.8.8.8',family:4},{address:'10.0.0.1',family:4}]))
})

test('redirects are validated before the next connection, and connections use checked addresses',async () => {
  let connections = 0
  const transport = async (_url,addresses) => {
    assert.equal(addresses[0].address,'8.8.8.8')
    connections += 1
    return {status:302,location:'http://169.254.169.254/latest/meta-data/'}
  }
  await assert.rejects(safeFetch('https://example.com','text/html',{resolver:publicDns,transport}),/内网/)
  assert.equal(connections,1)
})

test('redirect loop is bounded',async () => {
  let calls = 0
  await assert.rejects(safeFetch('https://example.com','text/html',{resolver:publicDns,transport:async () => { calls++; return {status:302,location:'/loop'} }}),/跳转/)
  assert.equal(calls,6)
})

test('pinned HTTP transport enforces body size while streaming and a total deadline',async () => {
  const server = http.createServer((req,res) => {
    if (req.url === '/stall') { res.writeHead(200); res.write('x'); return }
    res.writeHead(200); res.write('1234567890'); res.end('1234567890')
  })
  await new Promise(resolve => server.listen(0,'127.0.0.1',resolve))
  try {
    const options = {accept:'text/html',maxBytes:16,timeoutMs:100}
    const publicHostUrl = new URL(`http://fixture.example:${server.address().port}/`)
    const pinnedFixtureAddress = [{address:'127.0.0.1',family:4}]
    // Direct transport fixture: the production safeFetch validates before calling it.
    await assert.rejects(requestText(publicHostUrl,pinnedFixtureAddress,options),/体积/)
    publicHostUrl.pathname = '/stall'
    await assert.rejects(requestText(publicHostUrl,pinnedFixtureAddress,options))
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)) }
})

test('browser proxy rejects private TLS tunnels before connecting',async () => {
  const proxy = await createPublicProxy()
  try {
    const endpoint = new URL(proxy.url)
    const status = await new Promise((resolve,reject) => {
      const request = http.request({host:endpoint.hostname,port:endpoint.port,method:'CONNECT',path:'127.0.0.1:1234'})
      request.on('connect',(response,socket) => { resolve(response.statusCode); socket.destroy() })
      request.on('error',reject)
      request.end()
    })
    assert.equal(status,403)
  } finally { await proxy.close() }
})

test('actually reads three representative PDPs, tracks failed pages, preserves original currency',async () => {
  const payload = await fixtureAnalysis({failHigh:true})
  assert.equal(payload.upsell.coverage.productCount,2)
  assert.equal(payload.upsell.coverage.samples.length,3)
  assert.equal(payload.upsell.coverage.samples[2].status,'failed')
  assert.ok(payload.requests.includes('https://fixture.example/products/item-1'))
  assert.ok(payload.requests.includes('https://fixture.example/products/item-2'))
  assert.equal(payload.store.currency,'GBP')
  assert.equal(payload.products[1].price,49)
  assert.equal(payload.upsell.strategies.find(item => item.id === 'frequently-bought').status,'有线索')
})

test('single-product Ajax cents are normalized consistently, including sample and average price',async () => {
  const payload = await fixtureAnalysis({ajax:true})
  assert.equal(payload.products[0].price,49)
  assert.equal(payload.upsell.coverage.products[0].price,49)
  assert.equal(payload.store.averagePublicPrice,49)
  assert.ok(payload.requests.includes('https://fixture.example/products/item-2'))
})

test('generic marketing, equal prices and newsletter subscriptions are not upsell strategies',async () => {
  const payload = await fixtureAnalysis()
  for (const id of ['quiz-recommendation','upsell-upgrade','compare-at','subscription']) assert.equal(payload.upsell.strategies.find(item => item.id === id).status,'未观察到',id)
  assert.equal(payload.upsell.strategies.find(item => item.id === 'post-purchase').status,'无法确认')
  assert.equal(payload.upsell.verifiedCount,0)
})

test('ordinary PDP Add to cart and Your cart do not create cart strategy findings',() => {
  const findings = detectJourneySignals({text:'Fixture item £49 Add to cart Your cart is empty',url:'https://fixture.example/products/item-1'},'商品页')
  assert.equal(findings.length,0)
  const actual = detectJourneySignals({text:'',drawerVisible:true,drawerReady:true,drawerText:'Your cart',url:'https://fixture.example/products/item-1'},'加购后',{added:true,drawerBefore:false})
  assert.equal(actual[0].id,'cart-drawer')
  assert.equal(actual[0].verified,true)
  assert.equal(detectJourneySignals({drawerVisible:true,drawerText:'Your cart'},'加购后',{added:false})[0].verified,false)
  assert.equal(detectJourneySignals({drawerVisible:true,drawerReady:false,drawerText:'My cart 0'},'加购后',{added:true})[0].verified,false)
})

test('cart upsell requires a recommendation module with a product and button, and is only observed',() => {
  assert.equal(detectJourneySignals({text:'Add to cart'},'购物车').length,0)
  const found = detectJourneySignals({text:'',cartRecommendationButton:true,cartRecommendationText:'Add travel size',url:'https://fixture.example/cart'},'购物车')
  assert.equal(found[0].id,'cart-upsell'); assert.equal(found[0].verified,false)
})

test('multi-sample aggregation preserves errors, boundaries and finding provenance',() => {
  const urls = ['https://fixture.example/products/a','https://fixture.example/products/b','https://fixture.example/products/c']
  const result = aggregateJourneys(urls,[
    {status:'fulfilled',value:{status:'completed',product:{title:'A'},steps:[],findings:[],unconfirmed:[]}},
    {status:'rejected',reason:Object.assign(new Error('B blocked'),{journeyStage:'打开商品页'})},
    {status:'fulfilled',value:{status:'partial',product:{title:'C'},steps:[],findings:[{id:'bundle',evidence:'Bundle',sourceUrl:urls[2]}],unconfirmed:[{id:'checkout-upsell',reason:'Checkout blocked'}]}}
  ])
  assert.equal(result.sampleCount,2); assert.equal(result.sampleTotal,3)
  assert.equal(result.sampleRuns[1].error,'B blocked')
  assert.equal(result.findings[0].sourceUrl,urls[2])
  assert.match(result.unconfirmed[0].reason,/C.*Checkout blocked/)
  assert.equal(result.status,'partial')
})

test('only explicit behavioral verification becomes verified; old missing statuses retain opportunities',() => {
  const report = {total:3,strategies:[{id:'cart-upsell',status:'未发现'},{id:'bundle',status:'未发现'},{id:'cart-drawer',status:'未观察到'}]}
  applyJourneyToReport(report,{findings:[{id:'cart-upsell',verified:false,evidence:'Recommendation'},{id:'cart-drawer',verified:true,evidence:'Drawer appeared'}],sampleCount:1,sampleTotal:1})
  assert.equal(report.strategies[0].status,'已观察到')
  assert.equal(report.strategies[2].status,'已验证')
  assert.equal(report.verifiedCount,1)
  assert.equal(report.opportunities[0].id,'bundle')
})

test('unknown currency is explicit rather than implicitly USD',async () => {
  const payload = await fixtureAnalysis({unknownCurrency:true})
  assert.equal(payload.store.currency,null)
  assert.equal(formatMoney(49,'GBP'),'GBP 49')
  assert.equal(formatMoney(49,null),'49（币种未知）')
})

test('local and production share the same analysis implementation',async () => {
  const local = await import('../server.mjs')
  assert.equal(local.analyzeShopify,analyzeShopify)
})
