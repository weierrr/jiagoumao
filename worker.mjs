import http from 'node:http'
import { randomUUID } from 'node:crypto'
import { runInteractiveJourney } from './lib/journey.mjs'

const PORT = Number(process.env.PORT || process.env.WORKER_PORT || 8787)
const MAX_QUEUE = Number(process.env.WORKER_MAX_QUEUE || 2)
const JOB_TIMEOUT_MS = Number(process.env.WORKER_JOB_TIMEOUT_MS || 55000)
const JOB_TTL_MS = Number(process.env.WORKER_JOB_TTL_MS || 10 * 60 * 1000)
const jobs = new Map()
const queue = []
let active = 0

function json(res, status, body) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'access-control-allow-origin': '*' })
  res.end(JSON.stringify(body))
}

function pump() {
  while (active < 1 && queue.length) {
    const id = queue.shift()
    const job = jobs.get(id)
    if (!job) continue
    active += 1
    job.status = 'running'
    job.startedAt = Date.now()
    const controllers = job.urls.map(() => new AbortController())
    const task = Promise.allSettled(job.urls.map((url, index) => runInteractiveJourney(url, { signal: controllers[index].signal })))
    const timeout = setTimeout(() => controllers.forEach(controller => controller.abort()), JOB_TIMEOUT_MS)
    Promise.race([
      task,
      new Promise((_, reject) => setTimeout(() => reject(new Error('浏览器 Worker 执行超过 55 秒，已主动终止')), JOB_TIMEOUT_MS + 250))
    ])
      .then(runs => {
        const completed = runs.filter(run => run.status === 'fulfilled').map(run => run.value)
        if (!completed.length) throw runs[0]?.reason || new Error('浏览器实验失败')
        const findings = [...new Map(completed.flatMap(run => run.findings || []).map(item => [item.id, item])).values()]
        const sampleMatches = findings.map(item => ({ id: item.id, samples: completed.filter(run => (run.findings || []).some(found => found.id === item.id)).length }))
        job.result = { ...completed[0], findings, sampleCount: completed.length, sampleTotal: job.urls.length, sampleMatches, sampleRuns: completed.map(run => ({ product: run.product, status: run.status, durationMs: run.durationMs })) }
        job.status = 'completed'
      })
      .catch(error => { job.status = 'failed'; job.error = error.message || '浏览器实验失败'; console.error(`[job ${job.id}]`, error) })
      .finally(() => { clearTimeout(timeout); job.finishedAt = Date.now(); active -= 1; pump() })
  }
}

setInterval(() => {
  const cutoff = Date.now() - JOB_TTL_MS
  for (const [id, job] of jobs) {
    if (job.finishedAt && job.finishedAt < cutoff) jobs.delete(id)
  }
}, 60_000).unref()

function body(req) {
  return new Promise((resolve, reject) => {
    let raw = ''
    req.on('data', chunk => { raw += chunk; if (raw.length > 4096) reject(new Error('请求体过大')) })
    req.on('end', () => { try { resolve(JSON.parse(raw || '{}')) } catch { reject(new Error('请求 JSON 无效')) } })
    req.on('error', reject)
  })
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return json(res, 204, {})
  if (req.method === 'GET' && req.url === '/health') return json(res, 200, { ok: true, active, queued: queue.length })
  if (req.method === 'POST' && req.url === '/jobs') {
    try {
      const payload = await body(req)
      const urls = (payload.urls || [payload.url]).filter(url => /^https?:\/\//i.test(url)).slice(0, 3)
      if (!urls.length) return json(res, 400, { error: '请输入有效的公开店铺或商品 URL' })
      if (active + queue.length >= MAX_QUEUE) return json(res, 429, { error: '浏览器 Worker 当前繁忙，请稍后重试' })
      const id = randomUUID()
      jobs.set(id, { id, urls, status: 'queued', createdAt: Date.now() })
      queue.push(id); pump()
      return json(res, 202, { id, status: 'queued' })
    } catch (error) { return json(res, 400, { error: error.message }) }
  }
  const match = req.method === 'GET' && req.url.match(/^\/jobs\/([^/?#]+)$/)
  if (match) {
    const job = jobs.get(match[1])
    return job ? json(res, 200, job) : json(res, 404, { error: '任务不存在' })
  }
  return json(res, 404, { error: 'Not found' })
})

server.listen(PORT, () => console.log(`Browser worker listening on :${PORT}`))
