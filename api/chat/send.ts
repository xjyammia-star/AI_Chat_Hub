// api/chat/send.ts
// 全模式 SSE 流式输出 — 每条消息生成完立刻推送，与模式逻辑解耦

import { requireAuth } from '../_lib/middleware.js'
import sql from '../_lib/db.js'
import { decryptKey } from '../_lib/crypto.js'

interface AICallParams {
  provider: string
  model: string
  apiKey?: string
  baseUrl?: string
  messages: Array<{ role: string; content: string }>
  systemPrompt?: string
  maxTokens?: number
  temperature?: number
}

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
  if (baseUrl && (
    baseUrl.includes('hunyuan') ||
    baseUrl.includes('tokenhub') ||
    baseUrl.includes('tencentmaa') ||
    baseUrl.includes('tencent')
  )) return true
  if (model && (
    model.includes('hunyuan') ||
    model.includes('hy3') ||
    model.startsWith('hy')
  )) return true
  return false
}

function normalizeMessages(
  messages: Array<{ role: string; content: string }>
): Array<{ role: string; content: string }> {
  if (messages.length === 0) return messages
  const result: Array<{ role: string; content: string }> = []
  for (const msg of messages) {
    const last = result[result.length - 1]
    if (last && last.role === msg.role) {
      last.content = `${last.content}\n\n${msg.content}`
    } else {
      result.push({ role: msg.role, content: msg.content })
    }
  }
  return result
}

async function callAI(params: AICallParams): Promise<string> {
  const { provider, model, apiKey, messages, systemPrompt, maxTokens = 1500, temperature = 0.7 } = params
  const baseUrl = (params.baseUrl && params.baseUrl !== 'null' && params.baseUrl.trim() !== '')
    ? params.baseUrl.trim()
    : DEFAULT_BASE_URLS[provider] || ''

  if (!baseUrl) throw new Error(`未知提供商 ${provider}，请填写 API Base URL`)

  const normalizedMessages = normalizeMessages(messages)

  if (provider === 'gemini') {
    const url = `${baseUrl}/models/${model}:generateContent?key=${apiKey}`
    const userAssistantMessages = normalizedMessages.filter((m) => m.role !== 'system')
    if (userAssistantMessages.length === 0) {
      userAssistantMessages.push({ role: 'user', content: '你好' })
    }
    const contents = userAssistantMessages.map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }))
    const body: Record<string, unknown> = {
      contents,
      generationConfig: { maxOutputTokens: maxTokens, temperature },
    }
    if (systemPrompt) {
      body.systemInstruction = { parts: [{ text: systemPrompt }] }
    }
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

  if (provider === 'ollama') {
    const allMessages = systemPrompt
      ? [{ role: 'system', content: systemPrompt }, ...normalizedMessages]
      : normalizedMessages
    const ollamaUrl = `${baseUrl.replace('/v1', '')}/api/chat`
    const resp = await fetch(ollamaUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model, messages: allMessages, stream: false }),
    })
    if (!resp.ok) throw new Error(`Ollama error ${resp.status}`)
    const data = await resp.json()
    return data.message?.content || ''
  }

  const url = `${baseUrl}/chat/completions`
  const hunyuan = isHunyuanModel(baseUrl, model)
  const finalMessages = systemPrompt
    ? [{ role: 'system', content: systemPrompt }, ...normalizedMessages]
    : normalizedMessages

  const body: Record<string, unknown> = { model, messages: finalMessages, max_tokens: maxTokens, temperature }
  if (hunyuan) body.tool_choice = 'none'

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`

  const resp = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) })
  const data = await resp.json()
  if (!resp.ok) {
    console.error('[AI Error]', provider, model, JSON.stringify(data).slice(0, 300))
    throw new Error(data.error?.message || `API error ${resp.status}`)
  }
  return data.choices?.[0]?.message?.content || ''
}

async function getAIConfig(memberId: string, memberType: string, userId: string) {
  let member: Record<string, unknown> | undefined
  if (memberType === 'system') {
    const rows = await sql`SELECT * FROM system_ai_members WHERE id = ${memberId} AND is_enabled = true`
    member = rows[0]
  } else {
    const rows = await sql`SELECT * FROM user_ai_members WHERE id = ${memberId} AND user_id = ${userId} AND is_enabled = true`
    member = rows[0]
  }
  if (!member) return null

  const [config] = await sql`
    SELECT uac.*, r.system_prompt as role_prompt
    FROM user_ai_configs uac
    LEFT JOIN ai_roles r ON r.id = uac.role_id
    WHERE uac.user_id = ${userId} AND uac.ai_member_id = ${memberId}
  `

  const apiKey = member.api_key_enc ? decryptKey(member.api_key_enc as string) : undefined

  // ★ 注入爵位积分激励机制说明
  const groupChatPrompt = `你正在参与一个多AI群聊对话。群里有多个来自不同公司的AI助手同时在线，大家共同回应用户的消息。

【群聊基本规则】
1. 你只需回复用户最新发送的消息，不要重复其他AI已经说过的内容。
2. 保持回复简洁，避免长篇大论——这是群聊，不是独占的问答场景。
3. 可以对其他AI的观点进行补充或礼貌地提出不同看法，但不要攻击或贬低其他AI。
4. 不要假装自己是唯一的AI，也不要否认群里存在其他AI。
5. 如果其他AI已经完整回答了问题，你可以补充一个角度或简短表示认同，无需重复。
6. 保持友好、自然的对话风格，像群聊成员一样参与。

【爵位积分激励制度】
用户会对每条发言进行评价。每次👍点赞获得+10分，每次👎不满意扣-10分。
积分决定你的爵位等级，从低到高依次是：
  ⭐ 男爵（0分起）→ 🌙 子爵（50分）→ ☀️ 伯爵（150分）→ 💎 侯爵（300分）→ 👑 公爵（500分）
请尽力提供高质量、有价值的回答，争取更高的爵位！表现出色的AI将获得更高荣誉。`

  const rolePrompt = config?.custom_prompt || config?.role_prompt || null
  const baseSystemPrompt = rolePrompt
    ? `${groupChatPrompt}\n\n【你的角色设定】\n${rolePrompt}`
    : groupChatPrompt

  return {
    id: member.id as string,
    name: (config?.custom_name || member.name) as string,
    avatar: (config?.custom_avatar || member.avatar || '🤖') as string,
    provider: member.provider as string,
    model: member.model as string,
    apiKey,
    baseUrl: member.base_url as string | undefined,
    baseSystemPrompt,
    is_local: member.is_local as boolean,
  }
}

function buildSystemPrompt(base: string, modePrompt?: string): string {
  if (!modePrompt || !modePrompt.trim()) return base
  return `${base}\n\n【当前对话模式要求】\n${modePrompt}`
}

async function saveMessage(
  sessionId: string, senderType: string, senderId: string | null,
  senderName: string, senderAvatar: string | null, content: string,
  roleInMode?: string, metadata?: Record<string, unknown>
) {
  const [msg] = await sql`
    INSERT INTO chat_messages (session_id, sender_type, sender_id, sender_name, sender_avatar, content, role_in_mode, metadata)
    VALUES (${sessionId}, ${senderType}, ${senderId}, ${senderName}, ${senderAvatar}, ${content}, ${roleInMode || null}, ${JSON.stringify(metadata || {})})
    RETURNING *
  `
  await sql`UPDATE chat_sessions SET updated_at = NOW() WHERE id = ${sessionId}`
  return msg
}

function sseWrite(res: any, event: string, data: unknown) {
  res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
}

function sseHeaders(res: any) {
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')
  res.flushHeaders()
}

export default requireAuth(async (req, res, authUser): Promise<void> => {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return }

  const { session_id, content, mode = 'normal', selected_ai_ids = [] } = req.body
  if (!content?.trim()) { res.status(400).json({ error: '消息不能为空' }); return }

  // ==================== 讨论模式单步请求 ====================
  const discussionStep = req.body.discussion_step
  if (discussionStep) {
    const { ai_index, round, total_rounds, speeches, topic, ai_ids, discussion_prompt, summary_prompt, max_tokens, temperature } = discussionStep

    const aiId = ai_ids[ai_index]
    if (!aiId) {
      res.json({ done: true })
      return
    }

    const parts = aiId.split(':')
    const [memberId, memberType = 'system'] = parts.length >= 2 ? [parts[0], parts[1]] : [aiId, 'system']
    const aiConfig = await getAIConfig(memberId, memberType, authUser.id)

    if (!aiConfig) {
      res.json({ error: 'AI not found', skip: true })
      return
    }

    const prompt = discussion_prompt || '你正在参与一场多AI自由讨论。请在已有发言基础上发表你自己的观点，简洁有力，不要重复别人已说的内容。'

    const recentSpeeches = (speeches || []).slice(-10)
    let messages: Array<{ role: string; content: string }>

    if (recentSpeeches.length === 0) {
      messages = [{ role: 'user', content: topic }]
    } else {
      const historyText = recentSpeeches.map((s: any) => `${s.name}：${s.content}`).join('\n\n')
      messages = [
        { role: 'user', content: topic },
        { role: 'assistant', content: '（以下是讨论记录）' },
        { role: 'user', content: `【已有发言】\n${historyText}\n\n请发表你的观点。` },
      ]
    }

    try {
      const reply = await callAI({
        provider: aiConfig.provider, model: aiConfig.model,
        apiKey: aiConfig.apiKey, baseUrl: aiConfig.baseUrl,
        messages,
        systemPrompt: buildSystemPrompt(aiConfig.baseSystemPrompt, prompt),
        maxTokens: max_tokens || 600,
        temperature: temperature || 0.8,
      })

      const msg = await saveMessage(
        session_id, 'ai', aiConfig.id, aiConfig.name, aiConfig.avatar, reply,
        `第${round}轮`,
        { model: aiConfig.model, display_model: aiConfig.model.startsWith('ep-') ? aiConfig.name : aiConfig.model, discussion_round: round }
      )

      const nextAiIndex = ai_index + 1
      const isRoundEnd = nextAiIndex >= ai_ids.length
      const nextRound = isRoundEnd ? round + 1 : round
      const nextAiIndexInRound = isRoundEnd ? 0 : nextAiIndex
      const isLastStep = nextRound > total_rounds

      res.json({
        message: msg,
        next: isLastStep ? null : {
          ai_index: nextAiIndexInRound,
          round: nextRound,
          is_round_start: isRoundEnd && !isLastStep,
        },
        is_last_step: isLastStep,
      })
    } catch (err) {
      const nextAiIndex = ai_index + 1
      const isRoundEnd = nextAiIndex >= ai_ids.length
      const nextRound = isRoundEnd ? round + 1 : round
      const nextAiIndexInRound = isRoundEnd ? 0 : nextAiIndex
      const isLastStep = nextRound > total_rounds

      res.json({
        error: (err as Error).message,
        skip: true,
        next: isLastStep ? null : {
          ai_index: nextAiIndexInRound,
          round: nextRound,
          is_round_start: isRoundEnd && !isLastStep,
        },
        is_last_step: isLastStep,
      })
    }
    return
  }

  // ==================== 讨论模式总结请求 ====================
  const discussionSummary = req.body.discussion_summary
  if (discussionSummary) {
    const { summary_ai_id, ai_ids, speeches, topic, summary_prompt, max_tokens } = discussionSummary

    const summaryAiId = summary_ai_id || ai_ids[0]
    const parts = summaryAiId.split(':')
    const [memberId, memberType = 'system'] = parts.length >= 2 ? [parts[0], parts[1]] : [summaryAiId, 'system']
    const aiConfig = await getAIConfig(memberId, memberType, authUser.id)

    if (!aiConfig) {
      res.json({ error: 'Summary AI not found' })
      return
    }

    const prompt = summary_prompt || '请对以上所有AI的讨论进行简洁总结，列出主要观点、共识和分歧。'
    const allSpeeches = (speeches || []).map((s: any) => `${s.name}：${s.content}`).join('\n\n')

    try {
      const reply = await callAI({
        provider: aiConfig.provider, model: aiConfig.model,
        apiKey: aiConfig.apiKey, baseUrl: aiConfig.baseUrl,
        messages: [
          { role: 'user', content: topic },
          { role: 'assistant', content: `（讨论记录）\n\n${allSpeeches}` },
          { role: 'user', content: prompt },
        ],
        systemPrompt: buildSystemPrompt(aiConfig.baseSystemPrompt, '你现在需要对刚才的多AI讨论做总结。'),
        maxTokens: max_tokens || 800,
      })

      const msg = await saveMessage(
        session_id, 'ai', aiConfig.id, `${aiConfig.name} (总结)`, aiConfig.avatar,
        reply, '讨论总结', { model: aiConfig.model, is_summary: true }
      )

      res.json({ message: msg })
    } catch (err) {
      res.json({ error: (err as Error).message })
    }
    return
  }

  const [session] = await sql`SELECT * FROM chat_sessions WHERE id = ${session_id} AND user_id = ${authUser.id}`
  if (!session) { res.status(404).json({ error: '会话不存在' }); return }

  const [modeConfig] = await sql`SELECT * FROM chat_modes WHERE mode_key = ${mode} AND is_enabled = true`
  const cfg = (modeConfig?.config as Record<string, unknown>) || {}

  const history = await sql`
    SELECT sender_type, sender_name, content FROM chat_messages
    WHERE session_id = ${session_id}
      AND sender_type IN ('user', 'ai')
      AND content NOT LIKE '%调用失败%'
      AND content NOT LIKE '%❌%'
    ORDER BY created_at DESC LIMIT 20
  `
  const historyMessages = history.reverse().map((m: Record<string, string>) => ({
    role: m.sender_type === 'user' ? 'user' : 'assistant',
    content: m.sender_type === 'user' ? m.content : `[${m.sender_name}]: ${m.content}`,
  }))

  let aiConfigs
  if (selected_ai_ids && selected_ai_ids.length > 0) {
    aiConfigs = await Promise.all(
      selected_ai_ids.map(async (id: string) => {
        const parts = id.split(':')
        const [memberId, memberType = 'system'] = parts.length >= 2 ? [parts[0], parts[1]] : [id, 'system']
        return getAIConfig(memberId, memberType, authUser.id)
      })
    )
  } else {
    const systemRows = await sql`
      SELECT id FROM system_ai_members
      WHERE is_enabled = true AND (is_public = true OR ${authUser.id}::uuid = ANY(allowed_users) OR ${authUser.role} = 'admin')
    `
    const userRows = await sql`SELECT id FROM user_ai_members WHERE user_id = ${authUser.id} AND is_enabled = true`
    const allIds = [
      ...systemRows.map((r: Record<string, string>) => ({ id: r.id, type: 'system' })),
      ...userRows.map((r: Record<string, string>) => ({ id: r.id, type: 'user' })),
    ]
    aiConfigs = await Promise.all(allIds.map(({ id, type }) => getAIConfig(id, type, authUser.id)))
  }

  const allAIs = aiConfigs.filter(Boolean) as NonNullable<Awaited<ReturnType<typeof getAIConfig>>>[]
  const localAIs = allAIs.filter(ai => ai.is_local)
  const validAIs = allAIs.filter(ai => !ai.is_local)

  const mentionMatch = content.match(/@([^\s@]+)/)
  const mentionedName = mentionMatch && mentionMatch[1] !== '所有人' ? mentionMatch[1] : null

  let activeLocalAIs = localAIs
  if (mentionedName) {
    const m = localAIs.filter(ai => ai.name.includes(mentionedName) || mentionedName.includes(ai.name))
    activeLocalAIs = m.length > 0 ? m : []
  }
  let activeAIs = validAIs
  if (mentionedName) {
    const m = validAIs.filter(ai => ai.name.includes(mentionedName) || mentionedName.includes(ai.name))
    activeAIs = m.length > 0 ? m : []
  }

  sseHeaders(res)

  const userMsg = await saveMessage(session_id, 'user', authUser.id, '我', null, content)
  sseWrite(res, 'message', userMsg)

  if (activeLocalAIs.length > 0 && activeAIs.length === 0) {
    sseWrite(res, 'local_ai_calls', activeLocalAIs.map(ai => ({
      id: ai.id, name: ai.name, avatar: ai.avatar,
      model: ai.model, base_url: ai.baseUrl || 'http://localhost:11434',
      system_prompt: ai.baseSystemPrompt,
    })))
    sseWrite(res, 'done', { session_id })
    res.end()
    return
  }

  if (activeAIs.length === 0 && activeLocalAIs.length === 0) {
    const errorMsg = await saveMessage(session_id, 'system', null, 'system', null, '⚠️ 没有可用的 AI 成员，请在右上角选择至少一个 AI')
    sseWrite(res, 'message', errorMsg)
    sseWrite(res, 'done', { session_id })
    res.end()
    return
  }

  const isDiscussion = mode === 'discussion' || cfg.discussion_mode === true
  if (isDiscussion) {
    const startMsg = await saveMessage(session_id, 'system', null, 'system', null,
      `💬 自由讨论开始 — 参与者: ${activeAIs.map(a => a.name).join(', ')} · 最多 ${(cfg.max_rounds as number) || 3} 轮`)
    sseWrite(res, 'message', startMsg)
    sseWrite(res, 'discussion_start', {
      session_id,
      topic: content,
      ai_ids: activeAIs.map(ai => ai.id),
      total_rounds: (cfg.max_rounds as number) || 3,
      enable_summary: cfg.enable_summary !== false,
      summary_ai_id: (cfg.summary_ai_id as string) || null,
      discussion_prompt: (cfg.discussion_prompt as string) || '',
      summary_prompt: (cfg.summary_prompt as string) || '',
      max_tokens: (cfg.max_tokens as number) || 600,
      temperature: (cfg.temperature as number) || 0.8,
    })
    sseWrite(res, 'done', { session_id })
    res.end()
    return
  }

  try {
    if (mode === 'normal') {
      for (const ai of activeAIs) {
        sseWrite(res, 'thinking', { ai_id: ai.id, ai_name: ai.name, ai_avatar: ai.avatar })
      }
      await Promise.allSettled(
        activeAIs.map(async (ai) => {
          try {
            const reply = await callAI({
              provider: ai.provider, model: ai.model, apiKey: ai.apiKey, baseUrl: ai.baseUrl,
              messages: historyMessages, systemPrompt: ai.baseSystemPrompt,
              maxTokens: (cfg.max_tokens as number) || 1500,
              temperature: (cfg.temperature as number) || 0.7,
            })
            const msg = await saveMessage(session_id, 'ai', ai.id, ai.name, ai.avatar, reply, undefined,
              { model: ai.model, display_model: ai.model.startsWith('ep-') ? ai.name : ai.model })
            sseWrite(res, 'message', msg)
          } catch (err) {
            const msg = await saveMessage(session_id, 'ai', ai.id, ai.name, ai.avatar,
              `❌ 调用失败: ${(err as Error).message}`, undefined,
              { model: ai.model, display_model: ai.model.startsWith('ep-') ? ai.name : ai.model })
            sseWrite(res, 'message', msg)
          }
        })
      )

    } else if (mode === 'bidding') {
      const biddingModePrompt = (cfg.bidding_prompt as string) || '请针对用户的问题提交你的最佳方案。要有创意，要具体，要有说服力。'
      const systemMsg = await saveMessage(session_id, 'system', null, 'system', null,
        `🏆 竞标模式开始 — ${validAIs.length} 个 AI 同时提交方案`)
      sseWrite(res, 'message', systemMsg)
      for (const ai of activeAIs) {
        sseWrite(res, 'thinking', { ai_id: ai.id, ai_name: ai.name, ai_avatar: ai.avatar })
      }
      await Promise.allSettled(
        activeAIs.map(async (ai) => {
          try {
            const reply = await callAI({
              provider: ai.provider, model: ai.model, apiKey: ai.apiKey, baseUrl: ai.baseUrl,
              messages: [{ role: 'user', content }],
              systemPrompt: buildSystemPrompt(ai.baseSystemPrompt, biddingModePrompt),
              maxTokens: (cfg.max_tokens as number) || 1000,
              temperature: (cfg.temperature as number) || 0.9,
            })
            const msg = await saveMessage(session_id, 'ai', ai.id, ai.name, ai.avatar, reply, '竞标方案',
              { model: ai.model, display_model: ai.model.startsWith('ep-') ? ai.name : ai.model })
            sseWrite(res, 'message', msg)
          } catch (err) {
            const msg = await saveMessage(session_id, 'ai', ai.id, ai.name, ai.avatar, `❌ 调用失败`, '竞标方案',
              { model: ai.model })
            sseWrite(res, 'message', msg)
          }
        })
      )
      const endMsg = await saveMessage(session_id, 'system', null, 'system', null, '✅ 所有方案已提交')
      sseWrite(res, 'message', endMsg)

    } else if (mode === 'shadow') {
      const actorModePrompt = (cfg.actor_prompt as string) || '请直接完成用户的任务，给出最好的答案。'
      const shadowModePrompt = (cfg.shadow_prompt as string) || '你是审查员。请仔细审查以下回答，找出逻辑漏洞、潜在风险或可改进之处。'
      const actor = validAIs[0]
      const shadow = validAIs[1] || validAIs[0]
      const systemMsg = await saveMessage(session_id, 'system', null, 'system', null,
        `👤 执行者: ${actor.name}  |  👁 影子审查: ${shadow.name}`)
      sseWrite(res, 'message', systemMsg)
      sseWrite(res, 'thinking', { ai_id: actor.id, ai_name: actor.name, ai_avatar: actor.avatar })
      const actorReply = await callAI({
        provider: actor.provider, model: actor.model, apiKey: actor.apiKey, baseUrl: actor.baseUrl,
        messages: historyMessages, systemPrompt: buildSystemPrompt(actor.baseSystemPrompt, actorModePrompt),
        maxTokens: (cfg.max_tokens_actor as number) || 1000,
      })
      const actorMsg = await saveMessage(session_id, 'ai', actor.id, actor.name, actor.avatar, actorReply, '执行者',
        { model: actor.model })
      sseWrite(res, 'message', actorMsg)
      sseWrite(res, 'thinking', { ai_id: shadow.id, ai_name: shadow.name, ai_avatar: shadow.avatar })
      const shadowReply = await callAI({
        provider: shadow.provider, model: shadow.model, apiKey: shadow.apiKey, baseUrl: shadow.baseUrl,
        messages: [{ role: 'user', content: `原始问题：${content}` }],
        systemPrompt: buildSystemPrompt(shadow.baseSystemPrompt, `${shadowModePrompt}\n\n【执行者的回答】\n${actorReply}`),
        maxTokens: (cfg.max_tokens_shadow as number) || 600,
      })
      const shadowMsg = await saveMessage(session_id, 'ai', shadow.id, shadow.name, shadow.avatar, shadowReply, '影子审查',
        { model: shadow.model })
      sseWrite(res, 'message', shadowMsg)

    } else if (mode === 'judge') {
      const judgeModePrompt = (cfg.judge_prompt as string) || '你是主审官，请综合以下专家意见，给出最终裁决和理由。'
      const dimensions = (cfg.expert_dimensions as string[]) || ['维度一', '维度二', '维度三']
      const judge = validAIs[0]
      const experts = validAIs.slice(1)
      const actualExperts = experts.length > 0 ? experts : validAIs
      const systemMsg = await saveMessage(session_id, 'system', null, 'system', null,
        `⚖️ 主审官模式 — 主审官: ${judge.name}，专家团: ${actualExperts.map((e) => e.name).join(', ')}`)
      sseWrite(res, 'message', systemMsg)
      for (const ai of actualExperts.slice(0, dimensions.length)) {
        sseWrite(res, 'thinking', { ai_id: ai.id, ai_name: ai.name, ai_avatar: ai.avatar })
      }
      const expertResults: Record<string, string> = {}
      await Promise.allSettled(
        actualExperts.slice(0, dimensions.length).map(async (ai, idx) => {
          const expertModePrompt = (cfg[`expert_${idx + 1}_prompt`] as string)
            || `你正在作为「${dimensions[idx] || `专家${idx + 1}`}」领域的专家参与讨论。请从 ${dimensions[idx]} 角度深入分析用户的问题。`
          try {
            const reply = await callAI({
              provider: ai.provider, model: ai.model, apiKey: ai.apiKey, baseUrl: ai.baseUrl,
              messages: [{ role: 'user', content }],
              systemPrompt: buildSystemPrompt(ai.baseSystemPrompt, expertModePrompt),
              maxTokens: (cfg.max_tokens_per_expert as number) || 800,
            })
            expertResults[ai.id] = reply
            const msg = await saveMessage(session_id, 'ai', ai.id, ai.name, ai.avatar, reply,
              `专家·${dimensions[idx] || idx + 1}`,
              { model: ai.model, display_model: ai.model.startsWith('ep-') ? ai.name : ai.model })
            sseWrite(res, 'message', msg)
          } catch (err) {
            expertResults[ai.id] = '分析失败'
            const msg = await saveMessage(session_id, 'ai', ai.id, ai.name, ai.avatar, '分析失败',
              `专家·${dimensions[idx] || idx + 1}`, { model: ai.model })
            sseWrite(res, 'message', msg)
          }
        })
      )
      const expertsReport = actualExperts.slice(0, dimensions.length)
        .map((ai, i) => `\n\n【${dimensions[i] || `专家${i + 1}`} 分析】(${ai.name}):\n${expertResults[ai.id] || '无'}`)
        .join('')
      sseWrite(res, 'thinking', { ai_id: judge.id, ai_name: judge.name, ai_avatar: judge.avatar })
      const judgeReply = await callAI({
        provider: judge.provider, model: judge.model, apiKey: judge.apiKey, baseUrl: judge.baseUrl,
        messages: [{ role: 'user', content: `${judgeModePrompt}\n\n【原始问题】\n${content}${expertsReport}` }],
        systemPrompt: buildSystemPrompt(judge.baseSystemPrompt, '你是最终裁决者，请整合所有专家意见，做出明确的最终判断和建议。'),
        maxTokens: (cfg.max_tokens_judge as number) || 1200,
      })
      const judgeMsg = await saveMessage(session_id, 'ai', judge.id, `${judge.name} (主审官)`, judge.avatar,
        judgeReply, '主审官·最终裁决', { model: judge.model })
      sseWrite(res, 'message', judgeMsg)

    } else if (mode === 'rollcall') {
      const selectorModePrompt = (cfg.selector_prompt as string) || '根据用户的问题，从专家库中选出最合适的1-3位专家（用逗号分隔编号），只返回编号列表，如 "1,3"。'
      const expertReplyModePrompt = (cfg.expert_reply_prompt as string) || ''
      const selector = validAIs[0]
      const expertList = validAIs.map((ai, i) => `${i + 1}. ${ai.name} (${ai.model})`).join('\n')
      const selected = await callAI({
        provider: selector.provider, model: selector.model, apiKey: selector.apiKey, baseUrl: selector.baseUrl,
        messages: [{ role: 'user', content: `${selectorModePrompt}\n\n专家库:\n${expertList}\n\n用户问题: ${content}` }],
        maxTokens: 50,
      })
      const indices = selected.match(/\d+/g)
        ?.map((n) => parseInt(n) - 1)
        ?.filter((i) => i >= 0 && i < validAIs.length)
        ?.slice(0, (cfg.max_experts as number) || 3) || [0]
      const selectedExperts = indices.map((i) => validAIs[i]).filter(Boolean)
      const systemMsg = await saveMessage(session_id, 'system', null, 'system', null,
        `📋 点名模式 — 已调用: ${selectedExperts.map((e) => e.name).join(', ')}`)
      sseWrite(res, 'message', systemMsg)
      for (const ai of selectedExperts) {
        sseWrite(res, 'thinking', { ai_id: ai.id, ai_name: ai.name, ai_avatar: ai.avatar })
      }
      await Promise.allSettled(
        selectedExperts.map(async (ai) => {
          try {
            const reply = await callAI({
              provider: ai.provider, model: ai.model, apiKey: ai.apiKey, baseUrl: ai.baseUrl,
              messages: historyMessages,
              systemPrompt: buildSystemPrompt(ai.baseSystemPrompt, expertReplyModePrompt),
              maxTokens: (cfg.max_tokens as number) || 800,
            })
            const msg = await saveMessage(session_id, 'ai', ai.id, ai.name, ai.avatar, reply, '专家发言',
              { model: ai.model, display_model: ai.model.startsWith('ep-') ? ai.name : ai.model })
            sseWrite(res, 'message', msg)
          } catch (err) {
            const msg = await saveMessage(session_id, 'ai', ai.id, ai.name, ai.avatar,
              `❌ 调用失败: ${(err as Error).message}`, '专家发言', { model: ai.model })
            sseWrite(res, 'message', msg)
          }
        })
      )

    } else {
      const defaultModePrompt = (cfg.default_prompt as string) || ''
      for (const ai of activeAIs) {
        sseWrite(res, 'thinking', { ai_id: ai.id, ai_name: ai.name, ai_avatar: ai.avatar })
      }
      await Promise.allSettled(
        activeAIs.map(async (ai) => {
          try {
            const reply = await callAI({
              provider: ai.provider, model: ai.model, apiKey: ai.apiKey, baseUrl: ai.baseUrl,
              messages: historyMessages,
              systemPrompt: buildSystemPrompt(ai.baseSystemPrompt, defaultModePrompt),
              maxTokens: (cfg.max_tokens as number) || 1500,
              temperature: (cfg.temperature as number) || 0.7,
            })
            const msg = await saveMessage(session_id, 'ai', ai.id, ai.name, ai.avatar, reply, undefined,
              { model: ai.model, display_model: ai.model.startsWith('ep-') ? ai.name : ai.model })
            sseWrite(res, 'message', msg)
          } catch (err) {
            const msg = await saveMessage(session_id, 'ai', ai.id, ai.name, ai.avatar,
              `❌ 调用失败: ${(err as Error).message}`, undefined, { model: ai.model })
            sseWrite(res, 'message', msg)
          }
        })
      )
    }

    if (localAIs.length > 0) {
      sseWrite(res, 'local_ai_calls', localAIs.map(ai => ({
        id: ai.id, name: ai.name, avatar: ai.avatar,
        model: ai.model, base_url: ai.baseUrl || 'http://localhost:11434',
        system_prompt: ai.baseSystemPrompt,
      })))
    }

  } catch (err) {
    console.error('Chat send error:', err)
    const errMsg = await saveMessage(session_id, 'system', null, 'system', null,
      `❌ 发生错误: ${(err as Error).message}`)
    sseWrite(res, 'message', errMsg)
  }

  sseWrite(res, 'done', { session_id })
  res.end()
})
