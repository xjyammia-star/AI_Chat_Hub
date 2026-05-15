// api/settings/profile.ts
// 用户个人设置 API

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAuth } from '../_lib/middleware.js'
import sql from '../_lib/db.js'
import bcrypt from 'bcryptjs'

export default requireAuth(async (req, res, authUser): Promise<void> => {
  if (req.method !== 'PUT') { res.status(405).json({ error: 'Method not allowed' }); return }

  const { display_name, current_password, new_password } = req.body

  // 更新昵称
  if (display_name !== undefined) {
    await sql`UPDATE users SET display_name = ${display_name}, updated_at = NOW() WHERE id = ${authUser.id}`
  }

  // 修改密码
  if (current_password && new_password) {
    if (new_password.length < 8) { res.status(400).json({ error: '新密码至少8位' }); return }

    const [user] = await sql`SELECT password_hash FROM users WHERE id = ${authUser.id}`
    const valid = await bcrypt.compare(current_password, user.password_hash)
    if (!valid) { res.status(400).json({ error: '当前密码不正确' }); return }

    const hash = await bcrypt.hash(new_password, 12)
    await sql`UPDATE users SET password_hash = ${hash}, updated_at = NOW() WHERE id = ${authUser.id}`
  }

  res.json({ success: true })
})
