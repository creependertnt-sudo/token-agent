# Token AI Agent

基于 Next.js + Prisma + DeepSeek API 的 AI 客服系统。

## 功能

- AI 客服（SALES 销售顾问）
- Token 销售与套餐
- 多模型角色（LIGHT / STANDARD / PREMIUM，即 A / B / C）
- 用户系统（注册 / 登录）
- 对话记录
- Memory（长期记忆）

## 技术栈

- Next.js
- TypeScript
- Prisma
- SQLite
- DeepSeek API

## 运行步骤

1. 安装依赖：

```bash
npm install
```

2. 配置环境变量：复制 `.env.example` 为 `.env`，填入真实密钥（**不要提交 `.env`**）。

```bash
# Windows PowerShell
Copy-Item .env.example .env
```

至少需要设置：

- `OPENAI_API_KEY` — DeepSeek（或兼容）API Key
- `SESSION_SECRET` — 生产环境请使用强随机字符串

3. 初始化数据库并（可选）写入种子数据：

```bash
npx prisma migrate deploy
npm run db:seed
```

4. 启动开发服务：

```bash
npm run dev
```

打开 [http://localhost:3000](http://localhost:3000)。

## 安全说明

以下内容已通过 `.gitignore` 排除，请勿强制加入版本库：

- `.env`（API Key、会话密钥）
- `*.db` / `data.db` / `dev.db`（含用户、聊天、订单等隐私数据）
- `node_modules`、`.next`

请使用 `.env.example` 作为配置模板，仅使用占位符，不要写入真实密钥。
