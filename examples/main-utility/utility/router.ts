import { initTRPC } from '@trpc/server';
import { z } from 'zod';

const t = initTRPC.create();

let reportId = 0;

export const utilityRouter = t.router({
  greet: t.procedure
    .input(z.object({ name: z.string() }))
    .query(({ input }) => ({
      message: `Hello from the utility process, ${input.name}!`,
      workerPid: process.pid,
    })),

  generateReport: t.procedure
    .input(z.object({ topic: z.string() }))
    .mutation(({ input }) => ({
      id: ++reportId,
      summary: `Generated a background report about ${input.topic}.`,
      workerPid: process.pid,
    })),

  heartbeats: t.procedure.subscription(async function* ({ signal }) {
    let sequence = 0;

    while (!signal?.aborted) {
      yield {
        sequence: ++sequence,
        at: new Date().toISOString(),
      };

      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }),
});

export type UtilityRouter = typeof utilityRouter;
