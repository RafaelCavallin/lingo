import type { BackupPreview } from '../services/backupTypes'

const OPTION_CLASS = 'flex min-h-11 cursor-pointer items-start gap-3 py-2 text-sm'

function DuplicateChoice({
  preview,
  skip,
  onChange,
}: {
  preview: BackupPreview
  skip: boolean
  onChange: (skip: boolean) => void
}) {
  const { cardIds, items } = preview.duplicates
  return (
    <fieldset className="mt-6">
      <legend className="font-mono text-xs uppercase tracking-[0.2em] text-signal">Cartões repetidos</legend>
      <p className="mt-2 text-sm text-text/90">
        {cardIds.length === 1
          ? '1 cartão do arquivo já existe aqui com a mesma frase e tradução.'
          : `${cardIds.length} cartões do arquivo já existem aqui com a mesma frase e tradução.`}
      </p>
      <label className={OPTION_CLASS}>
        <input type="radio" name="duplicatas" checked={skip} onChange={() => onChange(true)} className="mt-1" />
        <span>
          <span className="block font-medium">Pular duplicatas</span>
          <span className="block text-muted">Mantém o cartão que você já tem, com o agendamento dele.</span>
        </span>
      </label>
      <label className={OPTION_CLASS}>
        <input type="radio" name="duplicatas" checked={!skip} onChange={() => onChange(false)} className="mt-1" />
        <span>
          <span className="block font-medium">Importar mesmo assim</span>
          <span className="block text-muted">Cria uma segunda cópia, com agendamento próprio.</span>
        </span>
      </label>
      <details className="text-sm text-muted">
        <summary className="min-h-11 cursor-pointer py-2">Ver frases</summary>
        <ul className="space-y-1 pb-2">
          {items.map((item, index) => (
            <li key={cardIds[index]}>
              {item.sentence} <span className="font-mono text-xs">· {item.deckName}</span>
            </li>
          ))}
        </ul>
      </details>
    </fieldset>
  )
}

/** Só existe na mesclagem: na substituição o conteúdo local deixa de valer. */
export function RestoreMergeOptions({
  preview,
  skipDuplicates,
  onSkipDuplicatesChange,
  safetyCopy,
  onSafetyCopyChange,
}: {
  preview: BackupPreview
  skipDuplicates: boolean
  onSkipDuplicatesChange: (skip: boolean) => void
  safetyCopy: boolean
  onSafetyCopyChange: (safetyCopy: boolean) => void
}) {
  return (
    <>
      {preview.duplicates.cardIds.length > 0 && (
        <DuplicateChoice preview={preview} skip={skipDuplicates} onChange={onSkipDuplicatesChange} />
      )}
      {preview.hasLocalData && (
        <label className={`mt-4 ${OPTION_CLASS}`}>
          <input
            type="checkbox"
            checked={safetyCopy}
            onChange={(e) => onSafetyCopyChange(e.target.checked)}
            className="mt-1"
          />
          <span>
            <span className="block font-medium">Baixar uma cópia do estado atual antes</span>
            <span className="block text-muted">Se o arquivo for o errado, dá para voltar atrás.</span>
          </span>
        </label>
      )}
    </>
  )
}
