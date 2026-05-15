// api/settings/modes.ts
// 对话模式管理 API（管理员可增删改，用户可读）

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAuth } from '../_lib/middleware.js'
import sql from '../_lib/db.js'

export default requireAuth(async (req, res, authUser): Promise<void> => {
  if (req.method === 'GET') {
    const modes = await sql`SELECT * FROM chat_modes ORDER BY created_at`
    res.json({ modes }); return
  }

  // 以下操作需要管理员
  if (authUser.role !== 'admin') {
    res.status(403).json({ error: '需要管理员权限' }); return
  }

  if (req.method === 'POST') {
    const { mode_key, mode_name, description, config } = req.body
    if (!mode_key || !mode_name) { res.status(400).json({ error: '模式标识和名称不能为空' }); return }

    // 检查 key 是否重复
    const existing = await sql`SELECT id FROM chat_modes WHERE mode_key = ${mode_key}`
    if (existing.length > 0) { res.status(400).json({ error: '模式标识已存在' }); return }

    const [mode] = await sql`
      INSERT INTO chat_modes (mode_key, mode_name, description, config)
      VALUES (${mode_key}, ${mode_name}, ${description || ''}, ${JSON.stringify(config || {})})
      RETURNING *
    `
    res.status(201).json({ mode }); return
  }

  if (req.method === 'PUT') {
    const { id, mode_name, description, config, is_enabled } = req.body
    if (mode_name !== undefined) await sql`UPDATE chat_modes SET mode_name = ${mode_name}, updated_at = NOW() WHERE id = ${id}`
    if (description !== undefined) await sql`UPDATE chat_modes SET description = ${description}, updated_at = NOW() WHERE id = ${id}`
    if (config !== undefined) await sql`UPDATE chat_modes SET config = ${JSON.stringify(config)}, updated_at = NOW() WHERE id = ${id}`
    if (is_enabled !== undefined) await sql`UPDATE chat_modes SET is_enabled = ${is_enabled}, updated_at = NOW() WHERE id = ${id}`
    res.json({ success: true }); return
  }

  if (req.method === 'DELETE') {
    const { id } = req.body
    // 不能删除内置模式
    const [mode] = await sql`SELECT mode_key FROM chat_modes WHERE id = ${id}`
    const builtinKeys = ['normal', 'judge', 'bidding', 'shadow', 'rollcall']
    if (mode && builtinKeys.includes(mode.mode_key)) {
      res.status(400).json({ error: '内置模式不可删除' }); return
    }
    await sql`DELETE FROM chat_modes WHERE id = ${id}`
    res.json({ success: true }); return
  }

  res.status(405).json({ error: 'Method not allowed' })
})
