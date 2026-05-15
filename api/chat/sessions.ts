// api/chat/sessions.ts

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAuth } from '../_lib/middleware.js'
import sql from '../_lib/db.js'

export default requireAuth(async (req, res, authUser) => {
  if (req.method === 'GET') {
    const sessions = await sql`
      SELECT s.*,
        (SELECT content FROM chat_messages
         WHERE session_id = s.id ORDER BY created_at DESC LIMIT 1) as last_message
      FROM chat_sessions s
      WHERE s.user_id = ${authUser.id}
      ORDER BY s.is_pinned DESC, s.updated_at DESC
    `
    return res.json({ sessions })
  }

  if (req.method === 'POST') {
    const { mode = 'normal', title } = req.body
    const [session] = await sql`
      INSERT INTO chat_sessions (user_id, title, chat_mode)
      VALUES (${authUser.id}, ${title || '新对话'}, ${mode})
      RETURNING *
    `
    return res.status(201).json({ session })
  }

  if (req.method === 'PUT') {
    const { id, title, category, is_archived, is_pinned } = req.body

    const updates: Record<string, unknown> = { updated_at: new Date() }
    if (title !== undefined) updates.title = title
    if (category !== undefined) updates.category = category
    if (is_archived !== undefined) updates.is_archived = is_archived
    if (is_pinned !== undefined) updates.is_pinned = is_pinned

    const setClauses = Object.entries(updates)
      .map(([k]) => `${k} = $${k}`)
      .join(', ')

    // 用参数化查询更新
    if (title !== undefined) {
      await sql`UPDATE chat_sessions SET title = ${title}, updated_at = NOW() WHERE id = ${id} AND user_id = ${authUser.id}`
    }
    if (is_archived !== undefined) {
      await sql`UPDATE chat_sessions SET is_archived = ${is_archived}, updated_at = NOW() WHERE id = ${id} AND user_id = ${authUser.id}`
    }
    if (is_pinned !== undefined) {
      await sql`UPDATE chat_sessions SET is_pinned = ${is_pinned}, updated_at = NOW() WHERE id = ${id} AND user_id = ${authUser.id}`
    }
    if (category !== undefined) {
      await sql`UPDATE chat_sessions SET category = ${category}, updated_at = NOW() WHERE id = ${id} AND user_id = ${authUser.id}`
    }

    return res.json({ success: true })
  }

  if (req.method === 'DELETE') {
    const { id } = req.body
    await sql`DELETE FROM chat_sessions WHERE id = ${id} AND user_id = ${authUser.id}`
    return res.json({ success: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
})
