import { loadMoreButtonText, loadMoreLabel } from './loadMore'

type LoadMoreButtonProps = {
  shown: number
  total: number
  onLoadMore: () => void
}

export function LoadMoreButton({ shown, total, onLoadMore }: LoadMoreButtonProps) {
  if (shown >= total) return null
  return (
    <div className="mt-6 flex flex-col items-center gap-3">
      <p className="font-mono text-xs text-muted">{loadMoreLabel({ shown, total })}</p>
      <button
        onClick={onLoadMore}
        className="rounded-full border border-line px-5 py-2 font-mono text-xs uppercase tracking-wider text-muted transition hover:border-signal hover:text-signal"
      >
        {loadMoreButtonText({ shown, total })}
      </button>
    </div>
  )
}
