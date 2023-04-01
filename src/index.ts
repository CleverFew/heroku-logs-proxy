import { fetchAllLogGroupStreamNames } from './lib/awsLogGroups'
import { batchSendMessages } from './lib/batching'
import { herokuLogsProxyServer } from './lib/server'

const PORT = process.env.NODE_ENV === 'development' ? 3000 : 80

fetchAllLogGroupStreamNames().then(() => {
  herokuLogsProxyServer.listen(PORT, () => {
    console.log(`Server listening on port ${PORT}...`)

    // Let's PM2 know when the process is ready to accept connections
    if(process.send) process.send('ready')

    // Graceful shutdown
    process.on('SIGINT', function stopServer() {
      console.log('Stopping server...')

      herokuLogsProxyServer.closeAllConnections() // necessary for http/2

      herokuLogsProxyServer.close(() => {
        console.log('Server stopped.')
        console.log('Batching final messages...')

        batchSendMessages(true).then(() => {
          console.log('Batching complete.')
          process.exit(0)
        })
      })
    })
  })
})
