import 'fake-indexeddb/auto'
import { vi } from 'vitest'

/**
 * jsdom não implementa a Web Locks API. Por padrão o fake concede o lock
 * sempre (roda o callback com um lock "obtido"); testes sobre o mutex
 * substituem `request` para simular concorrência (lock indisponível).
 */
Object.defineProperty(navigator, 'locks', {
  configurable: true,
  writable: true,
  value: {
    request: vi.fn(
      (_name: string, optsOrCallback: unknown, maybeCallback?: (lock: object | null) => unknown) => {
        const callback = (
          typeof optsOrCallback === 'function' ? optsOrCallback : maybeCallback
        ) as (lock: object | null) => unknown
        return Promise.resolve(callback({}))
      },
    ),
  },
})
