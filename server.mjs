import http from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import { pathToFileURL } from 'node:url'
import { lookup } from 'node:dns/promises'
import { createServer as createViteServer } from 'vite'
import { runInteractiveJourney } from './lib/journey.mjs'

const PORT = Number(process.env.PORT || 5173)
const production = process.env.NODE_ENV === 'production'
const MAX_BYTES = 4 * 1024 * 1024
const APP_SIGNALS = [
  ['Klaviyo', /klaviyo/i], ['Judge.me', /judge\.me|judgeme/i], ['Loox', /loox\.io|looxReviews/i],
  ['Yotpo', /yotpo/i], ['Gorgias', /gorgias/i], ['Rebuy', /rebuyengine/i],
  ['Recharge', /rechargeapps|rechargecdn/i], ['AfterShip', /aftership/i], ['Omnisend', /omnisend/i],
  ['TikTok', /analytics\.tiktok|tiktok\.com/i], ['Meta Pixel', /connect\.facebook\.net\/.*fbevents/i]
]

const UPSELL_RULES = [
  { id:'free-shipping', name:'满额免邮', group:'门槛激励', patterns:[/free shipping/i,/免邮|免运费/i], why:'把用户的配送成本转化为“再买一点就划算”的明确目标，常用于推动凑单。', action:'在购物车显示距离免邮门槛还差多少钱，并推荐高毛利、低决策成本的小件商品。' },
  { id:'bundle', name:'套装 / 组合购买', group:'组合销售', patterns:[/bundle|bundles|build a set|shop the set|组合|套装/i], why:'把多个相关商品包装成一个购买决策，减少用户自行搭配的成本。', action:'为主商品建立 2—3 个互补 SKU 的套装，并突出组合价与单买价差。' },
  { id:'quantity-break', name:'多件折扣 / 阶梯价', group:'数量激励', patterns:[/buy more|more you buy|quantity discount|multi-buy|2\s*for|3\s*for|买多|多件|阶梯折扣/i], why:'用更低的边际价格鼓励用户增加件数，适合消耗品、礼品和低客单商品。', action:'测试 2 件、3 件的阶梯折扣，确保折扣后的毛利仍高于单件获客成本。' },
  { id:'subscription', name:'订阅省钱', group:'复购与客单', patterns:[/subscribe|subscription|save \d+%|订阅|定期购/i], why:'通过价格利益换取更高的购买频次和更稳定的订单价值。', action:'在一次性购买旁边展示订阅选项，明确节省金额、配送频率和随时取消。' },
  { id:'product-recs', name:'商品相关推荐', group:'交叉销售', patterns:[/you may also like|related products|recommended for you|推荐商品|猜你喜欢/i], why:'在用户已经表达兴趣后提供下一件商品，推荐阻力低于首页导购。', action:'优先推荐互补品而非同类替代品，并标注“搭配购买”理由。' },
  { id:'frequently-bought', name:'经常一起购买', group:'交叉销售', patterns:[/frequently bought together|often bought together|经常一起购买|一起买/i], why:'借助社会证明降低用户对连带购买的犹豫。', action:'在商品页或购物车展示 1 个主商品 + 2 个互补商品的组合加购。' },
  { id:'cart-drawer', name:'购物车抽屉 / 加购后推荐', group:'购物车转化', patterns:[/cart drawer|quick cart|mini cart|购物车抽屉|继续购物/i], why:'加购后立即承接购买意图，是展示轻量加购优惠的黄金时机。', action:'加购后打开抽屉，加入“本单顺手带上”的推荐位和一键加购按钮。' },
  { id:'gift-threshold', name:'满额赠品', group:'门槛激励', patterns:[/free gift|gift with purchase|gift on orders|赠品|满赠/i], why:'赠品的感知价值通常高于同额折扣，可推动用户跨过订单门槛。', action:'设置一个成本可控、与主品类相关的赠品门槛，并在购物车动态提示。' },
  { id:'upsell-upgrade', name:'高配版本升级', group:'价格升级', patterns:[/premium|pro version|upgrade|best value|旗舰|升级版|高配/i], why:'让用户在同一需求下选择更高价格方案，提升单笔收入而不增加流量成本。', action:'将高配 SKU 设计成“推荐选择”，用性能差异和每次使用成本解释溢价。' },
  { id:'social-proof', name:'评价 / 社会证明', group:'信任增强', patterns:[/reviews?|rating|customer(s)? say|评价|评论|用户说/i], why:'降低追加购买的风险感知，尤其适合推荐陌生配件或高价升级。', action:'在推荐商品旁显示真实评分、评论数和简短使用场景。' },
  { id:'discount-code', name:'优惠码 / 首单优惠', group:'价格激励', patterns:[/discount code|promo code|first order|welcome offer|优惠码|首单|新人优惠/i], why:'首单激励能降低首次购买门槛，但应避免让用户养成等待折扣的习惯。', action:'把优惠限定在首单或组合购买，避免全站长期无条件打折。' },
  { id:'free-gift-card', name:'礼品卡 / 礼赠场景', group:'场景销售', patterns:[/gift card|gifting|礼品卡|送礼/i], why:'礼赠场景通常带来更高预算和多件购买机会。', action:'在节日或高峰期提供礼盒、礼品卡和多件礼赠组合。' },
  { id:'cart-progress', name:'购物车进度条', group:'购物车转化', patterns:[/spend \$?\d+ more|add \$?\d+|progress bar|还差|再加购/i], why:'把抽象门槛变成实时反馈，能持续提醒用户完成目标。', action:'在购物车顶部显示进度条，并根据差额自动排序推荐商品。' },
  { id:'cart-upsell', name:'购物车一键加购', group:'购物车转化', patterns:[/one[- ]click add|add this|一键加购|顺手加购/i], why:'让用户无需离开购物车即可完成追加购买，减少跳转和重新决策。', action:'在购物车抽屉放 1—3 个互补商品，并提供一键加入购物车按钮。' },
  { id:'post-purchase', name:'购买后追加销售', group:'售后增长', patterns:[/post[- ]purchase|thank you page|order status upsell|购买后|感谢页追加|订单状态页/i], why:'用户刚完成付款时信任和购买意愿最高，适合低摩擦追加小件。', action:'在感谢页提供限时、免运费或一键确认的互补商品。' },
  { id:'checkout-upsell', name:'结账页追加购买', group:'结账转化', patterns:[/checkout upsell|checkout offer|order bump|checkout extension|结账追加|订单加购/i], why:'结账阶段的追加购买距离支付最近，适合高相关性、低价格商品。', action:'只推荐与当前购物车强相关且价格不超过主订单一定比例的商品。' },
  { id:'sticky-add', name:'悬浮加购栏', group:'商品页转化', patterns:[/sticky add to cart|sticky atc|fixed add to cart|悬浮加购|固定加购/i], why:'用户滚动浏览详情和评价时仍能快速购买，减少回到顶部的摩擦。', action:'在移动端优先测试悬浮购买栏，并同步显示价格、变体和核心优惠。' },
  { id:'compare-at', name:'划线价 / 价值锚定', group:'价格激励', patterns:[/compare at|was \$|regular price|原价|划线价|立省|save \$|save \d+%/i], why:'对比价格帮助用户快速理解优惠幅度，但必须保持价格真实、清晰。', action:'在组合或高配方案旁展示真实节省金额，而不是只展示折扣百分比。' },
  { id:'limited-time', name:'限时促销倒计时', group:'紧迫感', patterns:[/countdown|ends in|limited time|limited offer|倒计时|限时|仅剩/i], why:'合理的时间限制能减少拖延，推动用户在当前会话内完成多件购买。', action:'把倒计时绑定真实活动截止时间，避免长期循环造成信任损耗。' },
  { id:'low-stock', name:'库存稀缺提示', group:'紧迫感', patterns:[/only \d+ left|low stock|almost gone|库存紧张|仅剩 \d+|售罄风险/i], why:'稀缺提示能降低用户延后购买的倾向，但必须基于真实库存。', action:'在高转化 SKU 和限量颜色上展示真实库存状态，避免全站滥用。' },
  { id:'membership', name:'会员 / 积分加购激励', group:'会员增长', patterns:[/rewards?|loyalty|points|member price|积分|会员价|奖励计划/i], why:'积分和会员权益让用户更愿意凑单或购买更高等级商品。', action:'在购物车展示本单可获得的积分，并设置下一档会员权益提示。' },
  { id:'free-returns', name:'退换货保障降低升级阻力', group:'信任增强', patterns:[/free returns|easy returns|money back|guarantee|免费退换|无忧退换|保障/i], why:'降低高价和追加购买的风险感知，有助于用户选择更高价值方案。', action:'把保障信息放在高配升级和推荐商品旁，而不是只放在页脚。' },
  { id:'gift-wrap', name:'礼盒 / 加价包装', group:'场景销售', patterns:[/gift wrap|gift packaging|add a gift|礼盒|礼品包装|加价包装/i], why:'礼品包装是低成本、高毛利的附加购买，适合节日和礼赠场景。', action:'在购物车提供礼盒、贺卡和个性化留言等轻量附加项。' },
  { id:'personalization', name:'个性化定制加价', group:'价格升级', patterns:[/personaliz|customiz|engraving|monogram|个性化|定制|刻字/i], why:'定制服务提高感知价值和支付意愿，能把普通商品升级为独特商品。', action:'把定制选项做成清晰的加价变体，并预览最终效果。' },
  { id:'quiz-recommendation', name:'问答式商品推荐', group:'导购转化', patterns:[/product quiz|find your|which .* for you|take the quiz|测验|帮你选择|适合你的/i], why:'通过问题降低选择成本，能把更多用户导向更高价值或更合适的组合。', action:'围绕使用场景设计 3—5 个问题，结果页同时推荐主品和互补品。' },
  { id:'social-share', name:'分享 / 邀请奖励', group:'会员增长', patterns:[/refer a friend|referral|share and save|邀请好友|分享得|推荐奖励/i], why:'奖励分享能带来低成本新客，也能促使用户购买可分享的套装或礼赠组合。', action:'设置清晰的双方奖励，避免奖励规则比商品本身更复杂。' },
  { id:'landing-bundle', name:'场景落地页组合', group:'组合销售', patterns:[/shop the look|complete the look|starter kit|routine|入门套装|完整搭配|场景套装/i], why:'按场景打包比按单品陈列更容易让用户一次买齐。', action:'为通勤、旅行、健身、礼赠等场景制作组合落地页。' },
  { id:'back-in-stock', name:'补货提醒带回购推荐', group:'复购与客单', patterns:[/back in stock|notify me|restock|到货通知|补货提醒/i], why:'补货提醒重新激活高意向用户，可同时推荐同系列或配套商品。', action:'通知商品到货时同步推荐相关配件或多件优惠。' }
]
const CONVERSION_RULES = [
  ['CVR-01','首页首屏价值主张不清晰','首页与落地页','首页 → 商品页','high',[/shop now|shop all|买|立即|discover|探索/i], '首屏只保留一个主 CTA，并用一句话说明目标人群、核心结果和购买理由。',['首页点击率','商品页进入率']],
  ['CVR-02','商品页缺少社会证明','商品页','商品页 → 加购','high',[/review|rating|testimonial|评价|评论|评分/i], '把评分、评价数量和买家图片放到价格与加购按钮附近。',['商品页加购率','评价模块点击率']],
  ['CVR-03','配送信息后置','商品页','商品页 → 加购','high',[/shipping|delivery|arrives|配送|到货|运费/i], '在价格和 CTA 附近展示预计到货日期、运费和配送区域。',['商品页加购率','到达结账率']],
  ['CVR-04','退换/质保说明不明显','商品页','商品页 → 加购','medium',[/return|refund|warranty|guarantee|退换|质保|保障/i], '在购买决策旁展示退换期限、质保范围和例外情况。',['商品页加购率','退款率']],
  ['CVR-05','移动端缺少持续可见的加购入口','Mobile Experience','商品页 → 加购','high',[/sticky|fixed.*add|悬浮加购|固定加购/i], '增加同步当前变体、价格和库存的底部固定加购栏。',['移动端加购率','加购按钮点击率']],
  ['CVR-06','购物车总成本不透明','Cart & Navigation','购物车 → 结账','high',[/shipping.*tax|estimated total|运费|税费|总计/i], '在购物车提前解释运费、税费、到货时间和免邮门槛。',['购物车到结账率','结账放弃率']],
  ['CVR-07','购物车主 CTA 不突出','Cart & Navigation','购物车 → 结账','high',[/checkout|结账|去付款|proceed/i], '强化一个主结账按钮，减少 CTA 前的干扰模块。',['购物车到结账率','结账按钮点击率']],
  ['CVR-08','推荐模块可能打断结账','Cart & Navigation','购物车 → 结账','medium',[/you may also like|recommended|推荐|猜你喜欢/i], '最多保留一个低决策推荐，并放在主 CTA 之后。',['购物车到结账率','推荐加购率']],
  ['CVR-09','快捷支付入口不可见','Checkout Entry','结账 → 支付','medium',[/shop pay|apple pay|google pay|paypal|快捷支付/i], '在适用地区开启并测试快捷支付入口及兼容性。',['结账完成率','支付失败率']],
  ['CVR-10','Checkout 表单无法公开确认','Checkout Entry','结账 → 支付','high',[], '公开页面无法确认 Checkout 字段、账号要求和支付失败体验；请在后台和测试订单中检查。',['结账完成率','支付失败率']],
  ['CVR-11','移动端存在布局风险','Mobile Experience','首页 → 结账','medium',[/overflow-x|viewport|横向滚动|布局/i], '用真实手机尺寸复测图片、弹窗、变体和结账入口，修复横向溢出与布局跳动。',['移动端加购率','页面错误率']],
  ['CVR-12','页面性能存在风险','Trust & Performance','首页 → 结账','medium',[/lazyload|preload|web-vitals|performance|loading/i], '优先压缩首屏图片和第三方脚本，并复测交互响应与布局稳定性。',['LCP','INP','页面错误率']]
]

function detectUpsellStrategies(text) {
  const source = String(text || '')
  return UPSELL_RULES.map(rule => {
    const match = rule.patterns.find(pattern => pattern.test(source))
    if (!match) return { ...rule, status:'未发现', confidence:58, evidence:'公开页面未检测到明确信号' }
    const index = source.search(match)
    const snippet = source.slice(Math.max(0,index-70), Math.min(source.length,index+150)).replace(/\s+/g,' ').trim()
    return { ...rule, status:'已发现', confidence:92, evidence:snippet || '页面文本或结构化数据中出现匹配信号' }
  })
}

function buildUpsellReport(strategies, productCount) {
  const found = strategies.filter(x => x.status === '已发现')
  const missing = strategies.filter(x => x.status === '未发现')
  const fallback = found.slice(0,5)
  const pool = [...missing, ...fallback].slice(0,5)
  const priority = pool.map((x,i) => ({ ...x, priority: missing.includes(x) ? (i < 2 ? '高' : i < 4 ? '中' : '低') : (i < 2 ? '中' : '低') }))
  return { strategies, foundCount: found.length, total: strategies.length, productCount, opportunities: priority, summary: `公开流程中检测到 ${found.length} / ${strategies.length} 类客单价策略；未发现的项目不等于后台没有配置，可能需要交互、地区或登录态才能确认。` }
}

function buildCompetitiveReport({ html, productPage, rawProducts, store }) {
  const source = `${html || ''} ${productPage || ''}`
  const text = plainText(source).toLowerCase()
  const prices = rawProducts.flatMap(p => (p.variants || []).map(v => {
    const value = Number(v.price || 0)
    return value > 1000 ? value / 100 : value
  })).filter(Number.isFinite).filter(Boolean)
  const titles = rawProducts.map(p => p.title || '').filter(Boolean)
  const families = []
  const familyRules = [['塑形 / 收腹', /sculpt|shap|tummy|contour|compression|塑形|收腹/i], ['抗 cellulite / 平滑', /cellulite|cellusmooth|anti-cellulite/i], ['提臀 / 曲线', /booty|butt.?lift|curve/i], ['无痕 / 舒适', /seamless|second skin|soft|breathable/i], ['运动场景', /yoga|workout|training|active|sport/i], ['口袋 / 功能细节', /pocket|side pocket/i]]
  for (const [name, pattern] of familyRules) if (titles.some(t => pattern.test(t)) || pattern.test(source)) families.push(name)
  const mechanisms = []
  const mechanismRules = [
    ['结果型承诺', /instant|lift|smooth|sculpt|shape|sleeker|更平滑|提臀|塑形/i, '用穿着后的外观结果作为首要购买理由'],
    ['技术解释', /3d|compression|technology|fabric|tailoring|micro-pressure|technology/i, '用技术词解释“为什么它可能有效”'],
    ['社会证明', /reviews?|verified customer|satisfied customers|评价|评论/i, '用评价、用户数量或案例降低首次购买风险'],
    ['门槛激励', /free shipping|save|off|bundle|2 pcs|3 pcs|满额|折扣/i, '用免邮、折扣和多件购买提高订单价值'],
    ['风险逆转', /30-day|returns?|guarantee|easy returns|退换|保证/i, '用退换和保证降低试错成本']
  ]
  for (const [name, pattern, explanation] of mechanismRules) if (pattern.test(source)) mechanisms.push({ name, explanation })
  const positioning = /cellulite|cellusmooth|sculpt|shap|tummy|booty/i.test(text)
    ? '以“身材修饰 / 塑形结果”为核心，将运动服饰包装成低门槛的外观改善方案。'
    : '以功能型服饰为核心，通过商品卖点、价格和页面信任机制完成转化。'
  const avg = prices.length ? Math.round(prices.reduce((a,b)=>a+b,0) / prices.length) : null
  return {
    positioning,
    facts: [
      `公开目录读取 ${rawProducts.length} 个商品${store.products > rawProducts.length ? '（接口本次返回上限内）' : ''}`,
      avg ? `公开变体价格约 US$${Math.min(...prices)}–US$${Math.max(...prices)}，平均约 US$${avg}` : '公开页面未提供可计算的价格区间',
      families.length ? `商品命名集中在：${families.join('、')}` : '商品家族信号不足，需进一步读取分类页',
      mechanisms.length ? `页面出现 ${mechanisms.length} 类成交信号` : '公开页面未识别到明确成交信号'
    ],
    mechanisms,
    principles: {
      problem: /cellulite|sculpt|shap|tummy|booty/i.test(text) ? '用户希望在不牺牲舒适度的前提下，让身体线条看起来更平滑、更紧致。' : '用户希望用一件功能服饰解决明确的穿着或运动场景问题。',
      whyItMayWork: mechanisms.length ? mechanisms.slice(0,3).map(x => x.explanation).join('；') : '当前公开证据不足以解释成交原因。',
      copyable: families.length ? `可研究的复制线索：围绕“${families.slice(0,3).join('、')}”建立产品家族，而不是只复制单个 SKU。` : '需要更多商品和页面证据后再判断可复制性。',
      verify: '需要通过广告素材、用户评论、历史价格/上新和退款反馈验证：用户真正为哪个结果付费，以及页面承诺是否兑现。'
    },
    boundaries: ['公开商品页不能证明销量、利润、复购和真实广告回报。', '“未发现”只代表本次公开页面流程未观察到，不代表后台没有配置。', '健康或身体效果类承诺需要单独做证据与合规核验。']
  }
}

function isPrivateAddress(address) {
  const ip = address.toLowerCase()
  if (ip === '::1' || ip === '::' || ip.startsWith('fc') || ip.startsWith('fd') || ip.startsWith('fe80:')) return true
  if (!/^\d+\.\d+\.\d+\.\d+$/.test(ip)) return false
  const [a,b] = ip.split('.').map(Number)
  return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)
}

async function validatePublicUrl(input) {
  const url = new URL(input)
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('只支持 HTTP 或 HTTPS 地址')
  if (url.username || url.password) throw new Error('网址不能包含账号信息')
  const records = await lookup(url.hostname, { all: true })
  if (!records.length || records.some(record => isPrivateAddress(record.address))) throw new Error('不能分析本地或内网地址')
  return url
}

async function safeFetch(input, accept = 'text/html,application/json') {
  let url = await validatePublicUrl(input)
  for (let redirects = 0; redirects < 5; redirects += 1) {
    const response = await fetch(url, {
      redirect: 'manual', signal: AbortSignal.timeout(12000),
      headers: { accept, 'user-agent': 'AddToCartCat/0.1 (+public Shopify AOV research; contact: local-user)' }
    })
    if ([301,302,303,307,308].includes(response.status)) {
      const location = response.headers.get('location')
      if (!location) throw new Error('目标站点返回了无效跳转')
      url = await validatePublicUrl(new URL(location, url).href)
      continue
    }
    if (!response.ok) throw new Error(`目标站点返回 ${response.status}`)
    const length = Number(response.headers.get('content-length') || 0)
    if (length > MAX_BYTES) throw new Error('页面体积超过分析限制')
    const reader = response.body.getReader(); const chunks = []; let size = 0
    while (true) {
      const { done, value } = await reader.read(); if (done) break
      size += value.byteLength; if (size > MAX_BYTES) { reader.cancel(); throw new Error('页面体积超过分析限制') }
      chunks.push(value)
    }
    return { url, contentType: response.headers.get('content-type') || '', body: Buffer.concat(chunks).toString('utf8') }
  }
  throw new Error('目标站点跳转次数过多')
}

const plainText = html => String(html || '').replace(/<script[\s\S]*?<\/script>/gi,' ').replace(/<style[\s\S]*?<\/style>/gi,' ').replace(/<[^>]+>/g,' ').replace(/&nbsp;|&#160;/g,' ').replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&#39;/g,"'").replace(/\s+/g,' ').trim()
const money = value => Number(value || 0) / 100
const absoluteImage = image => typeof image === 'string' ? (image.startsWith('//') ? `https:${image}` : image) : image?.src || ''

function themeFromHtml(html) {
  const jsonMatch = html.match(/Shopify\.theme\s*=\s*(\{[\s\S]*?\});/)
  if (jsonMatch) { try { const value = JSON.parse(jsonMatch[1]); return value.name || value.schema_name || '已识别 Shopify 主题' } catch {} }
  const idMatch = html.match(/shopify-digital-wallet|cdn\.shopify\.com|Shopify\.shop/i)
  return idMatch ? 'Shopify 主题（名称未公开）' : '未识别'
}

function buildConversionReport({ html, productPage, cart }) {
  const targets = [
    { label:'公开首页', text:plainText(html) },
    { label:'商品页', text:plainText(productPage) },
    { label:'购物车页', text:plainText(cart) }
  ]
  const rules = CONVERSION_RULES.map(([id,title,pageType,stage,priority,patterns,action,metrics]) => {
    if (!patterns.length) return { id,title,pageType,stage,priority,status:'无法确认',evidenceLevel:'D',evidence:'Checkout 内部字段和真实支付体验无法通过公开页面确认。',action,metrics,limitation:'需要 Shopify 后台、测试订单或授权后的结账检查。' }
    const target = targets.find(item => patterns.some(pattern => pattern.test(item.text)))
    const pattern = target && patterns.find(item => item.test(target.text))
    return target
      ? { id,title,pageType,stage,priority,status:'已观察到',evidenceLevel:'A',evidence:`${target.label}出现相关公开文案或模块信号：${(target.text.match(pattern)?.[0] || '页面元素').slice(0,80)}`,action,metrics,limitation:'公开页面证据不能证明该模块实际提升转化。' }
      : { id,title,pageType,stage,priority,status:'未观察到',evidenceLevel:'D',evidence:'本次公开会话未观察到明确信号，不代表后台一定没有配置。',action,metrics,limitation:'建议在对应页面、设备和地区复测。' }
  })
  return { rules, analyticsConnected:false, dataScope:'public_storefront', unconfirmedStages:['checkout','post_purchase'], summary:`公开扫描完成 ${rules.length} 项转化率检查；其中 ${rules.filter(item => item.status === '已观察到').length} 项观察到页面信号，${rules.filter(item => item.status === '无法确认').length} 项需要后台或交互确认。` }
}

function productRecord(raw, context, index = 0) {
  const variants = raw.variants || []
  const first = variants[0] || {}
  const price = raw.price != null ? money(raw.price) : Number(first.price || 0)
  const compare = raw.compare_at_price != null ? money(raw.compare_at_price) : Number(first.compare_at_price || 0)
  const options = (raw.options || []).map(option => typeof option === 'string' ? option : `${option.name}: ${(option.values || []).slice(0,4).join(' / ')}`)
  const description = plainText(raw.body_html || raw.description).slice(0,500) || '公开商品数据未提供描述。'
  return {
    id: `live-${raw.id || index}`, brand: raw.vendor || context.name, store: context.domain, name: raw.title,
    price, compareAt: compare > price ? compare : null, rating: null, reviews: 0, category: raw.product_type || '真实店铺', country: '公开页面未提供',
    imageUrl: absoluteImage(raw.featured_image || raw.image || raw.images?.[0]), image: 'linear-gradient(145deg,#f7f7f7,#e8e8e8)',
    trend: null, updated: '刚刚', confidence: 98, description, sourceType: 'live', sourceUrl: context.url,
    sellingPoints: options.length ? options.slice(0,4) : ['商品标题、价格与变体来自公开 Shopify 数据'],
    specs: { '商品类型': raw.product_type || '未公开', '供应商品牌': raw.vendor || context.name, '变体数量': `${variants.length || 1}`, '可选项': options.join('；') || '未公开', '商品 Handle': raw.handle || '未公开' },
    storeId: context.storeId
  }
}

export async function analyzeShopify(input) {
  const requested = await validatePublicUrl(input)
  const home = await safeFetch(`${requested.origin}/`)
  const html = home.body
  if (!/cdn\.shopify\.com|Shopify\.shop|shopify-section|myshopify\.com/i.test(html)) throw new Error('未在该网站检测到 Shopify 信号')
  const title = plainText((html.match(/<title[^>]*>([\s\S]*?)<\/title>/i) || [,''])[1]).split(/[|–—-]/)[0].trim() || requested.hostname.replace(/^www\./,'')
  const description = (html.match(/<meta[^>]+(?:name|property)=["'](?:description|og:description)["'][^>]+content=["']([^"']+)/i) || [,''])[1]
  const storeId = `live-store-${requested.hostname.replace(/\W/g,'-')}`
  let rawProducts = []
  let productSource = `${requested.origin}/products.json?limit=50`
  const productMatch = requested.pathname.match(/\/products\/([^/?#]+)/)
  try {
    if (productMatch) {
      productSource = `${requested.origin}/products/${productMatch[1]}.js`
      const result = await safeFetch(productSource, 'application/json,text/plain')
      rawProducts = [JSON.parse(result.body)]
    } else {
      const result = await safeFetch(productSource, 'application/json,text/plain')
      rawProducts = JSON.parse(result.body).products || []
    }
  } catch (error) {
    if (productMatch) throw new Error(`商品公开接口读取失败：${error.message}`)
    throw new Error(`店铺商品目录不可公开读取：${error.message}`)
  }
  if (!rawProducts.length) throw new Error('公开商品目录中没有可读取商品')
  const cart = await safeFetch(`${requested.origin}/cart`, 'text/html,application/xhtml+xml').catch(() => ({ body:'' }))
  const productPage = productMatch ? html : await safeFetch(`${requested.origin}/products/${rawProducts[0]?.handle || ''}`, 'text/html,application/xhtml+xml').catch(() => ({ body:'' }))
  const observableText = `${html}\n${productPage.body || ''}\n${cart.body || ''}`
  const apps = APP_SIGNALS.filter(([,pattern]) => pattern.test(observableText)).map(([name]) => name)
  const upsell = buildUpsellReport(detectUpsellStrategies(observableText), rawProducts.length)
  const prices = rawProducts.flatMap(p => (p.variants || []).map(v => Number(v.price || 0))).filter(Number.isFinite)
  const store = {
    id: storeId, name: title, domain: requested.hostname.replace(/^www\./,''), country: '公开页面未提供', currency: rawProducts[0]?.variants?.[0]?.price ? '店铺货币' : '未公开',
    products: rawProducts.length, aov: prices.length ? Math.round(prices.reduce((a,b)=>a+b,0)/prices.length) : 0,
    category: [...new Set(rawProducts.map(p=>p.product_type).filter(Boolean))].slice(0,3).join(' / ') || '未公开', founded: '未公开', theme: themeFromHtml(html),
    apps: apps.length ? apps : ['未发现明确的公开 App 信号'], traffic: '—', trafficChange: null, channels: [],
    description: plainText(description).slice(0,300) || `${title} 的公开 Shopify 店铺资料。`, confidence: 96, sourceType: 'live', sourceUrl: home.url.href, productSource
  }
  const context = { name:title, domain:store.domain, url:productSource, storeId }
  store.upsell = upsell
  store.conversion = buildConversionReport({ html, productPage: productPage.body || '', cart: cart.body || '' })
  const report = buildCompetitiveReport({ html, productPage: productPage.body || '', rawProducts, store })
  store.report = report
  return { mode: productMatch ? 'product' : 'store', products: rawProducts.slice(0,50).map((p,i)=>productRecord(p,context,i)), store, upsell, conversion: store.conversion, report }
}

function sendJson(res, status, payload) { res.writeHead(status, {'content-type':'application/json; charset=utf-8','cache-control':'no-store'}); res.end(JSON.stringify(payload)) }

async function startServer() {
const vite = production ? null : await createViteServer({ server: { middlewareMode: true }, appType: 'spa' })
const server = http.createServer(async (req, res) => {
  if (req.url?.startsWith('/api/journey')) {
    try {
      const input = new URL(req.url, `http://${req.headers.host}`).searchParams.get('url')
      if (!input || input.length > 2048) return sendJson(res, 400, { error:'请输入有效的 Shopify 店铺或商品 URL' })
      sendJson(res, 200, await runInteractiveJourney(input))
    } catch (error) { sendJson(res, 422, { error:error.message || '交互式购物流程诊断失败' }) }
    return
  }
  if (req.url?.startsWith('/api/analyze')) {
    try {
      const input = new URL(req.url, `http://${req.headers.host}`).searchParams.get('url')
      if (!input || input.length > 2048) return sendJson(res, 400, { error:'请输入有效的 Shopify 店铺或商品 URL' })
      sendJson(res, 200, await analyzeShopify(input))
    } catch (error) { sendJson(res, 422, { error:error.message || '分析失败' }) }
    return
  }
  if (vite) return vite.middlewares(req,res,()=>{ res.statusCode=404; res.end('Not found') })
  try {
    const pathname = new URL(req.url, `http://${req.headers.host}`).pathname
    const relative = pathname === '/' ? 'index.html' : normalize(pathname).replace(/^[/\\]+/,'')
    const file = join(process.cwd(),'dist',relative); await stat(file)
    const types = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg'}
    res.writeHead(200, {'content-type':`${types[extname(file)] || 'application/octet-stream'}; charset=utf-8`}); res.end(await readFile(file))
  } catch { res.writeHead(200, {'content-type':'text/html; charset=utf-8'}); res.end(await readFile(join(process.cwd(),'dist/index.html'))) }
})
server.listen(PORT, '0.0.0.0', () => console.log(`加购猫运行于 http://127.0.0.1:${PORT}`))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startServer()
}
