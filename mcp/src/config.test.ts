import { describe, expect, it } from 'vitest'
import {
  ConfigError,
  HOSTED_APP_URL,
  readConfig,
  type FileConfig,
} from './config.ts'

const paths = { home: '/home/ada', cwd: '/work' }

function files(env: Record<string, string | undefined>) {
  const config = readConfig(env, paths)
  if (config.backend !== 'files') throw new Error('expected the file backend')
  return config
}

function http(env: Record<string, string | undefined>) {
  const config = readConfig(env, paths)
  if (config.backend !== 'http') throw new Error('expected the HTTP backend')
  return config
}

describe('readConfig', () => {
  it.each([
    [{ YODO_URL: 'not a url' }, 'YODO_URL is not a valid URL'],
    [{ YODO_URL: 'file:///tmp/yodo' }, 'must be an http or https URL'],
  ])('rejects %j', (env, message) => {
    expect(() => readConfig(env, paths)).toThrow(ConfigError)
    expect(() => readConfig(env, paths)).toThrow(message)
  })

  it.each([
    ['http://127.0.0.1:8080', 'http://127.0.0.1:8080/'],
    ['https://yodo.example.com/yodo', 'https://yodo.example.com/yodo/'],
    [
      'https://yodo.example.com/yodo/?x=1#top',
      'https://yodo.example.com/yodo/',
    ],
  ])('normalises %s to the app root %s', (url, root) => {
    expect(http({ YODO_URL: url }).baseUrl.href).toBe(root)
  })

  it('reads an optional token', () => {
    expect(http({ YODO_URL: 'http://h/' }).token).toBeUndefined()
    expect(
      http({ YODO_URL: 'http://h/', YODO_API_TOKEN: '' }).token,
    ).toBeUndefined()
    expect(http({ YODO_URL: 'http://h/', YODO_API_TOKEN: ' abc ' }).token).toBe(
      'abc',
    )
  })
})

// Without YODO_URL the server keeps files in a directory (ADR 0064).
describe('readConfig for the file backend', () => {
  const hosted = new URL(HOSTED_APP_URL)

  it.each<[Record<string, string>, Omit<FileConfig, 'appUrl'>]>([
    [{}, { backend: 'files', dir: '/home/ada/Yodo' }],
    [{ YODO_URL: '  ' }, { backend: 'files', dir: '/home/ada/Yodo' }],
    [{ YODO_MCP_DIR: '/data/yodo' }, { backend: 'files', dir: '/data/yodo' }],
    [
      { YODO_MCP_DIR: ' ~/Drawings ' },
      { backend: 'files', dir: '/home/ada/Drawings' },
    ],
    [{ YODO_MCP_DIR: '~' }, { backend: 'files', dir: '/home/ada' }],
    [{ YODO_MCP_DIR: 'drawings' }, { backend: 'files', dir: '/work/drawings' }],
    [{ YODO_MCP_DIR: '' }, { backend: 'files', dir: '/home/ada/Yodo' }],
  ])('reads %j as %j', (env, config) => {
    expect(readConfig(env, paths)).toEqual({ ...config, appUrl: hosted })
  })

  it.each([
    ['https://draw.example.com/yodo', 'https://draw.example.com/yodo/'],
    ['http://127.0.0.1:5173/?x=1#/d/a', 'http://127.0.0.1:5173/'],
    ['  ', HOSTED_APP_URL],
  ])('reads YODO_APP_URL %j as %s', (raw, root) => {
    expect(files({ YODO_APP_URL: raw }).appUrl.href).toBe(root)
  })

  it.each([
    ['not a url', 'YODO_APP_URL is not a valid URL'],
    ['javascript:alert(1)', 'YODO_APP_URL must be an http or https URL'],
  ])('rejects YODO_APP_URL %j', (raw, message) => {
    expect(() => readConfig({ YODO_APP_URL: raw }, paths)).toThrow(message)
  })

  it('prefers YODO_URL when both are set', () => {
    const env = { YODO_URL: 'http://h/', YODO_MCP_DIR: '/data/yodo' }
    expect(readConfig(env, paths).backend).toBe('http')
  })

  it('rejects a token without a URL, a sign of a misconfigured URL', () => {
    const env = { YODO_API_TOKEN: 'abc' }
    expect(() => readConfig(env, paths)).toThrow(ConfigError)
    expect(() => readConfig(env, paths)).toThrow(
      'YODO_API_TOKEN is set but YODO_URL is not',
    )
  })
})
