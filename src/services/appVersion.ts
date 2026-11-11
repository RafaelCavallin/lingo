const SHORT_SHA_LENGTH = 7
const LOCAL_BUILD_SUFFIX = 'dev'

export interface AppVersionInput {
  version: string
  commitSha: string | null
}

export function buildAppVersion({ version, commitSha }: AppVersionInput): string {
  const suffix = commitSha ? commitSha.slice(0, SHORT_SHA_LENGTH) : LOCAL_BUILD_SUFFIX
  return `${version}+${suffix}`
}

export const APP_VERSION: string = buildAppVersion({
  version: __APP_PACKAGE_VERSION__,
  commitSha: __APP_COMMIT_SHA__,
})
