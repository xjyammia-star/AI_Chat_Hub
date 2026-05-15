// api/members/index.ts
// 获取当前用户可用的 AI 成员列表

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAuth } from '../_lib/middleware.js'
import sql from '../_lib/db.js'
import { decryptKey } from '../_lib/crypto.js'

export default requireAuth(async (req, res, authUser) => {
  if (req.method === 'GET') {
    // 1. 获取系统 AI（管理员开放给该用户的）
    const systemMembers = await sql`
      SELECT s.*, uac.custom_name, uac.custom_avatar, uac.role_id, uac.custom_prompt
      FROM system_ai_members s
      LEFT JOIN user_ai_configs uac
        ON uac.ai_member_id = s.id AND uac.ai_member_type = 'system' AND uac.user_id = ${authUser.id}
      WHERE s.is_enabled = true
        AND (
          s.is_public = true
          OR ${authUser.id}::uuid = ANY(s.allowed_users)
          OR ${authUser.role} = 'admin'
        )
      ORDER BY s.sort_order, s.created_at
    `

    // 2. 获取用户自己的私人 AI
    const userMembers = await sql`
      SELECT u.*, uac.custom_name, uac.custom_avatar, uac.role_id, uac.custom_prompt
      FROM user_ai_members u
      LEFT JOIN user_ai_configs uac
        ON uac.ai_member_id = u.id AND uac.ai_member_type = 'user' AND uac.user_id = ${authUser.id}
      WHERE u.user_id = ${authUser.id} AND u.is_enabled = true
      ORDER BY u.sort_order, u.created_at
    `

    // 3. 格式化，不暴露加密 Key
    const format = (m: Record<string, unknown>, type: string) => ({
      id: m.id,
      type,
      name: m.name,
      avatar: m.avatar || '🤖',
      provider: m.provider,
      model: m.model,
      base_url: m.base_url,
      is_local: m.is_local || false,
      is_enabled: m.is_enabled,
      is_available: true,    // 前端会实时检测本地模型
      has_key: !!m.api_key_enc,
      custom_name: m.custom_name,
      custom_avatar: m.custom_avatar,
      role_id: m.role_id,
      custom_prompt: m.custom_prompt,
      sort_order: m.sort_order || 0,
    })

    const members = [
      ...systemMembers.map((m) => format(m, 'system')),
      ...userMembers.map((m) => format(m, 'user')),
    ]

    return res.json({ members })
  }

  // POST: 添加私人 AI 成员
  if (req.method === 'POST') {
    const { name, avatar, provider, model, api_key, base_url, is_local } = req.body
    if (!name || !provider || !model) {
      return res.status(400).json({ error: '名称、提供商和模型不能为空' })
    }

    const encKey = api_key ? decryptKey(api_key) : null  // 前端不应传来明文Key，这里只是占位
    const actualEncKey = api_key ? require('../_lib/crypto').encryptKey(api_key) : null

    const [member] = await sql`
      INSERT INTO user_ai_members (user_id, name, avatar, provider, model, api_key_enc, base_url, is_local)
      VALUES (${authUser.id}, ${name}, ${avatar || '🤖'}, ${provider}, ${model}, ${actualEncKey}, ${base_url || null}, ${is_local || false})
      RETURNING id, name, avatar, provider, model, base_url, is_local, is_enabled, sort_order, created_at
    `

    return res.status(201).json({ member: { ...member, type: 'user', is_available: true } })
  }

  // PUT: 更新 AI 个性化配置（名字、头像、角色）
  if (req.method === 'PUT') {
    const { ai_member_id, ai_member_type, custom_name, custom_avatar, role_id, custom_prompt } = req.body

    await sql`
      INSERT INTO user_ai_configs (user_id, ai_member_id, ai_member_type, custom_name, custom_avatar, role_id, custom_prompt)
      VALUES (${authUser.id}, ${ai_member_id}, ${ai_member_type}, ${custom_name || null}, ${custom_avatar || null}, ${role_id || null}, ${custom_prompt || null})
      ON CONFLICT (user_id, ai_member_id, ai_member_type)
      DO UPDATE SET
        custom_name = EXCLUDED.custom_name,
        custom_avatar = EXCLUDED.custom_avatar,
        role_id = EXCLUDED.role_id,
        custom_prompt = EXCLUDED.custom_prompt,
        updated_at = NOW()
    `

    return res.json({ success: true })
  }

  // DELETE: 删除用户私人 AI
  if (req.method === 'DELETE') {
    const { id } = req.body
    await sql`DELETE FROM user_ai_members WHERE id = ${id} AND user_id = ${authUser.id}`
    return res.json({ success: true })
  }

  return res.status(405).json({ error: 'Method not allowed' })
})
