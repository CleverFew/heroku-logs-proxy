import { CreateLogStreamCommand, DescribeLogStreamsCommand } from '@aws-sdk/client-cloudwatch-logs'
import { awsClient } from './awsClient'

export const LOG_GROUPS = ['web', 'worker', 'router'] // only messages with these procid values will be recorded
export const GROUP_NAME_PREFIX = 'parcelify-heroku-'

var logsStreams = {} as { [key:string]: { [key:string]: boolean } }

/**
 * Fetch the stream names for a log group
 */
export async function fetchLogGroupStreamNames(groupName: string) {
  const streamCommand = new DescribeLogStreamsCommand({
    logGroupName: groupName
  })

  return await awsClient.send(streamCommand).then(result => {
    logsStreams[groupName] = logsStreams[groupName] ?? {}

    result.logStreams?.forEach(stream => {
      if(stream.logStreamName) {
        logsStreams[groupName][stream.logStreamName] = true
      }
    })

    return logsStreams[groupName]
  })
}

/**
 * Verify a stream exists for a log group, otherwise create it
 */
export async function verifyStream(groupName: string, streamName: string) {
  if(!logsStreams[groupName]) {
    console.log(`No known groupName=${groupName}`)
    return false
  }

  if(logsStreams[groupName][streamName] === undefined) {
    let createStreamCommand = new CreateLogStreamCommand({
      logGroupName: groupName,
      logStreamName: streamName
    })

    await fetchLogGroupStreamNames(groupName)

    if(logsStreams[groupName][streamName] !== true) {
      console.log(`Creating streamName=${streamName} for groupName=${groupName}`)

      try {
        await awsClient.send(createStreamCommand)
        logsStreams[groupName][streamName] = true
      } catch(err) {
        console.log(`Error creating streamName=${streamName} for groupName=${groupName}`)
        delete logsStreams[groupName][streamName]
      }
    }
  }

  return logsStreams[groupName][streamName] ?? false
}

/**
 * Fetch stream names for all log groups
 */
export async function fetchAllLogGroupStreamNames() {
  const promises = LOG_GROUPS.map(key => {
    const groupName = GROUP_NAME_PREFIX + key
    return fetchLogGroupStreamNames(groupName)
  })

  return Promise.all(promises)
}
