import * as client from 'openid-client'
import {
  Strategy,
  type StrategyOptions,
  type VerifyFunction,
} from 'openid-client/passport'
import type express from 'express'
import session from 'express-session'
import passport from 'passport'

import { createDatabase, destroyDatabase } from '../db/index.js'
import { provisionUserAndDefaultWorkspace } from './provision.js'

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
  requiredEnvKeys: string[]
  optionalEnvKeys: string[]
}

class GoogleStrategy extends Strategy {
  #hostedDomain: string

  constructor(
    options: StrategyOptions,
    verify: VerifyFunction,
    hostedDomain: string,
  ) {
    super(options, verify)
    this.#hostedDomain = hostedDomain
  }

  authorizationRequestParams(
    req: express.Request,
    options: Parameters<Strategy['authorizationRequestParams']>[1],
  ) {
    const base = super.authorizationRequestParams(req, options)
    if (!base) return { hd: this.#hostedDomain }
    if (base instanceof URLSearchParams) {
      base.set('hd', this.#hostedDomain)
      return base
    }
    return { ...base, hd: this.#hostedDomain }
  }
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
      requiredEnvKeys: [
        'OIDC_ISSUER_URL',
        'OIDC_CLIENT_ID',
        'OIDC_CLIENT_SECRET',
      ],
      optionalEnvKeys: ['OIDC_SCOPE', 'OIDC_CALLBACK_URL'],
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
      requiredEnvKeys: ['GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'],
      optionalEnvKeys: [
        'GOOGLE_SCOPE',
        'GOOGLE_CALLBACK_URL',
        'GOOGLE_HOSTED_DOMAIN',
      ],
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

      if (providerId === 'google') {
        const hostedDomain = process.env.GOOGLE_HOSTED_DOMAIN
        if (hostedDomain) {
          passport.use(
            providerId,
            new GoogleStrategy(options, verify, hostedDomain),
          )
          initialized.add(providerId)
          return
        }
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
        const missingConfigKeys = def.requiredEnvKeys.filter(
          (key) => !process.env[key],
        )
        return {
          id,
          displayName: def.displayName,
          configured: Boolean(
            def.clientId() && def.clientSecret() && def.issuerUrl(),
          ),
          requiredEnvKeys: def.requiredEnvKeys,
          optionalEnvKeys: def.optionalEnvKeys,
          missingConfigKeys,
          loginUrl: `/auth/${id}/login`,
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

    try {
      await ensureStrategy(providerId, req)
    } catch (error) {
      res.redirect(
        buildUiRedirectUrl(req, process.env.UI_AUTH_FAILURE_PATH ?? '/login', {
          error: String(error),
        }),
      )
      return
    }

    passport.authenticate(
      providerId,
      (err: unknown, user: Express.User | false) => {
        if (err || !user) {
          res.redirect(
            buildUiRedirectUrl(
              req,
              process.env.UI_AUTH_FAILURE_PATH ?? '/login',
              {
                error: String(err ?? 'Authentication failed'),
              },
            ),
          )
          return
        }

        req.logIn(user, async (loginErr) => {
          if (loginErr) {
            res.redirect(
              buildUiRedirectUrl(
                req,
                process.env.UI_AUTH_FAILURE_PATH ?? '/login',
                {
                  error: String(loginErr),
                },
              ),
            )
            return
          }

          try {
            const handle = createDatabase()
            try {
              const { userId } = await provisionUserAndDefaultWorkspace(
                handle.db,
                {
                  providerId,
                  claims: user as { sub?: string; email?: string },
                },
              )

              if (req.session) {
                req.session.userId = userId
              }
            } finally {
              await destroyDatabase(handle)
            }

            res.redirect(successRedirect)
          } catch (provisionErr) {
            res.redirect(
              buildUiRedirectUrl(
                req,
                process.env.UI_AUTH_FAILURE_PATH ?? '/login',
                {
                  error: String(provisionErr),
                },
              ),
            )
          }
        })
      },
    )(req, res, next)
  })
}
