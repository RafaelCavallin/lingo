# Lingo

Aplicativo de **repetição espaçada para aprender inglês por frases**, com áudio em inglês americano e prática de escuta e pronúncia. Roda 100% no navegador, funciona offline e é instalável como PWA.

Diferente de um flashcard tradicional, o Lingo trata cada cartão como uma frase completa: você ouve a narração antes de ver o texto, marca apenas se acertou ou errou, e o agendamento das próximas revisões é calculado por um algoritmo de memória moderno (FSRS) — nunca por intervalos fixos.

## Principais recursos

- **Agendamento com FSRS** (`ts-fsrs`, retenção alvo de 0,90) e avaliação binária simples: *Errei* ou *Acertei*.
- **Estudo offline-first** — cartões, histórico e estado ficam no navegador (Dexie/IndexedDB); revisão inteira sem rede.
- **Áudio automático** ao abrir o cartão, com *Repetir* e *Devagar*, e velocidade de narração ajustável.
- **Modo "ouvir primeiro"** — a frase escrita fica escondida até você responder, treinando compreensão de ouvido.
- **Gravação da própria voz** com comparação direta contra a narração nativa (sem nota, só percepção).
- **Cadastro assistido** — ao digitar a frase, uma função gera automaticamente tradução e dicas (tudo editável).
- **Cloze por seleção** — selecione um trecho e oculte-o; o áudio sempre toca a frase completa.
- **Importação de baralhos do Anki** (`.apkg`) com mapeamento de campos e prévia — traz o conteúdo, não o histórico.
- **Progresso** — retenção de 30 dias, sequência de dias, previsão de carga futura e heatmap de constância.
- **Múltiplos baralhos**, com troca rápida, e exclusão de cartões e baralhos.
- **Conta opcional** (email e senha) — sincroniza baralhos, cartões e histórico entre aparelhos via Supabase (Postgres + RLS); sem conta, o app funciona 100% offline igual antes.
- **Otimizador do FSRS** rodando em Web Worker (wasm) sobre o seu próprio histórico.
- **Voz neural opcional** (TTS em nuvem) com MP3 em cache local; sem chave configurada, usa a voz do navegador.

## Como rodar

```bash
npm install
npm run dev
```

Abre em `http://localhost:5173`. Roda **sem nenhuma chave de API**: o cadastro funciona manualmente e a narração usa a voz do navegador.

Para ligar a geração automática de tradução/dicas e a voz neural, copie `.env.example` para `.env` e preencha as chaves. Como as funções em `api/` dependem do runtime da Vercel, use `npx vercel dev` em vez de `npm run dev` nesse caso.

A geração automática de tradução/dicas funciona com Anthropic (padrão) ou Gemini — troque o provedor com `ENRICH_PROVIDER=anthropic` ou `ENRICH_PROVIDER=gemini` e preencha a chave correspondente (`ANTHROPIC_API_KEY` ou `GEMINI_API_KEY`). Ver `api/_lib/enrichProviders.ts` para adicionar outros provedores.

### Scripts

| Comando           | O que faz                                  |
| ----------------- | ------------------------------------------ |
| `npm run dev`     | Servidor de desenvolvimento (Vite)         |
| `npm run build`   | Type-check (`tsc -b`) + build de produção  |
| `npm run preview` | Servir localmente o build de produção      |

## Stack

- **React 18** + **TypeScript** + **Vite**
- **Tailwind CSS** para estilo e `@fontsource` para fontes auto-hospedadas
- **Dexie** (IndexedDB) para persistência local
- **ts-fsrs** / **fsrs-browser** (wasm) para agendamento e otimização
- **JSZip** + **sql.js** para ler arquivos `.apkg` do Anki
- **Recharts** para os gráficos de progresso
- **Zod** para validar as respostas do gerador
- **vite-plugin-pwa** para service worker e instalação offline
- Funções serverless (`api/`) para TTS, enriquecimento por LLM e sincronização — feitas para a Vercel

## Estrutura

```
src/
  services/
    db.ts          Schema Dexie e backup
    scheduler.ts   Wrapper do ts-fsrs, fila do dia e limite de novos cartões
    audio.ts       SpeechProvider (voz neural | voz do navegador), com fallback
    enrich.ts      Cliente de /api/enrich + validação Zod
    ankiImport.ts  Leitura de .apkg (JSZip + sql.js)
    recorder.ts    Gravação e reprodução da própria voz
    stats.ts       Retenção, sequência, carga futura
    sync.ts        Pull/push incremental contra o Postgres, LWW por linha
    auth.ts        Conta, adoção de dados locais ao entrar/cadastrar
    supabase.ts    Cliente Supabase sob import dinâmico (só quem usa conta baixa)
    optimizer.ts   Preparo do histórico e chamada do worker
  contexts/        DeckContext (baralho ativo) e AuthContext (sessão, sync)
  screens/         Home, Review, AddCard, Import, Cards, Progress, Settings, Account
  components/      Waveform, ClozeEditor, VoiceCompare, Heatmap, DeckSwitcher
  workers/         optimizer.worker.ts (fsrs-browser em wasm)
api/
  enrich.ts               LLM → { translation, hints[] } em JSON
  _lib/enrichProviders.ts Provedores de LLM (Anthropic, Gemini) atrás de interface comum
  tts.ts                  Voz neural en-US → MP3
supabase/
  migrations/             Schema, RLS e a RPC sync_push (decks, cards, review_logs)
```

## Atalhos de teclado

`espaço` revela / acerta · `1` erro · `2` acerto · `r` repete o áudio.