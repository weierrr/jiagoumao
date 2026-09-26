import { safeFetch, validatePublicUrl } from './public-http.mjs'
import { detectJourneySignals } from './journey-signals.mjs'
import { access } from 'node:fs/promises'
import { createPublicProxy } from './browser-proxy.mjs'
import chromium from '@sparticuz/chromium'
import puppeteer from 'puppeteer-core'

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36 AddToCartCat/0.2'
const MAX_SOURCE_BYTES = 2 * 1024 * 1024

async function fetchJson(input, signal) {
  const response = await safeFetch(input, 'application/json', { maxBytes:MAX_SOURCE_BYTES, signal })
  try { return JSON.parse(response.body) }
  catch { throw new Error('公开商品接口没有返回有效 JSON') }
}

function interactionLevel(item, context = {}) {
  if (item.step === '数量变更后' && context.quantityChanged) return '金额/数量已变化'
  if (item.step === '加购后' && context.added) return '加购后已触发'
  if (item.step === '购物车' || item.step === '加购后') return '可交互路径中出现'
  return '页面中出现'
}

async function resolveExecutablePath() {
  if (process.env.CHROME_EXECUTABLE_PATH) return process.env.CHROME_EXECUTABLE_PATH
  if (process.platform === 'darwin') return '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  if (process.env.NODE_ENV === 'production') { try { await access('/usr/bin/chromium'); return '/usr/bin/chromium' } catch {} }
  return chromium.executablePath()
}

// Warm the Sparticuz binary once when the worker process starts. Without this,
// the first real job can spend the entire Puppeteer connection window unpacking
// Chromium and surface as “WS endpoint URL” timeout.
const executablePathPromise = resolveExecutablePath()

async function dismissConsent(page) {
  await page.evaluate(() => {
    const text = /^(accept|accept all|agree|allow all|got it|close|同意|接受|确定)$/i
    const buttons = [...document.querySelectorAll('button,[role="button"]')]
    const target = buttons.find(element => text.test((element.innerText || element.getAttribute('aria-label') || '').trim()))
    target?.click()
  }).catch(() => {})
}

async function browserCart(page) {
  return page.evaluate(async () => {
    const response = await fetch('/cart.js', { credentials: 'include', headers: { accept: 'application/json' } })
    if (!response.ok) return null
    const cart = await response.json()
    return { itemCount: cart.item_count, totalPrice: cart.total_price, items: cart.items?.map(item => ({ id: item.id, title: item.product_title, url:item.url, quantity: item.quantity, finalLinePrice: item.final_line_price })) || [] }
  }).catch(() => null)
}

export async function pageSnapshot(page, cartItems = []) {
  const read = () => page.evaluate(items => {
    const visible = element => {
      const style = getComputedStyle(element)
      const rect = element.getBoundingClientRect()
      return style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity || 1) > 0 && rect.width > 8 && rect.height > 8
    }
    const selectors = ['[role="dialog"]', '[class*="drawer" i]', '[id*="drawer" i]', '[class*="cart" i]', '[data-cart]', '[class*="upsell" i]', '[class*="recommend" i]']
    const modules = [...new Set(selectors.flatMap(selector => [...document.querySelectorAll(selector)]))]
      .filter(visible)
      .map(element => (element.innerText || '').replace(/\s+/g, ' ').trim())
      .filter(text => text.length > 12)
      .slice(0, 8)
    const drawer = [...document.querySelectorAll('[class*="cart-drawer" i],[id*="cart-drawer" i],cart-drawer,[role="dialog"]')].find(element => visible(element) && /cart|bag|购物车/i.test(element.innerText || ''))
    const recommendations = [...document.querySelectorAll('product-recommendations,[data-recommendations],[class*="upsell" i],[class*="recommend" i]')].filter(visible)
    const cartRecommendations = recommendations.filter(element => Boolean(element.closest('form[action*="/cart"],cart-drawer,[class*="cart" i],[id*="cart" i]')))
    const recommendationText = recommendations.map(element => element.innerText).join(' ').slice(0,6000)
    const currentProducts = new Set(items.map(item => new URL(item.url || '',location.href).pathname))
    const recommendationCards = cartRecommendations.flatMap(element => [...element.querySelectorAll('a[href*="/products/"]')])
      .filter(link => visible(link) && !currentProducts.has(new URL(link.href).pathname))
      .map(link => link.closest('li,article,[data-product-id],[class*="product-card" i],[class*="upsell-item" i]'))
      .filter(Boolean)
    const cartRecommendationText = recommendationCards.map(element => element.innerText).join(' ').slice(0,6000)
    const cartRecommendationButton = recommendationCards.some(element => [...element.querySelectorAll('button,input[type="submit"]')].some(button => visible(button) && !button.disabled && /add|加购|加入/i.test(button.innerText || button.value || '')))
    const quiz = [...document.querySelectorAll('a,button')].some(element => visible(element) && /quiz|问卷|测验/i.test(element.innerText || ''))
    const comparePrice = [...document.querySelectorAll('s,del,[class*="compare" i]')].some(element => visible(element) && /[0-9]/.test(element.innerText || ''))
    const drawerReady = Boolean(drawer && [...drawer.querySelectorAll('a[href*="/products/"]')].some(element => visible(element) && (element.innerText || '').trim().length > 3))
    return { title:document.title, url:location.href, text:(document.body?.innerText || '').slice(0,24000), modules, drawerVisible:Boolean(drawer), drawerReady, drawerText:drawer?.innerText?.slice(0,2000) || '', recommendationText, cartRecommendationText, cartRecommendationButton, quiz, comparePrice }
  }, cartItems)
  try {
    return await read()
  } catch (error) {
    // A storefront can navigate while we are reading its DOM (for example
    // immediately after Add to Cart). Treat that as a transient race and
    // retry against the new document instead of failing the whole journey.
    if (/execution context was destroyed|most likely because of a navigation/i.test(String(error?.message || ''))) {
      await new Promise(resolve => setTimeout(resolve, 450))
      try { return await read() } catch {}
    }
    return { title: '', url: page.url(), text: '', modules: [] }
  }
}

function makeStep(id, label, status, snapshot, evidence, metrics = {}) {
  return { id, label, status, url: snapshot?.url || '', title: snapshot?.title || '', evidence: String(evidence || '').slice(0, 420), modules: snapshot?.modules?.slice(0, 4) || [], metrics }
}

async function goto(page, input, timeout = 18000) {
  let response = null
  try {
    response = await page.goto(input, { waitUntil: 'domcontentloaded', timeout: Math.min(timeout, 10000) })
  } catch (error) {
    if (!/timeout|Navigation timeout/i.test(String(error?.message || ''))) throw error
    // Third-party scripts can keep DOMContentLoaded pending. If the document
    // has committed, continue with the usable storefront instead of failing.
    if (!page.url() || page.url() === 'about:blank') throw error
  }
  await new Promise(resolve => setTimeout(resolve, 550))
  const { url:final } = await validatePublicUrl(page.url())
  if (response && response.status() >= 400) throw new Error(`商品页面返回 ${response.status()}`)
  return { response, final }
}

async function tryClickAdd(page) {
  const selectors = [
    'form[action*="/cart/add"] button[type="submit"]:not([disabled])',
    'button[name="add"]:not([disabled])',
    '[data-add-to-cart]:not([disabled])',
    'button[id*="add-to-cart" i]:not([disabled])'
  ]
  for (const selector of selectors) {
    const button = await page.$(selector)
    if (!button) continue
    try {
      await button.click({ delay: 70 })
      return { method: '真实点击', selector }
    } catch {}
  }
  return null
}

async function addThroughBrowserFetch(page, variantId) {
  return page.evaluate(async id => {
    const response = await fetch('/cart/add.js', {
      method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify({ items: [{ id, quantity: 1 }] })
    })
    return { ok: response.ok, status: response.status, text: (await response.text()).slice(0, 500) }
  }, variantId)
}

export async function runInteractiveJourney(input, options = {}) {
  const signal = options.signal
  if (signal?.aborted) throw new Error('商品验证已取消')
  const startedAt = Date.now()
  const { url:requested } = await validatePublicUrl(input)
  const origin = requested.origin
  const productMatch = requested.pathname.match(/\/products\/([^/?#]+)/)
  const raw = productMatch
    ? await fetchJson(`${origin}/products/${productMatch[1]}.js`, signal)
    : (await fetchJson(`${origin}/products.json?limit=8`, signal)).products?.[0]
  if (!raw) throw new Error('没有找到可用于交互验证的公开商品')
  const variant = (raw.variants || []).find(item => item.available !== false) || raw.variants?.[0]
  if (!variant?.id) throw new Error('商品没有可用于加购验证的公开变体')
  const productUrl = `${origin}/products/${raw.handle || productMatch?.[1]}`

  const launchArgs = process.platform === 'darwin'
    ? ['--no-sandbox', '--disable-setuid-sandbox']
    : [...chromium.args, '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  const proxy = await createPublicProxy()
  let browser
  try { browser = await puppeteer.launch({
    args: [...launchArgs, `--proxy-server=${proxy.url}`, '--proxy-bypass-list=<-loopback>'],
    defaultViewport: { width: 1365, height: 900, deviceScaleFactor: 1 },
    executablePath: await executablePathPromise,
    headless: true
  }) } catch (error) { await proxy.close(); throw error }
  const abortBrowser = () => browser.close().catch(() => {})
  signal?.addEventListener('abort', abortBrowser, { once: true })
  if (signal?.aborted) {
    await abortBrowser()
    await proxy.close()
    throw new Error('商品验证已取消')
  }

  const page = await browser.newPage()
  const steps = []
  const findings = []
  const unconfirmed = [{ id: 'post-purchase', reason: '诊断不会创建真实订单，因此无法进入购买后页面。' }]
  let currentStage = '准备匿名浏览器会话'
  let cartBefore = null
  let cartAfter = null
  let quantityCart = null

  try {
    await page.setUserAgent(USER_AGENT)
    await page.setExtraHTTPHeaders({ 'accept-language': 'en-US,en;q=0.9' })
    await page.setRequestInterception(true)
    page.on('request', async request => {
      try {
        const url = new URL(request.url())
        if (['media', 'font'].includes(request.resourceType())) return request.abort('blockedbyclient')
      } catch { return request.abort('blockedbyclient').catch(() => {}) }
      request.continue().catch(() => {})
    })

    currentStage = '打开商品页'
    await goto(page, productUrl)
    await dismissConsent(page)
    const productSnapshot = await pageSnapshot(page)
    findings.push(...detectJourneySignals(productSnapshot, '商品页'))
    steps.push(makeStep('product', '打开代表性商品页', 'passed', productSnapshot, `已加载 ${raw.title}；公开接口中的候选变体 ${variant.title || variant.id}，实际加购规格以购物车为准。`, { product: raw.title, variantId: variant.id }))

    currentStage = '执行加购'
    cartBefore = await browserCart(page)
    const click = await tryClickAdd(page)
    await new Promise(resolve => setTimeout(resolve, 2400))
    cartAfter = await browserCart(page)
    let addMethod = click?.method || ''
    if (!cartAfter || cartAfter.itemCount <= (cartBefore?.itemCount || 0)) {
      const fallback = await addThroughBrowserFetch(page, variant.id)
      addMethod = fallback.ok ? '浏览器会话内调用公开加购接口' : addMethod
      await new Promise(resolve => setTimeout(resolve, 1200))
      cartAfter = await browserCart(page)
    }
    const added = (cartAfter?.itemCount || 0) > (cartBefore?.itemCount || 0)
    if (added) await page.waitForFunction(() => [...document.querySelectorAll('cart-drawer,[class*="cart-drawer" i],[id*="cart-drawer" i]')].some(drawer => drawer.getBoundingClientRect().width > 8 && [...drawer.querySelectorAll('a[href*="/products/"]')].some(link => (link.innerText || '').trim().length > 3)), {timeout:7000}).catch(() => {})
    const drawerSnapshot = await pageSnapshot(page,cartAfter?.items)
    const drawerFindings = detectJourneySignals(drawerSnapshot, '加购后', { added, drawerBefore:productSnapshot.drawerVisible })
    if (drawerSnapshot.drawerReady && added) {
      const image = await page.screenshot({ type:'jpeg',quality:55,encoding:'base64',captureBeyondViewport:false }).catch(() => '')
      drawerFindings.forEach(item => { if (item.id === 'cart-drawer' && image) item.image = `data:image/jpeg;base64,${image}` })
    }
    findings.push(...drawerFindings)
    steps.push(makeStep('add', '执行 Add to Cart', added ? 'passed' : 'partial', drawerSnapshot, added ? `${addMethod}成功，购物车商品数从 ${cartBefore?.itemCount || 0} 变为 ${cartAfter.itemCount}。` : '页面已点击或请求加购，但未能确认购物车数量变化。', { method: addMethod || '未找到可操作按钮', before: cartBefore?.itemCount ?? null, after: cartAfter?.itemCount ?? null }))

    currentStage = '读取购物车'
    await goto(page, `${origin}/cart`)
    const cartSnapshot = await pageSnapshot(page,cartAfter?.items)
    const cartSignals = detectJourneySignals(cartSnapshot, '购物车')
      findings.push(...cartSignals.map(item => ({ ...item, interactionLevel: interactionLevel(item, { added: Boolean(cartAfter?.itemCount) }) })))
    steps.push(makeStep('cart', '读取购物车页面', cartAfter?.itemCount ? 'passed' : 'partial', cartSnapshot, cartSignals[0]?.evidence || '已读取购物车的可见文案、推荐模块和门槛提示。', { itemCount: cartAfter?.itemCount ?? null, totalPrice: cartAfter?.totalPrice ?? null }))

    if (cartAfter?.itemCount) {
      currentStage = '改变商品数量'
      try {
        await page.evaluate(async () => {
          await fetch('/cart/change.js', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ line: 1, quantity: 2 }) })
        })
      } catch (error) {
        if (!/execution context was destroyed|most likely because of a navigation/i.test(String(error?.message || ''))) throw error
      }
      try { await page.reload({ waitUntil: 'domcontentloaded', timeout: 16000 }) } catch (error) {
        if (!/execution context was destroyed|most likely because of a navigation|timeout/i.test(String(error?.message || ''))) throw error
      }
      await new Promise(resolve => setTimeout(resolve, 1000))
      quantityCart = await browserCart(page)
      const quantitySnapshot = await pageSnapshot(page,quantityCart?.items)
      const quantitySignals = detectJourneySignals(quantitySnapshot, '数量变更后')
      const quantityChanged = quantityCart?.items?.[0]?.quantity === 2
      findings.push(...quantitySignals.map(item => ({ ...item, interactionLevel: interactionLevel(item, { quantityChanged }) })))
      steps.push(makeStep('quantity', '把首件商品数量改为 2', quantityCart?.items?.[0]?.quantity === 2 ? 'passed' : 'partial', quantitySnapshot, quantitySignals[0]?.evidence || '已比较数量变化前后的价格、优惠和门槛文案。', { quantity: quantityCart?.items?.[0]?.quantity ?? null, totalPrice: quantityCart?.totalPrice ?? null }))
    } else {
      steps.push(makeStep('quantity', '把首件商品数量改为 2', 'blocked', cartSnapshot, '购物车没有可确认的商品，跳过数量触发验证。'))
    }

    try {
      currentStage = '寻找结账入口'
      await goto(page, `${origin}/checkout`, 20000)
      const checkoutSnapshot = await pageSnapshot(page)
      const checkoutSignals = detectJourneySignals(checkoutSnapshot, '结账入口')
      findings.push(...checkoutSignals.map(item => ({ ...item, interactionLevel: interactionLevel(item) })))
      const reachedCheckout = /checkout|checkouts|pay/i.test(checkoutSnapshot.url) && !/cart$/i.test(new URL(checkoutSnapshot.url).pathname)
      steps.push(makeStep('checkout', '进入结账入口（不提交订单）', reachedCheckout ? 'passed' : 'partial', checkoutSnapshot, checkoutSignals[0]?.evidence || '已到达公开结账入口；未填写个人信息或支付信息。'))
      if (!reachedCheckout) unconfirmed.push({ id: 'checkout-upsell', reason: '店铺未允许本次匿名会话进入结账页面。' })
    } catch (error) {
      unconfirmed.push({ id: 'checkout-upsell', reason: `结账入口未完成：${error.message}` })
      steps.push(makeStep('checkout', '进入结账入口（不提交订单）', 'blocked', null, `结账入口未完成：${error.message}`))
    }
  } catch (error) {
    error.journeyStage = currentStage
    error.journeyElapsedMs = Date.now() - startedAt
    if (!steps.length) throw error
    steps.push(makeStep('interrupted',currentStage,'blocked',null,`该阶段没有完成：${signal?.aborted ? '达到检查时间上限' : error.message}`))
    if (!steps.some(step => step.id === 'cart' && step.status === 'passed')) {
      for (const id of ['cart-upsell','cart-progress','gift-threshold']) unconfirmed.push({id,reason:'购物车阶段未完整检查，不能判断是否配置。'})
    }
    if (!steps.some(step => step.id === 'checkout' && step.status === 'passed')) unconfirmed.push({id:'checkout-upsell',reason:'结账阶段未完整检查。'})
  } finally {
    signal?.removeEventListener('abort', abortBrowser)
    await browser.close().catch(() => {})
    await proxy.close()
  }

  const unique = [...findings.reduce((map,item) => { if (!map.has(item.id) || (item.verified && !map.get(item.id).verified)) map.set(item.id,item); return map }, new Map()).values()]
  return {
    status: steps.every(step => step.status === 'passed') ? 'completed' : 'partial',
    engine: 'Chromium browser journey',
    product: { title: raw.title, handle: raw.handle, variantId: variant.id },
    steps,
    findings: unique,
    unconfirmed,
    durationMs: Date.now() - startedAt,
    boundary: '本次结果只证明该匿名会话在当前地区、设备和时间观察到的公开体验；不等于读取了 Shopify 后台全部配置。'
  }
}
