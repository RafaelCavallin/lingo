const KB = 1024

export function formatBytes(bytes: number): string {
  if (bytes < KB) return `${bytes} B`
  if (bytes < KB * KB) return `${Math.round(bytes / KB)} KB`
  return `${(bytes / (KB * KB)).toFixed(1)} MB`
}
