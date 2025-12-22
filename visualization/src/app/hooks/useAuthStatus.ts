import { useCallback, useEffect, useState } from 'react'

type AuthProvider = {
  id: string
  displayName: string
  loginUrl: string
  configured: boolean
  missingConfigKeys?: string[]
}

type AuthStatusResult = {
  isChecking: boolean
  isAuthenticated: boolean
  providers: AuthProvider[] | null
  error: string | null
  refresh: () => Promise<void>
}

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

const parseProviders = (value: unknown): AuthProvider[] | null => {
  if (!isRecord(value)) return null
  const providers = value.providers
  if (!Array.isArray(providers)) return null

  const parsed: AuthProvider[] = []
  for (const p of providers) {
    if (!isRecord(p)) continue
    if (typeof p.id !== 'string') continue
    if (typeof p.displayName !== 'string') continue
    if (typeof p.loginUrl !== 'string') continue
    if (typeof p.configured !== 'boolean') continue
    parsed.push({
      id: p.id,
      displayName: p.displayName,
      loginUrl: p.loginUrl,
      configured: p.configured,
      missingConfigKeys: Array.isArray(p.missingConfigKeys)
        ? p.missingConfigKeys.filter((k) => typeof k === 'string')
        : undefined,
    })
  }

  return parsed
}

export const useAuthStatus = (): AuthStatusResult => {
  const [isChecking, setIsChecking] = useState<boolean>(true)
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false)
  const [providers, setProviders] = useState<AuthProvider[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setIsChecking(true)
    setError(null)

    try {
      const authzRes = await fetch('/api/workspaces', {
        method: 'GET',
        headers: { accept: 'application/json' },
      })

      if (authzRes.status === 401) {
        setIsAuthenticated(false)

        const providersRes = await fetch('/auth/providers', {
          method: 'GET',
          headers: { accept: 'application/json' },
        })

        const body = (await providersRes.json()) as unknown
        const parsed = parseProviders(body)
        setProviders(parsed)
        return
      }

      if (!authzRes.ok) {
        setError(`Failed to check auth status. Status: ${authzRes.status}`)
        setIsAuthenticated(false)
        return
      }

      setIsAuthenticated(true)
      setProviders(null)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setIsAuthenticated(false)
    } finally {
      setIsChecking(false)
    }
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  return { isChecking, isAuthenticated, providers, error, refresh }
}
