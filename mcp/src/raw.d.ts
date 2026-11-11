// `?raw` imports, which Vitest resolves to a file's text. The shared contract
// suite (`web/src/storage/contract.ts`) loads its fixture this way; declared
// here rather than through `vite/client`, which would bring in DOM types.
declare module '*?raw' {
  const text: string
  export default text
}

// `?inline` asset imports: the file as a base64 `data:` URL, bundled into
// `dist/index.js` (the fonts, ADR 0065).
declare module '*?inline' {
  const dataUrl: string
  export default dataUrl
}
