type Resolver = (...args: unknown[]) => unknown;

export function createMockDb() {
  const perTable = new Map<string, Map<string, Resolver>>();
  const globalOps = new Map<string, Resolver>();
  const mutationOps = new Map<string, Resolver>();

  function getTableMap(table: string): Map<string, Resolver> {
    let m = perTable.get(table);
    if (!m) {
      m = new Map();
      perTable.set(table, m);
    }
    return m;
  }

  function resolve(table: string, op: string): Resolver | undefined {
    return getTableMap(table).get(op) ?? globalOps.get(op);
  }

  function setResolver(
    target: Map<string, Resolver>,
    op: string,
    value: unknown,
  ) {
    const fn: Resolver =
      typeof value === "function" ? (value as Resolver) : () => value;
    target.set(op, fn);
  }

  function buildTableProxy(
    table: string,
  ): Record<string, (...args: unknown[]) => unknown> {
    return new Proxy(
      {},
      {
        get(_t, op: string | symbol) {
          if (typeof op === "symbol") return undefined;
          const resolver = resolve(table, op);
          if (resolver) {
            return (...args: unknown[]) => resolver(...args);
          }
          return () => undefined;
        },
      },
    );
  }

  const query = new Proxy(
    {},
    {
      get(_t, table: string | symbol) {
        if (typeof table === "symbol") return undefined;
        return buildTableProxy(table);
      },
    },
  ) as Record<string, Record<string, (...args: unknown[]) => unknown>>;

  // Each chain starts with a value that flows through methods.
  // The terminal awaited value is determined by the last method called.
  // We use a "deferred promise" pattern: store the resolve fn in a closure.

  function createChain(
    terminalValue: () => unknown,
  ): Record<string, (...args: unknown[]) => unknown> {
    return new Proxy({} as Record<string, (...args: unknown[]) => unknown>, {
      get(_t, prop: string | symbol) {
        if (typeof prop === "symbol") return undefined;
        // thenable: any awaited chain resolves to terminalValue
        if (prop === "then") {
          return (resolve: (v: unknown) => void, reject: (e: unknown) => void) => {
            try {
              resolve(terminalValue());
            } catch (e) {
              reject(e);
            }
          };
        }
        // The most recently configured method overrides future value
        return (..._args: unknown[]) => createChain(terminalValue);
      },
    });
  }

  const db = {
    query,
    insert: (..._args: unknown[]) =>
      createChain(() => mutationOps.get("insert")?.()),
    update: (..._args: unknown[]) =>
      createChain(() => mutationOps.get("update")?.()),
    delete: (..._args: unknown[]) =>
      createChain(() => mutationOps.get("delete")?.()),
    select: (..._args: unknown[]) =>
      createChain(() => mutationOps.get("select")?.() ?? []),
  };

  return {
    db: db as typeof import("@/db/connection").db,
    setTableResult(table: string, op: string, value: unknown) {
      setResolver(getTableMap(table), op, value);
    },
    setQueryResult(op: string, value: unknown) {
      setResolver(globalOps, op, value);
    },
    setMutationResult(op: string, value: unknown) {
      setResolver(mutationOps, op, value);
    },
    clear() {
      perTable.clear();
      globalOps.clear();
      mutationOps.clear();
    },
  };
}
