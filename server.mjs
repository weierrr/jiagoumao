import http from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createServer as createViteServer } from 'vite'
import analyzeHandler from './api/analyze.mjs'
import journeyHandler from './api/journey.mjs'
export { analyzeShopify } from './lib/analyze.mjs'

const PORT = Number(process.env.PORT || 5173)
const production = process.env.NODE_ENV === 'production'
async function startServer() {
const vite = production ? null : await createViteServer({ server: { middlewareMode: true }, appType: 'spa' })
const server = http.createServer(async (req, res) => {
  const route = new URL(req.url, `http://${req.headers.host}`)
  const endpoint = route.pathname.replace(/^\/jiagoumao/, '')
  if (endpoint === '/api/analyze' || endpoint === '/api/journey') {
    req.query = Object.fromEntries(route.searchParams)
    res.status = code => { res.statusCode = code; return res }
    res.json = payload => { res.setHeader('content-type','application/json; charset=utf-8'); res.end(JSON.stringify(payload)); return res }
    await (endpoint === '/api/analyze' ? analyzeHandler : journeyHandler)(req,res)
    return
  }
  if (vite) return vite.middlewares(req,res,()=>{ res.statusCode=404; res.end('Not found') })
  try {
    const pathname = new URL(req.url, `http://${req.headers.host}`).pathname
    const relative = pathname === '/' ? 'index.html' : normalize(pathname).replace(/^[/\\]+/,'')
    const file = join(process.cwd(),'dist',relative); await stat(file)
    const types = {'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg'}
    res.writeHead(200, {'content-type':`${types[extname(file)] || 'application/octet-stream'}; charset=utf-8`}); res.end(await readFile(file))
  } catch { res.writeHead(200, {'content-type':'text/html; charset=utf-8'}); res.end(await readFile(join(process.cwd(),'dist/index.html'))) }
})
server.listen(PORT, '0.0.0.0', () => console.log(`加购猫运行于 http://127.0.0.1:${PORT}`))
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  startServer()
}
