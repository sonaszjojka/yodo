// `?raw` imports, which Vitest resolves to a file's text. The shared contract
// suite (`web/src/storage/contract.ts`) loads its fixture this way; declared
// here rather than through `vite/client`, which would bring in DOM types.
declare module '*?raw' {
  const text: string
  export default text
}
