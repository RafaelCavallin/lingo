/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

declare const __APP_PACKAGE_VERSION__: string
declare const __APP_COMMIT_SHA__: string | null

declare module '*?url' {
  const src: string
  export default src
}
