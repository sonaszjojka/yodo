import { describe, expect, it } from 'vitest'
import { ConfigError, readConfig } from './config.ts'

describe('readConfig', () => {
  it.each([
    [{}, 'YODO_URL is not set'],
    [{ YODO_URL: '  ' }, 'YODO_URL is not set'],
    [{ YODO_URL: 'not a url' }, 'YODO_URL is not a valid URL'],
    [{ YODO_URL: 'file:///tmp/yodo' }, 'must be an http or https URL'],
  ])('rejects %j', (env, message) => {
    expect(() => readConfig(env)).toThrow(ConfigError)
    expect(() => readConfig(env)).toThrow(message)
  })

  it.each([
    ['http://127.0.0.1:8080', 'http://127.0.0.1:8080/'],
    ['https://yodo.example.com/yodo', 'https://yodo.example.com/yodo/'],
    [
      'https://yodo.example.com/yodo/?x=1#top',
      'https://yodo.example.com/yodo/',
    ],
  ])('normalises %s to the app root %s', (url, root) => {
    expect(readConfig({ YODO_URL: url }).baseUrl.href).toBe(root)
  })

  it('reads an optional token', () => {
    expect(readConfig({ YODO_URL: 'http://h/' }).token).toBeUndefined()
    expect(
      readConfig({ YODO_URL: 'http://h/', YODO_API_TOKEN: '' }).token,
    ).toBeUndefined()
    expect(
      readConfig({ YODO_URL: 'http://h/', YODO_API_TOKEN: ' abc ' }).token,
    ).toBe('abc')
  })
})
