import { safeFetch } from './public-http.mjs'
import { refreshReport, strategyMeta } from './strategy-meta.mjs'

const APP_SIGNALS = [
  ['Klaviyo', /klaviyo/i], ['Judge.me', /judge\.me|judgeme/i], ['Loox', /loox\.io|looxReviews/i],
  ['Yotpo', /yotpo/i], ['Gorgias', /gorgias/i], ['Rebuy', /rebuyengine/i], ['Recharge', /rechargeapps|rechargecdn/i],
  ['AfterShip', /aftership/i], ['Omnisend', /omnisend/i], ['TikTok', /analytics\.tiktok|tiktok\.com/i], ['Meta Pixel', /connect\.facebook\.net\/.*fbevents/i]
]
const UPSELL_RULES = [
  ['free-shipping','满额免邮','门槛激励',[/free shipping.{0,35}(over|orders|above|\$|€|£)|(?:over|spend).{0,35}free shipping/i,/免邮|免运费/i]], ['bundle','套装 / 组合购买','组合销售',[/bundle|bundles|build a set|shop the set|组合|套装/i]],
  ['quantity-break','多件折扣 / 阶梯价','数量激励',[/buy more|more you buy|quantity discount|multi-buy|2\s*for|3\s*for|买多|多件|阶梯折扣/i]],
  ['subscription','订阅省钱','复购与客单',[/subscribe.{0,30}(save|discount)|subscription|定期购|订阅省/i]], ['product-recs','商品相关推荐','交叉销售',[/you may also like|related products|recommended for you|推荐商品|猜你喜欢/i]],
  ['frequently-bought','经常一起购买','交叉销售',[/frequently bought together|often bought together|经常一起购买|一起买/i]], ['cart-drawer','购物车抽屉 / 加购后推荐','购物车转化',[/cart drawer|quick cart|mini cart|购物车抽屉|继续购物/i]],
  ['gift-threshold','满额赠品','门槛激励',[/free gift|gift with purchase|gift on orders|赠品|满赠/i]], ['upsell-upgrade','高配版本升级','价格升级',[/pro version|upgrade to|升级版|升级至|高配/i]],
  ['social-proof','评价 / 社会证明','信任增强',[/reviews?|rating|customer(s)? say|评价|评论|用户说/i]], ['discount-code','优惠码 / 首单优惠','价格激励',[/discount code|promo code|first order|welcome offer|优惠码|首单|新人优惠/i]],
  ['free-gift-card','礼品卡 / 礼赠场景','场景销售',[/gift card|gifting|礼品卡|送礼/i]],
  ['cart-progress','购物车进度条','购物车转化',[/spend \$?\d+ more|add \$?\d+|progress bar|还差|再加购/i]], ['cart-upsell','购物车一键加购','购物车转化',[/one[- ]click add|add this|一键加购|顺手加购/i]],
  ['post-purchase','购买后追加销售','售后增长',[/post[- ]purchase|thank you page|order status upsell|购买后|感谢页追加|订单状态页/i]], ['checkout-upsell','结账页追加购买','结账转化',[/checkout upsell|checkout offer|order bump|checkout extension|结账追加|订单加购/i]],
  ['sticky-add','悬浮加购栏','商品页转化',[/sticky add to cart|sticky atc|fixed add to cart|悬浮加购|固定加购/i]], ['compare-at','划线价 / 价值锚定','价格激励',[/compare at|was \$|regular price|原价|划线价|立省|save \$|save \d+%/i]],
  ['limited-time','限时促销倒计时','紧迫感',[/countdown|ends in|limited time|limited offer|倒计时|限时|仅剩/i]], ['low-stock','库存稀缺提示','紧迫感',[/only \d+ left|low stock|almost gone|库存紧张|仅剩 \d+|售罄风险/i]],
  ['membership','会员 / 积分加购激励','会员增长',[/rewards program|loyalty|earn.{0,20}points|member price|积分|会员价|奖励计划/i]], ['free-returns','退换货保障降低升级阻力','信任增强',[/free returns|easy returns|money back|guarantee|免费退换|无忧退换|保障/i]],
  ['gift-wrap','礼盒 / 加价包装','场景销售',[/gift wrap|gift packaging|add a gift|礼盒|礼品包装|加价包装/i]], ['personalization','个性化定制加价','价格升级',[/personaliz|customiz|engraving|monogram|个性化|定制|刻字/i]],
  ['quiz-recommendation','问答式商品推荐','导购转化',[/product quiz|take the quiz|产品测验|选购问卷/i]], ['social-share','分享 / 邀请奖励','会员增长',[/refer a friend|referral|share and save|邀请好友|分享得|推荐奖励/i]],
  ['landing-bundle','场景落地页组合','组合销售',[/shop the look|complete the look|starter kit|routine|入门套装|完整搭配|场景套装/i]], ['back-in-stock','补货提醒带回购推荐','复购与客单',[/back in stock|notify me|restock|到货通知|补货提醒/i]]
]
const plainText = html => String(html || '').replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<(?:noscript|template)[\s\S]*?<\/(?:noscript|template)>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/\s+/g,' ').trim()
function evidenceSnippet(source, pattern) {
  const text = plainText(source)
  const found = text.match(pattern)
  if (!found) return ''
  const index = Math.max(0, text.toLowerCase().indexOf(found[0].toLowerCase()))
  return text.slice(Math.max(0, index - 70), Math.min(text.length, index + found[0].length + 130))
}

function currencyCode(value) { return /^[A-Z]{3}$/.test(String(value || '')) ? value : null }
function priceOf(product, ajax) { return Number(product.price ?? product.variants?.[0]?.price ?? 0) / (ajax ? 100 : 1) }
function productRecord(raw, context, ajax) {
  const variants = raw.variants || []
  const price = priceOf(raw, ajax)
  const compare = Number(raw.compare_at_price ?? variants[0]?.compare_at_price ?? 0) / (ajax ? 100 : 1)
  const options = (raw.options || []).map(option => typeof option === 'string' ? option : `${option.name}: ${(option.values || []).slice(0,4).join(' / ')}`)
  return {
    id:`live-${raw.id || raw.handle}`, brand:raw.vendor || context.name, store:context.domain,
    name:raw.title, price, compareAt:compare > price ? compare : null, currency:context.currency,
    rating:null, reviews:null, category:raw.product_type || '未公开', country:'未公开',
    imageUrl:raw.featured_image || raw.image?.src || raw.images?.[0]?.src || raw.images?.[0] || '',
    image:'linear-gradient(145deg,#f7f7f7,#e8e8e8)', trend:null, updated:'刚刚', confidence:null,
    description:plainText(raw.body_html || raw.description).slice(0,500) || '公开数据未提供描述。',
    sourceType:'live', sourceUrl:`${context.origin}/products/${raw.handle}`,
    sellingPoints:options.slice(0,4), specs:{ '商品类型':raw.product_type || '未公开', '供应商品牌':raw.vendor || context.name, '变体数量':String(variants.length), '可选项':options.join('；') || '未公开' }, storeId:context.storeId
  }
}

export async function analyzeShopify(input, { fetchPage = safeFetch } = {}) {
  const requested = new URL(input)
  const home = await fetchPage(`${requested.origin}/`)
  const origin = home.url.origin
  if (!/cdn\.shopify\.com|Shopify\.shop|shopify-section|myshopify\.com/i.test(home.body)) throw new Error('未在该网站检测到 Shopify 信号')
  const title = plainText((home.body.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [, ''])[1]).split(/[|–—]/)[0].trim() || home.url.hostname
  const productMatch = requested.pathname.match(/\/products\/([^/?#]+)/)
  const ajax = Boolean(productMatch)
  const productSource = ajax ? `${origin}/products/${productMatch[1]}.js` : `${origin}/products.json?limit=50`
  const directory = await fetchPage(productSource, 'application/json')
  let rawProducts
  try { const data = JSON.parse(directory.body); rawProducts = ajax ? [data] : data.products || [] }
  catch { throw new Error('商品公开接口没有返回有效 JSON') }
  if (!rawProducts.length) throw new Error('公开商品目录中没有可读取商品')
  const ranked = [...rawProducts].sort((a,b) => priceOf(a,ajax) - priceOf(b,ajax))
  const candidates = [...new Map([
    ['低价',ranked[0]], ['中位价',ranked[Math.floor((ranked.length - 1)/2)]], ['高价',ranked.at(-1)]
  ].map(([segment,raw]) => [raw.id || raw.handle, {segment:ajax ? '指定商品' : segment,title:raw.title,handle:raw.handle,price:priceOf(raw,ajax),url:`${origin}/products/${raw.handle || productMatch?.[1]}`}])).values()]
  const [cart, cartData, ...pages] = await Promise.allSettled([
    fetchPage(`${origin}/cart`), fetchPage(`${origin}/cart.js`, 'application/json'),
    ...candidates.map(item => fetchPage(item.url))
  ])
  const sampled = candidates.map((item,index) => ({ ...item, status:pages[index].status === 'fulfilled' ? 'read' : 'failed', error:pages[index].reason?.message || '' }))
  const targets = [{ label:'公开首页', url:home.url.href, raw:home.body }]
  if (cart.status === 'fulfilled') targets.push({ label:'购物车页', url:cart.value.url.href, raw:cart.value.body })
  pages.forEach((page,index) => { if (page.status === 'fulfilled') targets.push({ label:`商品页 · ${candidates[index].title}`, url:page.value.url.href, raw:page.value.body }) })
  targets.forEach(target => { target.text = plainText(target.raw) })
  let currency = null
  if (cartData.status === 'fulfilled') { try { currency = currencyCode(JSON.parse(cartData.value.body).currency) } catch {} }
  currency ||= currencyCode(((home.body.match(/"priceCurrency"\s*:\s*"([A-Z]{3})"/) || home.body.match(/Shopify\.currency\s*=\s*\{[^}]*["']?active["']?\s*:\s*["']([A-Z]{3})/)) || [])[1])
  const storeId = `live-store-${home.url.hostname.replace(/\W/g,'-')}`
  const context = {name:title,domain:home.url.hostname,origin,currency,storeId}
  const products = rawProducts.map(raw => productRecord(raw,context,ajax))
  const strategies = UPSELL_RULES.map(([id,name,group,patterns]) => {
    let target = targets.find(item => patterns.some(pattern => pattern.test(item.text)))
    let pattern = target && patterns.find(pattern => pattern.test(target.text))
    let rawOnly = false
    if (!target) { target = targets.find(item => patterns.some(pattern => pattern.test(item.raw))); pattern = target && patterns.find(pattern => pattern.test(target.raw)); rawOnly = true }
    let sourceEvidence = target ? evidenceSnippet(target.text,pattern) : ''
    if (id === 'compare-at') {
      const discounted = products.find(product => product.compareAt > product.price)
      target = discounted ? { label:'公开商品价格字段',url:discounted.sourceUrl } : null
      sourceEvidence = discounted ? `${discounted.name}：售价 ${discounted.price}，对比价 ${discounted.compareAt}（${currency || '币种未知'}）；前台呈现仍需验证。` : ''
      rawOnly = true
    }
    const meta = strategyMeta(id)
    const cannotCheck = ['结账','购买后'].includes(meta.page) || (meta.page === '购物车' && cart.status !== 'fulfilled') || (meta.page === '商品页' && !sampled.some(item => item.status === 'read'))
    return {
      id,name,group,...meta, status:target ? '有线索' : cannotCheck ? '无法确认' : '未观察到',
      evidenceLevel:target ? (rawOnly ? '弱证据' : '文案线索') : '未验证',
      evidenceTypes:target ? [rawOnly ? '公开字段 / 源码' : '静态页面文案'] : [],
      coverage:target ? [target.label] : targets.map(item => item.label),
      evidence:target ? (sourceEvidence || '公开源码出现相关字段，需要检查实际购物流程。') : cannotCheck ? '本次未完成该阶段的检查，不能判断是否配置。' : '本次已读取页面未观察到明确线索，不代表后台没有配置。',
      sourceEvidence,sourceLabel:target?.label || '',sourceUrl:target?.url || ''
    }
  })
  const coverage = { productCount:sampled.filter(item => item.status === 'read').length,products:sampled.filter(item => item.status === 'read'),samples:sampled,pages:targets.map(item => item.label) }
  const upsell = refreshReport({strategies,total:strategies.length,coverage})
  upsell.summary = `读取 ${coverage.productCount} / ${candidates.length} 个代表商品页，观察到 ${upsell.foundCount} / ${upsell.total} 类策略线索；静态线索尚未验证实际行为。`
  const prices = products.map(product => product.price).filter(Number.isFinite)
  const store = {
    id:storeId,name:title,domain:home.url.hostname,currency,products:products.length,
    averagePublicPrice:prices.reduce((a,b) => a+b,0)/prices.length,
    category:[...new Set(products.map(product => product.category))].join(' / '),
    country:'未公开',founded:'未公开',theme:'Shopify 主题（名称未公开）',
    apps:APP_SIGNALS.filter(([,pattern]) => targets.some(target => pattern.test(target.raw))).map(([name]) => name),
    traffic:'—',trafficChange:null,channels:[],description:`${title} 的公开页面诊断。`,
    sourceType:'live',sourceUrl:home.url.href,productSource,upsell
  }
  return {mode:ajax ? 'product' : 'store',products,store,upsell}
}
