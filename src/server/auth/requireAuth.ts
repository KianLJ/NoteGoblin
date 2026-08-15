import type { NextFunction, Request, Response } from 'express'
import { verifyToken } from './token'

export interface AuthedRequest extends Request {
  userId?: string
}

export function requireAuth(secret: Buffer) {
  return (req: AuthedRequest, res: Response, next: NextFunction): void => {
    const header = req.header('authorization') ?? ''
    const [scheme, token] = header.split(' ')
    if (scheme !== 'Bearer' || !token) {
      res.status(401).json({ error: 'Missing or malformed Authorization header.' })
      return
    }
    const payload = verifyToken(secret, token)
    if (!payload) {
      res.status(401).json({ error: 'Session is invalid or expired.' })
      return
    }
    req.userId = payload.userId
    next()
  }
}
