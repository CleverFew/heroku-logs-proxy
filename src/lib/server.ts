import auth from 'basic-auth'
import { createServer } from 'node:http'
import { batchSendMessages } from './batching'
import { parseMessages } from './parsing'

const USERNAME = process.env.LOGS_USERNAME ?? 'user'
const PASSWORD = process.env.LOGS_PASSWORD ?? 'pass'

export const herokuLogsProxyServer = createServer((req, res) => {
  const credentials = auth(req)
  if(!credentials || credentials.name !== USERNAME || credentials.pass !== PASSWORD) {
    res.statusCode = 401;
    return res.end('Unauthorized');
  }

  let data = [] as Uint8Array[]

  req.on('data', (chunk: Uint8Array) => {
    data.push(chunk)
  }).on('close', async () => {
    parseMessages(Buffer.concat(data))

    //await batchSendMessages()
    batchSendMessages()

    res.writeHead(200).end()
  })
})
