# AI Chat Hub — 完整项目结构

## 目录结构

```
ai-chat-hub/                          ← 根目录（上传到 GitHub 的文件夹）
│
├── public/                           ← 静态资源
│   ├── manifest.json                 ← PWA 配置
│   ├── sw.js                         ← Service Worker（PWA 离线支持）
│   ├── icons/                        ← PWA 图标（需要你自己放入）
│   │   ├── icon-192.png
│   │   └── icon-512.png
│   └── favicon.ico
│
├── src/                              ← 前端源码
│   ├── main.tsx                      ← 入口文件
│   ├── App.tsx                       ← 根组件（路由）
│   ├── index.css                     ← 全局样式（微信风格）
│   │
│   ├── types/                        ← TypeScript 类型定义
│   │   └── index.ts
│   │
│   ├── lib/                          ← 工具库
│   │   ├── db.ts                     ← Neon 数据库客户端
│   │   ├── auth.ts                   ← 认证工具
│   │   ├── crypto.ts                 ← API Key 加密/解密
│   │   └── providers.ts              ← AI 提供商配置
│   │
│   ├── hooks/                        ← React Hooks
│   │   ├── useAuth.ts                ← 认证状态
│   │   ├── useChat.ts                ← 聊天逻辑
│   │   └── useAIMembers.ts           ← AI 成员管理
│   │
│   ├── components/                   ← UI 组件
│   │   ├── auth/
│   │   │   ├── LoginForm.tsx
│   │   │   └── RegisterForm.tsx
│   │   ├── layout/
│   │   │   ├── AppShell.tsx          ← 整体布局容器
│   │   │   ├── Sidebar.tsx           ← 左侧会话列表
│   │   │   └── ChatArea.tsx          ← 右侧聊天区域
│   │   ├── chat/
│   │   │   ├── MessageBubble.tsx     ← 消息气泡
│   │   │   ├── MessageInput.tsx      ← 输入框
│   │   │   ├── AIAvatar.tsx          ← AI 头像
│   │   │   └── ModeSelector.tsx      ← 模式选择器
│   │   ├── members/
│   │   │   ├── AICard.tsx            ← AI 成员卡片
│   │   │   └── AIConfigModal.tsx     ← AI 配置弹窗
│   │   └── admin/
│   │       ├── AdminPanel.tsx        ← 管理员面板
│   │       ├── UserManager.tsx       ← 用户管理
│   │       ├── ModeConfig.tsx        ← 模式配置
│   │       └── RoleLibrary.tsx       ← 角色预设库
│   │
│   └── pages/                        ← 页面组件
│       ├── AuthPage.tsx              ← 登录/注册页
│       ├── ChatPage.tsx              ← 主聊天页
│       └── AdminPage.tsx             ← 管理员后台
│
├── api/                              ← Vercel Serverless Functions
│   ├── auth/
│   │   ├── register.ts               ← 用户注册
│   │   ├── login.ts                  ← 用户登录
│   │   └── me.ts                     ← 获取当前用户
│   ├── chat/
│   │   ├── send.ts                   ← 发送消息（路由到各 AI）
│   │   ├── sessions.ts               ← 会话管理
│   │   └── messages.ts               ← 消息记录
│   ├── members/
│   │   ├── index.ts                  ← 获取 AI 成员列表
│   │   └── [id].ts                   ← 单个 AI 成员操作
│   ├── admin/
│   │   ├── users.ts                  ← 用户管理
│   │   ├── modes.ts                  ← 模式配置
│   │   └── roles.ts                  ← 角色库管理
│   └── _middleware.ts                ← 认证中间件
│
├── database/
│   └── schema.sql                    ← 数据库初始化 SQL（在 Neon 执行）
│
├── .env.example                      ← 环境变量示例
├── .gitignore
├── index.html                        ← HTML 入口
├── vite.config.ts                    ← Vite 配置
├── tsconfig.json
├── tailwind.config.js
├── postcss.config.js
├── vercel.json                       ← Vercel 部署配置
└── package.json
```

---

## Neon 数据库配置步骤

### Step 1: 创建 Neon 数据库

1. 打开 https://neon.tech，登录（用 GitHub 账号）
2. 点击 **New Project**
3. 项目名填：`ai-chat-hub`
4. Region 选：**AWS Asia Pacific (Singapore)** （离泰国最近）
5. 创建完成后，点击 **Connection Details**
6. 复制 **Connection string**，格式如下：
   ```
   postgresql://user:password@ep-xxx.ap-southeast-1.aws.neon.tech/neondb?sslmode=require
   ```

### Step 2: 执行数据库 SQL

1. 在 Neon 控制台点击 **SQL Editor**
2. 把 `database/schema.sql` 文件的全部内容粘贴进去
3. 点击 **Run** 执行
4. 看到 "Success" 即完成

### Step 3: 配置 Vercel 环境变量

在 Vercel 项目的 **Settings → Environment Variables** 添加：

| 变量名 | 值 | 说明 |
|--------|-----|------|
| `DATABASE_URL` | 你的 Neon Connection String | 数据库连接 |
| `JWT_SECRET` | 随机字符串（32位以上） | JWT 签名密钥 |
| `ENCRYPTION_KEY` | 随机字符串（32位以上） | API Key 加密密钥 |
| `ADMIN_INVITE_CODE` | 自定义邀请码 | 注册管理员账号用 |

生成随机字符串的方法（在终端运行）：
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Step 4: 上传到 GitHub 并部署

1. 在 GitHub 创建新仓库：`ai-chat-hub`
2. 把所有文件推送上去
3. 在 Vercel 导入这个仓库
4. Framework 选 **Vite**
5. 添加好环境变量后点 **Deploy**

---

## 本地开发

```bash
# 安装依赖
npm install

# 复制环境变量文件
cp .env.example .env.local
# 然后编辑 .env.local 填入你的值

# 启动开发服务器
npm run dev
```

---

## Ollama 本地模型配置（用户端）

用户需要在自己电脑上：

1. 安装 Ollama: https://ollama.com
2. 下载模型: `ollama pull gemma3:27b`
3. 设置跨域启动:
   - **Mac/Linux**: `OLLAMA_ORIGINS=* ollama serve`
   - **Windows**: 在系统环境变量添加 `OLLAMA_ORIGINS` = `*`，然后重启 Ollama
4. 在 AI Chat Hub 的设置页面，添加本地 AI，填入：
   - API 地址: `http://localhost:11434`
   - 模型名: `gemma3:27b`
