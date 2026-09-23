/// <reference types="vite/client" />

/* eslint-disable @typescript-eslint/naming-convention */
interface ImportMetaEnv {
  readonly VITE_IMODELHUB_URL: string
  readonly VITE_API_URL: string
  readonly VITE_WEBSOCKET_URL: string
  readonly VITE_STORAGE_URL: string
  readonly VITE_OIDC_AUTHORITY: string
  readonly VITE_OIDC_CLIENT_ID: string
  readonly VITE_OIDC_REDIRECT_URI: string
  readonly VITE_OIDC_POST_LOGOUT_REDIRECT_URI: string
  readonly VITE_WEBHOOK_SECRET: string
  readonly VITE_AZURE_STORAGE_ACCOUNT: string
  readonly VITE_AZURE_STORAGE_CONTAINER: string
  readonly VITE_AZURE_STORAGE_SAS_TOKEN: string
  readonly DEV: boolean
  readonly PROD: boolean
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
/* eslint-enable @typescript-eslint/naming-convention */
