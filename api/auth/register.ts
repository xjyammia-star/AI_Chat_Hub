// api/auth/register.ts

import type { VercelRequest, VercelResponse } from '@vercel/node'
import bcrypt from 'bcryptjs'
import { SignJWT } from 'jose'
import sql from '../_lib/db.js'

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || 'fallback-secret')

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { email, password, display_name, invite_code } = req.body

  if (!email || !password) return res.status(400).json({ error: '邮箱和密码不能为空' })
  if (password.length < 8) return res.status(400).json({ error: '密码至少 8 位' })

  // 验证邮箱格式
  const emailRe = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRe.test(email)) return res.status(400).json({ error: '邮箱格式不正确' })

  // 判断是否注册为管理员
  let role: 'admin' | 'user' = 'user'
  if (invite_code) {
    if (invite_code !== process.env.ADMIN_INVITE_CODE) {
      return res.status(400).json({ error: '管理员邀请码不正确' })
    }
    role = 'admin'
  }

  try {
    // 检查邮箱是否已注册
    const existing = await sql`SELECT id FROM users WHERE email = ${email}`
    if (existing.length > 0) return res.status(400).json({ error: '该邮箱已注册' })

    // 加密密码
    const hash = await bcrypt.hash(password, 12)

    // 创建用户
    const [user] = await sql`
      INSERT INTO users (email, password_hash, display_name, role)
      VALUES (${email}, ${hash}, ${display_name || email.split('@')[0]}, ${role})
      RETURNING id, email, display_name, role, is_active, created_at
    `

    // 签发 JWT
    const token = await new SignJWT({ id: user.id, email: user.email, role: user.role })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('7d')
      .sign(JWT_SECRET)

    return res.status(201).json({ user, token })
  } catch (err) {
    console.error('Register error:', err)
    return res.status(500).json({ error: '注册失败，请稍后重试' })
  }
}
