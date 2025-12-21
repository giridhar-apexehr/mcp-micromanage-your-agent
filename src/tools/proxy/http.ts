import type { McpProxyConfig } from './config.js'

type JsonPrimitive = string | number | boolean | null

type JsonValue = JsonPrimitive | { [key: string]: JsonValue } | Array<JsonValue>

type RemoteResult =
  | {
      ok: true
      httpStatus: number
      endpoint: { method: string; path: string }
      data: JsonValue
    }
  | {
      ok: false
      httpStatus: number
      endpoint: { method: string; path: string }
      error: string
      details: JsonValue
    }

export const callRemoteTool = async (
  config: Extract<McpProxyConfig, { mode: 'remote' }>,
  input: {
    method: 'GET' | 'POST'
    path: string
    query?: Record<string, string | number | undefined>
    body?: unknown
  },
): Promise<{
  content: Array<{ type: 'text'; text: string }>
  isError: boolean
}> => {
  const url = new URL(input.path, config.serverBaseUrl)
  for (const [k, v] of Object.entries(input.query ?? {})) {
    if (v === undefined) continue
    url.searchParams.set(k, String(v))
  }

  const endpoint = { method: input.method, path: input.path }

  try {
    const res = await fetch(url.toString(), {
      method: input.method,
      headers: {
        authorization: `Bearer ${config.apiKey}`,
        ...(input.body !== undefined
          ? { 'content-type': 'application/json' }
          : {}),
      },
      body: input.body !== undefined ? JSON.stringify(input.body) : undefined,
    })

    const bodyText = await res.text()
    let parsed: JsonValue = bodyText
    try {
      parsed = JSON.parse(bodyText) as JsonValue
    } catch {
      parsed = bodyText
    }

    const payload: RemoteResult =
      res.status < 400
        ? {
            ok: true,
            httpStatus: res.status,
            endpoint,
            data: parsed,
          }
        : {
            ok: false,
            httpStatus: res.status,
            endpoint,
            error:
              typeof (parsed as { error?: unknown })?.error === 'string'
                ? String((parsed as { error: string }).error)
                : res.statusText || 'Request failed',
            details: parsed,
          }

    return {
      content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
      isError: res.status >= 400,
    }
  } catch (error) {
    const payload: RemoteResult = {
      ok: false,
      httpStatus: 0,
      endpoint,
      error: 'Network error',
      details: error instanceof Error ? error.message : String(error),
    }

    return {
      content: [{ type: 'text', text: JSON.stringify(payload, null, 2) }],
      isError: true,
    }
  }
}
