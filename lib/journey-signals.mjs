const rules = [
  ['free-shipping','满额免邮',/free shipping.{0,35}(over|orders|above|[$€£])|spend.{0,35}(more|away).{0,30}(shipping|delivery)|满.{0,15}(免邮|免运费)/i],
  ['bundle','套装 / 组合购买',/build a (box|set)|shop the set|bundle|套装|组合购买/i],
  ['quantity-break','多件折扣 / 阶梯价',/buy (2|3|two|three).{0,30}(save|get)|quantity discount|volume discount|阶梯折扣/i],
  ['subscription','订阅省钱',/subscribe.{0,40}(save|discount)|subscription plan|定期购|订阅省/i],
  ['gift-threshold','满额赠品',/gift with purchase|free gift.{0,30}(order|over)|unlock.{0,30}gift|满赠/i],
  ['cart-progress','购物车进度条',/spend.{0,40}(more|away)|add.{0,30}(more|to unlock)|还差.{0,30}(免邮|赠品)/i],
  ['checkout-upsell','结账页追加购买',/add to your order|order bump|checkout offer|结账追加/i]
]
const snippet = (text, pattern) => { const position = text.search(pattern); return text.slice(Math.max(0,position - 60),position + 180).replace(/\s+/g,' ').trim() }

export function detectJourneySignals(snapshot, step, context = {}) {
  const text = String(snapshot.text || '')
  const cartStage = ['加购后','购物车','数量变更后'].includes(step)
  const findings = rules.flatMap(([id,name,pattern]) => {
    if (['gift-threshold','cart-progress'].includes(id) && !cartStage) return []
    if (id === 'checkout-upsell' && step !== '结账入口') return []
    if (!pattern.test(text)) return []
    return [{ id,name,step,evidence:snippet(text,pattern),sourceUrl:snapshot.url,verified:false,evidenceType:'浏览器可见文案' }]
  })
  const add = (id,name,evidence,verified = false) => findings.push({id,name,step,evidence,verified,sourceUrl:snapshot.url,evidenceType:verified ? '动作触发的模块' : '浏览器模块结构'})
  if (snapshot.recommendationText) add('product-recs','商品相关推荐',snapshot.recommendationText.slice(0,250))
  if (/frequently bought together|often bought together|经常一起购买/i.test(snapshot.recommendationText || '')) add('frequently-bought','经常一起购买',snapshot.recommendationText.slice(0,250))
  if (cartStage && snapshot.cartRecommendationButton) add('cart-upsell','购物车一键加购',snapshot.cartRecommendationText?.slice(0,250) || '购物车推荐商品模块内有可用加购按钮；未执行推荐品加购。')
  if (step === '加购后' && snapshot.drawerVisible) add('cart-drawer','购物车抽屉 / 加购后推荐',snapshot.drawerText?.slice(0,250) || '加购后出现可见购物车抽屉。', Boolean(context.added && snapshot.drawerReady && !context.drawerBefore))
  return findings
}
