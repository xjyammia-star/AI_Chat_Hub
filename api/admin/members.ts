// api/admin/members.ts — 管理员 AI 成员管理

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAdmin } from '../_lib/middleware.js'
import sql from '../_lib/db.js'
import { encryptKey } from '../_lib/crypto.js'

export default requireAdmin(async (req, res, authUser) => {
  if (req.method === 'GET') {
    const members = await sql`SELECT id, name, avatar, provider, model, base_url, is_public, allowed_users, is_enabled, sort_order, created_at FROM system_ai_members ORDER BY sort_order, created_at`
    return res.json({ members })
  }

  if (req.method === 'POST') {
    const { name, avatar, provider, model, api_key, base_url, is_public } = req.body
    if (!name || !provider || !model) return res.status(400).json({ error: '必填项不能为空' })

    const encKey = api_key ? encryptKey(api_key) : null

    const [member] = await sql`
      INSERT INTO system_ai_members (name, avatar, provider, model, api_key_enc, base_url, is_public, created_by)
      VALUES (${name}, ${avatar || '🤖'}, ${provider}, ${model}, ${encKey}, ${base_url || null}, ${is_public !== false}, ${authUser.id})
      RETURNING id, name, avatar, provider, model, base_url, is_public, is_enabled, sort_order
    `
    return res.status(201).json({ member })
  }

  if (req.method === 'PUT') {
    const { id, name, avatar, is_public, is_enabled, api_key, allowed_users } = req.body
    if (name !== undefined) await sql`UPDATE system_ai_members SET name = ${name}, updated_at = NOW() WHERE id = ${id}`
    if (avatar !== undefined) await sql`UPDATE system_ai_members SET avatar = ${avatar}, updated_at = NOW() WHERE id = ${id}`
    if (is_public !== undefined) await sql`UPDATE system_ai_members SET is_public = ${is_public}, updated_at = NOW() WHERE id = ${id}`
    if (is_enabled !== undefined) await sql`UPDATE system_ai_members SET is_enabled = ${is_enabled}, updated_at = NOW() WHERE id = ${id}`
    if (api_key) {
      const encKey = encryptKey(api_key)
      await sql`UPDATE system_ai_members SET api_key_enc = ${encKey}, updated_at = NOW() WHERE id = ${id}`
    }
    return res.json({ success: true })
  }

  if (req.method === 'DELETE') {
    const { id } = req.body
    await sql`DELETE FROM system_ai_members WHERE id = ${id}`
    return res.json({ success: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
})
