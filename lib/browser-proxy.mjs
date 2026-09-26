import http from 'node:http'
import https from 'node:https'
import net from 'node:net'
import { validatePublicUrl } from './public-http.mjs'

// Chromium resolves through this local proxy; each HTTP request / TLS tunnel
// connects to the public IP we checked, including redirected subresources.
export async function createPublicProxy() {
  const sockets = new Set()
  const track = socket => { sockets.add(socket); socket.once('close', () => sockets.delete(socket)); return socket }
  const server = http.createServer(async (req,res) => {
    try {
      const {url,addresses} = await validatePublicUrl(req.url)
      const chosen = addresses[0]
      const headers = {...req.headers}
      delete headers['proxy-authorization']; delete headers['proxy-connection']
      const upstream = (url.protocol === 'https:' ? https : http).request(url, {
        method:req.method,headers,
        lookup:(_host,options,callback) => options.all ? callback(null,[chosen]) : callback(null,chosen.address,chosen.family)
      }, response => { res.writeHead(response.statusCode,response.headers); response.pipe(res) })
      upstream.setTimeout(20000, () => upstream.destroy(new Error('浏览器代理读取超时')))
      upstream.on('error', () => { if (!res.headersSent) res.writeHead(502); res.end() })
      req.on('aborted', () => upstream.destroy())
      req.pipe(upstream)
    } catch { res.writeHead(403); res.end('Destination blocked') }
  })
  server.on('connection',track)
  server.on('connect',async (req,client,head) => {
    try {
      const {url,addresses} = await validatePublicUrl(`https://${req.url}`)
      const upstream = track(net.connect({host:addresses[0].address,port:Number(url.port || 443),family:addresses[0].family}))
      upstream.setTimeout(20000, () => upstream.destroy())
      upstream.once('connect', () => { client.write('HTTP/1.1 200 Connection Established\r\n\r\n'); if (head.length) upstream.write(head); upstream.pipe(client); client.pipe(upstream) })
      upstream.on('error', () => client.destroy())
      client.on('error', () => upstream.destroy())
      client.once('close', () => upstream.destroy())
      upstream.once('close', () => client.destroy())
    } catch { client.end('HTTP/1.1 403 Forbidden\r\n\r\n') }
  })
  await new Promise((resolve,reject) => { server.once('error',reject); server.listen(0,'127.0.0.1',resolve) })
  return { url:`http://127.0.0.1:${server.address().port}`, close:() => new Promise(resolve => { for (const socket of sockets) socket.destroy(); server.close(resolve) }) }
}
