import { PutLogEventsCommand } from "@aws-sdk/client-cloudwatch-logs"
import { awsClient } from "./awsClient"
import { GROUP_NAME_PREFIX, verifyStream } from "./awsLogGroups"
import { bytes, messages } from "./parsing"

const DEBUG = process.env.NODE_ENV === 'development'
const BATCH_BYTE_LIMIT = 1048576
const BATCH_MESSAGE_LIMIT = 10000
const BATCH_TIME_LIMIT = 15000 // 15 seconds

var lastPushTimestamps = {} as { [key:string]: number }
var batchLock = false

/**
 * Splices off messages for batching without exceeding batch or message limits
 */
function prepareStreamMessages(streamName: string) {
  var count = 0
  var batchBytes = 0

  messages[streamName].every(message => {
    var nextBatchBytes = batchBytes + message.length
    if(nextBatchBytes >= BATCH_BYTE_LIMIT) {
      if(count === 0) {
        console.log(`Single log message exceeds ${BATCH_BYTE_LIMIT} byte limit. Discarding message...`)
        messages[streamName].shift()
        return true
      }
      return false
    }

    if(count === 10000) {
      return false
    }

    batchBytes = nextBatchBytes
    ++count
    return true
  })

  if(DEBUG) console.log(`Batch calculated for ${streamName} at count=${count} and bytes=${batchBytes}`)
  bytes[streamName] -= batchBytes
  return messages[streamName]
    .splice(0, count)
    .filter(msg => msg.message.length > 0) // the router had empty messages?
    .sort((a, b) => a.timestamp - b.timestamp )
}

/**
 * Send log messages to CloudWatch Logs
 */
export async function batchSendMessages(force: boolean = false) {
  if(batchLock) return
  batchLock = true

  const promises = Object.keys(messages).map(async (streamName) => {
    const groupName = GROUP_NAME_PREFIX + streamName.split('.')[0]
    const now = Date.now()

    if(!force) {
      lastPushTimestamps[streamName] = lastPushTimestamps[streamName] ?? now
      const timeSinceLastPush = now - lastPushTimestamps[streamName]

      if(messages[streamName].length < BATCH_MESSAGE_LIMIT && bytes[streamName] < BATCH_BYTE_LIMIT && timeSinceLastPush < BATCH_TIME_LIMIT) return
    }

    lastPushTimestamps[streamName] = now

    const streamExists = await verifyStream(groupName, streamName)
    if(!streamExists) {
      console.log(`streamName=${streamName} does not exist - discarding ${messages[streamName].length} messages`)
      messages[streamName].splice(0)
      return
    }

    const logEvents = prepareStreamMessages(streamName)

    if(logEvents.length < 1) return

    const command = new PutLogEventsCommand({
      logGroupName: groupName,
      logStreamName: streamName,
      logEvents
    })

    try {
      if(DEBUG) {
        console.log(`Batching ${logEvents.length} logs for groupName=${groupName} streamName=${streamName}`)
      } else {
        await awsClient.send(command)
      }
    } catch(err) {
      if(err instanceof Error) {
        console.log(`Error sending logs: ${err.message}`)
      } else {
        console.log(`Unknown error sending logs: ${err}`)
      }
    }
  })

  await Promise.allSettled(promises)
  batchLock = false
}
