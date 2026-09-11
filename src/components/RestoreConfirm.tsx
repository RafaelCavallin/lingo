import type { RestoreConfirmation } from './restoreConfirm'

export function RestoreConfirm({
  confirmation,
  onConfirm,
  onBack,
}: {
  confirmation: RestoreConfirmation
  onConfirm: () => void
  onBack: () => void
}) {
  return (
    <div role="alert" className="mt-6 rounded-xl border border-miss/40 bg-miss/10 p-4">
      <div className="space-y-2">
        {confirmation.warnings.map((warning) => (
          <p key={warning} className="text-sm text-miss">
            {warning}
          </p>
        ))}
      </div>
      <div className="mt-4 flex flex-wrap gap-3">
        <button
          onClick={onConfirm}
          className="rounded-full bg-miss px-5 py-2.5 text-sm font-medium text-ink transition hover:brightness-110"
        >
          {confirmation.action}
        </button>
        <button onClick={onBack} className="text-sm text-muted hover:text-text">
          Voltar
        </button>
      </div>
    </div>
  )
}
