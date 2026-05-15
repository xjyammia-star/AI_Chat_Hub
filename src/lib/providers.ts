// ============================================
// AI 提供商配置
// ============================================

import type { AIProvider, AIProvider_Config } from '@/types'

export const AI_PROVIDERS: Record<AIProvider, AIProvider_Config> = {
  gemini: {
    key: 'gemini',
    label: 'Google Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com/v1beta',
    models: ['gemini-2.5-flash', 'gemini-2.0-flash', 'gemini-1.5-pro'],
    requiresKey: true,
  },
  deepseek: {
    key: 'deepseek',
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com/v1',
    models: ['deepseek-chat', 'deepseek-reasoner'],
    requiresKey: true,
  },
  doubao: {
    key: 'doubao',
    label: '豆包 (Doubao)',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
    models: ['doubao-pro-4k', 'doubao-pro-32k', 'doubao-lite-4k'],
    requiresKey: true,
  },
  glm: {
    key: 'glm',
    label: '智谱 GLM',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    models: ['glm-4', 'glm-4-flash', 'glm-3-turbo'],
    requiresKey: true,
  },
  openai: {
    key: 'openai',
    label: 'OpenAI / ChatGPT',
    baseUrl: 'https://api.openai.com/v1',
    models: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo', 'gpt-3.5-turbo'],
    requiresKey: true,
  },
  anthropic: {
    key: 'anthropic',
    label: 'Anthropic Claude',
    baseUrl: 'https://api.anthropic.com/v1',
    models: ['claude-opus-4-5', 'claude-sonnet-4-5', 'claude-haiku-4-5'],
    requiresKey: true,
  },
  ollama: {
    key: 'ollama',
    label: 'Ollama 本地模型',
    baseUrl: 'http://localhost:11434',
    models: ['gemma3:27b', 'llama3.2', 'mistral', 'qwen2.5'],
    requiresKey: false,
    isLocal: true,
  },
  custom: {
    key: 'custom',
    label: '自定义 (OpenAI 兼容)',
    models: [],
    requiresKey: true,
  },
}

// 默认 AI 头像 emoji
export const DEFAULT_AVATARS: Record<AIProvider, string> = {
  gemini: '✨',
  deepseek: '🌊',
  doubao: '🫘',
  glm: '🧠',
  openai: '🤖',
  anthropic: '🔮',
  ollama: '🦙',
  custom: '⚡',
}

// 检测本地 Ollama 是否可用（浏览器直连）
export async function checkOllamaAvailability(baseUrl: string = 'http://localhost:11434'): Promise<boolean> {
  try {
    const response = await fetch(`${baseUrl}/api/tags`, {
      signal: AbortSignal.timeout(3000),
    })
    return response.ok
  } catch {
    return false
  }
}

// 调用 Ollama（浏览器直连，不经过 Vercel）
export async function callOllama(
  baseUrl: string,
  model: string,
  messages: Array<{ role: string; content: string }>,
  systemPrompt?: string
): Promise<string> {
  const allMessages = systemPrompt
    ? [{ role: 'system', content: systemPrompt }, ...messages]
    : messages

  const response = await fetch(`${baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      messages: allMessages,
      stream: false,
    }),
  })

  if (!response.ok) {
    throw new Error(`Ollama error: ${response.status}`)
  }

  const data = await response.json()
  return data.message?.content || ''
}
