// api/chat/react.ts
// 处理点赞 / 不满意，更新积分，触发 AI 感谢或道歉回复

import { requireAuth } from '../_lib/middleware.js'
import sql from '../_lib/db.js'
import { decryptKey } from '../_lib/crypto.js'

const DEFAULT_BASE_URLS: Record<string, string> = {
  gemini:    'https://generativelanguage.googleapis.com/v1beta',
  deepseek:  'https://api.deepseek.com/v1',
  doubao:    'https://ark.cn-beijing.volces.com/api/v3',
  glm:       'https://open.bigmodel.cn/api/paas/v4',
  openai:    'https://api.openai.com/v1',
  anthropic: 'https://api.anthropic.com/v1',
  ollama:    'http://localhost:11434/v1',
  custom:    '',
}

function isHunyuanModel(baseUrl?: string, model?: string): boolean {
  if (baseUrl && (baseUrl.includes('hunyuan') || baseUrl.includes('tokenhub') || baseUrl.includes('tencent'))) return true
  if (model && (model.includes('hunyuan') || model.includes('hy3') || model.startsWith('hy'))) return true
  return false
}

async function callAI(params: {
  provider: string; model: string; apiKey?: string; baseUrl?: string
  messages: Array<{ role: string; content: string }>
  systemPrompt?: string; maxTokens?: number; temperature?: number
}): Promise<string> {
  const { provider, model, apiKey, messages, systemPrompt, maxTokens = 300, temperature = 0.9 } = params
  const baseUrl = (params.baseUrl && params.baseUrl !== 'null' && params.baseUrl.trim() !== '')
    ? params.baseUrl.trim()
    : DEFAULT_BASE_URLS[provider] || ''

  if (!baseUrl) throw new Error(`未知提供商 ${provider}`)

  if (provider === 'gemini') {
    const url = `${baseUrl}/models/${model}:generateContent?key=${apiKey}`
    const contents = messages
      .filter(m => m.role !== 'system')
      .map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }))
    const body: Record<string, unknown> = { contents, generationConfig: { maxOutputTokens: maxTokens, temperature } }
    if (systemPrompt) body.systemInstruction = { parts: [{ text: systemPrompt }] }
    const resp = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const data = await resp.json()
    if (!resp.ok) throw new Error(data.error?.message || 'Gemini API error')
    return data.candidates?.[0]?.content?.parts?.[0]?.text || ''
  }

  let authToken = apiKey || ''
  if (provider === 'glm' && apiKey && apiKey.includes('.')) {
    const [id, secret] = apiKey.split('.')
    const now = Date.now()
    const header = btoa(JSON.stringify({ alg: 'HS256', typ: 'JWT', sign_type: 'SIGN' }))
    const payload = btoa(JSON.stringify({ api_key: id, exp: now + 3600000, timestamp: now }))
    const { createHmac } = await import('crypto')
    const sig = createHmac('sha256', secret).update(`${header}.${payload}`).digest('base64url')
    authToken = `${header}.${payload}.${sig}`
  }

  const url = `${baseUrl}/chat/completions`
  const hunyuan = isHunyuanModel(baseUrl, model)
  const finalMessages = systemPrompt ? [{ role: 'system', content: systemPrompt }, ...messages] : messages
  const body: Record<string, unknown> = { model, messages: finalMessages, max_tokens: maxTokens, temperature }
  if (hunyuan) body.tool_choice = 'none'
  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`
  const resp = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) })
  const data = await resp.json()
  if (!resp.ok) throw new Error(data.error?.message || `API error ${resp.status}`)
  return data.choices?.[0]?.message?.content || ''
}

// 根据积分计算爵位名称（用于提示词）
function getTitleName(score: number): string {
  if (score >= 500) return '公爵'
  if (score >= 300) return '侯爵'
  if (score >= 150) return '伯爵'
  if (score >= 50) return '子爵'
  return '男爵'
}

export default requireAuth(async (req, res, authUser): Promise<void> => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return }

  const { message_id, reaction } = req.body
  // reaction: 'up' | 'down'
  if (!message_id || !['up', 'down'].includes(reaction)) {
    res.status(400).json({ error: '参数错误' }); return
  }

  // 1. 查找被点评的消息
  const [message] = await sql`
    SELECT cm.*, cs.user_id as session_user_id
    FROM chat_messages cm
    JOIN chat_sessions cs ON cs.id = cm.session_id
    WHERE cm.id = ${message_id}
      AND cm.sender_type = 'ai'
      AND cs.user_id = ${authUser.id}
  `
  if (!message) { res.status(404).json({ error: '消息不存在' }); return }

  const aiMemberId = message.sender_id as string
  if (!aiMemberId) { res.status(400).json({ error: '无法识别 AI 成员' }); return }

  const delta = reaction === 'up' ? 10 : -10

  // 2. 更新积分（upsert）
  const [repRow] = await sql`
    INSERT INTO ai_reputation (user_id, ai_member_id, score)
    VALUES (${authUser.id}, ${aiMemberId}, ${delta})
    ON CONFLICT (user_id, ai_member_id)
    DO UPDATE SET
      score = GREATEST(0, ai_reputation.score + ${delta}),
      updated_at = NOW()
    RETURNING score
  `
  const newScore = repRow.score as number

  // 3. 找 AI 配置（先查 system，再查 user）
  let member: Record<string, unknown> | null = null
  const sysRows = await sql`SELECT * FROM system_ai_members WHERE id = ${aiMemberId} AND is_enabled = true`
  if (sysRows.length > 0) {
    member = sysRows[0]
  } else {
    const userRows = await sql`SELECT * FROM user_ai_members WHERE id = ${aiMemberId} AND user_id = ${authUser.id} AND is_enabled = true`
    if (userRows.length > 0) member = userRows[0]
  }

  if (!member) {
    // AI已被删除，但积分已更新，直接返回
    res.json({ new_score: newScore, reply_message: null })
    return
  }

  // 取用户自定义名字/头像
  const [config] = await sql`
    SELECT custom_name, custom_avatar FROM user_ai_configs
    WHERE user_id = ${authUser.id} AND ai_member_id = ${aiMemberId}
  `
  const displayName = (config?.custom_name || member.name) as string
  const displayAvatar = (config?.custom_avatar || member.avatar || '🤖') as string
  const apiKey = member.api_key_enc ? decryptKey(member.api_key_enc as string) : undefined
  const titleName = getTitleName(newScore)

  // 4. 让 AI 生成感谢/道歉回复（简短）
  const originalContent = (message.content as string).slice(0, 200)
  const reactionPrompt = reaction === 'up'
    ? `用户对你刚才的发言点了赞👍，你的当前爵位是「${titleName}」，积分为 ${newScore} 分。请用1-2句话表示感谢，语气符合你的角色设定，可以提到爵位和积分，保持简洁生动。`
    : `用户对你刚才的发言表示不满意👎，你的当前爵位是「${titleName}」，积分为 ${newScore} 分。请用1-2句话诚恳道歉并表示会改进，语气符合你的角色设定，保持简洁。`

  let replyContent = ''
  try {
    replyContent = await callAI({
      provider: member.provider as string,
      model: member.model as string,
      apiKey,
      baseUrl: member.base_url as string | undefined,
      messages: [
        { role: 'assistant', content: originalContent },
        { role: 'user', content: reactionPrompt },
      ],
      maxTokens: 150,
      temperature: 0.9,
    })
  } catch (err) {
    // 如果AI调用失败，用默认文本
    replyContent = reaction === 'up'
      ? `谢谢您的认可！目前积分 ${newScore} 分（${titleName}），我会继续努力！`
      : `抱歉没能达到您的期望。目前积分 ${newScore} 分（${titleName}），我会认真改进！`
  }

  // 5. 保存回复到数据库
  const [replyMsg] = await sql`
    INSERT INTO chat_messages (session_id, sender_type, sender_id, sender_name, sender_avatar, content, metadata)
    VALUES (
      ${message.session_id},
      'ai',
      ${aiMemberId},
      ${displayName},
      ${displayAvatar},
      ${replyContent},
      ${JSON.stringify({ model: member.model, is_reaction_reply: true, reaction, score_after: newScore })}
    )
    RETURNING *
  `

  res.json({ new_score: newScore, reply_message: replyMsg })
})
