import { vi } from 'vitest'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Fake do SupabaseClient real: só a superfície usada por sync.ts/auth.ts
 * (from().select()...gt/eq/order/limit, rpc, auth.getSession/signOut).
 * O builder é "thenable" igual ao PostgrestFilterBuilder de verdade — o
 * await dispara a resolução configurada para a tabela, sem precisar
 * terminar sempre com o mesmo método (`.limit()` em pullTable,
 * `.eq()`/nada em remoteSummary).
 */
export interface FakeResolution {
  data?: unknown[] | null
  error?: unknown
  count?: number | null
  /** Se definido, o await da query rejeita com este erro (simula falha de rede). */
  reject?: Error
}

interface FakeSession {
  user: { id: string }
}

export interface FromCall {
  table: string
  ops: unknown[][]
}

export interface RpcCall {
  name: string
  args: unknown
}

export function createFakeSupabase() {
  const queues = new Map<string, FakeResolution[]>()
  const defaults = new Map<string, FakeResolution>()
  const fromCalls: FromCall[] = []
  const rpcCalls: RpcCall[] = []
  let rpcResult: FakeResolution = { error: null }
  let session: FakeSession | null = null
  let sessionError: Error | null = null

  function queueResolution(table: string, resolution: FakeResolution) {
    queues.set(table, [...(queues.get(table) ?? []), resolution])
  }

  function setDefaultResolution(table: string, resolution: FakeResolution) {
    defaults.set(table, resolution)
  }

  function nextResolution(table: string): FakeResolution {
    const pending = queues.get(table)
    if (pending && pending.length > 0) return pending.shift()!
    return defaults.get(table) ?? { data: [], error: null, count: 0 }
  }

  class FakeQueryBuilder implements PromiseLike<FakeResolution> {
    private ops: unknown[][] = []
    constructor(private table: string) {}

    select(...args: unknown[]) {
      this.ops.push(['select', ...args])
      return this
    }
    gt(...args: unknown[]) {
      this.ops.push(['gt', ...args])
      return this
    }
    eq(...args: unknown[]) {
      this.ops.push(['eq', ...args])
      return this
    }
    order(...args: unknown[]) {
      this.ops.push(['order', ...args])
      return this
    }
    limit(...args: unknown[]) {
      this.ops.push(['limit', ...args])
      return this
    }

    then<TResult1 = FakeResolution, TResult2 = never>(
      onfulfilled?: ((value: FakeResolution) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ): PromiseLike<TResult1 | TResult2> {
      fromCalls.push({ table: this.table, ops: this.ops })
      const resolution = nextResolution(this.table)
      const promise =
        resolution.reject !== undefined ? Promise.reject(resolution.reject) : Promise.resolve(resolution)
      return promise.then(onfulfilled, onrejected)
    }
  }

  const auth = {
    getSession: vi.fn(() => {
      if (sessionError) return Promise.reject(sessionError)
      return Promise.resolve({ data: { session } })
    }),
    signOut: vi.fn(() => Promise.resolve({ error: null })),
  }

  /** Roda uma vez, entre a chamada da RPC e a resolução — usado para simular uma
   *  edição concorrente "em trânsito" e exercitar o compare-and-swap do clearDirty. */
  let rpcSideEffect: (() => Promise<void> | void) | null = null

  const rpc = vi.fn(async (name: string, args: unknown) => {
    rpcCalls.push({ name, args })
    if (rpcSideEffect) {
      const effect = rpcSideEffect
      rpcSideEffect = null
      await effect()
    }
    if (rpcResult.reject !== undefined) throw rpcResult.reject
    return { error: rpcResult.error ?? null }
  })

  const from = vi.fn((table: string) => new FakeQueryBuilder(table))

  const client = { auth, from, rpc } as unknown as SupabaseClient

  return {
    client,
    setSession(next: FakeSession | null) {
      session = next
    },
    setSessionError(next: Error | null) {
      sessionError = next
    },
    queueResolution,
    setDefaultResolution,
    setRpcResult(next: FakeResolution) {
      rpcResult = next
    },
    setRpcSideEffect(fn: (() => Promise<void> | void) | null) {
      rpcSideEffect = fn
    },
    fromCalls,
    rpcCalls,
    authSignOut: auth.signOut,
  }
}
