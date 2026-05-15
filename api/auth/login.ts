// api/auth/login.ts

import type { VercelRequest, VercelResponse } from '@vercel/node'
import bcrypt from 'bcryptjs'
import { SignJWT } from 'jose'
import sql from '../_lib/db.js'

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'fallback-secret')

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { email, password } = req.body
  if (!email || !password) return res.status(400).json({ error: '邮箱和密码不能为空' })

  try {
    const [user] = await sql`SELECT * FROM users WHERE email = ${email} AND is_active = true`
    if (!user) return res.status(401).json({ error: '邮箱或密码错误' })

    const valid = await bcrypt.compare(password, user.password_hash)
    if (!valid) return res.status(401).json({ error: '邮箱或密码错误' })

    const token = await new SignJWT({ id: user.id, email: user.email, role: user.role })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('7d')
      .sign(JWT_SECRET)

    const { password_hash, ...safeUser } = user
    return res.json({ user: safeUser, token })
  } catch (err) {
    console.error('Login error:', err)
    return res.status(500).json({ error: '登录失败' })
  }
}
