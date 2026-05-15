// api/chat/save_local.ts
// 保存本地 AI 消息到数据库

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAuth } from '../_lib/middleware.js'
import sql from '../_lib/db.js'

export default requireAuth(async (req, res, authUser): Promise<void> => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return }

  const { session_id, sender_id, sender_name, sender_avatar, content, model } = req.body

  // 验证会话归属
  const [session] = await sql`SELECT id FROM chat_sessions WHERE id = ${session_id} AND user_id = ${authUser.id}`
  if (!session) { res.status(404).json({ error: '会话不存在' }); return }

  const [msg] = await sql`
    INSERT INTO chat_messages (session_id, sender_type, sender_id, sender_name, sender_avatar, content, metadata)
    VALUES (${session_id}, 'ai', ${sender_id}, ${sender_name}, ${sender_avatar || '🦙'}, ${content}, ${JSON.stringify({ model, is_local: true })})
    RETURNING *
  `
  await sql`UPDATE chat_sessions SET updated_at = NOW() WHERE id = ${session_id}`

  res.json({ message: msg })
})
