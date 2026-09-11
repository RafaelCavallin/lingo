export function RestoreFilePicker({ onPick }: { onPick: (file: File) => void }) {
  return (
    <div>
      <h1 className="font-display text-3xl">Restaurar backup</h1>
      <p className="mt-2 text-sm text-muted">
        Escolha um arquivo <span className="font-mono">.zip</span> gerado pelo próprio Lingo. Você
        confere o conteúdo antes de qualquer alteração.
      </p>
      <label className="mt-6 flex cursor-pointer flex-col items-center gap-2 rounded-2xl border border-dashed border-line px-6 py-12 text-center transition hover:border-signal">
        <span className="text-sm font-medium">Escolher arquivo</span>
        <span className="font-mono text-xs text-muted">lingo-backup-AAAA-MM-DD.zip</span>
        <input
          type="file"
          accept=".zip,application/zip"
          className="sr-only"
          onChange={(e) => e.target.files?.[0] && onPick(e.target.files[0])}
        />
      </label>
    </div>
  )
}
