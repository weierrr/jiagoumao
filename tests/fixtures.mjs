import { analyzeShopify } from '../lib/analyze.mjs'
const rawProduct = (id,price) => ({id,title:`Item ${id}`,handle:`item-${id}`,variants:[{id:id*10,price:String(price),compare_at_price:String(price),available:true}]})
export async function fixtureAnalysis({ ajax = false, failHigh = false, unknownCurrency = false } = {}) {
  const requests = []
  const origin = 'https://fixture.example'
  const fetchPage = async input => {
    requests.push(input)
    let body = '<title>Fixture</title><div class="shopify-section">Find Your Fit. Premium fabric. Regular price £49 Sale price £49. Subscribe to our newsletter.</div>'
    if (input.includes('products.json')) body = JSON.stringify({products:[rawProduct(1,19),rawProduct(2,49),rawProduct(3,99)]})
    if (input.endsWith('/item-2.js')) body = JSON.stringify({...rawProduct(2,4900),price:4900})
    if (input.endsWith('/cart.js')) body = JSON.stringify({currency:unknownCurrency ? null : 'GBP'})
    if (input.endsWith('/products/item-1')) body += '<section>Frequently bought together</section>'
    if (failHigh && input.endsWith('/products/item-3')) throw new Error('Fixture page unavailable')
    return {url:new URL(input),body}
  }
  return {requests,...await analyzeShopify(`${origin}${ajax ? '/products/item-2' : '/'}`,{fetchPage})}
}

