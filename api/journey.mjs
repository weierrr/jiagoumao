import { runInteractiveJourney } from '../lib/journey.mjs'

export const config = { maxDuration: 60 }

async function runOnWorker(urls) {
  const base = String(process.env.BROWSER_WORKER_URL || '').replace(/\/$/, '')
  if (!base) return null
  const requestSignal = AbortSignal.timeout(8000)
  const created = await fetch(`${base}/jobs`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ urls }), signal: requestSignal })
  if (!created.ok) throw new Error((await created.text()).slice(0, 240) || '浏览器 Worker 创建任务失败')
  const { id } = await created.json()
  const deadline = Date.now() + 54000
  while (Date.now() < deadline) {
    await new Promise(resolve => setTimeout(resolve, 900))
    const response = await fetch(`${base}/jobs/${id}`, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(5000) })
    const job = await response.json()
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
          reject(new Error(`${label}验证超时，浏览器会话已关闭`))
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
    const workerResult = await runOnWorker(urls)
    if (workerResult) return res.status(200).json(workerResult)
    const perSampleTimeout = urls.length === 1 ? 48000 : 28000
    const runs = await Promise.allSettled(urls.map((url, index) => runWithTimeout(url, perSampleTimeout, `第 ${index + 1} 个商品`)))
    const completed = runs.filter(run => run.status === 'fulfilled').map(run => run.value)
    if (!completed.length) {
      const reason = runs.find(run => run.status === 'rejected')?.reason
      throw reason || new Error('交互式购物流程诊断失败')
    }
    const findings = [...new Map(completed.flatMap(run => run.findings || []).map(item => [item.id, item])).values()]
    const sampleMatches = findings.map(item => ({ id: item.id, samples: completed.filter(run => (run.findings || []).some(found => found.id === item.id)).length }))
    const sampleRuns = urls.map((url, index) => {
      const run = runs[index]
      return run.status === 'fulfilled'
        ? { product: run.value.product, status: run.value.status, durationMs: run.value.durationMs }
        : { url, status: 'failed', error: run.reason?.message || '该商品验证失败', stage: run.reason?.journeyStage || '未知阶段', elapsedMs: run.reason?.journeyElapsedMs || null }
    })
    return res.status(200).json({ ...completed[0], findings, sampleCount: completed.length, sampleTotal: urls.length, sampleMatches, sampleRuns })
  } catch (error) {
    return res.status(422).json({ error: error.message || '交互式购物流程诊断失败', stage: error.journeyStage || '', elapsedMs: error.journeyElapsedMs || null })
  }
}
