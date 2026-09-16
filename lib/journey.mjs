import { lookup } from 'node:dns/promises'
import chromium from '@sparticuz/chromium'
import puppeteer from 'puppeteer-core'

const USER_AGENT = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0 Safari/537.36 AddToCartCat/0.2'
const MAX_SOURCE_BYTES = 2 * 1024 * 1024

const SIGNALS = [
  { id: 'free-shipping', name: '满额免邮', patterns: [/free shipping/i, /spend.{0,40}(more|away).{0,30}(shipping|delivery)/i, /免邮|免运费/i] },
  { id: 'bundle', name: '套装 / 组合购买', patterns: [/bundle|build a (box|set)|shop the set|complete the (set|look)|套装|组合购买/i] },
  { id: 'quantity-break', name: '多件折扣 / 阶梯价', patterns: [/buy (2|3|two|three).{0,30}(save|get)|quantity (break|discount)|volume discount|多件|阶梯折扣/i] },
  { id: 'subscription', name: '订阅省钱', patterns: [/subscribe.{0,40}(save|discount)|subscription|定期购|订阅省/i] },
  { id: 'product-recs', name: '商品相关推荐', patterns: [/you may also like|related products|recommended for you|complete your|猜你喜欢|相关推荐/i] },
  { id: 'frequently-bought', name: '经常一起购买', patterns: [/frequently bought together|often bought together|pairs well with|经常一起购买|搭配购买/i] },
  { id: 'cart-drawer', name: '购物车抽屉 / 加购后推荐', patterns: [/your cart|cart drawer|shopping bag|mini cart|购物车|购物袋/i] },
  { id: 'gift-threshold', name: '满额赠品', patterns: [/free gift|gift with purchase|unlock.{0,30}gift|满赠|赠品/i] },
  { id: 'cart-progress', name: '购物车进度条', patterns: [/spend.{0,40}(more|away)|add.{0,30}(more|to unlock)|progress.{0,20}(shipping|gift)|还差|再加购/i] },
  { id: 'cart-upsell', name: '购物车一键加购', patterns: [/add this|quick add|add to (cart|bag)|you might also like|顺手加购|一键加购/i] },
  { id: 'checkout-upsell', name: '结账页追加购买', patterns: [/add to your order|order bump|checkout offer|complete your order|结账追加/i] }
]

function isPrivateAddress(address) {
  const ip = String(address || '').toLowerCase()
  if (ip === '::1' || ip === '::' || ip.startsWith('fc') || ip.startsWith('fd') || ip.startsWith('fe80:')) return true
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(ip)) return false
  const [a, b] = ip.split('.').map(Number)
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
}

function isBlockedHostname(hostname) {
  const host = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '')
  return host === 'localhost' || host.endsWith('.local') || isPrivateAddress(host)
}

async function validatePublicUrl(input) {
  const url = new URL(input)
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('只支持 HTTP 或 HTTPS 地址')
  if (url.username || url.password || isBlockedHostname(url.hostname)) throw new Error('目标地址不可访问')
  const records = await lookup(url.hostname, { all: true })
  if (!records.length || records.some(record => isPrivateAddress(record.address))) throw new Error('不能分析本地或内网地址')
  return url
}

async function fetchJson(input) {
  const url = await validatePublicUrl(input)
  const response = await fetch(url, { signal: AbortSignal.timeout(12000), headers: { accept: 'application/json,text/plain', 'user-agent': USER_AGENT } })
  if (!response.ok) throw new Error(`目标站点返回 ${response.status}`)
  const text = await response.text()
  if (text.length > MAX_SOURCE_BYTES) throw new Error('公开商品数据超过读取限制')
  try {
    return JSON.parse(text)
  } catch {
    const preview = text.replace(/\s+/g, ' ').trim().slice(0, 80)
    throw new Error(preview.startsWith('An error') ? '目标店铺的公开商品接口临时返回错误文本，真实浏览器加购实验无法继续。' : '目标店铺的公开商品接口没有返回可解析的 JSON，真实浏览器加购实验无法继续。')
  }
}

function snippet(source, match) {
  const text = String(source || '').replace(/\s+/g, ' ').trim()
  const index = text.search(match)
  if (index < 0) return ''
  return text.slice(Math.max(0, index - 70), Math.min(text.length, index + 180))
}

function detectSignals(text, step) {
  return SIGNALS.flatMap(rule => {
    const match = rule.patterns.find(pattern => pattern.test(text))
    return match ? [{ id: rule.id, name: rule.name, step, evidence: snippet(text, match), evidenceType: '行为路径中的页面文案', confidence: step === '商品页' ? 94 : 98 }] : []
  })
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
  if (process.env.NODE_ENV === 'production') return '/usr/bin/chromium'
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
    return { itemCount: cart.item_count, totalPrice: cart.total_price, items: cart.items?.map(item => ({ id: item.id, title: item.product_title, quantity: item.quantity, finalLinePrice: item.final_line_price })) || [] }
  }).catch(() => null)
}

async function pageSnapshot(page) {
  const read = () => page.evaluate(() => {
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
    return { title: document.title, url: location.href, text: (document.body?.innerText || '').slice(0, 24000), modules }
  })
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
  const final = await validatePublicUrl(page.url())
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
  const requested = await validatePublicUrl(input)
  const origin = requested.origin
  const productMatch = requested.pathname.match(/\/products\/([^/?#]+)/)
  const raw = productMatch
    ? await fetchJson(`${origin}/products/${productMatch[1]}.js`)
    : (await fetchJson(`${origin}/products.json?limit=8`)).products?.[0]
  if (!raw) throw new Error('没有找到可用于交互验证的公开商品')
  const variant = (raw.variants || []).find(item => item.available !== false) || raw.variants?.[0]
  if (!variant?.id) throw new Error('商品没有可用于加购验证的公开变体')
  const productUrl = `${origin}/products/${raw.handle || productMatch?.[1]}`

  const launchArgs = process.platform === 'darwin'
    ? ['--no-sandbox', '--disable-setuid-sandbox']
    : [...chromium.args, '--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage']
  const browser = await puppeteer.launch({
    args: launchArgs,
    defaultViewport: { width: 1365, height: 900, deviceScaleFactor: 1 },
    executablePath: await executablePathPromise,
    headless: true
  })
  const abortBrowser = () => browser.close().catch(() => {})
  signal?.addEventListener('abort', abortBrowser, { once: true })
  if (signal?.aborted) {
    await abortBrowser()
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
    page.on('request', request => {
      try {
        const url = new URL(request.url())
        if (['http:', 'https:'].includes(url.protocol) && isBlockedHostname(url.hostname)) return request.abort('blockedbyclient')
        if (['image', 'media', 'font'].includes(request.resourceType())) return request.abort('blockedbyclient')
      } catch {}
      request.continue().catch(() => {})
    })

    currentStage = '打开商品页'
    await goto(page, productUrl)
    await dismissConsent(page)
    const productSnapshot = await pageSnapshot(page)
    findings.push(...detectSignals(`${productSnapshot.text}\n${productSnapshot.modules.join('\n')}`, '商品页'))
    steps.push(makeStep('product', '打开代表性商品页', 'passed', productSnapshot, `已加载 ${raw.title}；选择变体 ${variant.title || variant.id}。`, { product: raw.title, variantId: variant.id }))

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
    const drawerSnapshot = await pageSnapshot(page)
    const added = (cartAfter?.itemCount || 0) > (cartBefore?.itemCount || 0)
    findings.push(...detectSignals(`${drawerSnapshot.text}\n${drawerSnapshot.modules.join('\n')}`, '加购后').map(item => ({ ...item, interactionLevel: interactionLevel(item, { added }) })))
    if (drawerSnapshot.modules.some(text => /cart|bag|购物车|购物袋/i.test(text))) {
      findings.push({ id: 'cart-drawer', name: '购物车抽屉 / 加购后推荐', step: '加购后', evidence: drawerSnapshot.modules[0], confidence: 99, interactionLevel: interactionLevel({ step: '加购后' }, { added }) })
    }
    steps.push(makeStep('add', '执行 Add to Cart', added ? 'passed' : 'partial', drawerSnapshot, added ? `${addMethod}成功，购物车商品数从 ${cartBefore?.itemCount || 0} 变为 ${cartAfter.itemCount}。` : '页面已点击或请求加购，但未能确认购物车数量变化。', { method: addMethod || '未找到可操作按钮', before: cartBefore?.itemCount ?? null, after: cartAfter?.itemCount ?? null }))

    currentStage = '读取购物车'
    await goto(page, `${origin}/cart`)
    const cartSnapshot = await pageSnapshot(page)
    const cartSignals = detectSignals(`${cartSnapshot.text}\n${cartSnapshot.modules.join('\n')}`, '购物车')
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
      const quantitySnapshot = await pageSnapshot(page)
      const quantitySignals = detectSignals(`${quantitySnapshot.text}\n${quantitySnapshot.modules.join('\n')}`, '数量变更后')
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
      const checkoutSignals = detectSignals(`${checkoutSnapshot.text}\n${checkoutSnapshot.modules.join('\n')}`, '结账入口')
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
    throw error
  } finally {
    signal?.removeEventListener('abort', abortBrowser)
    await browser.close().catch(() => {})
  }

  const unique = [...new Map(findings.map(item => [item.id, item])).values()]
  return {
    status: steps.some(step => step.status === 'passed') ? 'completed' : 'partial',
    engine: 'Chromium browser journey',
    product: { title: raw.title, handle: raw.handle, variantId: variant.id },
    steps,
    findings: unique,
    unconfirmed,
    durationMs: Date.now() - startedAt,
    boundary: '本次结果只证明该匿名会话在当前地区、设备和时间观察到的公开体验；不等于读取了 Shopify 后台全部配置。'
  }
}
