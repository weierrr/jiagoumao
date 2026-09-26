import { analyzeShopify } from '../lib/analyze.mjs'

export default async function handler(req, res) {
  res.setHeader('cache-control', 'no-store')
  try {
    const input = Array.isArray(req.query?.url) ? req.query.url[0] : req.query?.url
    if (!input || input.length > 2048) return res.status(400).json({ error:'请输入有效的 Shopify 店铺或商品 URL' })
    return res.status(200).json(await analyzeShopify(input))
  } catch (error) { return res.status(422).json({ error:error.message || '分析失败' }) }
}
