import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import puppeteer from 'puppeteer-core'
import { fixtureAnalysis } from './fixtures.mjs'
import { pageSnapshot } from '../lib/journey.mjs'

const origin = `http://127.0.0.1:${process.env.UI_TEST_PORT || 5191}`
const output = await mkdtemp(join(tmpdir(),'jiagoumao-ui-'))
const server = spawn(process.execPath,['server.mjs'],{cwd:new URL('..',import.meta.url),env:{...process.env,PORT:new URL(origin).port,NODE_ENV:'production'},stdio:['ignore','pipe','pipe']})
let browser
try {
  await new Promise((resolve,reject) => {
    const timeout = setTimeout(() => reject(new Error('Preview server startup timeout')),10000)
    server.stdout.on('data',data => { if (String(data).includes('加购猫运行于')) { clearTimeout(timeout); resolve() } })
    server.once('exit',code => { clearTimeout(timeout); reject(new Error(`Preview server exited ${code}`)) })
  })
  browser = await puppeteer.launch({executablePath:process.env.CHROME_EXECUTABLE_PATH || (process.platform === 'darwin' ? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' : '/usr/bin/chromium'),headless:true,args:['--no-sandbox']})
  const domFixture = await browser.newPage()
  await domFixture.goto(origin)
  await domFixture.setContent('<div class="cart-drawer upsell"><article class="product-card"><a href="/products/main">Main item</a><button>Add to cart</button></article></div>')
  assert.equal((await pageSnapshot(domFixture,[{url:'/products/main'}])).cartRecommendationButton,false,'existing cart item is not a recommendation')
  await domFixture.setContent('<div class="cart-drawer"><article class="upsell-item" data-product-id="2"><a href="/products/extra">Extra item</a><button>Add to cart</button></article></div>')
  const moduleEvidence = await pageSnapshot(domFixture,[{url:'/products/main'}])
  assert.equal(moduleEvidence.cartRecommendationButton,true)
  assert.match(moduleEvidence.cartRecommendationText,/Extra item/)
  await domFixture.close()
  const page = await browser.newPage()
  await page.setViewport({width:1440,height:1000})
  const errors = []
  page.on('pageerror',error => errors.push(error.message))
  const payload = await fixtureAnalysis()
  let sampleRequest
  await page.setRequestInterception(true)
  page.on('request',async request => {
    const url = new URL(request.url())
    if (url.pathname === '/api/analyze') return request.respond({status:200,contentType:'application/json',body:JSON.stringify(payload)})
    if (url.pathname === '/api/journey') {
      sampleRequest = url.searchParams.get('urls')
      await new Promise(resolve => setTimeout(resolve,1300))
      return request.respond({status:200,contentType:'application/json',body:JSON.stringify({
        status:'partial',engine:'Isolated UI fixture',durationMs:1300,
        sampleCount:2,sampleTotal:3,
        steps:[{label:'打开代表性商品页',status:'passed',sampleTitle:'Item 1',evidence:'Fixture page',url:'https://fixture.example/products/item-1'}],
        findings:[{id:'cart-drawer',verified:true,evidence:'Drawer appeared after add',sourceUrl:'https://fixture.example/products/item-1',step:'加购后'}],
        unconfirmed:[{id:'checkout-upsell',reason:'Fixture checkout blocked'}],
        sampleMatches:[{id:'cart-drawer',samples:1}],
        sampleRuns:[{status:'completed',product:{title:'Item 1'}},{status:'failed',error:'Fixture sample blocked',stage:'打开商品页'},{status:'partial',product:{title:'Item 3'}}],
        boundary:'Only this isolated fixture was checked.'
      })})
    }
    if (url.origin !== origin && !url.protocol.startsWith('data')) return request.abort()
    return request.continue()
  })
  await page.goto(origin,{waitUntil:'networkidle0'})
  await page.type('#search-input','fixture.example')
  await page.click('#search-form button')
  await page.waitForSelector('.audit-table')
  assert.ok(await page.$('.journey-running'),'static result stays usable during journey')
  await page.waitForFunction(() => !document.querySelector('.journey-running'))
  assert.equal(sampleRequest.split('|').length,3,'all three sample URLs are passed')
  assert.equal(await page.$$eval('.audit-table tbody tr',rows => rows.length),28)
  assert.ok((await page.$eval('.diagnostic-panel',el => el.innerText)).includes('检查失败'))
  assert.ok((await page.$eval('.evidence-section',el => el.innerText)).includes('GBP'))
  assert.ok(!(await page.$eval('.evidence-section',el => el.innerText)).includes('US$'))
  await page.select('[data-scope="diagnostic"][data-strategy-filter="status"]','已验证')
  assert.equal(await page.$$eval('.audit-table tbody tr',rows => rows.length),1)
  await page.click('.audit-table [data-strategy-id]')
  await page.waitForSelector('.detail-evidence')
  assert.ok((await page.$eval('.detail-evidence',el => el.innerText)).includes('Drawer appeared after add'))
  assert.ok(await page.$('.verified-case img'),'verified case uses a saved scene screenshot')
  await page.click('.verified-case-zoom')
  await page.waitForSelector('.zoom-panel img')
  await page.keyboard.press('Escape')
  assert.ok(await page.$('.strategy-drawer-layer'),'closing zoom retains strategy detail')
  await page.keyboard.press('Escape')
  await page.waitForFunction(() => !document.querySelector('.strategy-drawer-layer'))
  await page.click('[data-clear-strategy-filters="diagnostic"]')
  await page.$eval('.diagnostic-panel',element => element.scrollIntoView())
  await page.screenshot({path:join(output,'desktop-table.png')})
  await page.click('[data-strategy-view="board"][data-scope="diagnostic"]')
  assert.equal(await page.$$eval('.audit-column',elements => elements.length),5)
  assert.ok(await page.$eval('.audit-board',element => element.scrollWidth > element.clientWidth))
  await page.screenshot({path:join(output,'desktop-board.png')})
  assert.equal(await page.evaluate(() => localStorage.getItem('jiagoumao-diagnostic-view')),'board')
  await page.setViewport({width:390,height:844})
  await page.$eval('.diagnostic-panel',element => element.scrollIntoView())
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1),'mobile page has no unintended horizontal overflow')
  await page.screenshot({path:join(output,'mobile-board.png')})
  await page.click('[data-strategy-view="table"][data-scope="diagnostic"]')
  assert.ok(await page.$eval('.audit-table-wrap',element => element.scrollWidth > element.clientWidth),'mobile table scrolls inside its container')
  await page.screenshot({path:join(output,'mobile-table.png')})
  await page.goto(`${origin}/strategies`,{waitUntil:'networkidle0'})
  await page.click('[data-strategy-view="table"][data-scope="library"]')
  assert.equal(await page.$$eval('.audit-table tbody tr',rows => rows.length),28)
  await page.select('[data-scope="library"][data-strategy-filter="needsApp"]','无需 App')
  assert.equal(await page.$$eval('.audit-table tbody tr',rows => rows.length),7)
  await page.click('.audit-table [data-strategy-id]')
  assert.ok((await page.$eval('.strategy-detail-drawer',el => el.innerText)).includes('场景待验证'))
  await page.keyboard.press('Escape')
  await page.reload({waitUntil:'networkidle0'})
  assert.ok(await page.$('.audit-table'),'library view persists on reload')
  assert.deepEqual(errors,[])
  const invalid = await fetch(`${origin}/api/analyze?url=${encodeURIComponent('http://127.0.0.1:1234')}`)
  assert.equal(invalid.status,422)
  assert.match((await invalid.json()).error,/内网/)
  console.log(`UI smoke passed: 28 strategies, 3 sample URLs, filters, view persistence, evidence drawer, static-result availability, 390px layout, private URL blocking. Screenshots: ${output}`)
} finally {
  await browser?.close()
  server.kill('SIGTERM')
}
