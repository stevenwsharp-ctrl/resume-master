/// <reference types="vite/client" />

declare module 'mammoth/mammoth.browser.min.js' {
  export function extractRawText(input: { arrayBuffer: ArrayBuffer }): Promise<{ value: string }>
}
