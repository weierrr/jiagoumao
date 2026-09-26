import { refreshReport } from './strategy-meta.mjs'

export function applyJourneyToReport(report, journey) {
  const findings = new Map((journey.findings || []).map(item => [item.id,item]))
  const unconfirmed = new Map((journey.unconfirmed || []).map(item => [item.id,item.reason]))
  const sampleMatches = new Map((journey.sampleMatches || []).map(item => [item.id,item.samples]))
  report.strategies = report.strategies.map(strategy => {
    const finding = findings.get(strategy.id)
    const limit = unconfirmed.get(strategy.id)
    if (finding) return {
      ...strategy, status:finding.verified ? '已验证' : '已观察到',
      evidenceLevel:finding.verified ? '行为证据' : '浏览器观察',
      evidenceTypes:[finding.evidenceType || '浏览器可见文案'],
      evidence:finding.evidence,sourceEvidence:finding.evidence,sourceStep:finding.step,
      sourceUrl:finding.sourceUrl || finding.sampleUrl || '',
      evidenceImage:finding.image || '',
      coverage:[finding.step],sampleHits:sampleMatches.get(strategy.id) || 1,sampleTotal:journey.sampleTotal || 1,
      limitation:limit || ''
    }
    if (limit) return { ...strategy,status:'无法确认',evidenceLevel:'未验证',evidence:limit }
    return strategy
  })
  refreshReport(report)
  const failed = (journey.sampleRuns || []).filter(item => item.status === 'failed').length
  report.summary = `共观察到 ${report.foundCount} / ${report.total} 类策略，其中 ${report.verifiedCount} 类有行为验证；返回 ${journey.sampleCount || 1} / ${journey.sampleTotal || 1} 个商品检查结果${failed ? `，${failed} 个检查失败` : ''}。`
  return report
}

export function formatMoney(value, currency) {
  if (!Number.isFinite(Number(value))) return '价格未公开'
  const amount = Number(value).toLocaleString('zh-CN', {maximumFractionDigits:2})
  return /^[A-Z]{3}$/.test(currency || '') ? `${currency} ${amount}` : `${amount}（币种未知）`
}
