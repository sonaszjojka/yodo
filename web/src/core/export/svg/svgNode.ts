// A tiny SVG node tree and its serialiser (ADR 0043). The export builds nodes
// instead of strings so escaping happens in one place, and it needs no DOM, so
// the core stays testable in Node.

export type SvgNode =
  { tag: string; attrs: Attrs; children: SvgNode[] } | { text: string }

export type Attrs = Record<string, string | number | undefined>

export function el(
  tag: string,
  attrs: Attrs = {},
  children: SvgNode[] = [],
): SvgNode {
  return { tag, attrs, children }
}

export function text(value: string): SvgNode {
  return { text: value }
}

// Characters XML 1.0 forbids: control codes except tab, newline, carriage return.
// eslint-disable-next-line no-control-regex
const FORBIDDEN = /[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g

function escape(value: string) {
  return value
    .replace(FORBIDDEN, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function serialize(node: SvgNode): string {
  if ('text' in node) return escape(node.text)
  const attrs = Object.entries(node.attrs)
    .filter(([, value]) => value !== undefined)
    .map(([name, value]) => ` ${name}="${escape(String(value))}"`)
    .join('')
  if (node.children.length === 0) return `<${node.tag}${attrs}/>`
  return `<${node.tag}${attrs}>${node.children.map(serialize).join('')}</${node.tag}>`
}
