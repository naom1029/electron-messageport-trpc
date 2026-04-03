import { initTRPC } from '@trpc/server';
import { z } from 'zod';

const t = initTRPC.create();

let jobId = 0;

export const utilityRouter = t.router({
  greet: t.procedure
    .input(z.object({ name: z.string() }))
    .query(({ input }) => ({
      message: `Hello from utility, ${input.name}!`,
      workerPid: process.pid,
    })),

  enqueueJob: t.procedure
    .input(z.object({ task: z.string() }))
    .mutation(({ input }) => ({
      id: ++jobId,
      status: `Queued ${input.task}`,
      workerPid: process.pid,
    })),

  telemetry: t.procedure.subscription(async function* ({ signal }) {
    while (!signal?.aborted) {
      yield {
        kind: 'utility-heartbeat',
        at: new Date().toISOString(),
      };

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }),
});

export type UtilityRouter = typeof utilityRouter;
