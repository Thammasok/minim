# Queues Reference (BullMQ)

## When to use a queue
- Sending emails / notifications (don't block the request)
- Image/video processing
- Scheduled jobs (cron)
- Rate-limited 3rd party API calls
- Anything that can fail and needs retry

## Setup

```typescript
// lib/queue.ts
import { Queue, Worker, QueueEvents } from 'bullmq'
import { redis } from './redis'

export const emailQueue = new Queue('email', { connection: redis })

export const emailWorker = new Worker('email', async (job) => {
  const { to, subject, body } = job.data
  await sendEmail({ to, subject, body })  // your email provider
}, {
  connection: redis,
  concurrency: 5,            // process 5 jobs at once
  limiter: { max: 100, duration: 60_000 },  // max 100/min
})

emailWorker.on('failed', (job, err) => {
  console.error(`Email job ${job?.id} failed:`, err)
})
```

## Adding jobs

```typescript
// In your service
await emailQueue.add(
  'welcome-email',
  { to: user.email, subject: 'Welcome!', body: '...' },
  {
    attempts: 3,              // retry up to 3 times
    backoff: { type: 'exponential', delay: 2000 },
    removeOnComplete: 100,   // keep last 100 completed
    removeOnFail: 500,
  }
)
```

## Scheduled / Cron jobs

```typescript
await emailQueue.add(
  'daily-digest',
  { type: 'digest' },
  { repeat: { pattern: '0 9 * * *' } }  // every day at 9am
)
```

## Progress tracking

```typescript
// In worker
await job.updateProgress(50)  // 50%

// In your API
const job = await emailQueue.getJob(jobId)
const state = await job?.getState()   // 'waiting' | 'active' | 'completed' | 'failed'
const progress = job?.progress
```
