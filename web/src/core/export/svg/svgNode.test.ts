import { describe, expect, test } from 'vitest'
import { el, serialize, text } from './svgNode.ts'

describe('serialize', () => {
  test('writes attributes in order and self-closes empty elements', () => {
    expect(serialize(el('rect', { x: 1, y: 2.5, fill: 'none' }))).toBe(
      '<rect x="1" y="2.5" fill="none"/>',
    )
  })

  test('skips undefined attributes', () => {
    expect(serialize(el('rect', { x: 1, opacity: undefined }))).toBe(
      '<rect x="1"/>',
    )
  })

  test('escapes attribute values and text', () => {
    const node = el('text', { 'font-family': '"A & B"' }, [
      text('a < b & c > d'),
    ])
    expect(serialize(node)).toBe(
      '<text font-family="&quot;A &amp; B&quot;">a &lt; b &amp; c &gt; d</text>',
    )
  })

  test('nests children without adding whitespace', () => {
    const node = el('g', {}, [el('path', { d: 'M0 0' }), text(' hi ')])
    expect(serialize(node)).toBe('<g><path d="M0 0"/> hi </g>')
  })

  test('drops characters XML cannot hold', () => {
    expect(serialize(text('a\u0000b\u0008c'))).toBe('abc')
  })
})
