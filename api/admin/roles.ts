// api/admin/roles.ts
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAuth } from '../_lib/middleware.js'
import sql from '../_lib/db.js'

export default requireAuth(async (req, res, authUser): Promise<void> => {
  if (req.method === 'GET') {
    const roles = await sql`
      SELECT * FROM ai_roles
      WHERE is_public = true OR created_by = ${authUser.id}
      ORDER BY is_public DESC, created_at
    `
    return res.json({ roles })
  }

  if (req.method === 'POST') {
    const { name, description, system_prompt, category, is_public } = req.body
    if (!name || !system_prompt) return res.status(400).json({ error: '名称和提示词不能为空' })
    const publicFlag = authUser.role === 'admin' ? (is_public !== false) : false
    const [role] = await sql`
      INSERT INTO ai_roles (name, description, system_prompt, category, is_public, created_by)
      VALUES (${name}, ${description || ''}, ${system_prompt}, ${category || '通用'}, ${publicFlag}, ${authUser.id})
      RETURNING *
    `
    return res.status(201).json({ role })
  }

  if (req.method === 'PUT') {
    const { id, name, description, system_prompt, category } = req.body
    if (!id) return res.status(400).json({ error: '缺少角色 ID' })
    if (!name || !system_prompt) return res.status(400).json({ error: '名称和提示词不能为空' })

    // 只有管理员或创建者可以编辑
    if (authUser.role === 'admin') {
      await sql`
        UPDATE ai_roles
        SET name = ${name}, description = ${description || ''}, system_prompt = ${system_prompt},
            category = ${category || '通用'}, updated_at = NOW()
        WHERE id = ${id}
      `
    } else {
      await sql`
        UPDATE ai_roles
        SET name = ${name}, description = ${description || ''}, system_prompt = ${system_prompt},
            category = ${category || '通用'}, updated_at = NOW()
        WHERE id = ${id} AND created_by = ${authUser.id}
      `
    }
    return res.json({ success: true })
  }

  if (req.method === 'DELETE') {
    const { id } = req.body
    if (authUser.role === 'admin') {
      await sql`DELETE FROM ai_roles WHERE id = ${id}`
    } else {
      await sql`DELETE FROM ai_roles WHERE id = ${id} AND created_by = ${authUser.id}`
    }
    return res.json({ success: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
})
