# Catálogo fixo de frases para cenários

Textos versionados e revisados à mão, para que todo cenário seja reprodutível e nenhum campo dependa de IA. Use-os **literalmente**, sem completar, reescrever nem traduzir de novo.

Se o cenário precisar de mais frases do que há aqui, use os textos que o usuário der ou os placeholders do fim deste arquivo. **Nunca** gere uma tradução, fonética ou dica nova na hora: nem chamando `/api/enrich`, nem com o provedor de IA, nem "de cabeça". Para crescer o catálogo, acrescente linhas aqui, num commit revisado pelo Rafael.

## Frases (inglês → português)

| # | Frase | Tradução | Bom para testar |
| --- | --- | --- | --- |
| F01 | Where is the train station? | Onde fica a estação de trem? | cartão simples |
| F02 | I would like to check in. | Eu gostaria de fazer o check-in. | dica de phrasal verb (`check in`) |
| F03 | Could you call me a taxi? | Você poderia chamar um táxi para mim? | lacuna (`taxi`) |
| F04 | We ran out of milk. | O nosso leite acabou. | phrasal verb (`ran out of`) |
| F05 | She is pretending to be asleep. | Ela está fingindo que está dormindo. | falso cognato (`pretend` ≠ pretender) |
| F06 | I actually like this song. | Na verdade, eu gosto desta música. | falso cognato (`actually` ≠ atualmente) |
| F07 | Please turn off the lights. | Por favor, apague as luzes. | phrasal verb (`turn off`) |
| F08 | How much does it cost? | Quanto custa? | frase curta |
| F09 | I have been living here for three years. | Eu moro aqui há três anos. | tradução sem correspondência palavra a palavra |
| F10 | Can I pay by card? | Posso pagar com cartão? | frase curta |
| F11 | The meeting was put off until next week. | A reunião foi adiada para a semana que vem. | phrasal verb (`put off`), destaque |
| F12 | My parents are coming to visit. | Meus pais vêm me visitar. | falso cognato (`parents` ≠ parentes) |
| F13 | It's raining cats and dogs. | Está chovendo canivetes. | expressão idiomática |
| F14 | I'm looking forward to seeing you. | Estou ansioso para te ver. | phrasal verb (`look forward to`) |
| F15 | Let me know if you need anything. | Me avise se precisar de alguma coisa. | frase média |

## Dicas prontas

Só para as frases acima. O `type` é um de `phrasal_verb`, `false_cognate`, `pronunciation` ou `custom`; o `source` é `user`, a menos que o cenário precise mostrar como a UI exibe uma dica marcada como `ai`. Mesmo nesse caso, o texto é este, literal.

| Frase | `type` | `text` |
| --- | --- | --- |
| F02 | `phrasal_verb` | check in = registrar a entrada (hotel, aeroporto) |
| F04 | `phrasal_verb` | run out of = ficar sem, acabar |
| F05 | `false_cognate` | pretend = fingir, não "pretender" |
| F06 | `false_cognate` | actually = na verdade, não "atualmente" |
| F07 | `phrasal_verb` | turn off = desligar, apagar |
| F11 | `phrasal_verb` | put off = adiar |
| F12 | `false_cognate` | parents = pais, não "parentes" |
| F14 | `phrasal_verb` | look forward to = aguardar com expectativa |

## Placeholders

Quando o conteúdo não importa (volume, paginação, contadores), gere textos numerados. São determinísticos e não fingem ser tradução:

- frase: `Test sentence 001`, `Test sentence 002`…
- tradução: `Tradução de teste 001`, `Tradução de teste 002`…
- fonética: `ˈtɛst`

```sql
select pg_temp.criar_cartao(:'email', :'deck',
  format('Test sentence %s', lpad(n::text, 3, '0')),
  format('Tradução de teste %s', lpad(n::text, 3, '0')))
from generate_series(1, 50) n;
```
