import { runInteractiveJourney } from '../lib/journey.mjs'
import { aggregateJourneys } from '../lib/journey-result.mjs'
import { validatePublicUrl } from '../lib/public-http.mjs'

export const config = { maxDuration: 60 }

async function runOnWorker(urls) {
  const base = String(process.env.BROWSER_WORKER_URL || '').replace(/\/$/, '')
  if (!base) return null
  const deadline = Date.now() + 54000
  const requestSignal = AbortSignal.timeout(8000)
  const created = await fetch(`${base}/jobs`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ urls, deadline }), signal: requestSignal })
  if (!created.ok) throw new Error((await created.text()).slice(0, 240) || '浏览器 Worker 创建任务失败')
  const { id } = await created.json()
  while (Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 900))
    const remaining = deadline - Date.now()
    if (remaining <= 0) break
    const response = await fetch(`${base}/jobs/${id}`, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(Math.min(5000,remaining)) })
    const job = await response.json()
    if (!response.ok) throw new Error(job.error || '浏览器 Worker 任务读取失败')
    if (job.status === 'completed') return job.result
    if (job.status === 'failed') throw new Error(job.error || '浏览器 Worker 执行失败')
  }
  throw new Error('浏览器 Worker 等待超时')
}

async function runWithTimeout(url, ms, label) {
  const controller = new AbortController()
  let timer
  try {
    return await Promise.race([
      runInteractiveJourney(url, { signal: controller.signal }),
      new Promise((_, reject) => {
        timer = setTimeout(() => {
          controller.abort()
          timer = setTimeout(() => reject(new Error(`${label}验证超时，浏览器会话已关闭`)), 2000)
        }, ms)
      })
    ])
  } finally {
    clearTimeout(timer)
  }
}

export default async function handler(req, res) {
  try {
    const input = Array.isArray(req.query?.url) ? req.query.url[0] : req.query?.url
    if (!input || input.length > 2048) return res.status(400).json({ error: '请输入有效的 Shopify 店铺或商品 URL' })
    res.setHeader('cache-control', 'no-store')
    const urls = String(req.query?.urls || input).split('|').map(value => value.trim()).filter(Boolean).slice(0, 3)
    if (urls.some(url => url.length > 2048)) return res.status(400).json({error:'商品网址过长'})
    await Promise.all(urls.map(url => validatePublicUrl(url)))
    const workerResult = await runOnWorker(urls)
    if (workerResult) return res.status(200).json(workerResult)
    const perSampleTimeout = 48000
    const runs = await Promise.allSettled(urls.map((url, index) => runWithTimeout(url, perSampleTimeout, `第 ${index + 1} 个商品`)))
    return res.status(200).json(aggregateJourneys(urls, runs))
  } catch (error) {
    return res.status(422).json({ error: error.message || '交互式购物流程诊断失败', stage: error.journeyStage || '', elapsedMs: error.journeyElapsedMs || null })
  }
}
