// api/chat/send.ts
// 核心发送 API — 处理 5 种聊天模式

import type { VercelRequest, VercelResponse } from '@vercel/node'
import { requireAuth } from '../_lib/middleware.js'
import sql from '../_lib/db.js'
import { decryptKey } from '../_lib/crypto.js'

// ---- AI 调用统一接口 ----
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

// 每个提供商的默认 base_url
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

async function callAI(params: AICallParams): Promise<string> {
  const { provider, model, apiKey, messages, systemPrompt, maxTokens = 1500, temperature = 0.7 } = params
  // 优先用用户填写的 base_url，否则用默认值
  const baseUrl = (params.baseUrl && params.baseUrl !== 'null' && params.baseUrl.trim() !== '')
    ? params.baseUrl.trim()
    : DEFAULT_BASE_URLS[provider] || ''

  if (!baseUrl) throw new Error(`未知提供商 ${provider}，请填写 API Base URL`)

  const allMessages = systemPrompt
    ? [{ role: 'system', content: systemPrompt }, ...messages]
    : messages

  // Gemini 格式
  if (provider === 'gemini') {
    const url = `${baseUrl}/models/${model}:generateContent?key=${apiKey}`
    const contents = allMessages
      .filter((m) => m.role !== 'system')
      .map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] }))

    const systemInstruction = allMessages.find((m) => m.role === 'system')

    const body: Record<string, unknown> = {
      contents,
      generationConfig: { maxOutputTokens: maxTokens, temperature },
    }
    if (systemInstruction) {
      body.systemInstruction = { parts: [{ text: systemInstruction.content }] }
    }

    const resp = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const data = await resp.json()
    if (!resp.ok) throw new Error(data.error?.message || 'Gemini API error')
    return data.candidates?.[0]?.content?.parts?.[0]?.text || ''
  }

  // GLM 需要动态生成 JWT Token
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

  // Ollama 本地调用 — 注意：Ollama 在浏览器端直连，这里是服务端备用路径
  if (provider === 'ollama') {
    const ollamaUrl = `${baseUrl.replace('/v1', '')}/api/chat`
    const ollamaBody = { model, messages: allMessages, stream: false }
    const resp = await fetch(ollamaUrl, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(ollamaBody) })
    if (!resp.ok) throw new Error(`Ollama error ${resp.status} — 请确认本地 Ollama 已启动并设置 OLLAMA_ORIGINS=*`)
    const data = await resp.json()
    return data.message?.content || ''
  }

  // OpenAI 兼容格式（DeepSeek / Doubao / OpenAI / GLM）
  const url = `${baseUrl}/chat/completions`
  const body = { model, messages: allMessages, max_tokens: maxTokens, temperature }

  const headers: Record<string, string> = { 'Content-Type': 'application/json' }
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`

  const resp = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) })
  const data = await resp.json()
  if (!resp.ok) throw new Error(data.error?.message || `API error ${resp.status}`)
  return data.choices?.[0]?.message?.content || ''
}

// ---- 获取 AI 成员的 API 配置 ----
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

  // 获取用户个性化配置（角色prompt）
  const [config] = await sql`
    SELECT uac.*, r.system_prompt as role_prompt
    FROM user_ai_configs uac
    LEFT JOIN ai_roles r ON r.id = uac.role_id
    WHERE uac.user_id = ${userId} AND uac.ai_member_id = ${memberId}
  `

  const apiKey = member.api_key_enc ? decryptKey(member.api_key_enc as string) : undefined
  const systemPrompt = config?.custom_prompt || config?.role_prompt || undefined

  return {
    id: member.id as string,
    name: (config?.custom_name || member.name) as string,
    avatar: (config?.custom_avatar || member.avatar || '🤖') as string,
    provider: member.provider as string,
    model: member.model as string,
    apiKey,
    baseUrl: member.base_url as string | undefined,
    systemPrompt,
    is_local: member.is_local as boolean,
  }
}

// ---- 保存消息到数据库 ----
async function saveMessage(sessionId: string, senderType: string, senderId: string | null, senderName: string, senderAvatar: string | null, content: string, roleInMode?: string, metadata?: Record<string, unknown>) {
  const [msg] = await sql`
    INSERT INTO chat_messages (session_id, sender_type, sender_id, sender_name, sender_avatar, content, role_in_mode, metadata)
    VALUES (${sessionId}, ${senderType}, ${senderId}, ${senderName}, ${senderAvatar}, ${content}, ${roleInMode || null}, ${JSON.stringify(metadata || {})})
    RETURNING *
  `
  // 更新会话 updated_at
  await sql`UPDATE chat_sessions SET updated_at = NOW() WHERE id = ${sessionId}`
  return msg
}

// ---- 主处理函数 ----
export default requireAuth(async (req, res, authUser) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const { session_id, content, mode = 'normal', selected_ai_ids = [] } = req.body

  if (!content?.trim()) return res.status(400).json({ error: '消息不能为空' })

  // 验证会话归属
  const [session] = await sql`SELECT * FROM chat_sessions WHERE id = ${session_id} AND user_id = ${authUser.id}`
  if (!session) return res.status(404).json({ error: '会话不存在' })

  // 保存用户消息
  const userMsg = await saveMessage(session_id, 'user', authUser.id, '我', null, content)

  // 获取历史消息（最近20条）
  const history = await sql`
    SELECT sender_type, content FROM chat_messages
    WHERE session_id = ${session_id} AND sender_type != 'system'
    ORDER BY created_at DESC LIMIT 20
  `
  const historyMessages = history.reverse().map((m: Record<string, string>) => ({
    role: m.sender_type === 'user' ? 'user' : 'assistant',
    content: m.content,
  }))

  // 获取选中的 AI 成员配置
  const aiConfigs = await Promise.all(
    selected_ai_ids.map(async (id: string) => {
      const parts = id.split(':')
      const [memberId, memberType = 'system'] = parts.length >= 2 ? [parts[0], parts[1]] : [id, 'system']
      return getAIConfig(memberId, memberType, authUser.id)
    })
  )
  const allAIs = aiConfigs.filter(Boolean) as NonNullable<Awaited<ReturnType<typeof getAIConfig>>>[]

  // 本地模型由前端直接调用，这里只处理非本地的
  const localAIs = allAIs.filter(ai => ai.is_local)
  const validAIs = allAIs.filter(ai => !ai.is_local)

  // 处理 @ 提及：先判断是否有 @ 特定成员
  const mentionMatch = content.match(/@([^\s@]+)/)
  const mentionedName = mentionMatch && mentionMatch[1] !== '所有人' ? mentionMatch[1] : null

  // 过滤本地AI（@ 过滤）
  let activeLocalAIs = localAIs
  if (mentionedName) {
    const mentionedLocal = localAIs.filter(ai =>
      ai.name.includes(mentionedName) || mentionedName.includes(ai.name)
    )
    if (mentionedLocal.length > 0) activeLocalAIs = mentionedLocal
    else activeLocalAIs = []  // @ 的是服务端AI，本地AI不参与
  }

  // 过滤服务端AI（@ 过滤）
  let activeAIs = validAIs
  if (mentionedName) {
    const mentionedServer = validAIs.filter(ai =>
      ai.name.includes(mentionedName) || mentionedName.includes(ai.name)
    )
    if (mentionedServer.length > 0) activeAIs = mentionedServer
    else activeAIs = []  // @ 的是本地AI，服务端AI不参与
  }

  // 如果只有本地模型需要回复
  if (activeLocalAIs.length > 0 && activeAIs.length === 0) {
    return res.json({
      messages: [userMsg],
      session_id,
      local_ai_calls: activeLocalAIs.map(ai => ({
        id: ai.id, name: ai.name, avatar: ai.avatar,
        model: ai.model, base_url: ai.baseUrl || 'http://localhost:11434',
        system_prompt: ai.systemPrompt,
      }))
    })
  }

  if (activeAIs.length === 0 && activeLocalAIs.length === 0) {
    const errorMsg = await saveMessage(session_id, 'system', null, 'system', null, '⚠️ 没有可用的 AI 成员，请在右上角选择至少一个 AI')
    return res.json({ messages: [userMsg, errorMsg] })
  }

  // 获取模式配置
  const [modeConfig] = await sql`SELECT * FROM chat_modes WHERE mode_key = ${mode} AND is_enabled = true`

  const resultMessages: unknown[] = [userMsg]

  try {
    // ==================== 模式路由 ====================

    if (mode === 'normal') {
      // 普通模式：所有选中的 AI 并行回复
      const replies = await Promise.allSettled(
        activeAIs.map((ai) =>
          callAI({
            provider: ai.provider,
            model: ai.model,
            apiKey: ai.apiKey,
            baseUrl: ai.baseUrl,
            messages: historyMessages,
            systemPrompt: ai.systemPrompt,
            maxTokens: (modeConfig?.config as Record<string, number>)?.max_tokens || 1500,
            temperature: (modeConfig?.config as Record<string, number>)?.temperature || 0.7,
          })
        )
      )

      for (let i = 0; i < activeAIs.length; i++) {
        const ai = activeAIs[i]
        const result = replies[i]
        const content = result.status === 'fulfilled' ? result.value : `❌ 调用失败: ${(result.reason as Error).message}`
        const msg = await saveMessage(session_id, 'ai', ai.id, ai.name, ai.avatar, content, undefined, { model: ai.model, display_model: ai.model.startsWith('ep-') ? ai.name : ai.model })
        resultMessages.push(msg)
      }

    } else if (mode === 'bidding') {
      // 竞标模式：所有 AI 并行提案
      const cfg = modeConfig?.config as Record<string, unknown> || {}

      const systemMsg = await saveMessage(session_id, 'system', null, 'system', null, `🏆 竞标模式开始 — ${validAIs.length} 个 AI 同时提交方案`)
      resultMessages.push(systemMsg)

      const replies = await Promise.allSettled(
        validAIs.map((ai) =>
          callAI({
            provider: ai.provider,
            model: ai.model,
            apiKey: ai.apiKey,
            baseUrl: ai.baseUrl,
            messages: [{ role: 'user', content }],
            systemPrompt: ai.systemPrompt || '请提交你的最佳方案。要有创意，要具体，要有说服力。',
            maxTokens: (cfg.max_tokens as number) || 1000,
            temperature: (cfg.temperature as number) || 0.9,
          })
        )
      )

      for (let i = 0; i < activeAIs.length; i++) {
        const ai = activeAIs[i]
        const result = replies[i]
        const replyContent = result.status === 'fulfilled' ? result.value : `❌ 调用失败`
        const msg = await saveMessage(session_id, 'ai', ai.id, ai.name, ai.avatar, replyContent, '竞标方案', { model: ai.model })
        resultMessages.push(msg)
      }

      const endMsg = await saveMessage(session_id, 'system', null, 'system', null, '✅ 所有方案已提交，请选出你最满意的方案')
      resultMessages.push(endMsg)

    } else if (mode === 'shadow') {
      // 影子模式：第一个 AI 执行，第二个 AI 审查
      const cfg = modeConfig?.config as Record<string, string> || {}
      const actor = validAIs[0]
      const shadow = validAIs[1] || validAIs[0]  // 影子默认用第二个，没有则用同一个

      const systemMsg = await saveMessage(session_id, 'system', null, 'system', null, `👤 执行者: ${actor.name}  |  👁 影子审查: ${shadow.name}`)
      resultMessages.push(systemMsg)

      // 执行者先回答
      const actorReply = await callAI({
        provider: actor.provider,
        model: actor.model,
        apiKey: actor.apiKey,
        baseUrl: actor.baseUrl,
        messages: historyMessages,
        systemPrompt: cfg.actor_prompt || actor.systemPrompt || '请直接完成用户的任务，给出最好的答案。',
        maxTokens: (modeConfig?.config as Record<string, number>)?.max_tokens_actor || 1000,
      })

      const actorMsg = await saveMessage(session_id, 'ai', actor.id, actor.name, actor.avatar, actorReply, '执行者', { model: actor.model })
      resultMessages.push(actorMsg)

      // 影子审查执行者的回答
      const shadowPrompt = `${cfg.shadow_prompt || '你是审查员。请仔细审查以下回答，找出逻辑漏洞、潜在风险或可改进之处。'}\n\n【执行者的回答】\n${actorReply}`

      const shadowReply = await callAI({
        provider: shadow.provider,
        model: shadow.model,
        apiKey: shadow.apiKey,
        baseUrl: shadow.baseUrl,
        messages: [{ role: 'user', content: `原始问题：${content}` }],
        systemPrompt: shadowPrompt,
        maxTokens: (modeConfig?.config as Record<string, number>)?.max_tokens_shadow || 600,
      })

      const shadowMsg = await saveMessage(session_id, 'ai', shadow.id, shadow.name, shadow.avatar, shadowReply, '影子审查', { model: shadow.model })
      resultMessages.push(shadowMsg)

    } else if (mode === 'judge') {
      // 主审官模式：专家们分析，第一个 AI 做主审官裁决
      const cfg = modeConfig?.config as Record<string, unknown> || {}
      const dimensions = (cfg.expert_dimensions as string[]) || ['维度一', '维度二', '维度三']
      const judge = validAIs[0]
      const experts = validAIs.slice(1)
      const actualExperts = experts.length > 0 ? experts : validAIs  // 没有足够 AI 时用同一批

      const systemMsg = await saveMessage(session_id, 'system', null, 'system', null, `⚖️ 主审官模式 — 主审官: ${judge.name}，专家团: ${actualExperts.map((e) => e.name).join(', ')}`)
      resultMessages.push(systemMsg)

      // 专家们各自分析（并行）
      const expertReplies = await Promise.allSettled(
        actualExperts.slice(0, dimensions.length).map((ai, idx) =>
          callAI({
            provider: ai.provider,
            model: ai.model,
            apiKey: ai.apiKey,
            baseUrl: ai.baseUrl,
            messages: [{ role: 'user', content }],
            systemPrompt: `你是「${dimensions[idx] || `专家${idx + 1}`}」领域的专家。请从 ${dimensions[idx]} 角度深入分析用户的问题，提供专业的分析报告。`,
            maxTokens: (cfg.max_tokens_per_expert as number) || 800,
          })
        )
      )

      let expertsReport = ''
      for (let i = 0; i < actualExperts.slice(0, dimensions.length).length; i++) {
        const ai = actualExperts[i]
        const result = expertReplies[i]
        const replyContent = result.status === 'fulfilled' ? result.value : '分析失败'
        const msg = await saveMessage(session_id, 'ai', ai.id, ai.name, ai.avatar, replyContent, `专家·${dimensions[i] || i + 1}`, { model: ai.model })
        resultMessages.push(msg)
        expertsReport += `\n\n【${dimensions[i] || `专家${i + 1}`} 分析】(${ai.name}):\n${replyContent}`
      }

      // 主审官综合裁决
      const judgePrompt = `${cfg.judge_prompt || '你是主审官，请综合以下专家意见，给出最终裁决和理由。'}\n\n【原始问题】\n${content}${expertsReport}`

      const judgeReply = await callAI({
        provider: judge.provider,
        model: judge.model,
        apiKey: judge.apiKey,
        baseUrl: judge.baseUrl,
        messages: [{ role: 'user', content: judgePrompt }],
        systemPrompt: '你是最终裁决者，请整合所有专家意见，做出明确的最终判断和建议。',
        maxTokens: (cfg.max_tokens_judge as number) || 1200,
      })

      const judgeMsg = await saveMessage(session_id, 'ai', judge.id, `${judge.name} (主审官)`, judge.avatar, judgeReply, '主审官·最终裁决', { model: judge.model })
      resultMessages.push(judgeMsg)

    } else if (mode === 'rollcall') {
      // 点名模式：先让一个 AI 判断需要哪些专家，再调用
      const cfg = modeConfig?.config as Record<string, unknown> || {}
      const selector = validAIs[0]

      // 构建专家列表描述
      const expertList = validAIs.map((ai, i) => `${i + 1}. ${ai.name} (${ai.model})`).join('\n')

      const selectPrompt = `${cfg.selector_prompt || '根据用户的问题，从专家库中选出最合适的1-3位专家（用逗号分隔编号），只返回编号列表，如 "1,3"。'}\n\n专家库:\n${expertList}\n\n用户问题: ${content}`

      const selected = await callAI({
        provider: selector.provider,
        model: selector.model,
        apiKey: selector.apiKey,
        baseUrl: selector.baseUrl,
        messages: [{ role: 'user', content: selectPrompt }],
        maxTokens: 50,
      })

      // 解析选中的专家编号
      const indices = selected
        .match(/\d+/g)
        ?.map((n) => parseInt(n) - 1)
        ?.filter((i) => i >= 0 && i < validAIs.length)
        ?.slice(0, (cfg.max_experts as number) || 3) || [0]

      const selectedExperts = indices.map((i) => validAIs[i]).filter(Boolean)

      const systemMsg = await saveMessage(
        session_id, 'system', null, 'system', null,
        `📋 点名模式 — 已调用: ${selectedExperts.map((e) => e.name).join(', ')}`
      )
      resultMessages.push(systemMsg)

      // 被点名的专家依次回答
      for (const ai of selectedExperts) {
        const reply = await callAI({
          provider: ai.provider,
          model: ai.model,
          apiKey: ai.apiKey,
          baseUrl: ai.baseUrl,
          messages: historyMessages,
          systemPrompt: ai.systemPrompt,
          maxTokens: (cfg.max_tokens as number) || 800,
        })
        const msg = await saveMessage(session_id, 'ai', ai.id, ai.name, ai.avatar, reply, '专家发言', { model: ai.model })
        resultMessages.push(msg)
      }
    }

  } catch (err) {
    console.error('Chat send error:', err)
    const errMsg = await saveMessage(session_id, 'system', null, 'system', null, `❌ 发生错误: ${(err as Error).message}`)
    resultMessages.push(errMsg)
  }

  return res.json({
    messages: resultMessages,
    session_id,
    local_ai_calls: localAIs.length > 0 ? localAIs.map(ai => ({
      id: ai.id, name: ai.name, avatar: ai.avatar,
      model: ai.model, base_url: ai.baseUrl || 'http://localhost:11434',
      system_prompt: ai.systemPrompt,
    })) : undefined
  })
})
