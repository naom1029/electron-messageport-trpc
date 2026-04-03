import { useEffect, useState } from 'react';

declare global {
  interface Window {
    mainUtilityDemo: {
      getGreeting(
        name: string,
      ): Promise<{ message: string; workerPid: number }>;
      generateReport(
        topic: string,
      ): Promise<{ id: number; summary: string; workerPid: number }>;
      onHeartbeat(
        listener: (payload: { sequence: number; at: string }) => void,
      ): () => void;
    };
  }
}

export function App() {
  const [name, setName] = useState('Utility');
  const [greeting, setGreeting] = useState('');
  const [topic, setTopic] = useState('release checklist');
  const [report, setReport] = useState('');
  const [heartbeat, setHeartbeat] = useState('connecting...');

  useEffect(() => {
    return window.mainUtilityDemo.onHeartbeat((payload) => {
      setHeartbeat(`#${payload.sequence} at ${payload.at}`);
    });
  }, []);

  return (
    <div style={{ padding: 20, fontFamily: 'system-ui' }}>
      <h1>Main to Utility tRPC Example</h1>
      <p>
        The renderer talks to the main process via preload IPC. The main process
        uses tRPC over MessagePort to call a utility process.
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
            const result = await window.mainUtilityDemo.getGreeting(name);
            setGreeting(`${result.message} (worker ${result.workerPid})`);
          }}
        >
          Request Greeting
        </button>
        {greeting && <p>{greeting}</p>}
      </section>

      <hr />

      <section>
        <h2>Mutation</h2>
        <input
          value={topic}
          onChange={(event) => setTopic(event.target.value)}
          placeholder="Report topic"
        />
        <button
          type="button"
          onClick={async () => {
            const result = await window.mainUtilityDemo.generateReport(topic);
            setReport(
              `#${result.id}: ${result.summary} (worker ${result.workerPid})`,
            );
          }}
        >
          Generate Report
        </button>
        {report && <p>{report}</p>}
      </section>

      <hr />

      <section>
        <h2>Subscription</h2>
        <p>
          Utility heartbeat: <strong>{heartbeat}</strong>
        </p>
      </section>
    </div>
  );
}
