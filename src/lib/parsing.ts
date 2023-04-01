import { LOG_GROUPS } from "./awsLogGroups"

// Heroku docs: The application/logplex-1 content type does not conform to RFC 5424. It omits STRUCTURED-DATA but does not replace it with a NILVALUE.
const regex = /^<(?<priority>\d|\d{2}|1[1-8]\d|19[01])>(?<version>\d{1,2})\s(?<timestamp>-|[\S]+)\s(?<hostname>[\S]{1,255})\s(?<appname>[\S]{1,48})\s(?<procid>[\S]{1,128})\s(?<msgid>[\S]{1,32})(?:\s(?<msg>[\s\S]*))?$/

interface IMessage {
  timestamp: number,
  message: string,
  length: number
}

export var messages = {} as { [key:string]: IMessage[]}
export var bytes = {} as { [key:string]: number }

function parseMessage(message: string, fullMessage: string) {
  const parsed = regex.exec(message)
  if(parsed === null || parsed.groups === undefined) {
    console.log(`Message failed to parse: ${fullMessage}`)
    return
  }

  /* @ts-ignore */
  const { groups: { priority, version, timestamp, hostname, appname, procid, msgid, msg } } = parsed
  // could use severity to push error/critical to slack
  //const severity = priority & 7
  //const facility = priority >> 3
  const groupName = procid.split('.')[0]
  if(!LOG_GROUPS.includes(groupName)) return

  const length = (new TextEncoder().encode(msg)).length + 26 // AWS payload is message length plus 26 bytes
  messages[procid] = messages[procid] ?? [] // scheduler procid are dynamic, maybe strip the number...
  bytes[procid] = bytes[procid] ?? 0
  bytes[procid] += length
  messages[procid].push({ timestamp: Date.parse(timestamp), message: msg, length: length })
}

export function parseMessages(chunk: Buffer) {
  const index = chunk.indexOf(' ')
  if(index < 0) return

  const length = parseInt(chunk.subarray(0, index).toString())

  // Heroku has sent body's with empty strings at the end
  if(isNaN(length)) {
    console.log(`Failed to parse number from message: ${chunk.toString()}`)
    return
  }

  const msg = chunk.subarray(index, length+index).toString('utf-8').trimStart()
  const fullMsg = chunk.subarray(0, length+index).toString('utf-8')

  parseMessage(msg, fullMsg)

  parseMessages(chunk.subarray(length+index))
}
