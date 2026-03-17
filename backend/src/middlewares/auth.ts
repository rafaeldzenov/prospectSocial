import type { NextFunction, Request, Response } from 'express'
import { supabaseAnon } from '../lib/supabase.js'

export async function ensureAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ message: 'Token ausente.' })
  }

  const accessToken = authHeader.split(' ')[1]
  if (!accessToken) {
    return res.status(401).json({ message: 'Token inválido.' })
  }
  const { data, error } = await supabaseAnon.auth.getUser(accessToken)

  if (error || !data.user) {
    return res.status(401).json({ message: 'Token inválido.' })
  }

  req.userId = data.user.id
  req.accessToken = accessToken
  next()
}
