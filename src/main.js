import './styles.css'

let catalog = []
let storeMap = {}
let progressTimer = null
let sampleReportRequested = false
const SAMPLE_REPORT_URL = 'https://silixwear.com'
const handoffParams = new URLSearchParams(window.location.search)
const handoffUrl = handoffParams.get('url') || ''
const handoffFrom = handoffParams.get('from') || ''

const state = {
  query: handoffUrl, category: '全部品类', sort: '默认排序', view: 'grid',
  favorites: new Set(JSON.parse(localStorage.getItem('add-to-cart-cat-favorites') || localStorage.getItem('scope-cat-favorites') || '[]')),
  compare: new Set(), modal: null, loading: false, journeyLoading: false, journeyError: '', journeyExpanded: false, error: '', dataMode: 'idle', mode: 'combined', sourceUrl: '', activeStrategyId: null, processStartedAt: 0
}

const escapeHtml = value => String(value ?? '').replace(/[&<>'"]/g, char => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[char]))
const isUrl = value => /^(https?:\/\/)?([a-z0-9-]+\.)+[a-z]{2,}(?:[/:?#].*)?$/i.test(value.trim())
const normalizeUrl = value => /^https?:\/\//i.test(value.trim()) ? value.trim() : `https://${value.trim()}`
const visualStyle = p => p.imageUrl ? `background:#f2f2f2 url(&quot;${escapeHtml(p.imageUrl)}&quot;) center/contain no-repeat` : `background:${p.image}`
const routeBase = () => window.location.pathname.startsWith('/jiagoumao') ? '/jiagoumao' : ''
const routePath = path => `${routeBase()}${path}`
const apiPath = path => `${routeBase()}/api/${path}`
const isStrategiesPage = () => /(?:\/jiagoumao)?\/strategies\/?$/i.test(window.location.pathname)
const screenshotUrl = url => `https://image.thum.io/get/width/1200/crop/760/noanimate/${url}`

function firstPrinciples(p) {
  const title = `${p.name} ${p.description || ''} ${(p.sellingPoints || []).join(' ')}`.toLowerCase()
  const isSport = /运动|跑步|户外|防水|openrun|fieldtone/.test(title)
  const isPremium = Number(p.price) >= 120
  const problem = isSport ? '在运动场景下兼顾稳固佩戴、环境感知与防护' : isPremium ? '为愿意付溢价的用户，降低噪音、连接或长时间使用的摩擦' : '用更低的尝试成本解决日常使用中的便携、连接或音质问题'
  const mechanism = isSport ? '场景化功能（防脱 / 防水 / 环境感知）+ 运动内容建立信任' : isPremium ? '明确的性能参数 + 高客单价设计感 + 品牌信任支撑价格' : '低门槛价格 + 直观卖点 + 多场景内容降低首次购买顾虑'
  const copy = (p.sellingPoints || []).slice(0, 3).join('、') || '商品页面的核心卖点'
  const verify = isPremium ? '验证用户是否愿意为核心性能支付当前价格，并核对差评中的真实痛点。' : '验证低价卖点是否带来真实点击与购买，而不是只带来低质量流量。'
  return { problem, mechanism, copy, verify, confidence: p.sourceType === 'live' ? '观察与推断' : '演示推断' }
}

const icons = {
  search: '<svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></svg>',
  scan: '<svg viewBox="0 0 24 24"><path d="M4 7V4h3M17 4h3v3M20 17v3h-3M7 20H4v-3M7 12h10"/></svg>',
  heart: '<svg viewBox="0 0 24 24"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z"/></svg>',
  compare: '<svg viewBox="0 0 24 24"><path d="M8 3v18M16 3v18M3 8h5M16 16h5M5 5l3 3-3 3M19 13l-3 3 3 3"/></svg>',
  arrow: '<svg viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6"/></svg>',
  close: '<svg viewBox="0 0 24 24"><path d="m6 6 12 12M18 6 6 18"/></svg>',
  check: '<svg viewBox="0 0 24 24"><path d="m5 12 4 4L19 6"/></svg>',
  bot: '<svg viewBox="0 0 24 24"><path d="M12 8V4H8"/><rect width="16" height="12" x="4" y="8" rx="2"/><path d="M2 14h2M20 14h2M15 13v2M9 13v2"/></svg>'
  ,wechat: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8.7 17.2c-3.1 0-5.7-1.9-5.7-4.4s2.6-4.4 5.7-4.4c.7 0 1.4.1 2 .3-.2.5-.3 1-.3 1.5 0 2.5 2.3 4.5 5.2 4.5h.2c-.9 1.5-2.8 2.5-5 2.5-.8 0-1.5-.1-2.2-.3l-2.2 1.2.6-1.4c-.1 0-.2 0-.3 0Z"/><path d="M15.6 14.2c-2.5 0-4.6-1.5-4.6-3.4s2.1-3.4 4.6-3.4 4.6 1.5 4.6 3.4c0 .8-.4 1.6-1 2.2l.4 1.1-1.7-.7c-.7.5-1.5.8-2.3.8Z"/></svg>'
  ,home: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m4 10 8-6 8 6v9a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1Z"/></svg>'
}

const STRATEGY_GROUPS = [
  { name:'门槛与价格激励', stage:'CART VALUE', strategies:[
    ['free-shipping','满额免邮'], ['gift-threshold','满额赠品'], ['discount-code','优惠码 / 首单优惠'], ['cart-progress','购物车进度条'], ['compare-at','划线价 / 价值锚定']
  ]},
  { name:'数量与组合销售', stage:'BUNDLE & VOLUME', strategies:[
    ['bundle','套装 / 组合购买'], ['quantity-break','多件折扣 / 阶梯价'], ['product-recs','商品相关推荐'], ['frequently-bought','经常一起购买'], ['landing-bundle','场景落地页组合']
  ]},
  { name:'商品页与购物车', stage:'PDP & CART', strategies:[
    ['cart-drawer','购物车抽屉 / 加购后推荐'], ['cart-upsell','购物车一键加购'], ['sticky-add','悬浮加购栏'], ['upsell-upgrade','高配版本升级']
  ]},
  { name:'结账与购买后', stage:'CHECKOUT', strategies:[
    ['checkout-upsell','结账页追加购买'], ['post-purchase','购买后追加销售']
  ]},
  { name:'复购与会员', stage:'RETENTION', strategies:[
    ['subscription','订阅省钱'], ['membership','会员 / 积分加购激励'], ['social-share','分享 / 邀请奖励'], ['back-in-stock','补货提醒带回购推荐']
  ]},
  { name:'紧迫感与信任', stage:'TRUST', strategies:[
    ['limited-time','限时促销倒计时'], ['low-stock','库存稀缺提示'], ['social-proof','评价 / 社会证明'], ['free-returns','退换货保障降低升级阻力']
  ]},
  { name:'礼赠与个性化', stage:'GIFT & PERSONALIZE', strategies:[
    ['free-gift-card','礼品卡 / 礼赠场景'], ['gift-wrap','礼盒 / 加价包装'], ['personalization','个性化定制加价'], ['quiz-recommendation','问答式商品推荐']
  ]}
]

const STRATEGY_EXAMPLES = {
  'free-shipping':['购物车只显示商品小计，运费要到结账页才知道。','购物车显示“还差 US$12 免邮”，达到门槛后切换为“已解锁免邮”。'],
  'gift-threshold':['顾客加多少商品都没有额外奖励提示。','显示“订单满 US$80，自动获赠旅行装”，并在购物车预览赠品。'],
  'discount-code':['新访客看到的只有日常售价，不知道是否有首次购买权益。','首访弹窗提供“首单 9 折”，结账时自动应用 WELCOME10。'],
  'cart-progress':['购物车只有金额合计，没有继续加购的明确理由。','进度条显示“再买 US$18 解锁赠品”，金额变化时实时更新。'],
  'compare-at':['商品页只显示现价 US$59，缺少价值参照。','同时显示原价 US$79、现价 US$59 与“立省 US$20”。'],
  'bundle':['洗发水、护发素和发膜只能分别寻找、分别加入。','提供“完整修护套装”，三件一键加入并比单买节省 15%。'],
  'quantity-break':['买 1 件和买 4 件的单价完全相同。','数量选择器标注“2 件每件 US$18；3 件每件 US$16”。'],
  'product-recs':['商品详情结束后直接进入页尾，没有下一步推荐。','水杯商品页下方推荐杯刷、吸管盖和便携保护套。'],
  'frequently-bought':['顾客需要自己判断哪些配件能搭配当前商品。','展示“经常一起购买：主商品 + 充电底座 + 收纳包”，可一键全选。'],
  'landing-bundle':['广告落地页只介绍单个商品，场景需求被拆散。','“新手露营”落地页组合帐篷、睡袋和营灯，并提供整套购买按钮。'],
  'cart-drawer':['点击加购后只出现成功提示，顾客不知道购物车里还有什么。','侧边购物车立即展开，显示小计、免邮进度和两件配套商品。'],
  'cart-upsell':['购物车里的每件商品只有删除和修改数量操作。','小计下方出现“加 US$9.9 带走旅行装”，无需离开购物车即可加入。'],
  'sticky-add':['顾客滑到长详情页中段后，加购按钮已经离开屏幕。','底部固定栏持续显示商品名、价格、规格与“加入购物车”。'],
  'upsell-upgrade':['基础版和专业版分散在不同页面，差异不清楚。','规格区直接提示“加 US$20 升级 Pro：容量翻倍 + 延长保修”。'],
  'checkout-upsell':['结账页只处理地址和付款，没有相关补充商品。','订单摘要旁提供“加购运输保障 US$2.99”，勾选后直接计入订单。'],
  'post-purchase':['付款完成后只显示订单确认信息。','支付成功页展示“限时加购替换滤芯 8 折”，确认后并入原订单。'],
  'subscription':['消耗型商品只能按单次价格购买。','购买框提供“单次 US$30 / 每月配送 US$25.5，随时暂停”。'],
  'membership':['加购和消费不会累积任何长期权益。','购物车提示“本单可得 240 积分；再加 US$10 升级双倍积分”。'],
  'social-share':['成交后没有邀请朋友或分享商品的入口。','订单完成页生成邀请链接：“朋友减 US$10，你获得 1,000 积分”。'],
  'back-in-stock':['缺货商品只有灰色的“售罄”按钮，访问到此结束。','顾客可订阅补货提醒，通知邮件同时推荐同系列现货替代款。'],
  'limited-time':['促销价长期静态展示，顾客没有现在购买的理由。','促销区显示“夏季优惠还剩 02:14:36”，到期后自动恢复原价。'],
  'low-stock':['商品页不展示库存情况，顾客倾向稍后再决定。','所选规格旁显示“仅剩 4 件”，并随真实可售库存更新。'],
  'social-proof':['购买按钮附近没有评价数量或真实使用反馈。','价格下方显示“4.8 分 · 2,316 条评价”，并突出同场景买家照片。'],
  'free-returns':['高价版本旁没有退换和保障说明。','升级按钮下明确写“30 天免费退换 · 2 年质保”，降低试错顾虑。'],
  'free-gift-card':['送礼顾客只能购买普通商品并自行解释用途。','提供 US$25–200 电子礼品卡，可填写收件人、祝福语和发送日期。'],
  'gift-wrap':['购物车无法声明订单用于送礼。','结账前可加 US$5 选择礼盒包装、隐藏价格并附赠留言卡。'],
  'personalization':['所有商品只有标准款，无法提高独特性和售价。','加 US$12 可刻名字，页面实时预览字体、位置和定制效果。'],
  'quiz-recommendation':['顾客面对十几款相似商品，只能逐页比较。','用 5 个问题了解肤质、预算和目标，输出主推款及配套方案。']
}

const STRATEGY_CONFIG_GUIDES = {
  'free-shipping': ['Shopify 原生「配送和交付」', '后台进入 设置 → 配送和交付 → 对应配送区域，新增“满额免邮”费率；再在购物车主题区补上距离门槛的提示。'],
  'gift-threshold': ['满额赠品应用（支持自动加赠）', '设置订单金额门槛、赠品商品和库存规则；把赠品状态同步到购物车，并测试未达标、达标和取消商品三种情况。'],
  'discount-code': ['Shopify 原生折扣 + Shopify Forms', '在 后台 → 折扣 中创建首单折扣，限定新客户或指定商品；用表单收集邮箱后展示兑换入口，避免全站长期降价。'],
  'cart-progress': ['购物车主题编辑器 / 进度条应用', '在购物车模板加入免邮或赠品目标，显示当前金额、还差金额和达成状态；修改数量后确认进度实时更新。'],
  'compare-at': ['Shopify 原生价格字段', '编辑商品或变体，在“对比价格”填写真实原价；只对确有促销依据的商品使用，并检查集合页和商品页显示一致。'],
  'bundle': ['Shopify Bundles 或组合销售应用', '创建固定套装或组合商品，关联互补商品和套装价格；确认库存扣减、拆单发货和退货规则都能正常处理。'],
  'quantity-break': ['阶梯折扣 / 数量折扣应用', '设置 2 件、3 件等数量档位和对应单价，绑定到商品或集合；检查折扣是否与其他优惠叠加。'],
  'product-recs': ['Shopify Search & Discovery', '在 Search & Discovery 中为商品添加互补推荐或相关商品；优先推荐同场景配件，并在商品页预览移动端位置。'],
  'frequently-bought': ['组合推荐应用或 Shopify Bundles', '建立“主商品 + 配件”的商品关系，开启一键全选；分别测试取消配件、修改数量和库存不足时的表现。'],
  'landing-bundle': ['Online Store 主题 + Shopify Bundles', '新建场景落地页，按使用场景组织商品和套装 CTA；把套装商品、节省金额和配送说明放在首屏可见区域。'],
  'cart-drawer': ['购物车抽屉主题组件 / 购物车应用', '在主题编辑器开启加购后打开购物车抽屉，加入小计、门槛进度和 1 个配套推荐；验证抽屉不会遮挡结账按钮。'],
  'cart-upsell': ['购物车加购推荐应用', '选择价格低、决策轻的配件，在购物车小计下方配置一键加购；限制推荐数量，避免干扰结账。'],
  'sticky-add': ['Online Store 2.0 主题区块或悬浮加购应用', '在商品模板添加悬浮加购栏，绑定当前变体、价格和库存；滚动、切换变体后检查按钮状态同步。'],
  'upsell-upgrade': ['商品变体 + 升级推荐应用', '把基础款和高配款放在同一商品或关联商品组中，明确展示差价和升级权益；确认升级后库存、图片和变体都切换正确。'],
  'checkout-upsell': ['Shopify Checkout Extensibility（需满足套餐条件）', '在结账编辑器添加低决策附加项，如运输保障或礼盒；限制为 1 个主推荐，并检查结账速度和支付方式兼容性。'],
  'post-purchase': ['购买后追加销售应用', '创建支付成功页的追加 offer，设置有效期、折扣和适用商品；测试拒绝、接受、退款和重复下单路径。'],
  'subscription': ['Shopify Subscriptions 或订阅应用', '为消耗型商品建立单次购买与订阅计划，设置配送周期、订阅价和暂停规则；在商品页说明随时暂停或取消。'],
  'membership': ['Shopify 原生客户账户 + 积分会员应用', '设定注册、下单和升级所需积分，配置购物车中的积分提示；先核对积分成本和有效期，再开放兑换。'],
  'social-share': ['购买后分享 / 推荐奖励应用', '设置邀请链接、好友优惠和老客奖励，绑定订单完成页；限制自购、重复设备和异常分享，避免奖励被滥用。'],
  'back-in-stock': ['补货提醒应用', '在缺货变体旁开启邮箱或短信订阅，设置补货触发通知；同时配置同系列现货推荐，并检查隐私同意文案。'],
  'limited-time': ['Shopify 原生折扣 + 倒计时区块', '先在折扣中设置明确开始和结束时间，再在活动区块展示倒计时；到期后自动恢复原价，不使用长期循环倒计时。'],
  'low-stock': ['库存管理 + 低库存提示应用', '设定库存阈值，例如低于 5 件才显示提示；绑定真实可售库存，缺货和不同变体分别测试。'],
  'social-proof': ['评价应用（Judge.me / Loox 等）', '安装评价应用并同步已验证订单，在价格和加购按钮附近展示评分、数量和真实图片；关闭无法验证来源的评价。'],
  'free-returns': ['Shopify 页面 + 退换货应用', '在商品页和结账附近写清退换期限、质保范围和例外情况；把保障说明放在升级 CTA 下方，并同步政策页面。'],
  'free-gift-card': ['Shopify 原生礼品卡', '在 产品 → 礼品卡 中创建面额和设计，补充收件人、祝福语与发送时间说明；检查余额、退款和过期规则。'],
  'gift-wrap': ['礼盒 / 加价服务应用或商品加购项', '创建礼盒服务商品，允许在购物车选择并填写留言；确认包装费只收一次，且不会影响主商品配送。'],
  'personalization': ['定制字段应用或产品选项应用', '给商品增加姓名、刻字或颜色字段，配置加价、预览和最长交付时间；检查定制信息能传到订单和履约端。'],
  'quiz-recommendation': ['Shopify Forms + 问答推荐应用', '设计 3–5 个高区分度问题，把答案映射到少量推荐商品；保存结果前说明用途，并测试每条答案都有可购买结果。']
}

function configGuideFor(strategy) {
  return STRATEGY_CONFIG_GUIDES[strategy.id] || ['对应策略应用或 Shopify 主题区块', '先在测试商品上配置策略，再用未达标、达标和取消操作各跑一遍，确认价格、库存和结账结果一致。']
}

const TOOL_RECOMMENDATIONS = {
  bundles: [
    ['Shopify Bundles', 'Shopify 官方', '固定套装与多件装', 'https://apps.shopify.com/shopify-bundles'],
    ['Kaching Bundles', 'Shopify App Store', '套装、数量折扣和加购', 'https://apps.shopify.com/bundle-deals'],
    ['Bundler', 'Shopify App Store', '组合销售与阶梯折扣', 'https://apps.shopify.com/bundler-product-bundles']
  ],
  upsell: [
    ['Selleasy', 'Shopify App Store', '购物车与结账加购', 'https://apps.shopify.com/easy-upsell'],
    ['ReConvert', 'Shopify App Store', '感谢页与购买后 Offer', 'https://apps.shopify.com/reconvert'],
    ['AfterSell', 'Shopify App Store', '购买后升级与追加销售', 'https://apps.shopify.com/aftersell']
  ],
  recommendations: [
    ['Search & Discovery', 'Shopify 官方', '商品推荐与筛选', 'https://apps.shopify.com/search-and-discovery'],
    ['Selleasy', 'Shopify App Store', '配件与一键加购', 'https://apps.shopify.com/easy-upsell'],
    ['Kaching', 'Shopify App Store', '推荐与组合 Offer', 'https://apps.shopify.com/bundle-deals']
  ],
  reviews: [
    ['Judge.me', 'Shopify App Store', '评价与照片证明', 'https://apps.shopify.com/judgeme'],
    ['Loox', '照片评价', 'UGC 与评分展示', 'https://apps.shopify.com/loox'],
    ['Shopify Product Reviews', 'Shopify 官方', '基础评价模块', 'https://apps.shopify.com/product-reviews']
  ],
  retention: [
    ['Shopify Subscriptions', 'Shopify 官方', '订阅购买计划', 'https://apps.shopify.com/shopify-subscriptions'],
    ['Smile', '积分会员', '积分与推荐奖励', 'https://apps.shopify.com/smile-io'],
    ['Growave', '会员套件', '积分、评价与愿望单', 'https://apps.shopify.com/growave']
  ],
  urgency: [
    ['Essential Countdown Timer', '倒计时', '活动倒计时区块', 'https://apps.shopify.com/essential-countdown-timer'],
    ['Fomo', '社会证明', '实时购买与库存提示', 'https://apps.shopify.com/fomo'],
    ['Vitals', '多功能套件', '倒计时与低库存组件', 'https://apps.shopify.com/vitals']
  ],
  options: [
    ['Easify Product Options', 'Shopify App Store', '定制字段与加价', 'https://apps.shopify.com/easify-product-options'],
    ['Product Options', 'Shopify App Store', '定制、礼盒与加价', 'https://apps.shopify.com/product-options'],
    ['Shopify Forms', 'Shopify 官方', '问答与邮箱收集', 'https://apps.shopify.com/shopify-forms']
  ],
  gift: [
    ['Shopify 礼品卡', 'Shopify 官方', '礼品卡与送礼场景', 'https://help.shopify.com/en/manual/products/gift-card-products'],
    ['Wrapin', '礼盒包装', '礼盒与留言卡', 'https://apps.shopify.com/wrapin-gift-wrap']
  ]
}

const STRATEGY_TOOL_GROUPS = {
  'free-shipping':'upsell', 'gift-threshold':'gift', 'discount-code':'upsell', 'cart-progress':'upsell', 'compare-at':'upsell',
  'bundle':'bundles', 'quantity-break':'bundles', 'product-recs':'recommendations', 'frequently-bought':'bundles', 'landing-bundle':'bundles',
  'cart-drawer':'upsell', 'cart-upsell':'upsell', 'sticky-add':'upsell', 'upsell-upgrade':'upsell', 'checkout-upsell':'upsell', 'post-purchase':'upsell',
  'subscription':'retention', 'membership':'retention', 'social-share':'retention', 'back-in-stock':'retention',
  'limited-time':'urgency', 'low-stock':'urgency', 'social-proof':'reviews', 'free-returns':'upsell',
  'free-gift-card':'gift', 'gift-wrap':'gift', 'personalization':'options', 'quiz-recommendation':'options'
}

function toolRecommendationsFor(strategy) {
  return TOOL_RECOMMENDATIONS[STRATEGY_TOOL_GROUPS[strategy.id]] || TOOL_RECOMMENDATIONS.upsell
}

function toolResourceTemplate(strategy) {
  const tools = toolRecommendationsFor(strategy)
  return `<div class="tool-resource" aria-label="${escapeHtml(strategy.name)}推荐工具">
    <div class="tool-resource-head"><div><small>推荐工具 / 资源位</small><strong>可以直接从这些工具开始</strong></div><span>Shopify App Store</span></div>
    <div class="tool-resource-grid">${tools.map(([name, tag, detail, url], index) => `<a href="${escapeHtml(url)}" target="_blank" rel="noopener" class="tool-resource-card ${index === 0 ? 'is-featured' : ''}">
      <span class="tool-resource-index">0${index + 1}</span><div><strong>${escapeHtml(name)}</strong><small>${escapeHtml(tag)}</small><p>${escapeHtml(detail)}</p></div><b aria-hidden="true">↗</b>
    </a>`).join('')}</div>
  </div>`
}

const RECOMMENDATION_COPY = {
  'free-shipping': ['把免邮门槛前置到购物车', '如果当前客单价离免邮线不远，在购物车提示“再加一点即可免邮”，并推荐一个低价补足商品。', '看加购率、达到免邮门槛的订单占比，以及是否推高真实客单价。'],
  'gift-threshold': ['用满额赠品拉高购物车金额', '设置一个略高于当前平均客单价的赠品门槛，让用户为了拿到赠品自然多买一件。', '看赠品门槛达成率、赠品成本占比和整体毛利是否变好。'],
  'discount-code': ['让首单优惠承担获客转化', '只对新访客或订阅用户展示首单优惠，避免所有订单都被无差别打折。', '看新客转化率、优惠使用率和折后客单价。'],
  'cart-progress': ['把“还差多少”说清楚', '在购物车顶部显示免邮、赠品或折扣进度条，让用户知道继续加购的具体目标。', '看购物车继续加购点击率和门槛完成率。'],
  'compare-at': ['用价值锚点解释现价', '对有真实促销空间的商品展示原价、现价和节省金额，帮助用户快速理解“现在买更划算”。', '看商品页加购率，不只看点击，也要看折扣后利润。'],
  'bundle': ['把常一起买的商品做成套装', '选择 2–3 个天然互补的商品做“一键加入”组合，不要只把无关商品硬凑在一起。', '看套装加购率、组合订单占比和退货率。'],
  'quantity-break': ['给多买一点一个明确理由', '适合袜子、内衣、耗材等可囤货品类，做 2 件、3 件、4 件的阶梯单价。', '看单笔件数、折扣成本和复购周期是否被拉长。'],
  'product-recs': ['在商品页补上配套推荐', '在主商品下方推荐真正能一起使用的配件或补充品，而不是泛泛的猜你喜欢。', '看推荐模块点击率、推荐商品加购率和连带率。'],
  'frequently-bought': ['把“经常一起买”做成可勾选组合', '根据商品关系展示主商品 + 配件，用户可以一键全选，也可以取消不需要的配件。', '看组合选择率和被取消最多的配件。'],
  'cart-drawer': ['加购后立刻给下一步选择', '用户加购成功后打开侧边购物车，同时展示小计、门槛进度和一个轻量加购项。', '看加购后继续浏览率、抽屉推荐点击率和跳出率。'],
  'cart-upsell': ['在购物车里放一个低阻力顺手加购', '选择价格低、决策轻、不会打断结账的商品，放在购物车小计附近一键加入。', '看一键加购点击率，以及是否影响结账完成率。'],
  'sticky-add': ['让加购按钮始终可见', '商品详情很长时，把商品名、当前规格、价格和加购按钮固定在底部，减少用户找按钮的成本。', '看长页面滚动后的加购率和规格错误率。'],
  'upsell-upgrade': ['把高配版本的差异讲清楚', '在基础款旁直接说明加多少钱能获得什么升级，比如容量、材质、质保或套装权益。', '看升级版本选择率和高配订单毛利。'],
  'checkout-upsell': ['结账页只放低决策附加项', '在结账阶段推荐运输保障、礼盒包装、补充耗材这类不会让用户重新犹豫的项目。', '看附加项勾选率和结账放弃率。'],
  'post-purchase': ['付款后再卖一个不打扰下单的补充品', '在支付成功页给一次限时追加机会，适合滤芯、替换装、配件或延保。', '看购买后追加率和客服取消率。'],
  'subscription': ['把消耗品做成订阅省钱', '如果商品有固定消耗周期，提供单次购买和订阅购买两个选择，并强调可暂停。', '看订阅选择率、取消率和 60 天留存。'],
  'membership': ['用积分承接下一次购买', '在购物车告诉用户本单可得多少积分，以及再加购多少可以升级权益。', '看会员注册率、积分兑换率和复购率。'],
  'social-share': ['成交后再做邀请奖励', '不要在购买前打断用户；在订单完成页给分享链接，让老客邀请朋友下单。', '看邀请链接打开率、被邀请新客转化率和奖励成本。'],
  'back-in-stock': ['缺货时承接需求，不让流量浪费', '缺货商品提供补货提醒，同时推荐同系列现货替代款。', '看补货提醒订阅率、替代款点击率和补货后的回购率。'],
  'limited-time': ['只在真实活动里使用限时感', '有明确活动周期时展示倒计时，避免长期假倒计时损害信任。', '看活动期转化率和活动结束后的价格敏感度。'],
  'low-stock': ['用真实库存提示减少犹豫', '只对库存确实偏低的规格展示“仅剩几件”，不要全站滥用稀缺感。', '看低库存规格转化率和缺货投诉。'],
  'social-proof': ['把评价放到购买决策旁边', '在价格和加购按钮附近展示评分、评价数量和同场景买家反馈。', '看评价曝光后的加购率和页面停留时间。'],
  'free-returns': ['用退换保障降低升级顾虑', '在高价款、套装或首次购买场景旁明确写出退换、质保和试错成本。', '看高价款选择率和退货率是否可控。'],
  'free-gift-card': ['补上礼品卡 / 送礼入口', '如果店铺适合送礼，提供电子礼品卡、祝福语和定时发送，让不知道买什么的人也能付款。', '看礼品卡购买量、节日前转化和后续兑换订单金额。'],
  'gift-wrap': ['让送礼订单可以加价包装', '在购物车或结账前提供礼盒、隐藏价格和留言卡，不改变主商品选择。', '看礼盒选择率和送礼订单客单价。'],
  'personalization': ['把定制变成加价选项', '适合刻字、姓名、颜色组合等个性化需求，把定制费和交付时间说清楚。', '看定制选择率、生产错误率和售后成本。'],
  'quiz-recommendation': ['用问答降低选择成本', '商品多或规格复杂时，用 3–5 个问题把用户导向少数几个推荐款。', '看完成问答后的加购率和推荐准确性反馈。'],
  'landing-bundle': ['把场景需求打包成购买方案', '围绕“新手套装、旅行套装、开学套装”等场景，把多个商品组合成一个落地页。', '看落地页套装点击率、整套购买率和广告转化成本。']
}

function recommendationFor(strategy) {
  const copy = strategy.status === '已发现' || strategy.status === '已验证'
    ? ['优化「' + strategy.name + '」的表现', '该策略已经被公开页面或真实流程观察到；下一步把位置、文案、推荐商品和触发条件拆成一个变量进行测试。', '看策略点击率、加购率、客单价、毛利和结账完成率是否同时改善。']
    : (RECOMMENDATION_COPY[strategy.id] || ['补上「' + strategy.name + '」的可测试方案', '先选一个最接近购买决策的位置做小流量测试，不要一次性全站铺开。', '看加购率、客单价、毛利和结账完成率是否同时改善。'])
  return { ...strategy, recommendationTitle: copy[0], recommendationAction: copy[1], recommendationMetric: copy[2] }
}

const STRATEGY_DEMOS = {
  'free-shipping':['meter','购物车小计','还差 US$12','免邮已解锁'],
  'gift-threshold':['meter','赠品门槛','US$64 / US$80','旅行装已加入'],
  'discount-code':['offer','WELCOME10','首单 9 折','自动应用'],
  'cart-progress':['meter','购物车进度','再加 US$18','解锁下一档'],
  'compare-at':['offer','US$79','US$59','立省 US$20'],
  'bundle':['stack','修护三件套','3 件已组合','一键加入'],
  'quantity-break':['meter','购买数量','1 → 2 → 3 件','单价降至 US$16'],
  'product-recs':['stack','搭配推荐','杯刷 + 吸管盖','加入购物车'],
  'frequently-bought':['stack','经常一起购买','主商品 + 2 配件','全部选中'],
  'landing-bundle':['stack','新手露营方案','帐篷 + 睡袋 + 营灯','整套购买'],
  'cart-drawer':['panel','加入成功','购物车抽屉','推荐同步出现'],
  'cart-upsell':['panel','顺手加购','旅行装 US$9.9','已加入'],
  'sticky-add':['sticky','正在浏览详情','悬浮购买栏','始终可加购'],
  'upsell-upgrade':['offer','基础版','加 US$20 升级 Pro','容量翻倍'],
  'checkout-upsell':['panel','订单摘要','运输保障 US$2.99','已勾选'],
  'post-purchase':['panel','支付成功','替换滤芯 8 折','并入原订单'],
  'subscription':['offer','单次 US$30','订阅 US$25.5','每月配送'],
  'membership':['meter','本单积分','240 → 480','双倍积分解锁'],
  'social-share':['social','邀请好友','朋友减 US$10','你得 1,000 积分'],
  'back-in-stock':['stack','补货提醒','同系列现货款','立即查看'],
  'limited-time':['countdown','限时优惠','02 : 14 : 36','优惠进行中'],
  'low-stock':['meter','可售库存','仅剩 4 件','库存实时更新'],
  'social-proof':['social','真实买家','4.8 · 2,316 条评价','照片评价浮现'],
  'free-returns':['offer','升级无压力','30 天免费退换','2 年质保'],
  'free-gift-card':['card','电子礼品卡','US$25 → US$200','定时发送'],
  'gift-wrap':['card','礼赠选项','礼盒 + 留言卡','加 US$5'],
  'personalization':['custom','刻字预览','MIA','加 US$12'],
  'quiz-recommendation':['quiz','问题 3 / 5','你的主要目标？','生成专属方案']
}

const REAL_SCENE_LINKS = {
  'free-shipping': {
    insight: '看购物车里是否用“还差多少”推动用户继续加购。',
    links: [['Dollar Shave Club','https://www.dollarshaveclub.com/'], ['Glossier','https://www.glossier.com/'], ['Amazon','https://www.amazon.com/']]
  },
  'gift-threshold': {
    insight: '看满赠、赠品、礼遇是否在购物车或活动页提前露出。',
    links: [['Glossier','https://www.glossier.com/'], ['Ulta Beauty','https://www.ulta.com/'], ['Sephora','https://www.sephora.com/']]
  },
  'discount-code': {
    insight: '看首单优惠、订阅弹窗、会员码是否降低首次购买门槛。',
    links: [['Nike','https://www.nike.com/'], ['Glossier','https://www.glossier.com/'], ['Ulta Beauty','https://www.ulta.com/']]
  },
  'cart-progress': {
    insight: '看购物车有没有进度条，把免邮或赠品门槛变成清晰目标。',
    links: [['Dollar Shave Club','https://www.dollarshaveclub.com/'], ['Glossier','https://www.glossier.com/'], ['Amazon','https://www.amazon.com/']]
  },
  'compare-at': {
    insight: '看商品页是否用原价、节省金额或套装价帮助用户判断价值。',
    links: [['Nike','https://www.nike.com/'], ['Apple Store','https://www.apple.com/shop'], ['Ulta Beauty','https://www.ulta.com/']]
  },
  'bundle': {
    insight: '看商品页或专题页是否把“主品 + 配件”包装成一个购买方案。',
    links: [['Apple Store','https://www.apple.com/shop'], ['Sephora','https://www.sephora.com/'], ['IKEA','https://www.ikea.com/']]
  },
  'quantity-break': {
    insight: '看数量选择器附近是否提示多件更划算。',
    links: [['Ulta Beauty','https://www.ulta.com/'], ['Dollar Shave Club','https://www.dollarshaveclub.com/'], ['Amazon','https://www.amazon.com/']]
  },
  'product-recs': {
    insight: '看商品页下方是否推荐同系列、配件或替代款。',
    links: [['Apple Store','https://www.apple.com/shop'], ['IKEA','https://www.ikea.com/'], ['Nike','https://www.nike.com/']]
  },
  'frequently-bought': {
    insight: '看页面是否把常见搭配组合成“一起购买”。',
    links: [['Apple Store','https://www.apple.com/shop'], ['IKEA','https://www.ikea.com/'], ['Amazon','https://www.amazon.com/']]
  },
  'landing-bundle': {
    insight: '看活动页是否按场景组织商品，而不是只推单品。',
    links: [['IKEA','https://www.ikea.com/'], ['Apple Store','https://www.apple.com/shop'], ['Nike','https://www.nike.com/']]
  },
  'cart-drawer': {
    insight: '看加购后是否打开侧边购物车，并同步出现推荐商品。',
    links: [['Glossier','https://www.glossier.com/'], ['Sephora','https://www.sephora.com/'], ['Target','https://www.target.com/']]
  },
  'cart-upsell': {
    insight: '看购物车内是否能一键加入低价配件或保障服务。',
    links: [['Apple Store','https://www.apple.com/shop'], ['Amazon','https://www.amazon.com/'], ['Chewy','https://www.chewy.com/']]
  },
  'sticky-add': {
    insight: '看长详情页滚动时，加购按钮是否持续停留在视野里。',
    links: [['Glossier','https://www.glossier.com/'], ['Nike','https://www.nike.com/'], ['Sephora','https://www.sephora.com/']]
  },
  'upsell-upgrade': {
    insight: '看规格区是否把更高配版本的差异说清楚。',
    links: [['Apple Store','https://www.apple.com/shop'], ['Nike','https://www.nike.com/'], ['Amazon','https://www.amazon.com/']]
  },
  'checkout-upsell': {
    insight: '看结账摘要里是否有保障、配件或服务的追加购买入口。',
    links: [['Apple Store','https://www.apple.com/shop'], ['Shopify App Store','https://apps.shopify.com/'], ['Amazon','https://www.amazon.com/']]
  },
  'post-purchase': {
    insight: '看支付完成后是否给出一次限时补充购买机会。',
    links: [['Shopify App Store','https://apps.shopify.com/'], ['Amazon','https://www.amazon.com/'], ['Chewy','https://www.chewy.com/']]
  },
  'subscription': {
    insight: '看消耗品是否同时提供单次购买和订阅省钱。',
    links: [['Dollar Shave Club','https://www.dollarshaveclub.com/'], ['Glossier','https://www.glossier.com/'], ['Amazon','https://www.amazon.com/']]
  },
  'membership': {
    insight: '看会员积分是否在购物车里变成“再买一点”的理由。',
    links: [['Ulta Beauty','https://www.ulta.com/'], ['Nike','https://www.nike.com/'], ['Sephora','https://www.sephora.com/']]
  },
  'social-share': {
    insight: '看成交后是否引导邀请好友，形成折扣或积分回流。',
    links: [['Glossier','https://www.glossier.com/'], ['Dollar Shave Club','https://www.dollarshaveclub.com/'], ['Nike','https://www.nike.com/']]
  },
  'back-in-stock': {
    insight: '看缺货状态有没有补货提醒和替代款推荐。',
    links: [['Nike','https://www.nike.com/'], ['Glossier','https://www.glossier.com/'], ['Ulta Beauty','https://www.ulta.com/']]
  },
  'limited-time': {
    insight: '看活动页或商品页是否用倒计时解释“为什么现在买”。',
    links: [['Nike','https://www.nike.com/'], ['Ulta Beauty','https://www.ulta.com/'], ['Glossier','https://www.glossier.com/']]
  },
  'low-stock': {
    insight: '看规格旁是否展示低库存，帮助用户快速决策。',
    links: [['Ulta Beauty','https://www.ulta.com/'], ['Nike','https://www.nike.com/'], ['Glossier','https://www.glossier.com/']]
  },
  'social-proof': {
    insight: '看购买按钮附近是否有评分、评价数量和真实买家内容。',
    links: [['Apple Store','https://www.apple.com/shop'], ['Nike','https://www.nike.com/'], ['Ulta Beauty','https://www.ulta.com/']]
  },
  'free-returns': {
    insight: '看高客单价商品旁边是否出现退换货和质保承诺。',
    links: [['Apple Store','https://www.apple.com/shop'], ['Nike','https://www.nike.com/'], ['Glossier','https://www.glossier.com/']]
  },
  'free-gift-card': {
    insight: '看送礼场景是否有礼品卡金额、祝福语和定时发送。',
    links: [['Apple Gift Cards','https://www.apple.com/shop/gift-cards'], ['Target Gift Cards','https://www.target.com/c/gift-cards/-/N-5xsxu'], ['Sephora Gift Cards','https://www.sephora.com/beauty/giftcards']]
  },
  'gift-wrap': {
    insight: '看结账前是否能加礼盒包装、隐藏价格或留言卡。',
    links: [['Apple Store','https://www.apple.com/shop'], ['Glossier','https://www.glossier.com/'], ['Ulta Beauty','https://www.ulta.com/']]
  },
  'personalization': {
    insight: '看商品定制项是否把加价后的预览和交付结果讲清楚。',
    links: [['Nike By You','https://www.nike.com/nike-by-you'], ['Apple Store','https://www.apple.com/shop'], ['Etsy','https://www.etsy.com/']]
  },
  'quiz-recommendation': {
    insight: '看问答推荐是否把用户需求转成更高匹配度的套装或升级款。',
    links: [['Glossier','https://www.glossier.com/'], ['Nike','https://www.nike.com/'], ['Ulta Beauty','https://www.ulta.com/']]
  }
}

function strategyDemoTemplate(id, name) {
  const scene = REAL_SCENE_LINKS[id]
  const primary = scene.links[0]
  const sceneLinks = scene.links.map(([brand, url]) => `<a href="${escapeHtml(url)}" target="_blank" rel="noopener"><span>${escapeHtml(brand)}</span><b>打开场景</b></a>`).join('')
  return `<div class="case-reference">
    <div class="case-shot" aria-label="${escapeHtml(primary[0])} 公开页面参考">
      <div class="case-browser"><i></i><i></i><i></i><span>${escapeHtml(new URL(primary[1]).hostname.replace(/^www\./,''))}</span></div>
      <div class="case-image">
        <img src="${escapeHtml(screenshotUrl(primary[1]))}" alt="${escapeHtml(primary[0])} 公开页面截图" loading="lazy" referrerpolicy="no-referrer" onerror="this.closest('.case-shot').classList.add('shot-failed');this.remove()">
        <button class="case-zoom-button" type="button" data-zoom-image="${escapeHtml(screenshotUrl(primary[1]))}" data-zoom-title="${escapeHtml(primary[0])} · ${escapeHtml(name)}" data-zoom-url="${escapeHtml(primary[1])}" aria-label="放大查看 ${escapeHtml(primary[0])} 公开页面截图"></button>
      </div>
      <div class="case-fallback">
        <span>${escapeHtml(primary[0])}</span>
        <strong>${escapeHtml(name)}</strong>
        <p>${escapeHtml(scene.insight)}</p>
      </div>
      <div class="case-caption">
        <span>${escapeHtml(primary[0])}</span>
        <strong>${escapeHtml(name)}</strong>
        <p>${escapeHtml(scene.insight)}</p>
      </div>
      <a class="case-open" href="${escapeHtml(primary[1])}" target="_blank" rel="noopener">查看公开页面</a>
    </div>
    <aside class="demo-scenes">
        <span>真实参照</span>
        <p>${escapeHtml(scene.insight)}</p>
        <div>${sceneLinks}</div>
    </aside>
  </div>`
}

function flatStrategies() {
  let index = 0
  return STRATEGY_GROUPS.flatMap(group => group.strategies.map(([id, name]) => {
    index += 1
    return { id, name, index, group: group.name, stage: group.stage }
  }))
}

function strategyDetailTemplate(strategy) {
  const example = STRATEGY_EXAMPLES[strategy.id]
  const [tool, steps] = configGuideFor(strategy)
  return `<aside class="strategy-detail-drawer" aria-live="polite">
    <div class="strategy-detail-kicker"><span>${String(strategy.index).padStart(2, '0')}</span><b>${escapeHtml(strategy.stage)}</b></div>
    <h3>${escapeHtml(strategy.name)}</h3>
    <p class="strategy-detail-subtitle">${escapeHtml(strategy.group)} · 看这个策略在真实电商页面里通常怎么出现。</p>
    <div class="strategy-example"><div><small>配置前</small><p>${escapeHtml(example[0])}</p></div><div><small>配置后</small><p>${escapeHtml(example[1])}</p></div></div>
    ${strategyDemoTemplate(strategy.id, strategy.name)}
    <section class="config-guide" aria-labelledby="config-guide-title">
      <div class="config-guide-head"><span>HOW TO CONFIGURE</span><h4 id="config-guide-title">如何配置</h4></div>
      <div class="config-guide-body"><div><small>后台入口 / 首选方案</small><strong>${escapeHtml(tool)}</strong></div><div><small>配置步骤</small><p>${escapeHtml(steps)}</p></div></div>
    </section>
    ${toolResourceTemplate(strategy)}
  </aside>`
}

function strategyLibraryTemplate() {
  const strategies = flatStrategies()
  return `<section class="strategy-library">
    <div class="strategy-library-head">
      <div><p class="eyebrow">FULL UPSELL PLAYBOOK</p><h2>28 类客单价策略，知道怎么落地</h2><p>透视猫的客单价策略库：查看展示示例、配置步骤和公开案例，为诊断后的测试选择方案。</p></div>
      <div class="strategy-total"><strong>28</strong><span>类策略</span></div>
    </div>
    <div class="strategy-workbench">
      <div class="strategy-list-panel">
        <div class="strategy-groups">${STRATEGY_GROUPS.map(group => `<article class="strategy-group">
          <header><span>${escapeHtml(group.stage)}</span><h3>${escapeHtml(group.name)}</h3><b>${group.strategies.length}</b></header>
          <div>${group.strategies.map(([id,name]) => {
            const item = strategies.find(x => x.id === id)
            return `<button type="button" class="strategy-item idle" data-strategy-id="${escapeHtml(id)}">
              <span class="strategy-no">${String(item.index).padStart(2, '0')}</span><strong>${escapeHtml(name)}</strong><em>查看详情</em><b aria-hidden="true">›</b>
            </button>`
          }).join('')}</div>
        </article>`).join('')}</div>
      </div>
    </div>
  </section>`
}

function strategyDrawerTemplate() {
  const strategy = flatStrategies().find(item => item.id === state.activeStrategyId)
  if (!strategy) return ''
  return `<div class="strategy-drawer-layer" role="presentation">
    <button class="strategy-drawer-backdrop" data-close-strategy-drawer aria-label="关闭策略详情"></button>
    <section class="strategy-drawer-panel" role="dialog" aria-modal="true" aria-label="${escapeHtml(strategy.name)}策略详情">
      <button class="strategy-drawer-close" data-close-strategy-drawer aria-label="关闭策略详情">${icons.close}</button>
      ${strategyDetailTemplate(strategy)}
    </section>
  </div>`
}

function mainMenuTemplate() {
  const strategies = isStrategiesPage()
  return `<header class="main-menu">
    <div class="main-menu-inner">
      <a class="menu-brand" href="${routePath('/')}" data-home-reset><span class="brand-mark" aria-hidden="true">${icons.bot}</span><span><strong>透视猫</strong><small>SHOPIFY · GROWTH REVIEW</small></span></a>
      <nav aria-label="主菜单">
      <a class="nav-report ${!strategies && state.dataMode === 'live' ? 'active' : ''}" href="${routePath('/')}" data-load-sample-report><span>示例诊断</span></a>
      <a class="${strategies ? 'active' : ''}" href="${routePath('/strategies')}">增长策略库</a>
      </nav>
      <button class="menu-status contact-author" type="button" data-contact-author><span>联系作者</span></button>
    </div>
  </header>`
}

function modeSelectorTemplate() {
  return `<div class="mode-selector" role="tablist" aria-label="诊断目标">
    <button class="mode-card combined ${state.mode === 'combined' ? 'active' : ''}" data-mode="combined" role="tab" aria-selected="${state.mode === 'combined'}"><span class="mode-kicker">MODE 01 · FULL REVIEW</span><strong>联合诊断</strong><small>一次扫描，同时看客单价和转化率。</small><em>先修漏斗，再找订单金额增长点</em></button>
    <button class="mode-card ${state.mode === 'aov' ? 'active' : ''}" data-mode="aov" role="tab" aria-selected="${state.mode === 'aov'}"><span class="mode-kicker">MODE 02 · AOV</span><strong>客单价增长</strong><small>已经想买的人，如何自然地多买一点？</small><em>组合、门槛、升级与复购机会</em></button>
    <button class="mode-card conversion ${state.mode === 'conversion' ? 'active' : ''}" data-mode="conversion" role="tab" aria-selected="${state.mode === 'conversion'}"><span class="mode-kicker">MODE 03 · CVR</span><strong>转化率增长</strong><small>为什么访问、加购或结账后没有买？</small><em>页面阻塞点、证据、优先修复与 SOP</em></button>
  </div>`
}

function heroCopyTemplate() {
  if (state.mode === 'combined') return { title:'扫描店铺<br><span>一次看清增长机会</span>', copy:'输入一个 Shopify 店铺，透视转化阻塞点、客单价机会和真实购买路径。先修漏斗，再放大订单价值。' }
  if (state.mode === 'conversion') return { title:'扫描店铺<br><span>找出转化阻塞点</span>', copy:'输入一个 Shopify 店铺，检查首页、商品页、购物车和结账入口，找出影响购买决策的页面问题，并给出修复顺序。' }
  return { title:'扫描店铺<br><span>找出客单价增长点</span>', copy:'输入一个 Shopify 店铺，识别组合、门槛、升级和复购机会，把已经想买的人自然地引导为更高价值订单。' }
}

function combinedDiagnosticSummaryTemplate() {
  if (state.mode !== 'combined' || state.dataMode !== 'live' || state.loading || state.journeyLoading) return ''
  const store = Object.values(storeMap)[0]
  const aov = store?.upsell
  const cvr = store?.conversion
  if (!aov || !cvr) return ''
  const high = (cvr.rules || []).filter(item => item.priority === 'high' && item.status !== '已观察到').length
  const observed = (aov.strategies || []).filter(item => ['已验证','有线索','已发现'].includes(item.status)).length
  return `<section class="combined-summary"><div><p class="eyebrow">FULL GROWTH REVIEW / ONE SCAN</p><h2>先修转化，再放大客单价</h2><p>两套报告共用本次扫描结果。先复核转化任务的证据与适用性，再选择客单价方案做单变量测试；观察到策略不代表已证明有效。</p></div><div class="combined-metrics"><article><strong>${high}</strong><span>高优先级转化任务</span></article><article><strong>${observed}<small>/${aov.total}</small></strong><span>已观察客单价线索</span></article><article><strong>${(cvr.rules || []).length}</strong><span>转化率检查项</span></article></div></section>`
}

function conversionDiagnosticTemplate() {
  if (!['conversion','combined'].includes(state.mode) || state.dataMode !== 'live' || state.loading || state.journeyLoading) return ''
  const report = Object.values(storeMap)[0]?.conversion
  if (!report) return ''
  const rules = report.rules || []
  const observed = rules.filter(x => x.status === '已观察到')
  const high = rules.filter(x => x.priority === 'high' && x.status !== '已观察到').slice(0, 3)
  const pageTypes = ['首页与落地页','Collection Page','商品页','Cart & Navigation','Checkout Entry','Mobile Experience','Trust & Performance']
  const statusLabel = { '已观察到':'已观察到', '未观察到':'未观察到', '无法确认':'无法确认' }
  return `<section class="conversion-panel">
    <div class="conversion-head"><div><p class="eyebrow">CVR DIAGNOSTIC / PUBLIC EVIDENCE</p><h2>转化率增长诊断</h2><p>${escapeHtml(report.summary)} 本次只读取公开店铺页面，未连接 Shopify Analytics。</p></div><div class="conversion-score"><strong>${observed.length}<small>/${rules.length}</small></strong><span>观察到相关信号</span></div></div>
    <div class="conversion-boundary"><strong>数据边界</strong><span>未观察到不代表后台没有配置；结账字段、真实支付和购买后流程需要后台或授权检查。</span></div>
    <div class="page-progress">${pageTypes.map(type => { const items = rules.filter(x => x.pageType === type); const done = items.filter(x => x.status !== '未观察到').length; const total = items.length; return `<div><span>${escapeHtml(type)}</span><b>${done} / ${total}</b><i><em style="width:${total ? Math.round(done / total * 100) : 0}%"></em></i></div>` }).join('')}</div>
    <div class="conversion-priority"><div><p class="eyebrow">FIRST FIXES / 先改这三项</p><h3>高优先级任务</h3></div><div class="conversion-cards">${high.map(rule => `<article class="conversion-card priority-${rule.priority}"><header><span>${escapeHtml(rule.id)}</span><b>${escapeHtml(statusLabel[rule.status])}</b><em>高优先级</em></header><h4>${escapeHtml(rule.title)}</h4><p><strong>证据：</strong>${escapeHtml(rule.evidence)}</p><p><strong>动作：</strong>${escapeHtml(rule.action)}</p><p><strong>验证：</strong>${escapeHtml((rule.metrics || []).join('、'))}</p><small>${escapeHtml(rule.limitation)}</small></article>`).join('') || '<p class="muted">当前没有可直接排序的高优先级公开问题。</p>'}</div></div>
    <details class="conversion-all"><summary><span>查看全部 ${rules.length} 项检查</span><b>${rules.filter(x=>x.status === '无法确认').length} 项无法确认</b></summary><div>${rules.map(rule => `<article class="conversion-row"><div><span>${escapeHtml(rule.id)}</span><strong>${escapeHtml(rule.title)}</strong><b class="status-${rule.status === '已观察到' ? 'seen' : rule.status === '无法确认' ? 'unknown' : 'missing'}">${escapeHtml(statusLabel[rule.status])}</b></div><p>${escapeHtml(rule.evidence)}</p><p><strong>动作：</strong>${escapeHtml(rule.action)} <strong>指标：</strong>${escapeHtml((rule.metrics || []).join('、'))}</p></article>`).join('')}</div></details>
    ${conversionSopTemplate()}
  </section>`
}

function conversionSopTemplate() {
  const days = [['DAY 1','建立基线','连接 Analytics 后记录 sessions、加购、到达结账和完成结账；未连接时只记录公开页面状态。'],['DAY 2–3','修复高确定性问题','补齐配送、退换、评价和主 CTA，删除结账前不必要的干扰。'],['DAY 4–7','走通移动端路径','用真实手机尺寸复测：首页 → 商品页 → 变体 → 加购 → 购物车 → 结账入口。'],['WEEK 2','一次只测一个变量','测试 CTA 文案、固定加购栏、评价位置或到货日期位置，预先定义主指标和护栏指标。'],['WEEK 3–4','复盘与推广','同时看转化率、客单价、毛利、退款率；样本不足时不宣布改版获胜。']]
  return `<div class="cvr-sop"><div><p class="eyebrow">30-DAY OPERATING SOP</p><h3>30 天执行与验证计划</h3><p>每一步都绑定执行动作和验证指标，公开诊断不会填入估算的转化率或提升百分比。</p></div><div class="sop-steps">${days.map(([label,title,copy]) => `<article><span>${label}</span><strong>${title}</strong><p>${copy}</p></article>`).join('')}</div></div>`
}

function filteredProducts() {
  const q = state.query.trim().toLowerCase()
  const availableCategories = new Set(catalog.map(p => p.category).filter(Boolean))
  const activeCategory = state.category === '全部品类' || availableCategories.has(state.category) ? state.category : '全部品类'
  let list = catalog.filter(p => {
    const matchesQuery = !q || [p.name, p.brand, p.category, p.description, ...p.sellingPoints].join(' ').toLowerCase().includes(q)
      || (q.includes('耳机') && ['消费电子', '运动户外'].includes(p.category))
      || (q.includes('跑步') && p.id === 'p3')
      || (q.includes('高客单') && p.price >= 120)
    return matchesQuery && (activeCategory === '全部品类' || p.category === activeCategory)
  })
  if (state.sort === '价格从低到高') list.sort((a,b) => a.price - b.price)
  if (state.sort === '价格从高到低') list.sort((a,b) => b.price - a.price)
  if (state.sort === '评论最多') list.sort((a,b) => b.reviews - a.reviews)
  if (state.sort === '默认排序') list.sort((a,b) => (b.reviews || 0) - (a.reviews || 0))
  return list
}

function categoryTabsTemplate() {
  const categories = [...new Set(catalog.map(p => p.category).filter(Boolean))]
  const tabs = ['全部品类', ...categories]
  const activeCategory = tabs.includes(state.category) ? state.category : '全部品类'
  return tabs.map(c=>`<button data-category="${escapeHtml(c)}" class="${activeCategory===c?'active':''}">${escapeHtml(c)}</button>`).join('')
}

function productCard(p) {
  const favorite = state.favorites.has(p.id)
  const compared = state.compare.has(p.id)
  return `<article class="product-card ${state.view === 'list' ? 'list-card' : ''}" data-id="${escapeHtml(p.id)}">
    <div class="product-visual" style="${visualStyle(p)}">
      <div class="scan-line"></div><span class="source-chip">公开商品数据</span>
      <button class="icon-button favorite ${favorite ? 'active' : ''}" data-action="favorite" aria-label="收藏">${icons.heart}</button>
      ${p.imageUrl ? '' : '<div class="product-silhouette"><span></span><span></span></div>'}
    </div>
    <div class="product-body">
      <div class="brand-row"><span>${escapeHtml(p.brand)}</span>${p.trend == null ? '<span class="live-source">公开目录</span>' : `<span class="trend">示例信号</span>`}</div>
      <h3>${escapeHtml(p.name)}</h3>
      <p class="store-domain">${escapeHtml(p.store)}</p>
      <div class="price-row"><strong>${p.price ? `US$${p.price}` : '价格未公开'}</strong>${p.compareAt ? `<del>US$${p.compareAt}</del>` : ''}${p.rating ? `<span class="rating">★ ${p.rating} <small>(${p.reviews.toLocaleString()})</small></span>` : '<span class="rating neutral">暂无公开评分</span>'}</div>
      <div class="signal-row"><span><i style="width:${p.confidence}%"></i></span><small>数据可信度 ${p.confidence}% · ${p.updated}</small></div>
      <div class="card-actions">
        <button class="text-button" data-action="detail">商品透视 ${icons.arrow}</button>
        <button class="compare-button ${compared ? 'active' : ''}" data-action="compare">${compared ? icons.check + ' 已加入' : icons.compare + ' 对比'}</button>
      </div>
    </div>
  </article>`
}

function publicEvidenceTemplate(list) {
  if (state.dataMode !== 'live') return ''
  const storeName = escapeHtml(list[0]?.brand || 'Shopify 店铺')
  const prices = list.map(p => Number(p.price)).filter(Boolean)
  const minPrice = prices.length ? Math.min(...prices) : null
  const maxPrice = prices.length ? Math.max(...prices) : null
  const discounted = list.filter(p => Number(p.compareAt) > Number(p.price)).length
  const categories = [...new Set(list.map(p => p.category).filter(Boolean))]
  const samples = list.slice(0, 6)
  const priceRange = minPrice && maxPrice ? `US$${minPrice}–${maxPrice}` : '价格未完整公开'
  return `<section class="evidence-section">
    <div class="evidence-head">
      <div><p class="eyebrow">PUBLIC PRODUCT EVIDENCE</p><h2>${storeName} 的公开商品证据</h2><p>从公开商品理解价格、变体与品类，为报告中的组合和升级建议提供参考。</p></div>
      <a href="${escapeHtml(state.sourceUrl)}" target="_blank" rel="noopener">打开来源店铺 ↗</a>
    </div>
    <div class="evidence-metrics">
      <article><span>读取商品</span><strong>${list.length}</strong><p>用于判断价格、套装、变体和折扣信号</p></article>
      <article><span>价格区间</span><strong>${priceRange}</strong><p>帮助识别升级款、门槛激励和组合空间</p></article>
      <article><span>折扣样本</span><strong>${discounted}</strong><p>出现划线价或公开优惠的商品数量</p></article>
      <article><span>覆盖品类</span><strong>${categories.length || 1}</strong><p>${escapeHtml(categories.slice(0, 3).join(' / ') || '公开目录')}</p></article>
    </div>
    <details class="evidence-samples">
      <summary><span>查看采样商品</span><b>${samples.length} 个样本</b></summary>
      <div>${samples.map(p => `<article class="evidence-sample">
        <i style="${visualStyle(p)}"></i>
        <div><strong>${escapeHtml(p.name)}</strong><span>${p.price ? `US$${p.price}` : '价格未公开'}${p.compareAt ? ` · 原价 US$${p.compareAt}` : ''}</span><p>${escapeHtml((p.sellingPoints || []).slice(0, 2).join(' / ') || p.description || '公开商品样本')}</p></div>
        <button data-sample-detail="${escapeHtml(p.id)}">商品证据</button>
      </article>`).join('')}</div>
    </details>
  </section>`
}

function strategySourceTemplate(strategy) {
  const isInteractive = strategy.sourceStep || /^交互验证/.test(strategy.evidence || '')
  const label = isInteractive ? `强证据 · 真实流程 · ${strategy.sourceStep || '交互步骤'}` : `${strategy.evidenceLevel || '中证据'} · 静态扫描 · ${strategy.sourceLabel || '公开页面'}`
  const copy = isInteractive
    ? (strategy.sourceEvidence || '真实购物流程中观察到该策略信号。')
    : (strategy.sourceUrl ? '证据正文已在上方展示；点击可打开本次命中的公开页面。' : '该线索来自源码字段，暂时没有可直接定位的可见页面。')
  const href = strategy.sourceUrl || (isInteractive ? state.sourceUrl : '#')
  return `<div class="strategy-source">
    <span>出处标记</span>
    <p><b>${escapeHtml(label)}</b>${escapeHtml(copy)}</p>
    ${href && href !== '#' ? `<a href="${escapeHtml(href)}" target="_blank" rel="noopener">打开来源 ↗</a>` : ''}
  </div>`
}

function diagnosticTemplate() {
  if (state.dataMode !== 'live' || state.loading || state.journeyLoading) return ''
  const store = Object.values(storeMap)[0]
  const report = store?.upsell
  if (!report) return ''
  const observed = report.strategies.filter(x => ['已验证', '有线索', '已发现'].includes(x.status))
  const unconfirmed = report.strategies.filter(x => x.status === '无法确认')
  const opportunities = (report.opportunities || []).map(recommendationFor)
  const diagnosticUrl = state.sourceUrl || store?.sourceUrl || ''
  let diagnosticUrlLabel = diagnosticUrl
  try {
    const parsed = new URL(diagnosticUrl)
    diagnosticUrlLabel = `${parsed.host}${parsed.pathname !== '/' ? parsed.pathname : ''}`
  } catch {}
  return `<section class="diagnostic-panel">
    <div class="diagnostic-head"><div><a class="eyebrow diagnostic-source-url" href="${escapeHtml(diagnosticUrl || '#')}" ${diagnosticUrl ? 'target="_blank" rel="noopener"' : ''} title="打开当前诊断店铺">${escapeHtml(diagnosticUrlLabel || '当前诊断店铺')}</a><h2>客单价增长诊断</h2><p>${escapeHtml(report.summary)}</p>${report.coverage?.products?.length ? `<div class="diagnostic-coverage"><span>本次覆盖商品</span>${report.coverage.products.map(product => `<b>${escapeHtml(product.segment)} · ${escapeHtml(product.title || '未命名商品')}</b>`).join('')}</div>` : ''}</div><div class="diagnostic-score"><strong>${report.foundCount}<small>/${report.total}</small></strong><span>观察到的线索</span></div></div>
    <div class="diagnostic-columns"><div><h3>已验证 / 有线索</h3><div class="strategy-list">${observed.length ? observed.map((x,index)=>{
      const label = x.status === '已发现' ? '有线索' : x.status
      const evidenceTypes = (x.evidenceTypes || []).join(' + ')
      const coverage = (x.coverage || []).join(' / ')
      const sampleCoverage = x.sampleTotal ? `<span>商品验证：${x.sampleHits} / ${x.sampleTotal}</span>` : ''
      const interaction = x.interactionLevel ? `<span>动作：${escapeHtml(x.interactionLevel)}</span>` : ''
      return `<article class="strategy-card found evidence-${x.status === '已验证' ? 'strong' : 'medium'}"><div><span class="strategy-index">${String(index + 1).padStart(2, '0')}</span><span class="evidence-pill">${escapeHtml(label)}</span><strong>${escapeHtml(x.name)}</strong><em>${escapeHtml(x.group)} · ${escapeHtml(x.evidenceLevel || (x.status === '已验证' ? '强证据' : '中证据'))}</em></div><p>${escapeHtml(x.evidence)}</p><div class="evidence-meta">${evidenceTypes ? `<span>证据：${escapeHtml(evidenceTypes)}</span>` : ''}${coverage ? `<span>覆盖：${escapeHtml(coverage)}</span>` : ''}${interaction}${sampleCoverage}</div>${strategySourceTemplate(x)}</article>`
    }).join('') : '<p class="muted">本次公开会话暂未观察到明确的 Upsell 信号。</p>'}</div></div>
      <div><h3>下一步增长建议</h3><div class="strategy-list">${opportunities.map((x,index)=>`<article class="strategy-card opportunity"><div><span class="strategy-index">${String(index + 1).padStart(2, '0')}</span><span class="priority ${x.priority === '高' ? 'high' : ''}">${x.priority}优先</span><strong>${escapeHtml(x.recommendationTitle)}</strong><em>${escapeHtml(x.name)}</em></div><p><b>建议：</b>${escapeHtml(x.recommendationAction)}</p><p><b>验证：</b>${escapeHtml(x.recommendationMetric)}</p><button type="button" class="strategy-example-link" data-strategy-id="${escapeHtml(x.id)}"><span>策略示例</span><b>查看配置前后与真实参考 ›</b></button></article>`).join('')}</div></div></div>
    ${unconfirmed.length ? `<div class="unconfirmed-strip"><strong>无法确认</strong>${unconfirmed.map(x=>`<span>${escapeHtml(x.name)}：${escapeHtml(x.evidence)}</span>`).join('')}</div>` : ''}
    <div class="diagnostic-note"><span>证据边界</span><p>“已验证”表示真实买家路径中观察到页面文案或行为变化；“有线索”表示公开页面或源码命中；“未观察到”不代表后台一定没有配置。当前扫描覆盖公开首页、购物车页和代表性商品路径。</p></div>
  </section>`
}

function journeyTemplate() {
  if (state.dataMode !== 'live' && !state.journeyLoading) return ''
  const store = Object.values(storeMap)[0]
  const journey = store?.journey
  if (state.journeyLoading) return runningProcessTemplate('journey')
  if (!journey) return state.journeyError ? `<section class="journey-panel journey-failed"><div class="journey-heading"><div><p class="eyebrow">REAL BROWSER / OPTIONAL CHECK</p><h2>购买路径验证未完成</h2><p>${escapeHtml(state.journeyError)}</p></div><span class="journey-status blocked">不影响静态诊断</span></div></section>` : ''
  const statusText = { passed:'已验证', partial:'部分完成', blocked:'无法进入' }
  return `<section class="journey-panel">
    <div class="journey-heading"><div><p class="eyebrow">REAL BROWSER / INTERACTIVE VERIFICATION</p><h2>购买路径验证结果</h2><p>在独立匿名会话中尝试选规格、加购和进入结账入口，记录完成情况与阻力；不会填写个人信息或提交订单。</p></div><div class="journey-meta"><strong>${Math.round((journey.durationMs || 0) / 1000)}s</strong><span>${escapeHtml(journey.engine)}</span></div></div>
    <div class="journey-steps">${journey.steps.map((step,index)=>`<article class="journey-step ${step.status}"><div><b>0${index+1}</b><span class="journey-status ${step.status}">${statusText[step.status] || step.status}</span></div><h3>${escapeHtml(step.label)}</h3><p>${escapeHtml(step.evidence)}</p>${step.url ? `<a href="${escapeHtml(step.url)}" target="_blank" rel="noopener">${escapeHtml(new URL(step.url).hostname + new URL(step.url).pathname)}</a>` : ''}</article>`).join('')}</div>
    ${journey.findings?.length ? `<div class="journey-findings"><strong>交互命中的策略</strong><div>${journey.findings.map(item=>`<span><b>${escapeHtml(item.name)}</b>${escapeHtml(item.step)} · ${item.confidence}%</span>`).join('')}</div></div>` : ''}
    ${journey.sampleRuns?.length > 1 ? `<div class="journey-samples"><strong>代表商品验证</strong><div>${journey.sampleRuns.map(item => item.status === 'failed' ? `<span class="is-failed">验证失败 · ${escapeHtml(item.stage || '未知阶段')} · ${escapeHtml(item.error || '未完成')}</span>` : `<span>已完成 · ${escapeHtml(item.product?.title || '代表商品')}</span>`).join('')}</div></div>` : ''}
    <div class="journey-boundary"><strong>本次实验边界</strong><span>${escapeHtml(journey.boundary)}</span></div>
  </section>`
}

function runningProcessTemplate(mode = 'static') {
  const isJourney = mode === 'journey'
  const totalEstimateSeconds = 60
  const stageEstimateSeconds = isJourney ? 48 : 12
  const startedAt = state.processStartedAt || Date.now()
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000))
  const remainingSeconds = Math.max(0, totalEstimateSeconds - elapsedSeconds)
  const progress = isJourney
    ? Math.min(96, Math.max(20, Math.round(20 + (elapsedSeconds / stageEstimateSeconds) * 80)))
    : Math.min(20, Math.max(5, Math.round((elapsedSeconds / stageEstimateSeconds) * 20)))
  const steps = isJourney ? [
    ['01','打开商品页','进入可购买商品页面，确认公开商品信息与变体。'],
    ['02','执行加购','尝试选择规格并触发加入购物车。'],
    ['03','读取购物车','检查 Cart Drawer、进度条、推荐加购和满额提示。'],
    ['04','改变数量','调整数量和金额，观察优惠、赠品或免邮门槛是否变化。'],
    ['05','寻找结账入口','进入结账前一步，确认结账前追加购买机会。']
  ] : [
    ['01','读取店铺公开页面','规范化 URL，打开 Shopify 公开页面并识别数据入口。'],
    ['02','读取商品信息','整理公开价格、变体、图片和商品链接。'],
    ['03','检查购买决策信息','读取商品与购物车页面，整理信任、配送、推荐和价格信号。'],
    ['04','生成诊断结论','把已验证、有线索、未观察到和无法确认的策略分层整理。'],
    ['05','准备可读报告','输出增长机会、证据边界和下一步建议。']
  ]
  const title = isJourney ? '正在验证购买路径' : '正在分析店铺公开数据'
  const copy = isJourney
    ? '浏览器正在模拟一次真实购买：打开商品页、加购、读取购物车、修改数量并尝试进入结账入口。'
    : '透视猫正在读取公开商品目录和页面信号，整理转化阻塞点、客单价机会与证据边界。'
  const eyebrow = isJourney ? 'REAL BROWSER / INTERACTIVE VERIFICATION' : 'PUBLIC DATA / SHOPIFY GROWTH REVIEW'
  const logs = isJourney ? ['准备匿名浏览器会话','等待商品页加载完成','观察购物车和加购组件','记录无法确认的步骤'] : ['检查 Shopify URL','读取公开商品目录','提取价格、变体和页面信号','生成转化与客单价诊断']
  const currentIndex = Math.min(steps.length - 1, Math.floor(progress / (100 / steps.length)))
  const timeText = remainingSeconds ? `预计还需 ${remainingSeconds}s` : '正在收尾'
  return `<section class="journey-panel journey-running process-board">
    <div class="journey-heading process-heading">
      <div><p class="eyebrow">${eyebrow}</p><h2>${title}</h2><p>${copy}</p></div>
      <div class="process-timer" aria-live="polite"><small>${timeText}</small><strong>${progress}%</strong><span>${elapsedSeconds}s 已运行</span></div>
    </div>
    <div class="process-rail is-determinate" aria-label="分析进度"><i style="width:${progress}%"></i><span>${timeText}</span></div>
    <div class="process-steps">${steps.map((step,index)=>{
      const status = index < currentIndex ? '已完成' : index === currentIndex ? '进行中' : '排队中'
      const klass = index < currentIndex ? 'is-done' : index === currentIndex ? 'is-current' : 'is-pending'
      return `<article class="process-step ${klass}" style="--i:${index}"><div><b>${step[0]}</b><span>${status}</span></div><h3>${step[1]}</h3><p>${step[2]}</p></article>`
    }).join('')}</div>
    <div class="process-console" aria-live="polite"><strong>实时执行记录</strong><div>${logs.map((log,index)=>`<span style="--i:${index}">${log}</span>`).join('')}</div></div>
  </section>`
}

function applyJourney(journey) {
  const store = Object.values(storeMap)[0]
  if (!store) return
  store.journey = journey
  const report = store.upsell
  if (!report?.strategies) return
  const findings = new Map((journey.findings || []).map(item => [item.id, item]))
  const sampleMatches = new Map((journey.sampleMatches || []).map(item => [item.id, item.samples]))
  const unconfirmed = new Map((journey.unconfirmed || []).map(item => [item.id, item.reason]))
  report.strategies = report.strategies.map(strategy => {
    const finding = findings.get(strategy.id)
    if (finding) {
      const step = (journey.steps || []).find(item => item.evidence?.includes(finding.evidence) || item.label?.includes(finding.step) || finding.step?.includes(item.label))
      const sampleTotal = journey.sampleTotal || journey.sampleCount || 1
      const sampleHits = sampleMatches.get(strategy.id) || 1
      return { ...strategy, status:'已验证', evidenceLevel:'强证据', confidence:finding.confidence, evidenceTypes:['真实行为','页面文案'], coverage:[finding.step], sampleHits, sampleTotal, evidence:`交互验证 · ${finding.step}：${finding.evidence}`, sourceStep:finding.step, sourceEvidence:finding.evidence, sourceUrl:step?.url || state.sourceUrl }
    }
    const reason = unconfirmed.get(strategy.id)
    if (reason) return { ...strategy, status:'无法确认', evidenceLevel:'无法确认', confidence:35, evidence:reason }
    return strategy
  })
  report.foundCount = report.strategies.filter(item => ['已验证', '有线索', '已发现'].includes(item.status)).length
  const missing = report.strategies.filter(item => ['未观察到','未发现'].includes(item.status))
  const fallback = report.strategies.filter(item => ['已发现','已验证'].includes(item.status))
  const opportunityPool = [...missing, ...fallback.filter(item => !missing.some(candidate => candidate.id === item.id))].slice(0,5)
  report.opportunities = opportunityPool.map((item,index) => ({ ...item, priority: missing.includes(item) ? (index < 2 ? '高' : index < 4 ? '中' : '低') : (index < 2 ? '中' : '低') }))
  const failedSamples = (journey.sampleRuns || []).filter(item => item.status === 'failed').length
  report.summary = `静态页面与真实购物流程共观察到 ${report.foundCount} / ${report.total} 类客单价策略线索；已验证 ${journey.sampleCount || 1} / ${journey.sampleTotal || journey.sampleCount || 1} 个代表商品${failedSamples ? `，${failedSamples} 个商品验证失败` : ''}。`
}

async function readJsonResponse(response, fallbackMessage) {
  const text = await response.text()
  try {
    return text ? JSON.parse(text) : {}
  } catch {
    return { error: fallbackMessage }
  }
}

function friendlyJourneyError(error) {
  const message = String(error?.message || '')
  const stage = error?.stage ? `当前阶段：${error.stage}。` : ''
  const elapsed = error?.elapsedMs ? `已耗时 ${Math.round(error.elapsedMs / 1000)} 秒。` : ''
  if (/Unexpected token|not valid JSON|公开商品接口|An error/i.test(message)) {
    return '购买路径验证暂时没跑完：目标店铺或平台返回了非标准商品数据，无法确认可加购商品。静态策略诊断已完成，可继续参考下方结果。'
  }
  if (/timeout|超时|timed out/i.test(message)) {
    return `购买路径验证超时。${stage}${elapsed}目标店铺页面或购物车响应过慢。静态策略诊断已完成，可继续参考下方结果。`
  }
  return message ? `${stage}${elapsed}${message}静态策略诊断已完成，可继续参考下方结果。` : '购买路径验证暂时没跑完；静态策略诊断已完成，可继续参考下方结果。'
}

function reportTemplate() {
  if (state.dataMode !== 'live') return ''
  const store = Object.values(storeMap)[0]
  const report = store?.report
  if (!report) return ''
  return `<section class="research-report">
    <div class="report-heading"><div><p class="eyebrow">FIRST-PRINCIPLES COMPETITIVE REPORT</p><h2>品牌透视报告</h2><p>${escapeHtml(report.positioning)}</p></div><span class="report-badge">公开数据 + 推断分层</span></div>
    <div class="report-facts"><div><span>01</span><strong>公开事实</strong>${report.facts.map(x=>`<p>${escapeHtml(x)}</p>`).join('')}</div><div><span>02</span><strong>成交机制</strong>${report.mechanisms.length ? report.mechanisms.map(x=>`<p><b>${escapeHtml(x.name)}</b>${escapeHtml(x.explanation)}</p>`).join('') : '<p>暂未发现明确机制</p>'}</div></div>
    <div class="report-principles"><p class="eyebrow">FIRST PRINCIPLES / 生意原理</p><div class="report-principle-grid"><article><small>用户真正要解决的问题</small><strong>${escapeHtml(report.principles.problem)}</strong></article><article><small>为什么它可能成立</small><strong>${escapeHtml(report.principles.whyItMayWork)}</strong></article><article><small>可复制的部分</small><strong>${escapeHtml(report.principles.copyable)}</strong></article><article class="report-verify"><small>下一步必须验证</small><strong>${escapeHtml(report.principles.verify)}</strong></article></div></div>
    <div class="report-boundaries"><strong>证据边界</strong><div>${report.boundaries.map(x=>`<span>— ${escapeHtml(x)}</span>`).join('')}</div></div>
  </section>`
}

function valuePropTemplate() {
  if (state.dataMode === 'live' || state.loading || state.journeyLoading) return ''
  return `<section class="aov-map" aria-label="店铺增长地图">
    <div class="aov-map-head">
      <p class="eyebrow">SHOPIFY GROWTH MAP</p>
      <h2>增长不只看流量，也要看每一步怎么成交。</h2>
      <p>透视猫沿着一次购买旅程，先找出转化损失，再识别客单价机会：哪里让用户犹豫，哪里可以让已经想买的人自然多买一点。</p>
    </div>
    <div class="aov-flow">
      <article>
        <span>01 / CONVERSION</span>
        <strong>先看哪里让顾客犹豫</strong>
        <p>检查首屏卖点、主 CTA、信任信息和商品选择，降低用户从访问到加购的决策成本。</p>
      </article>
      <article>
        <span>02 / ORDER VALUE</span>
        <strong>再找订单价值机会</strong>
        <p>识别套装、免邮门槛、升级款与配件推荐的公开线索，找到值得测试的客单价增长方案。</p>
      </article>
      <article>
        <span>03 / ACTION PLAN</span>
        <strong>把发现变成执行任务</strong>
        <p>每条建议说明证据、优先级、实施动作和验证指标；需要后台确认的环节单独列出。</p>
      </article>
    </div>
    <div class="aov-output">
      <strong>输入店铺后，你会看到：</strong>
      <span>公开页面证据</span>
      <span>优先修复任务</span>
      <span>客单价增长机会</span>
      <span>真实购买路径证据</span>
    </div>
  </section>`
}

function render() {
  // Preserve native disclosure state across progress-ticker re-renders.
  // Without this, the one-second progress refresh replaces the <details>
  // element and collapses an evidence section the user just opened.
  const evidenceSamplesOpen = document.querySelector('.evidence-samples')?.open ?? false
  const list = filteredProducts()
  const safeQuery = escapeHtml(state.query)
  const strategiesPage = isStrategiesPage()
  const heroCopy = heroCopyTemplate()
  document.querySelector('#app').innerHTML = `
    <div class="app-shell">
      ${mainMenuTemplate()}
      <main>
        ${strategiesPage ? `${strategyLibraryTemplate()}` : `
        <section class="hero">
          <div class="hero-copy"><p class="eyebrow">选品猫产品家族 · SHOPIFY GROWTH REVIEW</p><h1>${heroCopy.title}</h1><p>${heroCopy.copy}</p></div>
          <form class="search-panel" id="search-form">
            <div class="scanner-icon">${icons.scan}</div>
            <input id="search-input" value="${safeQuery}" placeholder="粘贴 Shopify 店铺 / 商品 URL 开始诊断" autocomplete="off" />
            <button type="submit" ${state.loading || state.journeyLoading ? 'disabled' : ''}>${state.loading ? '<span class="loading-dot"></span>正在读取公开数据' : state.journeyLoading ? '<span class="loading-dot"></span>正在交互验证' : `开始透视 ${icons.arrow}`}</button>
            <div class="search-beam"></div>
          </form>
          ${modeSelectorTemplate()}
          ${handoffUrl && handoffFrom === 'toushimao' ? `<div class="handoff-note"><strong>已从透视猫带入店铺</strong><span>${escapeHtml(handoffUrl)} · 点击“开始透视”后执行公开页面诊断</span></div>` : ''}
          ${state.error ? `<div class="analysis-error"><strong>本次诊断未完成</strong><span>${escapeHtml(state.error)}</span><button id="reset-search">返回首页</button></div>` : ''}
        </section>
        ${state.loading ? runningProcessTemplate('static') : ''}
        ${valuePropTemplate()}
        ${journeyTemplate()}
        ${reportTemplate()}
        ${combinedDiagnosticSummaryTemplate()}
        ${state.mode !== 'conversion' ? diagnosticTemplate() : ''}
        ${conversionDiagnosticTemplate()}
        ${publicEvidenceTemplate(list)}`}
      </main>
      ${state.compare.size ? `<div class="compare-dock"><div><span>${state.compare.size}</span><p><strong>已加入对比</strong><small>最多选择 3 件商品</small></p></div><div class="compare-thumbs">${[...state.compare].map(id=>{const p=catalog.find(x=>x.id===id);return p ? `<i style="${visualStyle(p)}" title="${escapeHtml(p.name)}"></i>` : ''}).join('')}</div><button id="clear-compare">清空</button><button id="open-compare" ${state.compare.size<2?'disabled':''}>生成对比报告 ${icons.arrow}</button></div>` : ''}
      ${state.activeStrategyId ? strategyDrawerTemplate() : ''}
      ${state.modal ? modalTemplate() : ''}
      <div id="toast" class="toast"></div>
  </div>`
  const evidenceSamples = document.querySelector('.evidence-samples')
  if (evidenceSamples) evidenceSamples.open = evidenceSamplesOpen
  bindEvents()
  syncProgressTicker()
}

function syncProgressTicker() {
  const isProcessing = state.loading || state.journeyLoading
  if (isProcessing && !progressTimer) progressTimer = setInterval(render, 1000)
  if (!isProcessing && progressTimer) {
    clearInterval(progressTimer)
    progressTimer = null
  }
}

function modalTemplate() {
  if (state.modal.type === 'contact') {
    return `<div class="modal-layer contact-layer"><button class="modal-backdrop" data-close aria-label="关闭联系作者弹窗"></button><section class="contact-panel" role="dialog" aria-modal="true" aria-label="联系作者">
      <button class="modal-close" data-close aria-label="关闭">${icons.close}</button>
      <p class="eyebrow">WECHAT / 微信</p>
      <img class="contact-qr" src="/contact-qr.jpg" alt="程校 Wesley 微信二维码">
    </section></div>`
  }
  if (state.modal.type === 'zoom') {
    return `<div class="modal-layer zoom-layer"><button class="modal-backdrop" data-close aria-label="关闭截图预览"></button><section class="zoom-panel" role="dialog" aria-modal="true" aria-label="${escapeHtml(state.modal.title)}">
      <button class="modal-close" data-close>${icons.close}</button>
      <div class="zoom-frame"><img src="${escapeHtml(state.modal.image)}" alt="${escapeHtml(state.modal.title)} 公开页面截图" referrerpolicy="no-referrer"></div>
      <footer><strong>${escapeHtml(state.modal.title)}</strong><a href="${escapeHtml(state.modal.url)}" target="_blank" rel="noopener">打开原始页面</a></footer>
    </section></div>`
  }
  if (state.modal.type === 'detail') {
    const p = catalog.find(x => x.id === state.modal.id)
    const fp = firstPrinciples(p)
    return `<div class="modal-layer"><button class="modal-backdrop" data-close></button><section class="detail-panel">
      <button class="modal-close" data-close>${icons.close}</button>
      <div class="modal-visual" style="${visualStyle(p)}"><div class="scan-line"></div><span class="source-chip">${p.sourceType === 'live' ? '实时商品数据' : 'PRODUCT X-RAY'}</span>${p.imageUrl ? '' : '<div class="product-silhouette large"><span></span><span></span></div>'}</div>
      <div class="modal-content"><p class="eyebrow">PRODUCT INTELLIGENCE / ${p.confidence}% CONFIDENCE</p><h2>${escapeHtml(p.name)}</h2><a href="${escapeHtml(p.sourceUrl || '#')}" target="_blank" rel="noopener">${escapeHtml(p.brand)} · ${escapeHtml(p.store)}</a><div class="modal-price"><strong>${p.price ? `US$${p.price}` : '价格未公开'}</strong><span>${p.rating ? `★ ${p.rating} · ${p.reviews.toLocaleString()} 条评价` : '公开数据未提供评分'}</span></div>
      <p class="description">${escapeHtml(p.description)}</p><section class="principles-card"><div class="principles-head"><span>FIRST PRINCIPLES / 竞品机制</span><em>${fp.confidence}</em></div><div class="principle-grid"><article><small>它解决的真实问题</small><strong>${escapeHtml(fp.problem)}</strong></article><article><small>它的成交机制</small><strong>${escapeHtml(fp.mechanism)}</strong></article><article><small>可复制线索</small><strong>${escapeHtml(fp.copy)}</strong></article><article class="verify"><small>还没有被证明</small><strong>${escapeHtml(fp.verify)}</strong></article></div></section><h4>${p.sourceType === 'live' ? '公开商品选项' : 'AI 提炼的核心卖点'}</h4><ul class="selling-points">${p.sellingPoints.map((x,i)=>`<li><b>0${i+1}</b><span>${escapeHtml(x)}</span></li>`).join('')}</ul>
      <h4>结构化参数</h4><dl class="specs">${Object.entries(p.specs).map(([k,v])=>`<div><dt>${escapeHtml(k)}</dt><dd>${escapeHtml(v)}</dd></div>`).join('')}</dl>
      <div class="data-note"><span>来源</span><strong>${p.sourceType === 'live' ? '店铺公开 Shopify JSON 接口' : '公开 Shopify 商品页'}</strong><span>更新</span><strong>${p.updated}</strong><span>口径</span><strong>${p.sourceType === 'live' ? '原始公开字段，不含销量估算' : '页面字段 + AI 结构化'}</strong></div></div>
    </section></div>`
  }
  if (state.modal.type === 'store') {
    const s = storeMap[state.modal.id]
    return `<div class="modal-layer"><button class="modal-backdrop" data-close></button><section class="store-panel">
      <button class="modal-close" data-close>${icons.close}</button><div class="store-head"><div class="store-logo">${s.name.split(' ').map(x=>x[0]).join('').slice(0,2)}</div><div><p class="eyebrow">STORE INTELLIGENCE / ${s.confidence}% CONFIDENCE</p><h2>${s.name}</h2><a>${s.domain} ↗</a></div></div>
      <p class="store-description">${escapeHtml(s.description)}</p>
      <div class="metric-grid"><div><small>${s.sourceType === 'live' ? '流量数据' : '月访问量（估算）'}</small><strong>${s.traffic}</strong><span>${s.trafficChange == null ? '未进行未经验证的估算' : `↗ ${s.trafficChange}%`}</span></div><div><small>平均公开价格</small><strong>US$${s.aov}</strong><span>基于本次读取的变体</span></div><div><small>读取商品</small><strong>${s.products}</strong><span>${escapeHtml(s.category)}</span></div><div><small>品牌起始年份</small><strong>${s.founded}</strong><span>${escapeHtml(s.country)}</span></div></div>
      <div class="store-columns"><div><h4>${s.sourceType === 'live' ? '公开数据边界' : '流量渠道'}</h4>${s.channels.length ? s.channels.map(([n,v])=>`<div class="channel"><span>${n}</span><i><b style="width:${v}%"></b></i><strong>${v}%</strong></div>`).join('') : '<p class="boundary-copy">当前只读取店铺公开页面与公开商品目录，不凭空估算销量、流量或总部。</p>'}</div><div><h4>技术栈信号</h4><div class="tech-stack"><span>Theme</span><strong>${escapeHtml(s.theme)}</strong>${s.apps.map(a=>`<em>${escapeHtml(a)}</em>`).join('')}</div></div></div>
      <div class="data-note"><span>数据性质</span><strong>实时公开数据</strong><span>来源页面</span><strong>${escapeHtml(s.sourceUrl || '公开店铺页面')}</strong><span>更新时间</span><strong>刚刚</strong></div>
    </section></div>`
  }
  const selected = [...state.compare].map(id => catalog.find(p => p.id === id)).filter(Boolean)
  const fields = [['价格', p=>p.price ? `US$${p.price}` : '—'],['评分',p=>p.rating ? `${p.rating} / 5` : '未公开'],['评论数',p=>p.rating ? p.reviews.toLocaleString() : '未公开'],['热度增长',p=>p.trend == null ? '未估算' : `+${p.trend}%`],['商品类型',p=>p.specs['商品类型'] || p.category],['变体数量',p=>p.specs['变体数量'] || '—'],['数据可信度',p=>`${p.confidence}%`]]
  return `<div class="modal-layer compare-layer"><button class="modal-backdrop" data-close></button><section class="compare-report"><button class="modal-close" data-close>${icons.close}</button><p class="eyebrow">AUTO-GENERATED COMPARISON</p><h2>商品透视对比</h2><p>基于公开页面字段生成，所有结论均可回溯到对应商品。</p><div class="compare-table"><div class="compare-row compare-head"><b>对比维度</b>${selected.map(p=>`<div><i style="background:${p.image}"></i><strong>${p.name}</strong><span>${p.brand}</span></div>`).join('')}</div>${fields.map(([name,get])=>`<div class="compare-row"><b>${name}</b>${selected.map(p=>`<span>${get(p) || '—'}</span>`).join('')}</div>`).join('')}</div><div class="report-insight"><span>AI 观察</span><p>${selected.sort((a,b)=>b.trend-a.trend)[0].name} 当前增长信号最强；${selected.sort((a,b)=>a.price-b.price)[0].name} 价格门槛最低。建议进一步验证广告投放强度与近 30 天价格变化。</p></div></section></div>`
}

function bindEvents() {
  document.querySelectorAll('[data-mode]').forEach(button => button.addEventListener('click', () => { state.mode = button.dataset.mode; render() }))
  document.querySelector('[data-home-reset]')?.addEventListener('click', e => {
    if (!isStrategiesPage()) {
      e.preventDefault()
      sampleReportRequested = false
      resetIdle(true)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }
  })
  document.querySelector('[data-load-sample-report]')?.addEventListener('click', e => {
    if (isStrategiesPage()) return
    e.preventDefault()
    loadSampleReport()
  })
  document.querySelector('[data-contact-author]')?.addEventListener('click', () => { state.modal = { type: 'contact' }; render() })
  document.querySelector('#search-form')?.addEventListener('submit', e => { e.preventDefault(); runSearch(document.querySelector('#search-input').value) })
  document.querySelectorAll('[data-category]').forEach(b => b.onclick = () => { state.category = b.dataset.category; render() })
  document.querySelectorAll('[data-view]').forEach(b => b.onclick = () => { state.view = b.dataset.view; render() })
  document.querySelector('#sort-select')?.addEventListener('change', e => { state.sort = e.target.value; render() })
  document.querySelectorAll('.product-card button').forEach(btn => btn.onclick = () => handleProductAction(btn.closest('.product-card').dataset.id, btn.dataset.action))
  document.querySelectorAll('[data-strategy-id]').forEach(btn => btn.onclick = () => { state.activeStrategyId = btn.dataset.strategyId; render() })
  document.querySelectorAll('[data-close-strategy-drawer]').forEach(btn => btn.onclick = () => { state.activeStrategyId = null; render() })
  document.querySelectorAll('[data-sample-detail]').forEach(btn => btn.onclick = () => { state.modal = { type: 'detail', id: btn.dataset.sampleDetail }; render() })
  document.querySelectorAll('[data-zoom-image]').forEach(btn => btn.onclick = e => { e.preventDefault(); e.stopPropagation(); state.modal = { type: 'zoom', image: btn.dataset.zoomImage, title: btn.dataset.zoomTitle, url: btn.dataset.zoomUrl }; render() })
  document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => { state.modal = null; render() })
  document.querySelector('#clear-compare')?.addEventListener('click', () => { state.compare.clear(); render() })
  document.querySelector('#open-compare')?.addEventListener('click', () => { state.modal = {type:'compare'}; render() })
  document.querySelector('#reset-search')?.addEventListener('click', resetIdle)
  document.addEventListener('keydown', keyHandler, { once: true })
}

function keyHandler(e) {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); document.querySelector('#search-input')?.focus() }
  if (e.key === 'Escape' && state.modal) { state.modal = null; render() }
  else if (e.key === 'Escape' && state.activeStrategyId) { state.activeStrategyId = null; render() }
}

function handleProductAction(id, action) {
  const p = catalog.find(x => x.id === id)
  if (action === 'favorite') {
    state.favorites.has(id) ? state.favorites.delete(id) : state.favorites.add(id)
    localStorage.setItem('add-to-cart-cat-favorites', JSON.stringify([...state.favorites])); render(); showToast(state.favorites.has(id) ? '已加入收藏' : '已取消收藏')
  }
  if (action === 'compare') {
    if (state.compare.has(id)) state.compare.delete(id)
    else if (state.compare.size < 3) state.compare.add(id)
    else return showToast('最多同时对比 3 件商品')
    render()
  }
  if (action === 'detail') { state.modal = {type:'detail', id}; render() }
}

async function loadSampleReport() {
  if (sampleReportRequested || isStrategiesPage() || state.loading || state.journeyLoading) return
  sampleReportRequested = true
  state.loading = true
  state.processStartedAt = Date.now()
  state.error = ''
  render()
  try {
    const response = await fetch(`${apiPath('analyze')}?url=${encodeURIComponent(SAMPLE_REPORT_URL)}&mode=${state.mode}`)
    const payload = await readJsonResponse(response, '示例报告暂时返回了非标准数据，请稍后重试。')
    if (!response.ok || payload.error) throw new Error(payload.error || '示例报告加载失败')
    catalog = payload.products
    storeMap = { [payload.store.id]: payload.store }
    state.dataMode = 'live'
    state.sourceUrl = payload.store.sourceUrl
    state.category = '全部品类'
    state.compare.clear()
    state.query = ''
  } catch (error) {
    state.error = error.message
  } finally {
    state.loading = false
    state.processStartedAt = 0
    render()
  }
}

async function runSearch(value) {
  state.query = value.trim(); state.error = ''; state.journeyError = ''; state.journeyLoading = false
  if (!isUrl(state.query)) { resetIdle(false); state.query = value.trim(); state.error = '请输入有效的 Shopify 店铺或商品网址'; render(); return }
  state.loading = true; state.processStartedAt = Date.now(); render()
  try {
    const targetUrl = normalizeUrl(state.query)
    const response = await fetch(`${apiPath('analyze')}?url=${encodeURIComponent(targetUrl)}&mode=${state.mode}`)
    const payload = await readJsonResponse(response, '分析接口暂时返回了非标准数据，请稍后重试。')
    if (!response.ok || payload.error) throw new Error(payload.error || '分析失败')
    catalog = payload.products; storeMap = { [payload.store.id]: payload.store }
    state.dataMode = 'live'; state.sourceUrl = payload.store.sourceUrl; state.category = '全部品类'; state.compare.clear(); state.query = ''
    state.loading = false; state.journeyLoading = true; render()
    try {
      const sampleUrls = (payload.store?.coverage?.products || []).map(product => product.handle ? `${new URL(targetUrl).origin}/products/${product.handle}` : '').filter(Boolean).slice(0, 1)
      const journeyQuery = sampleUrls.length ? `&urls=${encodeURIComponent(sampleUrls.join('|'))}` : ''
      const journeyResponse = await fetch(`${apiPath('journey')}?url=${encodeURIComponent(targetUrl)}${journeyQuery}`)
      const journeyPayload = await readJsonResponse(journeyResponse, '购买路径验证暂时返回了非标准数据。')
      if (!journeyResponse.ok || journeyPayload.error) { const error = new Error(journeyPayload.error || '交互验证失败'); error.stage = journeyPayload.stage; error.elapsedMs = journeyPayload.elapsedMs; throw error }
      applyJourney(journeyPayload)
    } catch (journeyError) {
      state.journeyError = friendlyJourneyError(journeyError)
    }
  } catch (error) {
    catalog = []; storeMap = {}; state.compare.clear()
    state.error = error.message; state.dataMode = 'idle'; state.sourceUrl = ''
  }
  finally { state.loading = false; state.journeyLoading = false; state.processStartedAt = 0; render() }
}

function resetIdle(shouldRender = true) {
  sampleReportRequested = false
  catalog = []; storeMap = {}; state.dataMode = 'idle'; state.sourceUrl = ''; state.error = ''; state.journeyError = ''; state.journeyLoading = false; state.journeyExpanded = false; state.processStartedAt = 0; state.compare.clear(); state.category = '全部品类'
  if (shouldRender) { state.query = ''; render() }
}

function showToast(message) { requestAnimationFrame(() => { const t=document.querySelector('#toast'); if(!t)return; t.textContent=message; t.classList.add('show'); setTimeout(()=>t.classList.remove('show'),1600) }) }

render()
