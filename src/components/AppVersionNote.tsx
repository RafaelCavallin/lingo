import { APP_VERSION } from '../services/appVersion'

export function AppVersionNote() {
  return (
    <p className="mt-12 text-center font-mono text-xs text-muted">Lingo {APP_VERSION}</p>
  )
}
