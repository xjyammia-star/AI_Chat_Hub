// api/reputation/index.ts
// 查询和更新 AI 爵位积分

import { requireAuth } from '../_lib/middleware.js'
import sql from '../_lib/db.js'

export default requireAuth(async (req, res, authUser): Promise<void> => {

  // GET /api/reputation — 获取当前用户所有 AI 的积分
  if (req.method === 'GET') {
    const rows = await sql`
      SELECT ai_member_id, score
      FROM ai_reputation
      WHERE user_id = ${authUser.id}
    `
    const map: Record<string, number> = {}
    for (const row of rows) {
      map[row.ai_member_id as string] = row.score as number
    }
    res.json({ scores: map })
    return
  }

  res.status(405).json({ error: 'Method not allowed' })
})
