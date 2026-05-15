// api/admin/users.ts

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAdmin } from '../_lib/middleware'
import sql from '../_lib/db'

export default requireAdmin(async (req, res) => {
  if (req.method === 'GET') {
    const users = await sql`SELECT id, email, display_name, role, is_active, created_at FROM users ORDER BY created_at DESC`
    return res.json({ users })
  }

  if (req.method === 'PUT') {
    const { id, is_active, role } = req.body
    if (is_active !== undefined) await sql`UPDATE users SET is_active = ${is_active} WHERE id = ${id}`
    if (role !== undefined) await sql`UPDATE users SET role = ${role} WHERE id = ${id}`
    return res.json({ success: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
})
