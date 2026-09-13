export function HomeOnboarding({ onAdd, onImport }: { onAdd: () => void; onImport: () => void }) {
  return (
    <>
      <h2 className="font-display text-4xl leading-tight sm:text-5xl">
        Comece colando uma frase que você quer nunca mais esquecer.
      </h2>
      <p className="mt-4 max-w-md text-muted">
        Cada frase vira um cartão narrado em inglês americano. Você revisa quando estiver prestes a esquecer.
      </p>
      <div className="mt-10 flex flex-wrap items-center gap-4">
        <button
          onClick={onAdd}
          className="rounded-full bg-signal px-7 py-3.5 font-medium text-ink transition hover:brightness-110"
        >
          Adicionar primeira frase
        </button>
        <button onClick={onImport} className="font-mono text-xs uppercase tracking-wider text-muted hover:text-signal">
          ou importar do Anki
        </button>
      </div>
    </>
  )
}
