import { EventEmitter } from 'node:events';
import { initTRPC } from '@trpc/server';
import { z } from 'zod';

const t = initTRPC.create();

const ee = new EventEmitter();

let todoIdCounter = 0;
const todos: { id: number; text: string; done: boolean }[] = [];

export const appRouter = t.router({
  // Query: get greeting
  greet: t.procedure
    .input(z.object({ name: z.string() }))
    .query(({ input }) => {
      return { message: `Hello, ${input.name}!` };
    }),

  // Query: list todos
  listTodos: t.procedure.query(() => {
    return todos;
  }),

  // Mutation: add a todo
  addTodo: t.procedure
    .input(z.object({ text: z.string() }))
    .mutation(({ input }) => {
      const todo = { id: ++todoIdCounter, text: input.text, done: false };
      todos.push(todo);
      ee.emit('todo-added', todo);
      return todo;
    }),

  // Mutation: toggle a todo
  toggleTodo: t.procedure
    .input(z.object({ id: z.number() }))
    .mutation(({ input }) => {
      const todo = todos.find((t) => t.id === input.id);
      if (!todo) throw new Error(`Todo ${input.id} not found`);
      todo.done = !todo.done;
      return todo;
    }),

  // Subscription: watch for new todos
  onTodoAdded: t.procedure.subscription(async function* (opts) {
    const queue: (typeof todos)[number][] = [];
    let resolve: (() => void) | null = null;

    const onAdd = (todo: (typeof todos)[number]) => {
      queue.push(todo);
      resolve?.();
    };

    ee.on('todo-added', onAdd);

    try {
      while (!opts.signal?.aborted) {
        if (queue.length > 0) {
          const nextTodo = queue.shift();
          if (nextTodo) {
            yield nextTodo;
          }
        } else {
          await new Promise<void>((r) => {
            resolve = r;
          });
        }
      }
    } finally {
      ee.off('todo-added', onAdd);
    }
  }),

  // Subscription: server time tick
  timeTick: t.procedure.subscription(async function* (opts) {
    while (!opts.signal?.aborted) {
      yield { time: new Date().toISOString() };
      await new Promise((r) => setTimeout(r, 1000));
    }
  }),
});

export type AppRouter = typeof appRouter;
