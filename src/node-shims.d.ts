// Minimal typings for the few Node APIs the build test (src/pwa.test.ts) uses,
// so the project needs no @types/node dependency.
declare module 'node:fs' {
  export function existsSync(path: string): boolean
  export function mkdtempSync(prefix: string): string
  export function readFileSync(path: string, encoding: 'utf8'): string
  export function rmSync(path: string, options?: { recursive?: boolean; force?: boolean }): void
}
declare module 'node:os' {
  export function tmpdir(): string
}
declare module 'node:path' {
  export function join(...parts: string[]): string
  export function resolve(...parts: string[]): string
}
interface ImportMeta {
  dirname: string
}
