import { useCallback, useEffect, useRef, useState } from 'react';
import { trpc } from './trpc';

export function App() {
  return (
    <div style={{ padding: 20, fontFamily: 'system-ui' }}>
      <h1>electron-messageport-trpc Example</h1>
      <QueryDemo />
      <hr />
      <MutationDemo />
      <hr />
      <SubscriptionDemo />
    </div>
  );
}

function QueryDemo() {
  const [name, setName] = useState('World');
  const [result, setResult] = useState('');

  const handleQuery = useCallback(async () => {
    const res = await trpc.greet.query({ name });
    setResult(res.message);
  }, [name]);

  return (
    <section>
      <h2>Query</h2>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Enter name"
      />
      <button type="button" onClick={handleQuery}>
        Greet
      </button>
      {result && <p>{result}</p>}
    </section>
  );
}

function MutationDemo() {
  const [text, setText] = useState('');
  const [todos, setTodos] = useState<
    { id: number; text: string; done: boolean }[]
  >([]);

  useEffect(() => {
    trpc.listTodos.query().then(setTodos);
  }, []);

  const handleAdd = useCallback(async () => {
    if (!text.trim()) return;
    await trpc.addTodo.mutate({ text });
    setText('');
    const updated = await trpc.listTodos.query();
    setTodos(updated);
  }, [text]);

  const handleToggle = useCallback(async (id: number) => {
    await trpc.toggleTodo.mutate({ id });
    const updated = await trpc.listTodos.query();
    setTodos(updated);
  }, []);

  return (
    <section>
      <h2>Mutation (Todo List)</h2>
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="New todo"
        onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
      />
      <button type="button" onClick={handleAdd}>
        Add
      </button>
      <ul>
        {todos.map((todo) => (
          <li key={todo.id}>
            <button
              type="button"
              onClick={() => handleToggle(todo.id)}
              style={{
                textDecoration: todo.done ? 'line-through' : 'none',
                cursor: 'pointer',
              }}
            >
              {todo.text}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function SubscriptionDemo() {
  const [time, setTime] = useState('');
  const [newTodos, setNewTodos] = useState<{ id: number; text: string }[]>([]);
  const timeSubRef = useRef<{ unsubscribe: () => void } | null>(null);
  const todoSubRef = useRef<{ unsubscribe: () => void } | null>(null);

  useEffect(() => {
    timeSubRef.current = trpc.timeTick.subscribe(undefined, {
      onData(data) {
        setTime(data.time);
      },
    });

    todoSubRef.current = trpc.onTodoAdded.subscribe(undefined, {
      onData(todo) {
        setNewTodos((prev) => [...prev, { id: todo.id, text: todo.text }]);
      },
    });

    return () => {
      timeSubRef.current?.unsubscribe();
      todoSubRef.current?.unsubscribe();
    };
  }, []);

  return (
    <section>
      <h2>Subscriptions</h2>
      <p>
        Server time: <strong>{time || 'connecting...'}</strong>
      </p>
      <div>
        <h3>New todos (via subscription)</h3>
        {newTodos.length === 0 ? (
          <p>Add a todo above to see it appear here in real-time</p>
        ) : (
          <ul>
            {newTodos.map((todo) => (
              <li key={todo.id}>
                [{todo.id}] {todo.text}
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
