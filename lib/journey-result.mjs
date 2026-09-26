export function aggregateJourneys(urls, runs) {
  const successful = runs.flatMap((run,index) => run.status === 'fulfilled' ? [{ ...run.value, sampleUrl: urls[index] }] : [])
  if (!successful.length) throw runs.find(run => run.status === 'rejected')?.reason || new Error('没有完成可读取的商品检查')
  const sampleRuns = runs.map((run,index) => run.status === 'fulfilled'
    ? { url:urls[index], product:run.value.product, status:run.value.status, durationMs:run.value.durationMs, steps:run.value.steps, unconfirmed:run.value.unconfirmed || [] }
    : { url:urls[index], status:'failed', error:run.reason?.message || '验证失败', stage:run.reason?.journeyStage || '未知阶段' })
  const byId = new Map()
  for (const run of successful) {
    for (const finding of run.findings || []) {
      const item = { ...finding, sampleUrl:run.sampleUrl, sourceUrl:finding.sourceUrl || run.steps?.find(step => step.label === finding.step)?.url || run.sampleUrl }
      const previous = byId.get(item.id)
      if (!previous || (item.verified && !previous.verified)) byId.set(item.id, item)
    }
  }
  const findings = [...byId.values()]
  const unconfirmed = [...new Set(successful.flatMap(run => (run.unconfirmed || []).map(item => item.id)))].map(id => ({
    id,
    reason: successful.flatMap(run => (run.unconfirmed || []).filter(item => item.id === id).map(item => `${run.product?.title || run.sampleUrl}：${item.reason}`)).join('；')
  }))
  return {
    ...successful[0],
    status: sampleRuns.every(run => run.status === 'completed') ? 'completed' : 'partial',
    findings, unconfirmed, sampleRuns,
    sampleCount: successful.length, sampleTotal:urls.length,
    steps:successful.flatMap(run => (run.steps || []).map(step => ({ ...step, sampleUrl:run.sampleUrl, sampleTitle:run.product?.title }))),
    sampleMatches:findings.map(item => ({ id:item.id, samples:successful.filter(run => (run.findings || []).some(found => found.id === item.id)).length }))
  }
}
