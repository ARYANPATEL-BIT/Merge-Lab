/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Base URL of the Merge Lab API. Unset → the board runs in demo mode. */
  readonly VITE_API_URL?: string;
  /** Bearer token sent as `Authorization: Bearer <token>`. */
  readonly VITE_API_TOKEN?: string;
  /** Repo whose board to render. Defaults to the demo fixture's repo. */
  readonly VITE_REPO?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
