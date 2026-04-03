import { useEffect, useState } from 'react';
import { trpc } from './trpc';

export function App() {
  const [name, setName] = useState('Renderer');
  const [greeting, setGreeting] = useState('');
  const [task, setTask] = useState('thumbnail generation');
  const [jobStatus, setJobStatus] = useState('');
  const [telemetry, setTelemetry] = useState('connecting...');

  useEffect(() => {
    const subscription = trpc.telemetry.subscribe(undefined, {
      onData(data) {
        setTelemetry(`${data.kind} at ${data.at}`);
      },
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  return (
    <div style={{ padding: 20, fontFamily: 'system-ui' }}>
      <h1>Renderer to Utility tRPC Example</h1>
      <p>
        The main process only brokers a MessagePort. The renderer talks directly
        to the utility process over tRPC.
      </p>

      <section>
        <h2>Query</h2>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="Name"
        />
        <button
          type="button"
          onClick={async () => {
            const result = await trpc.greet.query({ name });
            setGreeting(`${result.message} (worker ${result.workerPid})`);
          }}
        >
          Ask Utility
        </button>
        {greeting && <p>{greeting}</p>}
      </section>

      <hr />

      <section>
        <h2>Mutation</h2>
        <input
          value={task}
          onChange={(event) => setTask(event.target.value)}
          placeholder="Task name"
        />
        <button
          type="button"
          onClick={async () => {
            const result = await trpc.enqueueJob.mutate({ task });
            setJobStatus(
              `#${result.id}: ${result.status} (worker ${result.workerPid})`,
            );
          }}
        >
          Enqueue Job
        </button>
        {jobStatus && <p>{jobStatus}</p>}
      </section>

      <hr />

      <section>
        <h2>Subscription</h2>
        <p>
          Utility telemetry: <strong>{telemetry}</strong>
        </p>
      </section>
    </div>
  );
}
