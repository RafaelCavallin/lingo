import 'fake-indexeddb/auto'
import { Blob as NodeBlob } from 'node:buffer'
import { vi } from 'vitest'

/**
 * O `Blob` do jsdom não é serializável pelo `structuredClone` do Node, que é o
 * que o fake-indexeddb usa para gravar: um blob de áudio guardado voltaria do
 * banco como objeto simples, sem `type`, sem `size` e sem conteúdo. O `Blob` do
 * Node sobrevive à ida e volta.
 */
Object.defineProperty(globalThis, 'Blob', { configurable: true, writable: true, value: NodeBlob })

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
