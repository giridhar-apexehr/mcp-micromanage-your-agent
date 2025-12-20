import * as client from 'openid-client'
import {
  Strategy,
  type StrategyOptions,
  type VerifyFunction,
} from 'openid-client/passport'
import type express from 'express'
import session from 'express-session'
import passport from 'passport'

type UserClaims = {
  sub?: string
  email?: string
  name?: string
  preferred_username?: string
  picture?: string
  [key: string]: unknown
}

type ProviderId = 'oidc' | 'google'

type ProviderDefinition = {
  id: ProviderId
  displayName: string
  issuerUrl: () => string | undefined
  clientId: () => string | undefined
  clientSecret: () => string | undefined
  scope: () => string
  callbackUrl: (req: express.Request) => string
}

const parseCommaList = (value: string | undefined): string[] => {
  if (!value) return []
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

const buildUiRedirectUrl = (
  req: express.Request,
  path: string,
  extra?: Record<string, string>,
): string => {
  const base = process.env.UI_BASE_URL
  const origin = base
    ? base.replace(/\/$/, '')
    : `${req.protocol}://${req.get('host')}`

  const url = new URL(
    path.startsWith('/') ? `${origin}${path}` : `${origin}/${path}`,
  )
  for (const [k, v] of Object.entries(extra ?? {})) {
    url.searchParams.set(k, v)
  }
  return url.toString()
}

const getEnabledProviders = (): ProviderId[] => {
  const configured = parseCommaList(process.env.AUTH_PROVIDERS)
  if (configured.length > 0) {
    return configured.filter(
      (p): p is ProviderId => p === 'oidc' || p === 'google',
    )
  }

  const single = (process.env.AUTH_PROVIDER ?? 'oidc').trim()
  if (single === 'google') return ['google']
  return ['oidc', 'google']
}

const getProviderDefinitions = (): Record<ProviderId, ProviderDefinition> => {
  return {
    oidc: {
      id: 'oidc',
      displayName: 'OIDC',
      issuerUrl: () => process.env.OIDC_ISSUER_URL,
      clientId: () => process.env.OIDC_CLIENT_ID,
      clientSecret: () => process.env.OIDC_CLIENT_SECRET,
      scope: () => process.env.OIDC_SCOPE ?? 'openid email profile',
      callbackUrl: (req) =>
        process.env.OIDC_CALLBACK_URL ??
        `${req.protocol}://${req.get('host')}/auth/oidc/callback`,
    },
    google: {
      id: 'google',
      displayName: 'Google',
      issuerUrl: () => 'https://accounts.google.com',
      clientId: () => process.env.GOOGLE_CLIENT_ID,
      clientSecret: () => process.env.GOOGLE_CLIENT_SECRET,
      scope: () => process.env.GOOGLE_SCOPE ?? 'openid email profile',
      callbackUrl: (req) =>
        process.env.GOOGLE_CALLBACK_URL ??
        `${req.protocol}://${req.get('host')}/auth/google/callback`,
    },
  }
}

export const registerAuth = (app: express.Express): void => {
  const secret = process.env.SESSION_SECRET
  if (!secret && process.env.NODE_ENV === 'production') {
    throw new Error('SESSION_SECRET is required in production')
  }

  app.use(
    session({
      secret: secret ?? 'dev-session-secret',
      resave: false,
      saveUninitialized: false,
      cookie: {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
      },
    }),
  )

  app.use(passport.initialize())
  app.use(passport.session())

  passport.serializeUser((user, cb) => {
    cb(null, user)
  })

  passport.deserializeUser((user, cb) => {
    cb(null, user as Express.User)
  })

  const providers = getEnabledProviders()
  const definitions = getProviderDefinitions()

  const initialized = new Set<ProviderId>()
  const initPromises = new Map<ProviderId, Promise<void>>()

  const ensureStrategy = async (
    providerId: ProviderId,
    req: express.Request,
  ): Promise<void> => {
    if (initialized.has(providerId)) return

    const existing = initPromises.get(providerId)
    if (existing) {
      await existing
      return
    }

    const promise = (async () => {
      const def = definitions[providerId]

      const issuer = def.issuerUrl()
      const clientId = def.clientId()
      const clientSecret = def.clientSecret()

      if (!issuer || !clientId || !clientSecret) {
        throw new Error(`Auth provider not configured: ${providerId}`)
      }

      const config = await client.discovery(
        new URL(issuer),
        clientId,
        clientSecret,
      )

      const verify: VerifyFunction = (tokens, verified) => {
        const claims = tokens.claims() as UserClaims | undefined
        if (!claims) {
          verified(new Error('Missing ID token claims'))
          return
        }
        verified(null, claims as Express.User)
      }

      const options: StrategyOptions = {
        config,
        scope: def.scope(),
        callbackURL: def.callbackUrl(req),
      }

      passport.use(providerId, new Strategy(options, verify))

      initialized.add(providerId)
    })()

    initPromises.set(providerId, promise)
    await promise
  }

  app.get('/auth/providers', (_req, res) => {
    res.status(200).json({
      providers: providers.map((id) => {
        const def = definitions[id]
        return {
          id,
          displayName: def.displayName,
          configured: Boolean(
            def.clientId() && def.clientSecret() && def.issuerUrl(),
          ),
        }
      }),
    })
  })

  app.get('/auth/:provider/login', async (req, res, next) => {
    const providerId = req.params.provider as ProviderId
    if (!providers.includes(providerId)) {
      res.status(404).json({ error: 'Unknown auth provider' })
      return
    }

    const successRedirect = buildUiRedirectUrl(
      req,
      process.env.UI_AUTH_SUCCESS_PATH ?? '/',
    )
    const failureRedirect = buildUiRedirectUrl(
      req,
      process.env.UI_AUTH_FAILURE_PATH ?? '/login',
    )

    try {
      await ensureStrategy(providerId, req)
      passport.authenticate(providerId, {
        successRedirect,
        failureRedirect,
      })(req, res, next)
    } catch (error) {
      res.redirect(
        buildUiRedirectUrl(req, process.env.UI_AUTH_FAILURE_PATH ?? '/login', {
          error: String(error),
        }),
      )
    }
  })

  app.get('/auth/:provider/callback', async (req, res, next) => {
    const providerId = req.params.provider as ProviderId
    if (!providers.includes(providerId)) {
      res.status(404).json({ error: 'Unknown auth provider' })
      return
    }

    const successRedirect = buildUiRedirectUrl(
      req,
      process.env.UI_AUTH_SUCCESS_PATH ?? '/',
    )
    const failureRedirect = buildUiRedirectUrl(
      req,
      process.env.UI_AUTH_FAILURE_PATH ?? '/login',
    )

    try {
      await ensureStrategy(providerId, req)
      passport.authenticate(providerId, {
        successRedirect,
        failureRedirect,
      })(req, res, next)
    } catch (error) {
      res.redirect(
        buildUiRedirectUrl(req, process.env.UI_AUTH_FAILURE_PATH ?? '/login', {
          error: String(error),
        }),
      )
    }
  })
}
