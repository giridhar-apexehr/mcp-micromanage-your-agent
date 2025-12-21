export type McpProxyConfig =
  | {
      mode: 'local'
    }
  | {
      mode: 'remote'
      serverBaseUrl: string
      apiKey: string
    }

type ParsedArgs = {
  serverBaseUrl?: string
  apiKey?: string
}

const normalizeBaseUrl = (value: string): string => {
  const raw = value.trim().replace(/\/+$/, '')
  const parsed = new URL(raw)
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new Error('--mcp-server-base-url must start with http:// or https://')
  }
  return parsed.toString().replace(/\/+$/, '')
}

const parseArgs = (argv: string[]): ParsedArgs => {
  const parsed: ParsedArgs = {}

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i]
    if (token === '--mcp-server-base-url') {
      parsed.serverBaseUrl = argv[i + 1]
      i += 1
      continue
    }
    if (token === '--mcp-api-key') {
      parsed.apiKey = argv[i + 1]
      i += 1
      continue
    }
  }

  return parsed
}

export const loadMcpProxyConfig = (
  argv: string[] = process.argv.slice(2),
): McpProxyConfig => {
  const args = parseArgs(argv)

  const baseUrlRaw = args.serverBaseUrl
  if (!baseUrlRaw || !baseUrlRaw.trim()) {
    return { mode: 'local' }
  }

  const apiKeyRaw = args.apiKey
  if (!apiKeyRaw || !apiKeyRaw.trim()) {
    throw new Error(
      '--mcp-api-key is required when --mcp-server-base-url is set',
    )
  }

  return {
    mode: 'remote',
    serverBaseUrl: normalizeBaseUrl(baseUrlRaw),
    apiKey: apiKeyRaw.trim(),
  }
}
