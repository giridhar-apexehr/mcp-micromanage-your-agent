import { loadMcpProxyConfig } from '../../dist/tools/proxy/config.js'

describe('mcp proxy config', () => {
  test('defaults to local mode when args are missing', () => {
    expect(loadMcpProxyConfig([])).toEqual({ mode: 'local' })
  })

  test('throws when base URL arg is set but API key arg is missing', () => {
    expect(() =>
      loadMcpProxyConfig(['--mcp-server-base-url', 'http://localhost:8787']),
    ).toThrow('--mcp-api-key is required when --mcp-server-base-url is set')
  })

  test('normalizes base URL and loads remote config', () => {
    expect(
      loadMcpProxyConfig([
        '--mcp-server-base-url',
        'http://localhost:8787///',
        '--mcp-api-key',
        'pat-secret',
      ]),
    ).toEqual({
      mode: 'remote',
      serverBaseUrl: 'http://localhost:8787',
      apiKey: 'pat-secret',
    })
  })
})
