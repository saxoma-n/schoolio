// Stand-in for OpenRouter so E2E tests never need a real key.
import { createServer } from 'node:http'

const models = {
  data: [{ id: 'mock/model:free', name: 'Mock', context_length: 8192, pricing: { prompt: '0', completion: '0' }, architecture: { input_modalities: ['text'] } }],
}
const frame = (o) => `data: ${JSON.stringify(o)}\n\n`

createServer((req, res) => {
  if (req.method === 'GET' && req.url === '/api/v1/models') {
    res.writeHead(200, { 'Content-Type': 'application/json' })
    return res.end(JSON.stringify(models))
  }
  if (req.method === 'POST' && req.url === '/api/v1/chat/completions') {
    res.writeHead(200, { 'Content-Type': 'text/event-stream' })
    res.write(frame({ choices: [{ delta: { content: 'Hello' } }] }))
    res.write(frame({ choices: [{ delta: { content: ' from mock' } }] }))
    res.write(frame({ choices: [], usage: { prompt_tokens: 3, completion_tokens: 3 } }))
    return res.end('data: [DONE]\n\n')
  }
  res.writeHead(404).end()
}).listen(4010, '0.0.0.0')
