import { CloudWatchLogsClient } from "@aws-sdk/client-cloudwatch-logs";

export const awsClient = new CloudWatchLogsClient({ region: 'us-east-2', maxAttempts: 5 })
