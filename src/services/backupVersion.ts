import { BACKUP_FORMAT, BACKUP_VERSION, PREVIOUS_BACKUP_VERSION } from './backupFormat'

const LEGACY_JSON_VERSIONS: readonly unknown[] = [1, 2]
const FIRST_VERSION = 1

export type ManifestClass =
  | { kind: 'current'; raw: unknown }
  | { kind: 'previous'; raw: unknown; from: number }
  | { kind: 'too-new'; version: number }
  | { kind: 'too-old'; version: number }
  | { kind: 'foreign' }

function isRecord(raw: unknown): raw is Record<string, unknown> {
  return typeof raw === 'object' && raw !== null && !Array.isArray(raw)
}

function isVersion(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= FIRST_VERSION
}

export function classifyManifest(raw: unknown): ManifestClass {
  if (!isRecord(raw) || raw.format !== BACKUP_FORMAT || !isVersion(raw.version)) return { kind: 'foreign' }
  const { version } = raw
  if (version > BACKUP_VERSION) return { kind: 'too-new', version }
  if (version === BACKUP_VERSION) return { kind: 'current', raw }
  if (version === PREVIOUS_BACKUP_VERSION) return { kind: 'previous', raw, from: version }
  return { kind: 'too-old', version }
}

/** O backup em JSON de antes do ZIP não tem `format`: é reconhecido só para
 *  poder dizer ao usuário que aquele formato deixou de ser lido. */
export function isLegacyJsonBackup(raw: unknown): boolean {
  if (!isRecord(raw) || 'format' in raw) return false
  return LEGACY_JSON_VERSIONS.includes(raw.version) && Array.isArray(raw.decks) && Array.isArray(raw.cards)
}

/** v3 → v4: a v4 só acrescenta `appVersion`, que a v3 não registrava. */
export function upgradeFromPrevious(raw: unknown): unknown {
  if (!isRecord(raw)) return raw
  return { ...raw, version: BACKUP_VERSION, appVersion: null }
}
