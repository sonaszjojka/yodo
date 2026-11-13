// Test helper: a solid-colour PNG, encoded by @napi-rs/canvas.
import { createCanvas } from '@napi-rs/canvas'

/** A solid PNG of `width` x `height`. */
export function solidPng(width: number, height: number, color = '#ff0000') {
  const canvas = createCanvas(width, height)
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = color
  ctx.fillRect(0, 0, width, height)
  return new Uint8Array(canvas.toBuffer('image/png'))
}
