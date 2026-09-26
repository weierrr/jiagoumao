import http from 'node:http'
import { randomUUID } from 'node:crypto'
import { runInteractiveJourney } from './lib/journey.mjs'
import { aggregateJourneys } from './lib/journey-result.mjs'

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
    const budget = Math.max(1,Math.min(JOB_TIMEOUT_MS,job.deadline - Date.now() - 2000))
    const timeout = setTimeout(() => controllers.forEach(controller => controller.abort()), budget)
    let deadline
    Promise.race([
      task,
      new Promise((_, reject) => { deadline = setTimeout(() => reject(new Error('浏览器 Worker 执行超时，已主动终止')), budget + 2000) })
    ])
      .then(runs => {
        job.result = aggregateJourneys(job.urls, runs)
        job.status = 'completed'
      })
      .catch(error => { job.status = 'failed'; job.error = error.message || '浏览器实验失败'; console.error(`[job ${job.id}]`, error) })
      .finally(() => { clearTimeout(timeout); clearTimeout(deadline); job.finishedAt = Date.now(); active -= 1; pump() })
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
    req.on('data', chunk => { raw += chunk; if (raw.length > 4096) { req.pause(); reject(new Error('请求体过大')) } })
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
      const deadline = Math.min(Number(payload.deadline) || Date.now() + JOB_TIMEOUT_MS,Date.now() + JOB_TIMEOUT_MS)
      if (deadline <= Date.now()) return json(res,400,{error:'任务等待时间已过期，请重试'})
      jobs.set(id, { id, urls, deadline, status: 'queued', createdAt: Date.now() })
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
