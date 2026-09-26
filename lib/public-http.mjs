import http from 'node:http'
import https from 'node:https'
import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

// Only globally routable addresses are accepted, including redirect destinations.
export function isPrivateAddress(address) {
  const ip = String(address).toLowerCase().replace(/^\[|\]$/g, '')
  if (isIP(ip) === 6) return !/^[23][0-9a-f]{3}:/.test(ip) || ip.startsWith('2001:db8:')
  if (isIP(ip) !== 4) return true
  const [a, b] = ip.split('.').map(Number)
  return a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0)) ||
    (a === 198 && (b === 18 || b === 19))
}

export async function validatePublicUrl(input, resolver = lookup) {
  const url = new URL(input)
  const host = url.hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('只支持 HTTP 或 HTTPS 地址')
  if (url.username || url.password || /(^|\.)(localhost|local|internal)$/.test(host)) throw new Error('不能分析本地或内网地址')
  const addresses = isIP(host) ? [{ address: host, family: isIP(host) }] : await resolver(host, { all: true })
  if (!addresses.length || addresses.some(record => isPrivateAddress(record.address))) throw new Error('不能分析本地或内网地址')
  return { url, addresses }
}

export function requestText(url, addresses, { accept, maxBytes, timeoutMs, signal }) {
  return new Promise((resolve, reject) => {
    // Pin the connection to the address that was checked, preventing a second
    // DNS resolution from changing a public destination into a private one.
    const chosen = addresses[0]
    const request = (url.protocol === 'https:' ? https : http).request(url, {
      signal,
      lookup: (_host, options, callback) => options.all
        ? callback(null, [chosen]) : callback(null, chosen.address, chosen.family),
      headers: { accept, 'accept-encoding': 'identity', 'user-agent': 'AddToCartCat/0.3 (public storefront research)' }
    }, response => {
      if ([301, 302, 303, 307, 308].includes(response.statusCode)) {
        response.resume()
        resolve({ status: response.statusCode, location: response.headers.location })
        return
      }
      if (response.statusCode < 200 || response.statusCode >= 300) {
        response.resume(); reject(new Error(`目标站点返回 ${response.statusCode}`)); return
      }
      if (Number(response.headers['content-length']) > maxBytes) {
        response.destroy(); reject(new Error('页面体积超过分析限制')); return
      }
      const chunks = []
      let size = 0
      response.on('data', chunk => {
        size += chunk.length
        if (size > maxBytes) { response.destroy(new Error('页面体积超过分析限制')); return }
        chunks.push(chunk)
      })
      response.on('error', reject)
      response.on('end', () => resolve({ status: response.statusCode, body: Buffer.concat(chunks).toString('utf8'), contentType: response.headers['content-type'] || '' }))
    })
    const timer = setTimeout(() => request.destroy(new Error('目标站点读取超时')), timeoutMs)
    request.on('close', () => clearTimeout(timer))
    request.on('error', reject)
    request.end()
  })
}

export async function safeFetch(input, accept = 'text/html,application/json', options = {}) {
  const { resolver = lookup, transport = requestText, maxBytes = 4 * 1024 * 1024, timeoutMs = 12000, signal } = options
  let current = input
  for (let redirects = 0; redirects <= 5; redirects += 1) {
    const { url, addresses } = await validatePublicUrl(current, resolver)
    const response = await transport(url, addresses, { accept, maxBytes, timeoutMs, signal })
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      if (!response.location) throw new Error('目标站点返回了无效跳转')
      current = new URL(response.location, url).href
      continue
    }
    return { url, body: response.body, contentType: response.contentType || '' }
  }
  throw new Error('目标站点跳转次数过多')
}
