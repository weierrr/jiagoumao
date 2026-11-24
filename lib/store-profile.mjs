// Only expose fields explicitly published by the storefront.
export function storeProfile(html, products, sourceUrl, productSourceUrl = sourceUrl) {
  const meta = key => {
    for (const tag of html.match(/<meta\b[^>]*>/gi) || []) {
      const attrs = Object.fromEntries([...tag.matchAll(/([\w:-]+)\s*=\s*["']([^"']*)["']/g)].map(m => [m[1].toLowerCase(), m[2]]))
      if (attrs.name === key || attrs.property === key) return attrs.content || ''
    }
    return ''
  }
  const clean = s => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
  const currency = (html.match(/Shopify\.currency\s*=\s*\{[^}]*["']active["']\s*:\s*["']([A-Z]{3})/) || [])[1] || (html.match(/["']priceCurrency["']\s*:\s*["']([A-Z]{3})/) || [])[1] || ''
  const prices = products.flatMap(p => p.price != null ? [Number(p.price) / 100] : (p.variants || []).map(v => Number(v.price))).filter(n => Number.isFinite(n) && n > 0)
  const theme = (html.match(/Shopify\.theme\s*=\s*(\{[^;]*\})/) || [])[1]
  let themeName = ''; try { themeName = JSON.parse(theme).name || '' } catch {}
  const domainPattern = '[a-z0-9][a-z0-9-]*\\.myshopify\\.com'
  const explicitDomain = (html.match(new RegExp(`Shopify\\.shop\\s*=\\s*["'](${domainPattern})["']`, 'i')) || [])[1]
  const jsonDomain = (html.match(new RegExp(`["'](?:myshopify_domain|shop_domain)["']\\s*:\\s*["'](${domainPattern})["']`, 'i')) || [])[1]
  const linkedDomains = [...new Set([...html.matchAll(/\bhref\s*=\s*["']([^"']+)["']/gi)].flatMap(match => {
    try {
      const target = new URL(clean(match[1]), sourceUrl)
      return /^[a-z0-9][a-z0-9-]*\.myshopify\.com$/i.test(target.hostname) ? [target.hostname.toLowerCase()] : []
    } catch { return [] }
  }))]
  const shopDomain = (explicitDomain || jsonDomain || (linkedDomains.length === 1 ? linkedDomains[0] : '')).toLowerCase()
  const shopDomainSource = explicitDomain ? 'Shopify.shop 公开配置' : jsonDomain ? '公开域名配置字段' : shopDomain ? '店铺公开链接（域名线索）' : ''
  const dates = field => products.map(p => p[field]).filter(date => typeof date === 'string' && Number.isFinite(Date.parse(date))).map(Date.parse)
  const updatedDates = dates('updated_at')
  const createdDates = dates('created_at')
  const publishedDates = dates('published_at')
  const latestProductUpdatedAt = updatedDates.length ? new Date(Math.max(...updatedDates)).toISOString() : null
  const earliestProductCreatedAt = createdDates.length ? new Date(Math.min(...createdDates)).toISOString() : null
  const earliestProductPublishedAt = publishedDates.length ? new Date(Math.min(...publishedDates)).toISOString() : null
  return { description: clean(meta('description') || meta('og:description')), name: clean(meta('og:site_name')), currency, themeName, shopDomain, shopDomainSource, shopDomainSourceUrl: sourceUrl, shopDomainCandidates: linkedDomains, latestProductUpdatedAt, earliestProductCreatedAt, earliestProductPublishedAt, productDateSourceUrl: productSourceUrl, productDateSampleCount: products.length, productUpdatedDateCount: updatedDates.length, productCreatedDateCount: createdDates.length, storeCreatedAt: null, estimatedMonthlySales: null, estimatedAnnualSales: null, priceRange: prices.length ? { min: Math.min(...prices), max: Math.max(...prices) } : null, scannedAt: new Date().toISOString(), profileSourceUrl: sourceUrl }
}
