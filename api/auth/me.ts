// api/auth/me.ts

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAuth } from '../_lib/middleware'
import sql from '../_lib/db'

export default requireAuth(async (req, res, authUser) => {
  const [user] = await sql`
    SELECT id, email, display_name, role, is_active, created_at
    FROM users WHERE id = ${authUser.id}
  `
  if (!user) return res.status(404).json({ error: '用户不存在' })
  return res.json({ user })
})
