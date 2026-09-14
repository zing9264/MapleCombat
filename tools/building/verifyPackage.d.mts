// verifyPackage.mjs 的型別宣告 —— 工具腳本用 .mjs 寫（不需要編譯就能跑），
// 但它的測試在 vitest 裡，所以補一份宣告讓 typecheck 有東西可看。

export interface Secret {
  value: string
  label: string
}

export interface Hit extends Secret {
  file: string
}

export function secretsFrom(snapshot: unknown): Secret[]
export function listFiles(dir: string): string[]
export function scanFiles(files: string[], secrets: Secret[]): Hit[]
export function unexpectedEntries(dir: string): string[]
export const ALLOWED_ENTRIES: ReadonlySet<string>
