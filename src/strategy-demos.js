const preview = 'https://1jqt0g-4z.myshopify.com/?preview_theme_id=187973861412'

export const formwinkDemos = {
  'sticky-add': {
    status: '悬浮加购已验证', page: '商品页', anchor: '',
    summary: '滚过商品购买区后，底部显示当前款式、价格和加购按钮；手机也显示文字按钮及所选数量，到页尾自动隐藏。',
    triggers: ['打开壁灯商品预览，选择 Blue-wall switch 和 Cold Light。', '把数量改为 2，向下滚过购买区。', '点击底部 Add to cart (2)，核对抽屉中的款式、数量与金额。'],
    verification: '2026-10-13：款式切换后同步为 Blue-wall switch / Cold Light、US$48.35，数量同步为 2。桌面加购新增 US$96.70，总额 US$337.30；390×844 手机再次新增 2 件后，总额 US$434.00，顶部数量为 10。页尾隐藏已检查。',
    method: 'Horizon 原生悬浮加购栏 + 主题状态与手机布局修正，无需 App',
    steps: ['主题编辑器 → 商品 → 默认商品 → Product information，开启 Sticky add to cart。', '沿用商品页原生款式与数量选择，悬浮栏自动同步。', '滚过主购买区后显示，接近页尾隐藏；手机保留文字按钮和底部安全区。', '请求期间禁止重复点击，成功后才显示加入成功反馈；无效款式和售罄按钮不可加购。'],
    next: '先观察移动端商品页加购率和误触率，再评估是否需要在悬浮栏加入返回选款入口。',
    metrics: '移动端商品页加购率、悬浮栏点击率、误触率、结账完成率',
    limitation: '草稿主题中验证；未验证真实售罄商品 UI、慢网或断网下的原生商品表单。此演示不包含优惠。'
  },
  'quantity-break': {
    status: '部分验证 · 数量加购', page: '商品页', anchor: '',
    summary: '数量选择可真实加购，但阶梯优惠尚未配置；加入 2 件不代表会获得折扣。',
    triggers: ['打开预览，选择壁灯款式。', '在壁灯商品页数量控件选择 2，再点击 Add to cart。', '检查购物车数量与金额；不要提交订单。'],
    verification: '2026-10-13：选择 2 件后成功加入真实购物车，合计 US$110.34。未配置或验证任何数量折扣。',
    method: '主题数量控件；折扣规则需另行配置',
    steps: ['在默认商品模板保留原生数量控件，确认所选变体可售。', '数量控件遵循商品数量规则，购物车按真实变体价格计费。', '确定折扣适用商品、数量档位和毛利后，再选择后台折扣或数量折扣 App。', '对测试商品验证单件、达标件数、减少数量及优惠叠加后的结账金额。'],
    next: '先确认壁灯是否有双侧安装需求；若有，测试双件购买入口。优惠需在毛利允许时单独验证。',
    metrics: '平均订单件数、双件选择率、折后客单价、毛利、结账完成率',
    limitation: '数量加购已验证，折扣未验证。当前测试会在浏览器真实购物车中累加商品。'
  },
  bundle: {
    status: '组合加购已验证', page: '商品页 / 场景页', anchor: 'shop-the-room',
    summary: '壁灯、挂钟和杯架可一次加入真实购物车，按各商品价格分别计费，不包含套装折扣。',
    triggers: ['打开预览，分别选择壁灯、挂钟与杯架款式。', '点击「Add all three to cart」。', '打开购物车，核对三件商品的款式、数量及小计。'],
    verification: '2026-10-13：Shop the room 选择 Blue-wall switch / Cold Light 壁灯，整套价格从 US$75.09 同步为 US$68.27。真实加购新增 3 件，购物车从 3 件 US$75.09 到 6 件 US$143.36；移除本轮新增商品后恢复原状态。',
    method: '主题批量加购；正式库存型套装可选择 Shopify Bundles',
    steps: ['已配置壁灯、挂钟与杯架，三件商品均已发布到 Online Store。', '主题编辑器 → Shop the room → 编辑 Room product 区块，可替换搭配商品，最多三件。', '为每件商品选择可售变体，核对整套加入后的明细和数量。', '当前为分别计价的多商品加购；正式套装库存和优惠需要独立方案并验证。'],
    next: '先测试一个明确场景的固定组合；结合搭配相关性、加购率与毛利，再决定是否提供套装优惠。',
    metrics: '组合曝光后的选择率、整套加购率、平均件数、毛利、结账完成率',
    limitation: '批量加购不等于 Shopify 库存型 Bundle，也不自带折扣。售罄、并发库存与结账尚未验证。'
  },
  'cart-upsell': {
    status: '抽屉推荐已验证', page: '购物车抽屉', anchor: 'shop-the-room',
    summary: '真实购物车抽屉中推荐杯架，可选择颜色并一键加入。商品已在购物车时不重复推荐，数量、金额与顶部徽标同步更新。',
    triggers: ['打开预览，加入壁灯或打开顶部购物车。', '若购物车中已有杯架，先移除该测试商品，查看列表下方推荐。', '选择颜色并点击 Add to cart，核对变体、金额与顶部数量。'],
    verification: '2026-10-13：抽屉选择 blue 杯架后新增 1 件 US$10.44，总额从 US$174.99 到 US$185.43，顶部与抽屉数量均为 5。组合加购后同步到 8 件 US$260.52；移除后同步更新。390×844 手机尺寸下已检查推荐、选择和结账布局，并再次真实加购成功。',
    method: '主题原生购物车抽屉 + 自定义推荐组件，无需安装 App',
    steps: ['主题编辑器 → 主题设置 → FormWink cart recommendation，选择配套商品；当前为杯架。', '主题设置 → 购物车，使用抽屉并启用加购后自动打开。', '推荐品售罄、未选择商品、空购物车或商品已经加入时，不展示推荐卡。', '在抽屉选择颜色并加购，检查真实商品明细、价格、数量；再减量和移除核对同步。'],
    next: '先保留一个互补推荐，记录曝光与点击，再比较有无推荐的加购率及结账完成率。',
    metrics: '推荐曝光后的加购率、推荐收入、客单价、毛利、购物车至结账完成率',
    limitation: '仅在未发布主题验证交互，未提交订单、未验证经营收益。售罄和网络失败有防护，尚未完成真实售罄与断网测试。'
  },
  'cart-drawer': {
    status: '抽屉同步已验证', page: '购物车', anchor: 'shop-the-room',
    summary: '加购后自动打开原生购物车抽屉，商品、金额与顶部数量同步。保留关闭、改数量、移除和结账入口。',
    triggers: ['预览中点击 Add all three to cart。', '核对自动打开的抽屉、顶部数量和商品明细。', '修改数量或移除商品，再检查金额与顶部数量。'],
    verification: '2026-10-13：组合新增 3 件 US$75.09 后，顶部与抽屉同步为 8 件 US$260.52。杯架移除后回到 6 件 US$239.64，推荐重新出现；手机抽屉推荐加购后为 7 件 US$250.08。',
    method: '主题原生购物车抽屉与标准购物车更新事件',
    steps: ['主题设置 → 购物车 → 抽屉。', '开启加购后自动打开购物车抽屉。', '选择 FormWink cart recommendation 商品，推荐显示在商品列表下方。', '在预览核对单件、组合、推荐、减量与移除后的同步状态。'],
    next: '保持结账入口突出；后续把真实配送规则接入进度条，再评估推荐是否影响结账完成率。',
    metrics: '加购至结账率、抽屉推荐加购率、平均订单金额、毛利',
    limitation: '未发布主题；没有配置真实免邮、数量折扣或完成订单。'
  }
}

export function formwinkPreviewUrl(id) {
  const demo = formwinkDemos[id]
  if (id === 'sticky-add' || id === 'quantity-break') return 'https://formwink.com/products/blue-red-wall-lights-memphis-design-living-room-wall-lamps-acrylic-sconce-colorful-decorative-bedroom-bedside-light-for-study?preview_theme_id=187973861412'
  return demo ? `${preview}#${demo.anchor}` : null
}
