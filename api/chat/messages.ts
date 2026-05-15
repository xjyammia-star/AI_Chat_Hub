// api/chat/messages.ts

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAuth } from '../_lib/middleware.js'
import sql from '../_lib/db.js'

export default requireAuth(async (req, res, authUser): Promise<void> => {
  if (req.method === 'GET') {
    const { session_id } = req.query

    // 验证会话归属
    const [session] = await sql`
      SELECT id FROM chat_sessions WHERE id = ${session_id as string} AND user_id = ${authUser.id}
    `
    if (!session) return res.status(404).json({ error: '会话不存在' })

    const messages = await sql`
      SELECT * FROM chat_messages
      WHERE session_id = ${session_id as string}
      ORDER BY created_at ASC
    `
    return res.json({ messages })
  }

  return res.status(405).json({ error: 'Method not allowed' })
})
