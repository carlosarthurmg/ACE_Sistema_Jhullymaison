// Supabase simulado só para testes: guarda linhas em memória e imita as chamadas usadas
// pelas Functions de autenticação. NÃO substitui o teste real contra o Supabase.
export type Row = Record<string, unknown>;

export function createFakeSupabase(seed: Record<string, Row[]> = {}) {
  const tables: Record<string, Row[]> = { profiles: [], app_sessions: [], ...seed };
  const failures = new Set<string>(); // ex.: "insert:profiles"
  const users = new Map<string, { id: string; password: string }>();
  const deletedUsers: string[] = [];
  let counter = 0;

  const failIf = (key: string): Error | null => (failures.has(key) ? new Error(`falha simulada ${key}`) : null);

  const client = {
    from(table: string) {
      const rows = (tables[table] ??= []);
      return {
        insert(row: Row) {
          const error = failIf(`insert:${table}`);
          if (!error) rows.push({ id: `${table}-${++counter}`, revoked_at: null, ...row });
          return Promise.resolve({ error });
        },
        select(_columns: string) {
          return {
            eq(column: string, value: unknown) {
              return {
                maybeSingle: async () => ({
                  data: rows.find((row) => row[column] === value) ?? null,
                  error: failIf(`select:${table}`),
                }),
              };
            },
          };
        },
        update(values: Row) {
          const filters: Array<[string, unknown]> = [];
          const builder = {
            eq(column: string, value: unknown) {
              filters.push([column, value]);
              return builder;
            },
            is(column: string, value: unknown) {
              filters.push([column, value]);
              const error = failIf(`update:${table}`);
              if (!error) {
                for (const row of rows) {
                  if (filters.every(([c, v]) => (row[c] ?? null) === v)) Object.assign(row, values);
                }
              }
              return Promise.resolve({ error });
            },
          };
          return builder;
        },
      };
    },
    auth: {
      admin: {
        createUser: async (attrs: { email: string; password: string }) => {
          if (users.has(attrs.email)) {
            return {
              data: { user: null },
              error: Object.assign(new Error("exists"), { status: 422, code: "email_exists" }),
            };
          }
          const user = { id: `user-${++counter}` };
          users.set(attrs.email, { id: user.id, password: attrs.password });
          return { data: { user }, error: null };
        },
        deleteUser: async (id: string) => {
          deletedUsers.push(id);
          return { error: null };
        },
      },
      signInWithPassword: async (attrs: { email: string; password: string }) => {
        const user = users.get(attrs.email);
        if (!user || user.password !== attrs.password) {
          return {
            data: { user: null },
            error: Object.assign(new Error("Invalid login credentials"), {
              status: 400,
              code: "invalid_credentials",
            }),
          };
        }
        return { data: { user: { id: user.id } }, error: null };
      },
    },
  };

  return {
    client: client as never,
    tables,
    failures,
    deletedUsers,
    addUser(email: string, password: string, id: string, profile?: Row) {
      users.set(email, { id, password });
      if (profile) tables.profiles!.push({ id, ...profile });
    },
  };
}
