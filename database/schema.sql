-- ============================================
-- AI Chat Hub — 数据库初始化脚本
-- 在 Neon SQL Editor 中执行此文件
-- ============================================

-- 启用 UUID 扩展
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ============================================
-- 1. 用户表
-- ============================================
CREATE TABLE IF NOT EXISTS users (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  email         VARCHAR(255) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  display_name  VARCHAR(100),
  role          VARCHAR(20) DEFAULT 'user' CHECK (role IN ('admin', 'user')),
  is_active     BOOLEAN DEFAULT true,
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 2. 系统 AI 成员（管理员配置，可对用户开放）
-- ============================================
CREATE TABLE IF NOT EXISTS system_ai_members (
  id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name            VARCHAR(100) NOT NULL,
  avatar          TEXT,                        -- emoji 或图片 URL
  provider        VARCHAR(50) NOT NULL,         -- gemini / deepseek / doubao / glm / openai / ollama / custom
  model           VARCHAR(100) NOT NULL,
  api_key_enc     TEXT,                         -- AES 加密后的 API Key
  base_url        VARCHAR(255),                 -- 自定义 API 地址（Ollama 等）
  is_public       BOOLEAN DEFAULT true,         -- true = 对所有用户开放
  allowed_users   UUID[],                       -- 指定开放的用户 ID 列表（is_public=false 时使用）
  is_enabled      BOOLEAN DEFAULT true,
  sort_order      INTEGER DEFAULT 0,
  created_by      UUID REFERENCES users(id),
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 3. 用户私人 AI 成员（用户自行添加）
-- ============================================
CREATE TABLE IF NOT EXISTS user_ai_members (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        VARCHAR(100) NOT NULL,
  avatar      TEXT,
  provider    VARCHAR(50) NOT NULL,
  model       VARCHAR(100) NOT NULL,
  api_key_enc TEXT,                             -- 加密存储
  base_url    VARCHAR(255),                     -- 本地 Ollama 地址
  is_local    BOOLEAN DEFAULT false,            -- 是否为本地模型
  is_enabled  BOOLEAN DEFAULT true,
  sort_order  INTEGER DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW(),
  updated_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 4. AI 角色预设库
-- ============================================
CREATE TABLE IF NOT EXISTS ai_roles (
  id            UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name          VARCHAR(100) NOT NULL,
  description   VARCHAR(500),
  system_prompt TEXT NOT NULL,
  category      VARCHAR(50),                    -- 分类：分析师 / 创意 / 技术 / 通用 等
  is_public     BOOLEAN DEFAULT true,           -- false = 用户私人角色
  created_by    UUID REFERENCES users(id),
  created_at    TIMESTAMPTZ DEFAULT NOW(),
  updated_at    TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 5. 用户对 AI 成员的个性化配置
-- ============================================
CREATE TABLE IF NOT EXISTS user_ai_configs (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id          UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  ai_member_id     UUID NOT NULL,               -- system_ai_members.id 或 user_ai_members.id
  ai_member_type   VARCHAR(10) NOT NULL CHECK (ai_member_type IN ('system', 'user')),
  custom_name      VARCHAR(100),                -- 用户自定义的 AI 名字
  custom_avatar    TEXT,                        -- 用户自定义头像
  role_id          UUID REFERENCES ai_roles(id),
  custom_prompt    TEXT,                        -- 额外自定义 prompt
  created_at       TIMESTAMPTZ DEFAULT NOW(),
  updated_at       TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, ai_member_id, ai_member_type)
);

-- ============================================
-- 6. 聊天会话
-- ============================================
CREATE TABLE IF NOT EXISTS chat_sessions (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title        VARCHAR(200) DEFAULT '新对话',
  category     VARCHAR(100),                    -- 用户自定义分类
  chat_mode    VARCHAR(50) DEFAULT 'normal',    -- normal / judge / bidding / shadow / rollcall
  mode_config  JSONB,                           -- 该会话的模式参数
  is_archived  BOOLEAN DEFAULT false,
  is_pinned    BOOLEAN DEFAULT false,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 7. 聊天消息
-- ============================================
CREATE TABLE IF NOT EXISTS chat_messages (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  session_id   UUID NOT NULL REFERENCES chat_sessions(id) ON DELETE CASCADE,
  sender_type  VARCHAR(10) NOT NULL CHECK (sender_type IN ('user', 'ai', 'system')),
  sender_id    UUID,                            -- user.id 或 ai_member.id
  sender_name  VARCHAR(100),                    -- 显示名称
  sender_avatar TEXT,
  content      TEXT NOT NULL,
  role_in_mode VARCHAR(50),                     -- 在当前模式中的角色（如：judge / expert / shadow）
  metadata     JSONB,                           -- 额外信息（token用量、模型名等）
  created_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 8. 聊天模式全局配置（管理员设置）
-- ============================================
CREATE TABLE IF NOT EXISTS chat_modes (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  mode_key     VARCHAR(50) UNIQUE NOT NULL,     -- normal / judge / bidding / shadow / rollcall
  mode_name    VARCHAR(100) NOT NULL,
  description  TEXT,
  config       JSONB NOT NULL DEFAULT '{}',     -- 模式参数（可由管理员调整）
  is_enabled   BOOLEAN DEFAULT true,
  created_at   TIMESTAMPTZ DEFAULT NOW(),
  updated_at   TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 9. 索引（加速查询）
-- ============================================
CREATE INDEX IF NOT EXISTS idx_chat_sessions_user ON chat_sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_chat_sessions_updated ON chat_sessions(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_messages_session ON chat_messages(session_id);
CREATE INDEX IF NOT EXISTS idx_chat_messages_created ON chat_messages(created_at);
CREATE INDEX IF NOT EXISTS idx_user_ai_members_user ON user_ai_members(user_id);
CREATE INDEX IF NOT EXISTS idx_user_ai_configs_user ON user_ai_configs(user_id);

-- ============================================
-- 10. 初始数据
-- ============================================

-- 插入默认聊天模式配置
INSERT INTO chat_modes (mode_key, mode_name, description, config) VALUES
(
  'normal',
  '普通对话',
  '直接与选定的 AI 成员对话',
  '{"max_tokens": 2000, "temperature": 0.7}'
),
(
  'judge',
  '主审官模式',
  '多个 AI 专家分析后由主审官综合裁决',
  '{
    "expert_count": 3,
    "expert_dimensions": ["财务风险", "市场竞争", "技术实现"],
    "judge_prompt": "你是主审官，请综合以上专家意见，给出最终裁决和理由。",
    "max_tokens_per_expert": 800,
    "max_tokens_judge": 1200
  }'
),
(
  'bidding',
  '竞标模式',
  '所有 AI 并行提交方案，你来评选最优',
  '{
    "parallel": true,
    "show_scores": true,
    "max_tokens": 1000,
    "temperature": 0.9
  }'
),
(
  'shadow',
  '影子模式',
  '执行者完成任务，影子在后台审查并提出改进建议',
  '{
    "actor_prompt": "请直接完成用户的任务，给出最好的答案。",
    "shadow_prompt": "你是审查员。请仔细审查上方执行者的回答，找出逻辑漏洞、潜在风险或可改进之处，并给出具体建议。",
    "max_tokens_actor": 1000,
    "max_tokens_shadow": 600
  }'
),
(
  'rollcall',
  '点名模式',
  '系统自动判断需要哪些专家，按需调用',
  '{
    "auto_select": true,
    "max_experts": 3,
    "selector_prompt": "根据用户的问题，从专家库中选出最合适的1-3位专家（用逗号分隔专家名），只返回名字列表，不要其他内容。",
    "max_tokens": 800
  }'
)
ON CONFLICT (mode_key) DO NOTHING;

-- 插入默认角色预设
INSERT INTO ai_roles (name, description, system_prompt, category, is_public) VALUES
(
  '通用助手',
  '全能型 AI 助手，适合日常对话',
  '你是一个智能、友好的 AI 助手。请用清晰、准确的语言回答用户的问题。',
  '通用',
  true
),
(
  '财务分析师',
  '专注财务、投资、风险分析',
  '你是一位资深财务分析师，拥有丰富的投资分析和风险评估经验。请从财务角度对问题进行深入分析，提供数据支撑的专业建议。',
  '分析',
  true
),
(
  '技术架构师',
  '专注软件架构、代码审查、技术方案',
  '你是一位经验丰富的软件架构师。请从技术可行性、系统设计、最佳实践等角度分析问题，给出专业的技术建议和代码示例。',
  '技术',
  true
),
(
  '创意策划师',
  '专注创意、营销、品牌策划',
  '你是一位充满创意的策划师，擅长品牌营销和创意内容。请提供新颖、有吸引力的创意方案，注重用户体验和传播效果。',
  '创意',
  true
),
(
  '法律顾问',
  '专注法律分析、合规风险',
  '你是一位专业的法律顾问。请从法律角度分析问题，指出潜在的合规风险和法律隐患，提供谨慎的专业意见。（注意：以下建议仅供参考，具体事宜请咨询执业律师）',
  '分析',
  true
),
(
  '市场分析师',
  '专注市场趋势、竞争分析',
  '你是一位市场研究专家。请从市场趋势、竞争格局、用户需求等维度分析问题，提供有洞察力的市场判断。',
  '分析',
  true
)
ON CONFLICT DO NOTHING;

-- ============================================
-- 完成！
-- ============================================
-- 执行成功后你会看到 "INSERT 0 5" 和 "INSERT 0 6" 等提示
-- 接下来请按照 PROJECT_STRUCTURE.md 的指引配置 Vercel 环境变量
