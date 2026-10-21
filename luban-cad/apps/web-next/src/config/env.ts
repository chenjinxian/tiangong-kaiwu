/** 构建期环境（Vite 静态注入；缺省值供本地栈直跑）。 */
export const env = {
  msUrl: import.meta.env.VITE_MS_URL ?? 'http://localhost:5401',
  hubUrl: import.meta.env.VITE_HUB_URL ?? 'http://localhost:5400',
} as const;
