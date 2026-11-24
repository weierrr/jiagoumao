// Service add-ons should not stand in for the merchandise shopping journey.
export function merchandiseProducts(products) {
  const merchandise = products.filter(product => !/shipping[ -]?protection|package[ -]?protection|extended warranty|运输保障|延保/i.test(`${product.title || ''} ${product.product_type || ''} ${product.handle || ''}`))
  return merchandise.length ? merchandise : products
}
