import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import {
  db,
  deleteDeck as deleteDeckDb,
  ensureDefaultDeck,
  uid,
  DEFAULT_RATE,
  DEFAULT_VOICE,
  type Deck,
} from '../services/db'
import { setSpeechRate, setVoice } from '../services/audio'
import { useParameters } from '../services/scheduler'

const ACTIVE_DECK_KEY = 'lingo.activeDeckId'

interface DeckContextValue {
  /** `null` só quando o usuário excluiu todos os seus baralhos — não é estado de erro. */
  deck: Deck | null
  decks: Deck[]
  switchDeck: (id: string) => void
  /** Devolve o baralho criado — a importação precisa do id para gravar nele. */
  createDeck: (name: string) => Promise<Deck>
  renameDeck: (id: string, name: string) => Promise<void>
  removeDeck: (id: string) => Promise<void>
}

const DeckContext = createContext<DeckContextValue | null>(null)

/**
 * Lista de baralhos e o baralho ativo, acima do switch de telas — o seletor
 * no header e o resto da UI enxergam o mesmo estado sem prop drilling.
 * `decks` vem de `useLiveQuery`, então qualquer escrita no Dexie (inclusive
 * as feitas em Progress/Settings) já chega atualizada aqui sem refetch manual.
 */
export function DeckProvider({ children }: { children: ReactNode }) {
  const [activeId, setActiveId] = useState<string | null>(() => localStorage.getItem(ACTIVE_DECK_KEY))
  const [seeded, setSeeded] = useState(false)
  const initialized = useRef(false)

  const decks = useLiveQuery(() => db.decks.filter((d) => d.deletedAt === 0).sortBy('createdAt'), [])

  /**
   * Roda uma única vez, na primeira vez que a live query resolve — nunca de
   * novo a cada mudança de `decks`. Um efeito que reavaliasse "activeId
   * existe em decks?" a cada render corrigiria demais: logo depois de
   * `createDeck` mudar `activeId` para o baralho novo, a live query ainda
   * não tinha se atualizado, então esse efeito via "não existe" e devolvia
   * o `activeId` para o baralho antigo — a troca nunca aparecia na tela.
   * Deletar o baralho ativo é tratado à parte em `removeDeck`, usando o
   * `decks` já conhecido no momento da exclusão em vez de esperar a live
   * query confirmar.
   */
  useEffect(() => {
    if (decks === undefined || initialized.current) return
    initialized.current = true
    ;(async () => {
      if (activeId && decks.some((d) => d.id === activeId)) {
        setSeeded(true)
        return
      }
      if (decks.length > 0) {
        setActiveId(decks[0].id)
        setSeeded(true)
        return
      }
      // Banco de verdade vazio (nunca teve deck algum): só aqui cabe semear
      // o baralho padrão. Ver o comentário em ensureDefaultDeck.
      const d = await ensureDefaultDeck()
      setActiveId(d?.id ?? null)
      setSeeded(true)
    })()
  }, [decks, activeId])

  // Fallback só de renderização, nunca escrito de volta em `activeId`: se o
  // sync trouxer baralhos com ids diferentes do que está salvo (ou o salvo
  // tiver sido excluído), isto resolve sozinho a cada render, sem competir
  // com uma troca/criação que acabou de setar `activeId` e ainda não apareceu
  // em `decks` (essa era a race que o efeito antigo causava).
  const deck = decks?.find((d) => d.id === activeId) ?? decks?.[0] ?? null

  useEffect(() => {
    if (activeId) localStorage.setItem(ACTIVE_DECK_KEY, activeId)
  }, [activeId])

  // Voz, velocidade e parâmetros do FSRS são por deck; precisam ser
  // reaplicados a cada troca, não só no carregamento inicial do app.
  useEffect(() => {
    if (!deck) return
    setVoice(deck.voice)
    setSpeechRate(deck.speechRate ?? DEFAULT_RATE)
    useParameters(deck.fsrsParams)
  }, [deck])

  const switchDeck = useCallback((id: string) => setActiveId(id), [])

  const createDeck = useCallback(async (name: string) => {
    const now = Date.now()
    const newDeck: Deck = {
      id: uid(),
      name: name.trim() || 'Novo baralho',
      createdAt: now,
      updatedAt: now,
      newCardsPerDay: 20,
      youngLimit: 50,
      listenFirst: false,
      voice: DEFAULT_VOICE,
      speechRate: DEFAULT_RATE,
      deletedAt: 0,
      dirty: 1,
    }
    await db.decks.add(newDeck)
    setActiveId(newDeck.id)
    return newDeck
  }, [])

  const renameDeck = useCallback(async (id: string, name: string) => {
    const trimmed = name.trim()
    if (!trimmed) return
    await db.decks.update(id, { name: trimmed, updatedAt: Date.now() })
  }, [])

  // Se o baralho excluído era o ativo, escolhe outro a partir do `decks`
  // que já temos em mãos agora — não de uma live query que ainda não
  // absorveu a própria exclusão que acabamos de fazer.
  const removeDeck = useCallback(
    async (id: string) => {
      await deleteDeckDb(id)
      setActiveId((cur) => {
        if (cur !== id) return cur
        return decks?.find((d) => d.id !== id)?.id ?? null
      })
    },
    [decks],
  )

  if (!seeded || !decks) return null

  return (
    <DeckContext.Provider value={{ deck, decks, switchDeck, createDeck, renameDeck, removeDeck }}>
      {children}
    </DeckContext.Provider>
  )
}

export function useDeck(): DeckContextValue {
  const ctx = useContext(DeckContext)
  if (!ctx) throw new Error('useDeck precisa estar dentro de <DeckProvider>')
  return ctx
}
