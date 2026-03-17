import { Router } from 'express'
import { z } from 'zod'
import { supabaseAnon } from '../lib/supabase.js'
import { ensureAuth } from '../middlewares/auth.js'
import { asyncHandler, AppError } from '../utils/http.js'
import { env } from '../config/env.js'

const authRoutes = Router()

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
})

type AuthTokenPayload = {
  access_token: string
  refresh_token: string
  expires_in: number
  expires_at: number
  token_type: string
  user: {
    id: string
    email?: string
  }
}

authRoutes.post(
  '/login',
  asyncHandler(async (req, res) => {
    const { email, password } = loginSchema.parse(req.body)
    const { data, error } = await supabaseAnon.auth.signInWithPassword({ email, password })

    if (!error && data.session) {
      res.status(200).json({
        user: data.user,
        session: data.session,
      })
      return
    }

    const authResponse = await fetch(`${env.SUPABASE_URL.replace(/\/$/, '')}/auth/v1/token?grant_type=password`, {
      method: 'POST',
      headers: {
        apikey: env.SUPABASE_ANON_KEY,
        Authorization: `Bearer ${env.SUPABASE_ANON_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ email, password }),
    })

    if (!authResponse.ok) {
      throw new AppError('Credenciais inválidas.', 401)
    }

    const authPayload = (await authResponse.json()) as Partial<AuthTokenPayload>
    if (!authPayload?.access_token || !authPayload?.user) {
      throw new AppError('Credenciais inválidas.', 401)
    }

    res.status(200).json({
      user: authPayload.user,
      session: {
        access_token: authPayload.access_token,
        refresh_token: authPayload.refresh_token,
        expires_in: authPayload.expires_in,
        expires_at: authPayload.expires_at,
        token_type: authPayload.token_type,
      },
    })
  }),
)

authRoutes.get(
  '/me',
  ensureAuth,
  asyncHandler(async (req, res) => {
    const { data, error } = await supabaseAnon.auth.getUser(req.accessToken)
    if (error || !data.user) {
      throw new AppError('Usuário não autenticado.', 401)
    }
    res.status(200).json({ user: data.user })
  }),
)

authRoutes.post(
  '/logout',
  ensureAuth,
  asyncHandler(async (_req, res) => {
    res.status(200).json({ message: 'Logout efetuado no cliente.' })
  }),
)

export { authRoutes }
