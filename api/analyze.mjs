import { lookup } from 'node:dns/promises'

const MAX_BYTES = 4 * 1024 * 1024
const APP_SIGNALS = [
  ['Klaviyo', /klaviyo/i], ['Judge.me', /judge\.me|judgeme/i], ['Loox', /loox\.io|looxReviews/i],
  ['Yotpo', /yotpo/i], ['Gorgias', /gorgias/i], ['Rebuy', /rebuyengine/i], ['Recharge', /rechargeapps|rechargecdn/i],
  ['AfterShip', /aftership/i], ['Omnisend', /omnisend/i], ['TikTok', /analytics\.tiktok|tiktok\.com/i], ['Meta Pixel', /connect\.facebook\.net\/.*fbevents/i]
]
const UPSELL_RULES = [
  ['free-shipping','满额免邮','门槛激励',[/free shipping/i,/免邮|免运费/i]], ['bundle','套装 / 组合购买','组合销售',[/bundle|bundles|build a set|shop the set|组合|套装/i]],
  ['quantity-break','多件折扣 / 阶梯价','数量激励',[/buy more|more you buy|quantity discount|multi-buy|2\s*for|3\s*for|买多|多件|阶梯折扣/i]],
  ['subscription','订阅省钱','复购与客单',[/subscribe|subscription|save \d+%|订阅|定期购/i]], ['product-recs','商品相关推荐','交叉销售',[/you may also like|related products|recommended for you|推荐商品|猜你喜欢/i]],
  ['frequently-bought','经常一起购买','交叉销售',[/frequently bought together|often bought together|经常一起购买|一起买/i]], ['cart-drawer','购物车抽屉 / 加购后推荐','购物车转化',[/cart drawer|quick cart|mini cart|购物车抽屉|继续购物/i]],
  ['gift-threshold','满额赠品','门槛激励',[/free gift|gift with purchase|gift on orders|赠品|满赠/i]], ['upsell-upgrade','高配版本升级','价格升级',[/premium|pro version|upgrade|best value|旗舰|升级版|高配/i]],
  ['social-proof','评价 / 社会证明','信任增强',[/reviews?|rating|customer(s)? say|评价|评论|用户说/i]], ['discount-code','优惠码 / 首单优惠','价格激励',[/discount code|promo code|first order|welcome offer|优惠码|首单|新人优惠/i]],
  ['free-gift-card','礼品卡 / 礼赠场景','场景销售',[/gift card|gifting|礼品卡|送礼/i]],
  ['cart-progress','购物车进度条','购物车转化',[/spend \$?\d+ more|add \$?\d+|progress bar|还差|再加购/i]], ['cart-upsell','购物车一键加购','购物车转化',[/one[- ]click add|add this|一键加购|顺手加购/i]],
  ['post-purchase','购买后追加销售','售后增长',[/post[- ]purchase|thank you page|order status upsell|购买后|感谢页追加|订单状态页/i]], ['checkout-upsell','结账页追加购买','结账转化',[/checkout upsell|checkout offer|order bump|checkout extension|结账追加|订单加购/i]],
  ['sticky-add','悬浮加购栏','商品页转化',[/sticky add to cart|sticky atc|fixed add to cart|悬浮加购|固定加购/i]], ['compare-at','划线价 / 价值锚定','价格激励',[/compare at|was \$|regular price|原价|划线价|立省|save \$|save \d+%/i]],
  ['limited-time','限时促销倒计时','紧迫感',[/countdown|ends in|limited time|limited offer|倒计时|限时|仅剩/i]], ['low-stock','库存稀缺提示','紧迫感',[/only \d+ left|low stock|almost gone|库存紧张|仅剩 \d+|售罄风险/i]],
  ['membership','会员 / 积分加购激励','会员增长',[/rewards?|loyalty|points|member price|积分|会员价|奖励计划/i]], ['free-returns','退换货保障降低升级阻力','信任增强',[/free returns|easy returns|money back|guarantee|免费退换|无忧退换|保障/i]],
  ['gift-wrap','礼盒 / 加价包装','场景销售',[/gift wrap|gift packaging|add a gift|礼盒|礼品包装|加价包装/i]], ['personalization','个性化定制加价','价格升级',[/personaliz|customiz|engraving|monogram|个性化|定制|刻字/i]],
  ['quiz-recommendation','问答式商品推荐','导购转化',[/product quiz|find your|which .* for you|take the quiz|测验|帮你选择|适合你的/i]], ['social-share','分享 / 邀请奖励','会员增长',[/refer a friend|referral|share and save|邀请好友|分享得|推荐奖励/i]],
  ['landing-bundle','场景落地页组合','组合销售',[/shop the look|complete the look|starter kit|routine|入门套装|完整搭配|场景套装/i]], ['back-in-stock','补货提醒带回购推荐','复购与客单',[/back in stock|notify me|restock|到货通知|补货提醒/i]]
]
const plainText = html => String(html || '').replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/\s+/g,' ').trim()
function evidenceSnippet(source, pattern) {
  const text = plainText(source)
  const found = text.match(pattern)
  if (!found) return ''
  const index = Math.max(0, text.toLowerCase().indexOf(found[0].toLowerCase()))
  return text.slice(Math.max(0, index - 70), Math.min(text.length, index + found[0].length + 130))
}
const isPrivate = ip => ip === '::1' || ip === '::' || /^((10\.)|(127\.)|(192\.168\.)|(169\.254\.)|(172\.(1[6-9]|2\d|3[01])\.))/.test(ip)
async function safeFetch(input, accept='text/html,application/json') { const url=new URL(input); const records=await lookup(url.hostname,{all:true}); if(!records.length || records.some(x=>isPrivate(x.address))) throw new Error('目标地址不可访问'); const response=await fetch(url,{headers:{accept,'user-agent':'AddToCartCat/0.1'},signal:AbortSignal.timeout(12000)}); if(!response.ok) throw new Error(`目标站点返回 ${response.status}`); const body=await response.text(); if(body.length>MAX_BYTES) throw new Error('页面体积超过分析限制'); return {url,body} }
const money = value => Number(value || 0) / 100
const absoluteImage = image => typeof image === 'string' ? (image.startsWith('//') ? `https:${image}` : image) : image?.src || ''
function productRecord(raw, context, index=0) { const variants=raw.variants||[]; const first=variants[0]||{}; const price=raw.price!=null?money(raw.price):Number(first.price||0); const compare=raw.compare_at_price!=null?money(raw.compare_at_price):Number(first.compare_at_price||0); const options=(raw.options||[]).map(o=>typeof o==='string'?o:`${o.name}: ${(o.values||[]).slice(0,4).join(' / ')}`); return {id:`live-${raw.id||index}`,brand:raw.vendor||context.name,store:context.domain,name:raw.title,price,compareAt:compare>price?compare:null,rating:null,reviews:0,category:raw.product_type||'真实店铺',country:'公开页面未提供',imageUrl:absoluteImage(raw.featured_image||raw.image||raw.images?.[0]),image:'linear-gradient(145deg,#f7f7f7,#e8e8e8)',trend:null,updated:'刚刚',confidence:98,description:plainText(raw.body_html||raw.description).slice(0,500)||'公开商品数据未提供描述。',sourceType:'live',sourceUrl:context.url,sellingPoints:options.length?options.slice(0,4):['商品标题、价格与变体来自公开 Shopify 数据'],specs:{'商品类型':raw.product_type||'未公开','供应商品牌':raw.vendor||context.name,'变体数量':`${variants.length||1}`,'可选项':options.join('；')||'未公开','商品 Handle':raw.handle||'未公开'},storeId:context.storeId} }
async function analyzeShopify(input) {
  const requested = new URL(input)
  const home = await safeFetch(`${requested.origin}/`)
  const html = home.body
  if (!/cdn\.shopify\.com|Shopify\.shop|shopify-section|myshopify\.com/i.test(html)) throw new Error('未在该网站检测到 Shopify 信号')
  const title = plainText((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [, ''])[1]).split(/[|–—-]/)[0].trim() || requested.hostname.replace(/^www\./, '')
  const storeId = `live-store-${requested.hostname.replace(/\W/g, '-')}`
  let rawProducts = []
  const productMatch = requested.pathname.match(/\/products\/([^/?#]+)/)
  const productSource = productMatch ? `${requested.origin}/products/${productMatch[1]}.js` : `${requested.origin}/products.json?limit=50`
  const result = await safeFetch(productSource, 'application/json,text/plain')
  rawProducts = productMatch ? [JSON.parse(result.body)] : JSON.parse(result.body).products || []
  if (!rawProducts.length) throw new Error('公开商品目录中没有可读取商品')
  const cartFetch = await safeFetch(`${requested.origin}/cart`).catch(() => null)
  const cartHtml = cartFetch?.body || ''
  const observableText = `${html} ${cartHtml}`
  const scanTargets = [
    { label: '公开首页', url: home.url.href, text: plainText(html), raw: html },
    { label: '购物车页', url: cartFetch?.url?.href || `${requested.origin}/cart`, text: plainText(cartHtml), raw: cartHtml }
  ]
  const scannedText = plainText(observableText)
  const strategies = UPSELL_RULES.map(([id, name, group, patterns]) => {
    const visibleTarget = scanTargets.find(target => target.text && patterns.some(p => p.test(target.text)))
    const visibleMatch = visibleTarget ? patterns.find(p => p.test(visibleTarget.text)) : null
    const rawMatch = visibleMatch || patterns.find(p => p.test(observableText))
    const keywordSource = visibleMatch ? visibleTarget.text : observableText
    const match = rawMatch
    const keyword = match ? (keywordSource.match(match)?.[0] || '').replace(/\s+/g, ' ').slice(0, 44) : ''
    const snippet = visibleMatch ? evidenceSnippet(visibleTarget.text, visibleMatch) : ''
    const evidenceText = visibleMatch
      ? `${visibleTarget.label}命中「${keyword}」：${snippet || '公开页面出现相关策略信号'}`
      : match
        ? `源码字段命中「${keyword}」；该线索可能来自应用脚本或结构化数据，需要真实购物流程确认。`
        : '本次公开会话未观察到明确信号'
    return {
      id, name, group,
      status: match ? '已发现' : '未观察到',
      evidenceLevel: match ? (visibleMatch ? '中证据' : '弱证据') : '未观察到',
      evidenceTypes: match ? (visibleMatch ? ['页面文案'] : ['源码字段']) : [],
      coverage: visibleMatch ? [visibleTarget.label] : ['公开首页 + 购物车页源码'],
      confidence: match ? (visibleMatch ? 72 : 58) : 42,
      evidence: evidenceText,
      sourceEvidence: match ? snippet : '',
      sourceLabel: visibleMatch ? visibleTarget.label : '',
      sourceUrl: visibleMatch ? visibleTarget.url : '',
      why: '把购买决策中的阻力转化为更明确的加购理由。',
      action: '在商品页、购物车或结账阶段测试该策略，并用真实订单数据验证。'
    }
  })
  const opportunities = strategies.filter(x => x.status === '未观察到').slice(0, 5).map((item, index) => ({ ...item, priority: index < 2 ? '高' : index < 4 ? '中' : '低' }))
  const prices = rawProducts.flatMap(p => (p.variants || []).map(v => Number(v.price || 0))).filter(Number.isFinite)
  const observedCount = strategies.filter(x => x.status !== '未观察到').length
  const rankedProducts = [...rawProducts].sort((a, b) => {
    const price = product => Number(product.price || product.variants?.[0]?.price || 0)
    return price(a) - price(b)
  })
  const representativeProducts = [...new Map([
    ['低价', rankedProducts[0]],
    ['中位价', rankedProducts[Math.floor((rankedProducts.length - 1) / 2)]],
    ['高价', rankedProducts[rankedProducts.length - 1]]
  ].filter(([, product]) => product).map(([segment, product]) => [product.id || product.handle || segment, {
    segment,
    title: product.title,
    handle: product.handle,
    price: Number(product.price || product.variants?.[0]?.price || 0)
  }])).values()]
  const store = {
    id: storeId, name: title, domain: requested.hostname.replace(/^www\./, ''), country: '公开页面未提供', currency: '店铺货币',
    products: rawProducts.length,
    aov: prices.length ? Math.round(prices.reduce((a, b) => a + b, 0) / prices.length) : 0,
    category: [...new Set(rawProducts.map(p => p.product_type).filter(Boolean))].slice(0, 3).join(' / ') || '未公开',
    founded: '未公开',
    theme: /cdn\.shopify\.com|Shopify\.shop/i.test(html) ? 'Shopify 主题（名称未公开）' : '未识别',
    apps: APP_SIGNALS.filter(([, p]) => p.test(observableText)).map(([n]) => n),
    traffic: '—', trafficChange: null, channels: [],
    description: `${title} 的公开 Shopify 店铺资料。`,
    confidence: 96, sourceType: 'live', sourceUrl: home.url.href, productSource,
    upsell: {
      strategies,
      foundCount: observedCount,
      total: strategies.length,
      opportunities,
      coverage: {
        productCount: representativeProducts.length,
        products: representativeProducts,
        pages: ['公开首页', '购物车页']
      },
      summary: `本次公开页面扫描观察到 ${observedCount} / ${strategies.length} 类客单价策略线索，覆盖 ${representativeProducts.length} 个价格带代表商品；未观察到不等于后台没有配置。`
    }
  }
  const context = { name: title, domain: store.domain, url: productSource, storeId }
  return { mode: productMatch ? 'product' : 'store', products: rawProducts.slice(0, 50).map((p, i) => productRecord(p, context, i)), store, upsell: store.upsell }
}

export default async function handler(req, res) {
  try {
    const input = Array.isArray(req.query?.url) ? req.query.url[0] : req.query?.url
    if (!input || input.length > 2048) {
      return res.status(400).json({ error: '请输入有效的 Shopify 店铺或商品 URL' })
    }
    return res.status(200).json(await analyzeShopify(input))
  } catch (error) {
    return res.status(422).json({ error: error.message || '分析失败' })
  }
}
