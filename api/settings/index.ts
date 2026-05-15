// api/settings/index.ts
// 设置 API — 合并 modes 和 profile（节省 Serverless Function 配额）
// 路由：/api/settings?type=modes 或 /api/settings?type=profile

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAuth } from '../_lib/middleware.js'
import sql from '../_lib/db.js'
import bcrypt from 'bcryptjs'

export default requireAuth(async (req, res, authUser): Promise<any> => {
  const type = req.query.type as string

  // ==================== MODES ====================
  if (type === 'modes') {
    if (req.method === 'GET') {
      const modes = await sql`SELECT * FROM chat_modes ORDER BY created_at`
      return res.json({ modes })
    }

    if (authUser.role !== 'admin') return res.status(403).json({ error: '需要管理员权限' })

    if (req.method === 'POST') {
      const { mode_key, mode_name, description, config } = req.body
      if (!mode_key || !mode_name) return res.status(400).json({ error: '模式标识和名称不能为空' })
      const existing = await sql`SELECT id FROM chat_modes WHERE mode_key = ${mode_key}`
      if (existing.length > 0) return res.status(400).json({ error: '模式标识已存在' })
      const [mode] = await sql`
        INSERT INTO chat_modes (mode_key, mode_name, description, config)
        VALUES (${mode_key}, ${mode_name}, ${description || ''}, ${JSON.stringify(config || {})})
        RETURNING *
      `
      return res.status(201).json({ mode })
    }

    if (req.method === 'PUT') {
      const { id, mode_name, description, config, is_enabled } = req.body
      if (mode_name !== undefined) await sql`UPDATE chat_modes SET mode_name = ${mode_name}, updated_at = NOW() WHERE id = ${id}`
      if (description !== undefined) await sql`UPDATE chat_modes SET description = ${description}, updated_at = NOW() WHERE id = ${id}`
      if (config !== undefined) await sql`UPDATE chat_modes SET config = ${JSON.stringify(config)}, updated_at = NOW() WHERE id = ${id}`
      if (is_enabled !== undefined) await sql`UPDATE chat_modes SET is_enabled = ${is_enabled}, updated_at = NOW() WHERE id = ${id}`
      return res.json({ success: true })
    }

    if (req.method === 'DELETE') {
      const { id } = req.body
      const [mode] = await sql`SELECT mode_key FROM chat_modes WHERE id = ${id}`
      const builtinKeys = ['normal', 'judge', 'bidding', 'shadow', 'rollcall']
      if (mode && builtinKeys.includes(mode.mode_key)) return res.status(400).json({ error: '内置模式不可删除' })
      await sql`DELETE FROM chat_modes WHERE id = ${id}`
      return res.json({ success: true })
    }
  }

  // ==================== PROFILE ====================
  if (type === 'profile') {
    if (req.method !== 'PUT') return res.status(405).json({ error: 'Method not allowed' })

    const { display_name, current_password, new_password } = req.body

    if (display_name !== undefined) {
      await sql`UPDATE users SET display_name = ${display_name}, updated_at = NOW() WHERE id = ${authUser.id}`
    }

    if (current_password && new_password) {
      if (new_password.length < 8) return res.status(400).json({ error: '新密码至少8位' })
      const [user] = await sql`SELECT password_hash FROM users WHERE id = ${authUser.id}`
      const valid = await bcrypt.compare(current_password, user.password_hash)
      if (!valid) return res.status(400).json({ error: '当前密码不正确' })
      const hash = await bcrypt.hash(new_password, 12)
      await sql`UPDATE users SET password_hash = ${hash}, updated_at = NOW() WHERE id = ${authUser.id}`
    }

    return res.json({ success: true })
  }

  return res.status(400).json({ error: '请指定 type 参数：modes 或 profile' })
})
