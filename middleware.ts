// api/_lib/middleware.ts
// 认证中间件 — 被所有需要认证的 API 调用

import { jwtVerify } from 'jose'
import type { VercelRequest, VercelResponse } from '@vercel/node'

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'fallback-secret-change-me')

export interface AuthUser {
  id: string
  email: string
  role: 'admin' | 'user'
}

export async function verifyAuth(req: VercelRequest): Promise<AuthUser | null> {
  const auth = req.headers.authorization
  if (!auth || !auth.startsWith('Bearer ')) return null

  const token = auth.slice(7)
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET)
    return payload as unknown as AuthUser
  } catch {
    return null
  }
}

export function requireAuth(handler: (req: VercelRequest, res: VercelResponse, user: AuthUser) => Promise<void>) {
  return async (req: VercelRequest, res: VercelResponse) => {
    // 处理 OPTIONS 预检请求
    if (req.method === 'OPTIONS') {
      res.status(200).end()
      return
    }

    const user = await verifyAuth(req)
    if (!user) {
      res.status(401).json({ error: '未授权，请先登录' })
      return
    }
    await handler(req, res, user)
  }
}

export function requireAdmin(handler: (req: VercelRequest, res: VercelResponse, user: AuthUser) => Promise<void>) {
  return async (req: VercelRequest, res: VercelResponse) => {
    if (req.method === 'OPTIONS') {
      res.status(200).end()
      return
    }

    const user = await verifyAuth(req)
    if (!user) {
      res.status(401).json({ error: '未授权' })
      return
    }
    if (user.role !== 'admin') {
      res.status(403).json({ error: '需要管理员权限' })
      return
    }
    await handler(req, res, user)
  }
}
