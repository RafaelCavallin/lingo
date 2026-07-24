# Cadence — completo (Fases 1 a 4)

Repetição espaçada para estudo de inglês por frases, com áudio em inglês americano.
Implementa a tech spec inteira: núcleo de estudo, geração automática de tradução e
dicas, cloze por seleção, importação de baralhos do Anki, gravação da própria voz,
acompanhamento de progresso, sincronização entre aparelhos, escolha de voz,
otimizador do FSRS e modo "ouvir primeiro".

## Rodar

```bash
npm install
npm run dev
```

Abre em `http://localhost:5173`. Roda sem nenhuma chave de API: o cadastro funciona
manualmente e a narração usa a voz do navegador.

Para ligar a geração automática e a voz neural, copie `.env.example` para `.env` e
preencha as chaves. Em desenvolvimento, as funções em `api/` precisam do runtime da
Vercel: `npx vercel dev` em vez de `npm run dev`.

## O que já funciona

- **Persistência local (Dexie/IndexedDB)** — cartões, histórico e estado FSRS no navegador. Revisão 100% offline.
- **Agendamento FSRS** (`ts-fsrs`) com retenção alvo de 0,90 — o app nunca calcula intervalos por conta própria.
- **Avaliação binária** — `Errei → Rating.Again`, `Acertei → Rating.Good`. `Hard` e `Easy` existem na lib mas não são expostos, por decisão de produto.
- **Áudio automático** ao abrir o cartão, com **Repetir** e **Devagar** (0,65×). Ao marcar *Errei*, o áudio toca de novo com a resposta à vista.
- **Limite inteligente de novos cartões** — novos só entram enquanto os *young* (em aprendizado ou com estabilidade < 21 dias) estiverem abaixo do teto, e são intercalados na fila em vez de empilhados.
- **Tela inicial** com a fila do dia e estimativa de minutos (média móvel das últimas 50 revisões).
- **Backup exportável** em JSON, já na Fase 1 — mitigação do risco de o navegador limpar o IndexedDB.
- **PWA instalável** com service worker e cache do app shell.
- Atalhos de teclado: `espaço` revela / acerta, `1` erro, `2` acerto, `r` repete o áudio.

## Fase 2 — o que entrou

- **Geração automática no cadastro** — ao sair do campo da frase, `/api/enrich` devolve
  tradução e até 3 dicas tipadas. Tudo editável; dicas escritas por você (`source: 'user'`)
  nunca são sobrescritas por uma nova geração.
- **Validação com Zod + 1 retry** — JSON malformado do modelo não quebra a tela; na
  falha definitiva o formulário vira cadastro manual com aviso discreto.
- **Voz neural** via `/api/tts`, com o MP3 guardado em `audioBlobs` na primeira vez.
  Sem chave configurada, cai para a voz do navegador **pelo resto da sessão** — sem
  repetir chamadas que já se sabe que vão falhar.
- **Cloze por seleção** — selecione um trecho da frase e toque em "Ocultar". Sem
  `{{c1::...}}`. Na revisão a frente mostra `_____` e o verso revela a frase inteira;
  o áudio sempre toca a frase completa, porque o listening não deve ter lacuna.
- **Importação de `.apkg`** — JSZip abre o ZIP, sql.js lê o SQLite, você mapeia qual
  campo é a frase e qual é a tradução, com prévia antes de confirmar. O HTML das notas
  é limpo (inclusive tags `[sound:...]`) para o TTS receber texto puro.
- **Áudio em lote com pool de concorrência 3** e barra de progresso. Uma falha de
  narração não invalida a importação: o cartão entra e o áudio sai na primeira revisão.
- **Carregamento sob demanda** — sql.js e JSZip (~660 KB de wasm) só são baixados por
  quem realmente importa, e ficam fora do precache do service worker.

### Escopo consciente da importação

Importa **conteúdo, não histórico**: os cartões entram como novos e o FSRS recomeça o
agendamento. Trazer o revlog do Anki é possível, mas o mapeamento SM-2 → FSRS merece
decisão própria — ficou anotado para depois.

## Fase 3 — o que entrou

- **Gravação da própria voz** (`MediaRecorder`) no cartão, com **Comparar**: toca a
  narração nativa e, em seguida, a sua leitura. Sem nota nem pontuação — o objetivo é
  notar a diferença, não ser avaliado.
- Guardamos **apenas a última gravação** de cada cartão: a comparação é feita na hora,
  e histórico de áudio só ocuparia espaço sem servir ao estudo. (Fecha a questão em
  aberto nº 2 do PRD.)
- O botão some sozinho em navegadores sem `MediaRecorder`, e a negativa de microfone
  vira uma mensagem no lugar de um erro silencioso.
- **Heatmap de constância** em SVG puro, na tela inicial e no progresso. Sem lib de
  gráfico: é uma grade de retângulos, e escrevê-la à mão custa menos que a dependência.
- **Tela de progresso** com retenção de 30 dias (colorida pela faixa saudável do FSRS),
  sequência de dias, previsão de carga dos próximos 14 dias (Recharts) e a divisão do
  baralho entre frases firmes, em consolidação e não vistas.
- **Ajuste de ritmo** com leitura em texto: o app diz se vale subir o teto diário,
  segurar, ou se ainda não há revisões suficientes para uma conclusão. Os dois limites
  são editáveis por slider e passam a valer na fila seguinte.
- **Bundle enxuto** — Recharts e sql.js ficam em chunks separados, carregados só quando
  as telas de progresso e importação abrem, e fora do precache. O caminho de estudo
  precacheia 364 KB.

## Fase 4 — o que entrou

- **Sincronização entre aparelhos** por snapshot. Você define a mesma frase-chave nos
  dois aparelhos; o servidor guarda só o hash dela e o snapshot correspondente em um KV.
  Sem contas, sem login: quem tem a frase, tem os dados — suficiente para uso pessoal.
- **Merge sem conflito no que importa** — `reviewLogs` são imutáveis e têm id próprio,
  então a união é trivial e nenhuma revisão se perde se você estudou nos dois aparelhos.
  Cartões e baralhos usam last-write-wins por `updatedAt` (campo novo, com migração
  para a versão 2 do schema).
- **Áudio não sobe.** Narração é regenerada pelo TTS do outro lado e gravações de voz
  são locais por natureza. O payload fica em dezenas de KB em vez de dezenas de MB.
- **Velocidade da narração** ajustável em Ajustes (0,60× a 1,20×), salva no baralho e
  aplicada desde a primeira frase da sessão. O botão *Devagar* passou a ser relativo:
  sempre 30% abaixo da sua velocidade padrão, em vez de um valor fixo.
- **Escolha de voz** entre quatro vozes americanas, com prévia ao selecionar. O cache de
  áudio passou a ser indexado por voz: trocar invalida o cache sem apagar nada.
- **Otimizador do FSRS de verdade**, com `fsrs-browser` (wasm) rodando em Web Worker
  sobre o seu histórico. Exige 400 revisões — abaixo disso o resultado é ruído e os
  parâmetros padrão são melhores, então o botão fica desabilitado com o número à vista.
- **Modo "ouvir primeiro"** — a frase escrita fica escondida até você responder. Treina
  compreensão de ouvido sem a muleta do texto. (Fecha a questão em aberto nº 4 do PRD.)

### Efeito colateral bom: fontes auto-hospedadas

O otimizador usa threads no wasm, que exigem isolamento de origem (COOP/COEP) — e isso
bloquearia as fontes do Google. Trocá-las por `@fontsource` resolveu o isolamento **e**
consertou um defeito silencioso: um app offline-first estava buscando fontes na rede.
Só o subconjunto latino entra no precache.

## Decisão de implementação: provider de áudio

A tech spec prevê TTS neural em nuvem com o MP3 em cache local. Para a Fase 1 rodar sem
chave de API, `src/services/audio.ts` define a interface `SpeechProvider` com duas
implementações:

- `webSpeech` (padrão) — `speechSynthesis` do navegador com voz `en-US`. Zero configuração.
- `cloudTts` — chama `POST /api/tts`, guarda o MP3 em `audioBlobs` e reproduz com
  `playbackRate` + `preservesPitch` para a velocidade lenta.

A resolução é automática (`speech` em `audio.ts`): tenta a nuvem, e ao receber 501 ou
erro marca a sessão como degradada e usa a voz do navegador. A UI não sabe qual está
tocando — só chama `speech.speak()`.

## Estrutura

```
src/
  services/
    db.ts          Schema Dexie, backup
    scheduler.ts   Wrapper do ts-fsrs, fila do dia, limite inteligente
    audio.ts       SpeechProvider (TTS neural | voz do navegador), com fallback
    enrich.ts      Cliente de /api/enrich + validação Zod
    ankiImport.ts  Leitura de .apkg (JSZip + sql.js) e pool de concorrência
    recorder.ts    Gravação da própria voz e reprodução
    stats.ts       Retenção, sequência, carga futura, leitura de ritmo
    sync.ts        Snapshot, merge e envio
    optimizer.ts   Preparo do histórico e chamada do worker
  screens/         Home, Review, AddCard, Import, Progress, Settings
  components/      Waveform, ClozeEditor, VoiceCompare, Heatmap
  workers/         optimizer.worker.ts (fsrs-browser em wasm)
api/
  enrich.ts        LLM → { translation, hints[] } em JSON
  tts.ts           Voz neural en-US → MP3
  sync.ts          Snapshot em KV, indexado pelo hash da frase-chave
```

## Estado

As quatro fases da tech spec estão implementadas. `npx tsc -b` e `vite build` passam limpos.

O que ficou deliberadamente de fora, e por quê:

- **Importar o histórico do Anki** (só o conteúdo vem). O mapeamento SM-2 → FSRS muda o
  agendamento de todos os cartões importados e merece decisão própria, não um efeito
  colateral de uma importação.
- **Nota automática de pronúncia.** A comparação é de ouvido: um número em cima da sua
  fala convida a otimizar o número, não a pronúncia.
- **Reagendar cartões existentes após otimizar.** Os parâmetros novos valem a partir da
  próxima revisão de cada frase — reescrever a fila inteira de uma vez costuma gerar um
  pico de revisões que desanima mais do que ajuda.

## Verificar antes de confiar

Os pontos que dependem de ambiente e merecem um teste seu:

1. Voz do TTS e latência da primeira narração após salvar uma frase.
2. Otimizador em Chrome e Safari — o wasm com threads é o trecho mais sensível a navegador.
3. Sincronização com os dois aparelhos estudando o mesmo dia, para conferir o merge.
4. Instalação do PWA no celular e uma sessão inteira em modo avião.
