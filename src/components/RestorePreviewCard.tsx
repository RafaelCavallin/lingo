import { useState } from 'react'
import type { BackupPreview, RestorePlan } from '../services/backupRestore'
import { RestoreConfirm } from './RestoreConfirm'
import { RestorePlanChoice } from './RestorePlanChoice'
import { RestoreSummary } from './RestoreSummary'
import { confirmationFor } from './restoreConfirm'

export function RestorePreviewCard({
  preview,
  onCancel,
  onConfirm,
}: {
  preview: BackupPreview
  onCancel: () => void
  onConfirm: (choice: { plan: RestorePlan; includeNarrations: boolean }) => void
}) {
  const [plan, setPlan] = useState<RestorePlan>('merge')
  const [includeNarrations, setIncludeNarrations] = useState(preview.counts.narrations > 0)
  const [confirming, setConfirming] = useState(false)
  const confirmation = confirmationFor({ plan, accountMismatch: preview.accountMismatch })

  return (
    <div>
      <h1 className="font-display text-3xl">Conferir o backup</h1>
      <RestoreSummary preview={preview} />
      {preview.counts.narrations > 0 && (
        <label className="mt-6 flex cursor-pointer items-start gap-3 text-sm">
          <input
            type="checkbox"
            checked={includeNarrations}
            onChange={(e) => setIncludeNarrations(e.target.checked)}
            className="mt-1"
          />
          <span>Restaurar também as narrações geradas</span>
        </label>
      )}
      <fieldset className="mt-6">
        <legend className="font-mono text-xs uppercase tracking-[0.2em] text-signal">
          Como aplicar
        </legend>
        <RestorePlanChoice value="merge" current={plan} onSelect={setPlan} />
        <RestorePlanChoice value="replace" current={plan} onSelect={setPlan} />
      </fieldset>
      {confirming && confirmation ? (
        <RestoreConfirm
          confirmation={confirmation}
          onConfirm={() => onConfirm({ plan, includeNarrations })}
          onBack={() => setConfirming(false)}
        />
      ) : (
        <div className="mt-8 flex flex-wrap items-center gap-4">
          <button
            onClick={() =>
              confirmation ? setConfirming(true) : onConfirm({ plan, includeNarrations })
            }
            className="rounded-full bg-signal px-6 py-3 text-sm font-medium text-ink transition hover:brightness-110"
          >
            Restaurar
          </button>
          <button onClick={onCancel} className="text-sm text-muted hover:text-text">
            Cancelar
          </button>
        </div>
      )}
    </div>
  )
}
