const stages = {
  'free-shipping':'购物车', 'bundle':'商品页', 'quantity-break':'商品页', 'subscription':'商品页',
  'product-recs':'商品页', 'frequently-bought':'商品页', 'cart-drawer':'购物车', 'gift-threshold':'购物车',
  'upsell-upgrade':'商品页', 'social-proof':'商品页', 'discount-code':'首页', 'free-gift-card':'商品页',
  'cart-progress':'购物车', 'cart-upsell':'购物车', 'post-purchase':'购买后', 'checkout-upsell':'结账',
  'sticky-add':'商品页', 'compare-at':'商品页', 'limited-time':'商品页', 'low-stock':'商品页',
  'membership':'复购', 'free-returns':'商品页', 'gift-wrap':'购物车', 'personalization':'商品页',
  'quiz-recommendation':'商品页', 'social-share':'复购', 'landing-bundle':'商品页', 'back-in-stock':'复购'
}
const native = new Set(['free-shipping','discount-code','compare-at','free-gift-card','free-returns','product-recs','landing-bundle'])
const theme = new Set(['sticky-add','cart-drawer','cart-progress','upsell-upgrade','low-stock','limited-time'])
const high = new Set(['free-shipping','product-recs','frequently-bought','bundle','cart-upsell'])
const advanced = new Set(['checkout-upsell','post-purchase','personalization','quiz-recommendation','membership'])

export function strategyMeta(id) {
  const needsApp = native.has(id) ? '无需 App' : theme.has(id) ? '视主题而定' : '可选 App'
  const difficulty = advanced.has(id) ? '较高' : native.has(id) ? '低' : '中'
  return {
    page: stages[id] || '商品页', needsApp, difficulty,
    needsDevelopment: theme.has(id) ? '视主题而定' : '通常无需',
    readiness: advanced.has(id) ? '先确认条件' : '可开始配置',
    priority: high.has(id) ? '高' : advanced.has(id) ? '低' : '中',
    impact: ['social-proof','free-returns','sticky-add','quiz-recommendation'].includes(id) ? '减少购买阻力' : '增加连带购买机会'
  }
}

export const normalizeStatus = status => ({ '已发现':'有线索', '未发现':'未观察到' }[status] || status)

export function refreshReport(report) {
  report.strategies = report.strategies.map(item => ({ ...strategyMeta(item.id), ...item, status: normalizeStatus(item.status) }))
  report.foundCount = report.strategies.filter(item => ['已验证','已观察到','有线索'].includes(item.status)).length
  report.verifiedCount = report.strategies.filter(item => item.status === '已验证').length
  const order = { '高': 0, '中': 1, '低': 2 }
  report.opportunities = report.strategies.filter(item => item.status === '未观察到')
    .sort((a,b) => order[a.priority] - order[b.priority]).slice(0,5)
  return report
}
