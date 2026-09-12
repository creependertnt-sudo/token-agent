# Mira AI — 项目状态

> 更新日期：2026-08-18  
> 仓库：https://github.com/creependertnt-sudo/mira-ai  
> 分支：`main`  
> 当前提交：`2dbf3b0`（`feat: add agent observability system`）

本文记录截至第七阶段（Agent 可观测性）封版后的系统现状，供后续开发对齐。

---

## 当前架构

### 技术栈

| 层 | 选型 |
|---|---|
| 前端 / API | Next.js 16.2.10、React 19、TypeScript |
| ORM / 数据库 | Prisma 7 + SQLite（`data.db`，本地文件，不入库） |
| LLM | DeepSeek Chat Completions（OpenAI 兼容 SDK） |
| 会话 | Cookie `token_agent_session` |
| 流式输出 | SSE（`lib/chat-sse.ts`） |

### 服务通道（硬约束）

扣费与身份以 `SERVICE_CONFIG`（`lib/constants.ts`）为准，**禁止按问题复杂度自动升级档位**。

| serviceType | 展示名 | Token 费用 | 用途 |
|---|---|---|---|
| `SALES` | 销售客服 | **0（免费）** | 问诊、推荐套餐、指导购买 |
| `LIGHT` | A模型AI | 5 | 轻量问答 |
| `STANDARD` | B模型AI | 20 | 均衡能力 |
| `PREMIUM` | C模型AI | 50 | 长上下文 / 思考模式 |

A/B/C 底层都走 DeepSeek；能力隔离靠 `ModelConfig` + 生成上限（`SERVICE_GENERATION_LIMITS`），不靠切换厂商。

### 请求主链路

```text
用户（已登录）
  ↓
POST /api/chat  （锁定 serviceType）
  ↓
限流（RateLimitWindow）→ Token 预扣（仅 LIGHT/STANDARD/PREMIUM）
  ↓
SALES 时：Sales Pipeline → Decision Engine → Conversion（最多 1 张商品卡）
  ↓
Agent Runtime（Tool Calling，最多 3 轮）
  ↓
DeepSeek LLM 流式生成
  ↓
SSE 推送给前端
  ↓
落库 Message / Memory / Observability
  ↓
商品卡点击 → /recharge → 模拟支付 → Token 到账
```

### 职责边界（不可混淆）

| 模块 | 负责 | 不负责 |
|---|---|---|
| **Tools** | 查事实（余额、套餐、订单、记忆、知识库） | 决定卖什么 |
| **Sales Engine** | 卖什么、`recommendedPackage`、`pushStrategy`、商品卡（最多 1 张） | 编造价格或覆盖查询正文 |
| **LLM** | 表达 | 编造数据库事实 |
| **SSE** | 最终回答流式输出 | 业务决策 |
| **Observability** | 记录、统计、脱敏错误 | 扣费、路由、推荐 |

纯查询（有什么套餐 / 价格 / 余额 / 订单）进入 `toolQueryMode=true`：完整展示 Tool 结果，禁止销售推荐覆盖正文。购买或场景咨询不进查询模式。

### 核心目录

| 路径 | 职责 |
|---|---|
| `app/api/` | Next.js Route Handlers |
| `app/page.tsx` | 主聊天 UI |
| `lib/sales-pipeline.ts` | SALES 数据驱动流水线 |
| `lib/sales-decision-engine.ts` | 最终销售裁判（STRONG / MEDIUM / SOFT / NONE） |
| `lib/sales-conversion.ts` | 商品卡策略 |
| `lib/agent-runtime.ts` | Tool + LLM 循环 |
| `lib/tool-registry.ts` | 5 个业务 Tool |
| `lib/tokens.ts` | Token 预扣 / 确认 / 回滚 |
| `lib/agent-observability/` | AgentRun / AgentToolCall |
| `lib/observability/` | AgentTrace / 漏斗 / 错误 |
| `prisma/schema.prisma` | 数据模型 |

### 页面

| 路由 | 说明 |
|---|---|
| `/` | 主聊天（SALES / A / B / C 切换） |
| `/login` `/register` | 登录 / 注册 |
| `/recharge` | 套餐购买（可 `?package=` 高亮推荐档） |
| `/select-ai` | 选择 AI 服务 |
| `/writer` | AI 写作（每次 50 Token） |

---

## 已完成功能

### 阶段 0–1：账号、聊天、Memory

- 注册 / 登录 / 退出；Cookie 会话
- 昵称、头像、主题（light / dark / system）
- 对话与消息持久化；助手消息带档位 / 扣费 / 余额快照
- `AgentMemory` 长期记忆（preference / business / product / fact）
- 新用户 20 次免费聊天额度（`freeChatCount`）

### 阶段 2：A/B/C 路由与扣费

- 请求体 `serviceType` 锁定档位，禁止用历史会话覆盖
- LIGHT / STANDARD / PREMIUM 走 `TokenTransaction`：PENDING 预扣 → 成功 SUCCESS / 失败回滚
- SALES **不创建** Token 事务、费用恒为 0
- 模型能力、定位、system prompt 读 `ModelConfig` / `ModelCapability`，禁止代码写死档位介绍

### 阶段 3：SALES 数据驱动决策

- 客户画像 `CustomerProfile`、长期客户记忆 `CustomerMemory`
- 销售知识库 RAG（`SalesKnowledge`）、竞品库（`CompetitorKnowledge`）
- 策略表 `SalesStrategy`、推荐规则 `ModelRecommendRule`
- 客户分层（VIP / HIGH_VALUE / POTENTIAL / NORMAL）
- 用量预测读真实 `TokenUsage`，超额推动 Upsell

### 阶段 4：转化闭环

- Decision Engine 产出 `pushStrategy` + 唯一推荐套餐
- 商品卡最多 **1 张**；闲聊 / 问诊不出卡
- 点击 → `SalesConversion` SHOWN → CLICKED → 支付 PAID
- 充值页高亮推荐套餐；当前支付为 **模拟支付**（`POST /api/orders/[id]/pay`）

### 阶段 5：Tool Calling + 查询模式

五个 Tool（Schema **不含 userId**，`execute` 只用会话 `ctx.userId`）：

| Tool | 作用 |
|---|---|
| `query_packages` | 套餐目录与价格 |
| `query_balance` | 当前 Token 余额 |
| `query_orders` | 用户订单 |
| `query_memory` | 用户记忆 |
| `search_knowledge` | 产品 / 竞品知识 |

`toolQueryMode`：纯查询完整列事实；购买意图仍由 Sales 出卡。

### 阶段 6：Analytics / 漏斗观测

- `ChatAnalytics`、`ConversionAnalytics`、`SalesFunnelLog`
- `AgentTrace`、`ToolCallLog`、`AgentErrorLog`、`AgentLog`
- 开发环境才打 `[analytics] intent/tools/package/strategy`
- 统计写入失败不阻塞 SSE

### 阶段 7：AgentRun / AgentToolCall

- 每次请求写 `AgentRun`：耗时拆 `duration` / `toolDuration` / `llmDuration`，Memory 注入/使用计数
- 每次 Tool 写 `AgentToolCall`：参数脱敏（丢掉 userId / password / key），结果摘要
- 公开错误文案（无 API Key / SQL）
- `GET /api/admin/agent/stats`

### 用户限制

按历史成交订单推断配额档（不新增用户字段）：

| 档 | 请求/分钟 | 记忆上限 |
|---|---|---|
| NORMAL（无成交） | 10 | 100 |
| PREMIUM（有成交） | 100 | 300 |
| ENTERPRISE（大额/多次） | 300 | 500 |

上下文硬限制：最近 20 轮。SALES 计入限流但不扣 Token。

### 套餐目录（种子数据）

| 套餐 | Token | 价格 |
|---|---|---|
| 基础 | 10000 | ¥9.9 |
| 标准 | 50000 | ¥44 |
| 企业 | 100000 | ¥79 |

---

## 数据库模型

数据源：`prisma/schema.prisma`。SQLite 单文件，`.gitignore` 排除 `*.db`。

### 账号与会话

| Model | 说明 |
|---|---|
| `User` | 邮箱、密码哈希、昵称、头像、主题、`tokenBalance`、`freeChatCount` |
| `Conversation` | 会话；`serviceId` 仅作记录，**不覆盖**本次请求档位 |
| `Message` | 消息；助手条带 `serviceType` / `modelName` / `tokenCost` / `tokenBalanceAfter` |
| `RateLimitWindow` | 用户级自然分钟窗口 |

### 记忆

| Model | 说明 |
|---|---|
| `AgentMemory` | 多条分类记忆 |
| `CustomerMemory` | 每用户一条：行业 / 需求 / 预算 / 阶段 / 推荐模型 |

### 目录与计费

| Model | 说明 |
|---|---|
| `AIProvider` / `AIModel` | 厂商与模型目录 |
| `AIService` | SALES / LIGHT / STANDARD / PREMIUM |
| `UserSelectedService` | 用户选择记录 |
| `TokenUsage` | 消耗流水（展示 / 用量预测） |
| `TokenTransaction` | 付费预扣事务（SALES 不写） |
| `TokenPackage` | 可售套餐 |
| `Order` | PENDING / SUCCESS / FAILED |

### 销售知识与规则

| Model | 说明 |
|---|---|
| `SalesKnowledge` | RAG 知识（product / pricing / faq 等） |
| `ModelCapability` | A/B/C 能力说明 |
| `CompetitorKnowledge` | 竞品对照（不攻击） |
| `ModelConfig` | 档位权威配置（prompt / 价格 / 思考模式 / 记忆轮数） |
| `SalesStrategy` | 按意图 / 客户类型注入话术 |
| `CustomerProfile` | 画像模板 |
| `ModelRecommendRule` | 需求 → LIGHT/STANDARD/PREMIUM |
| `SalesConversion` | 推荐套餐漏斗：SHOWN / CLICKED / PAID |

### 观测（不参与扣费 / 路由 / 推荐）

| Model | 说明 |
|---|---|
| `AgentTrace` | 一次请求轨迹 |
| `ToolCallLog` | Tool 调用（含 traceId / latency） |
| `ChatAnalytics` | 意图计数 |
| `ConversionAnalytics` | 套餐 SHOWN / CLICKED / PAID |
| `SalesFunnelLog` | 漏斗布尔快照 |
| `AgentErrorLog` | DeepSeek / Tool / DB / SSE 错误 |
| `AgentLog` | 会话级销售日志；支付成功后 `purchased=true` |
| `AgentRun` | 第七阶段：整次运行耗时、工具、Memory、公开错误 |
| `AgentToolCall` | 第七阶段：单次 Tool 脱敏参数与结果摘要 |

---

## API 列表

鉴权列：`登录` = 需要有效会话；`公开` = 无需登录。  
管理统计接口目前只校验「已登录」，**尚未做管理员角色**。

### 认证与资料

| 方法 | 路径 | 鉴权 | 说明 |
|---|---|---|---|
| POST | `/api/auth/register` | 公开 | 注册 |
| POST | `/api/auth/login` | 公开 | 登录 |
| POST | `/api/auth/logout` | 公开 | 退出 |
| GET | `/api/auth/me` | 登录 | 当前用户 |
| PATCH | `/api/auth/me` | 登录 | 改昵称（兼容旧接口） |
| PATCH | `/api/user/profile` | 登录 | 改昵称 / 主题 |

### 聊天与会话

| 方法 | 路径 | 鉴权 | 说明 |
|---|---|---|---|
| POST | `/api/chat` | 登录 | 主入口；SSE 流式回复；body 必须含 `message` + `serviceType` |
| GET | `/api/conversations/[id]` | 登录 | 加载本用户会话消息（含扣费快照） |

### 目录

| 方法 | 路径 | 鉴权 | 说明 |
|---|---|---|---|
| GET | `/api/packages` | 公开 | 有效 Token 套餐 |
| GET | `/api/products` | 公开 | 同套餐（兼容旧前端） |
| GET | `/api/models` | 公开 | 厂商与模型目录 |
| GET | `/api/services` | 公开 | 可用 AI 服务 |
| POST | `/api/services/select` | 登录 | 记录用户选择（不改本次 chat 档位锁定规则） |
| GET | `/api/services/select` | 登录 | 读取选择记录 |

### 订单与转化

| 方法 | 路径 | 鉴权 | 说明 |
|---|---|---|---|
| GET | `/api/orders` | 登录 | 最近订单 |
| POST | `/api/orders` | 登录 | 创建 PENDING 订单 |
| POST | `/api/orders/[id]/pay` | 登录 | **模拟支付成功**，增加余额，标记成交 |
| POST | `/api/sales/conversions/click` | 登录 | 商品卡 / 充值页点击 |

### 销售知识

| 方法 | 路径 | 鉴权 | 说明 |
|---|---|---|---|
| GET | `/api/sales/search?q=` | 公开 | 知识库检索 |
| POST | `/api/sales/search` | 公开 | 同上（JSON body） |

### 写作

| 方法 | 路径 | 鉴权 | 说明 |
|---|---|---|---|
| POST | `/api/writer` | 登录 | 营销文案生成，扣 50 Token |

### 统计 / 观测

| 方法 | 路径 | 鉴权 | 说明 |
|---|---|---|---|
| GET | `/api/analytics/conversion` | 登录 | 按套餐聚合 SHOWN / CLICKED / PAID |
| GET | `/api/analytics/tools` | 登录 | 按 Tool 名聚合调用次数 |
| GET | `/api/analytics/intents` | 登录 | 按 intent 聚合 |
| GET | `/api/agent/stats` | 登录 | AgentLog 总量、Tool 使用、成交率 |
| GET | `/api/admin/observability/stats` | 登录 | 请求数 / Tool / 漏斗 / 错误 |
| GET | `/api/admin/agent/stats` | 登录 | AgentRun：总量、成功率、热门 Tool、最近失败 |

---

## 下一阶段计划

第七阶段已把「记录、脱敏、统计 API」做完，**还没有运营界面，也没有管理员角色**。建议按优先级推进，且继续遵守：不改 Token 扣费、`SALES.cost = 0`、A/B/C 路由、Memory 表结构、聊天布局、商品卡「最多 1 张」算法。

### 第八阶段（建议）：运营后台

1. **管理员鉴权**：`User.role` 或独立白名单；统计接口禁止普通用户访问。
2. **观测面板**：请求量、成功率、热门 Tool、漏斗（展示→点击→成交）、最近错误。数据已可由现有 `/api/admin/*` 与 `/api/analytics/*` 提供。
3. **Agent 明细**：按 `AgentRun` 查看单次耗时、Tool 摘要、Memory 注入情况（不展示完整聊天与密钥）。

### 第九阶段（建议）：销售运营能力

1. 异议处理话术（价格贵 / 先试用 / 和 Dify 比）入库，不写死在代码。
2. 回访：基于 `CustomerMemory.customerStage` 的跟进提示。
3. 知识库 / 策略 / 套餐的后台 CRUD（现在靠 seed）。

### 第十阶段（建议）：生产化

1. 真实支付（替换模拟 `pay`）。
2. 生产库从 SQLite 迁到 PostgreSQL。
3. 强化 `SESSION_SECRET`、管理接口鉴权、错误监控告警。
4. 管理 API 与观测面板的权限隔离上线验证。

### 明确不做（除非单独立项）

- 重构 Sales Pipeline / Tool 协议
- 让 LLM 决定扣费或自动升档
- 查询模式下用销售推荐覆盖 Tool 事实
- 把 `.env`、`*.db`、`node_modules`、`.next` 纳入 Git

---

## 本地运行（备忘）

```bash
npm install
# 复制 .env.example 为 .env，填写 OPENAI_API_KEY / SESSION_SECRET
npx prisma migrate deploy
npm run db:seed
npm run dev
```

敏感文件已在 `.gitignore`：`.env`、`*.db`、`node_modules`、`.next`。
