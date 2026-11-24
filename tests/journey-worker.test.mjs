import test from 'node:test'
import assert from 'node:assert/strict'
import { runOnWorker } from '../api/journey.mjs'
import { merchandiseProducts } from '../lib/product-sampling.mjs'
process.env.BROWSER_WORKER_URL = 'https://worker.example'
test('removed worker falls back without leaking infrastructure body', async () => {
  assert.equal(await runOnWorker(['https://formwink.com/'], async () => new Response('Application not found', { status: 404 })), null)
})
test('network failure falls back', async () => {
  assert.equal(await runOnWorker(['https://formwink.com/'], async () => { throw new Error('offline') }), null)
})
test('busy worker does not create another concurrent browser session', async () => {
  await assert.rejects(runOnWorker(['https://formwink.com/'], async () => new Response('', { status: 429 })), /繁忙/)
})
test('invalid job contract is rejected', async () => {
  await assert.rejects(runOnWorker(['https://formwink.com/'], async () => Response.json({})), /无效任务/)
})
test('merchandise sampling excludes protection while retaining service-only stores', () => {
  const service = { title: 'Shipping Protection' }, lamp = { title: 'Wall Light' }
  assert.deepEqual(merchandiseProducts([service, lamp]), [lamp])
  assert.deepEqual(merchandiseProducts([service]), [service])
})
