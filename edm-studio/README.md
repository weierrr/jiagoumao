# FormWink EDM Studio

Shopify 单店邮件营销工作台。根据 `Shopify_EDM_Studio_Resend_MVP_PRD (1).md` 实施，位于原有加购猫仓库的独立子目录；不复用原项目密钥、部署配置或生产服务。

**当前交付：可启动、可持久化、可测试的本地 Mock MVP。不是已接通真实店铺或已可生产群发的成品。** 所有发送入口默认 dry-run；真实测试邮件、Automation 发布及 Broadcast 群发在此验收版本中保持阻断，即使修改环境变量也不会自动开放。真实账号验证与后续接入工作见 `docs/acceptance.md`。

目标品牌为用户指定的 [FormWink](https://formwink.com/)。公开首页展示灯具、挂钟、杯架等家居商品；公开页面标识的 Shopify 域名为 `1jqt0g-4z.myshopify.com`。邮箱、客户、订单和图表为 DEMO 数据，不是此店铺的真实经营数据。

## 启动

需要 Node.js 22.12+。本次本机验证使用 Node 24.18.1。

```bash
cd '/Users/best/Desktop/shopify工具/加购猫/edm-studio'
npm ci
cp .env.example .env
npm run setup
npm run dev
```

访问 http://127.0.0.1:3100 。另外一个终端启动持久化任务消费者：

```bash
npm run worker
```

`npm run worker:once` 只消费一批。界面“同步客户”在本地演示会排队并处理一批；Webhook 默认迅速验签、入库、应答，独立 worker 异步消费。首次运行会创建 SQLite 文件并部署可重放 migration；`db:seed` 不覆盖现有客户暂停、退订、笔记、草稿等修改。需要全新演示时使用一个新的 `DATABASE_URL`，不要删除真实数据。

## 实际可操作的功能

- 总览：从数据库计算近 7 天 sent、delivered、clicked 和抑制数量；模拟决策独立计数，不伪造真实 delivered 回调。
- 客户：关键词与状态过滤、分页、详情、许可历史、订单摘要、所属分群、备注、营销暂停、退订、JSON 导出。
- 分群：AND/OR 规则，订单数、消费额、最近购买、标签；名单始终与许可/抑制集合相交。
- 模板：创建、编辑、删除引用保护、本地发布、React Email HTML/纯文本、变量安全转义、iframe 预览、暗色近似检查、受控地址模拟测试。自动保留品牌地址与退订页脚。
- 活动：选择模板和分群，生成模拟发送决策；发送前重新检查许可；24 小时频率限制；同一活动不重复处理。
- 工作流：React Flow 六类节点，拖拽、连线、属性表单、保存布局、校验、场景模拟、模拟发布、暂停。草稿与发布快照分开。Welcome/购后/弃单预置可打开；弃单不开放发布。
- 事件：模拟/真实来源区分、操作审计、outbox 状态、指数退避、最多 5 次后死信、人工重试。
- 接入基础：Shopify GraphQL 分页客户/订单摘要读取，HMAC 校验与去重；Resend Svix 验签与抑制；Provider 接口及 REST 适配器。接入路径完成本地契约测试，尚未用真实账号验收。

## 验证

```bash
npm test                 # 独立临时数据库，单元+本地集成测试；不接触演示库
npm run typecheck
npm run build
npm run test:browser     # 另有 npm run dev 正在监听 3100，使用本机 Chrome
```

浏览器验收会创建并删除一个演示分群，保存工作流草稿并生成一次模拟轨迹。仅对演示库使用。可设置 `TEST_BASE_URL` 和 `CHROME_PATH`，测试报告见 `docs/acceptance.md`，运行截图在 `docs/*.png`。

## 配置与身份

`.env.example` 不含真密钥。根目录 `.env.local` 属于其他应用，本项目不读取它。

本地模式绑定 `127.0.0.1`，未配置密码时允许本机 DEMO 会话。**不得把这个免登录演示端口通过公网代理转发。** 对任何非本机 Preview，先配置不同的长随机 `ADMIN_PASSWORD`、`SESSION_SECRET`、HTTPS `APP_URL`。生产必须保持认证，设置 Cookie 为 HttpOnly/SameSite=Strict；来源检查拒绝跨站管理写操作。此单账号密码方案没有 SSO/MFA 和多节点会话撤销，应在生产接入访问网关。

真实接入必须建立独立数据库并设 `DEMO_MODE=false`，不要把演示库迁移成真实收件名单。所有记录带 `storeId`；真实环境使用 `store-live`，Demo 使用 `store-demo`。预览不得误用原项目的 Vercel/Railway 生产配置。

## PostgreSQL

本地开发默认使用 SQLite。云端部署使用独立 Neon PostgreSQL；完整等价的 PostgreSQL schema 和初始 migration 在 `prisma/postgresql/`。

```bash
# 使用隔离的 PostgreSQL Preview 数据库，先在 .env 配置其 DATABASE_URL。
npx prisma generate --schema prisma/postgresql/schema.prisma
npx prisma migrate deploy --schema prisma/postgresql/schema.prisma
npm run db:seed
npm run typecheck
npm test
```

注意：`npm test` 的默认测试运行器针对 SQLite Client。切换 PostgreSQL 后，应在另一份 SQLite 开发目录运行本地测试，或用 PostgreSQL Preview 独立测试数据库执行等效验收。不要在生产运行现有测试或直接运行 SQLite 的 `npm run setup`。切换 schema 后始终重新生成 Prisma Client。云端迁移与回归测试记录见 `docs/vercel-deployment.md`；真实营销启用前仍需并发、备份恢复和真实账号联调验收。

## Shopify 连接

1. 在有权限的 Shopify 组织/店铺为本服务创建并安装应用，选择该安装场景支持的 OAuth 或组织内服务端授权；当前 UI 验证一个已获取的服务端 token，不提供 OAuth 安装向导或自动 client-credentials 换取/刷新。
2. 按功能申请 `read_customers`、`read_orders`；退订回写还需适用的 `write_customers` 权限。普通订单窗口通常有限；全历史另需相应批准。确认 protected customer data 和弃单后台权限。
3. 配置 `SHOPIFY_SHOP_DOMAIN=1jqt0g-4z.myshopify.com`、`SHOPIFY_ACCESS_TOKEN` 和 `SHOPIFY_WEBHOOK_SECRET`；在设置页检查连接，再排队同步。
4. 当前 API 固定为已通过官方工具校验的 `2026-07`；客户端日期为 2026-10-20，但工具尚不支持 2026-10 schema。升级时重新校验 GraphQL 与 webhook topics，不假装已测试新版本。
5. 在测试店铺配置回调 `/api/webhooks/shopify`，订阅客户/营销许可、orders/create、orders/updated、orders/paid，以及隐私主题。回调检查 HMAC、店铺域名、delivery ID；原始请求体只保存 hash，不保存地址/支付信息。

## Resend / DNS / 受控测试

1. 在 Resend 测试账号添加发件域名，按该账号返回的 DNS 记录设置 DKIM/SPF 等，等待 provider 标为 verified。不要套用固定 DNS 值。
2. 服务端配置 `RESEND_API_KEY`、`RESEND_FROM`、`RESEND_WEBHOOK_SECRET`，连接页实际查询 Domains 状态。策略证据、计费确认、集成验收条件单独配置。
3. 配置 `/api/webhooks/resend` 及 sent/delivered/clicked/bounced/complained、contact.updated、contact.topics.updated、suppression.added 等事件。使用 Resend 配置的 Svix 签名密钥。
4. `TEST_EMAIL_ALLOWLIST` 用逗号分隔本人控制的邮箱。DEMO 也允许 example.com 保留域名；所有“测试发送”仅生成安全渲染和审计，不发真实邮件。真实测试按钮此版本有显式 409 门禁。
5. 真正打通前，逐项完成 `docs/acceptance.md` 的 Phase 0 与账号联调。未经许可不发邮件、不导入陌生名单。普通家居类目并不等于本项目已经取得 Resend 许可。

本地回调需要你控制的 HTTPS tunnel；转发前启用管理员密码。将两个 provider 的签名 secret 配成测试值，用其官方回放工具测试。不要转发无密码的 DEMO 管理后台到公网，也不要把 Webhook 验签关掉以图方便。

## 部署与回滚

所有变更先在隔离 Preview 验证。Vercel 在线演示的配置与验收见 `docs/vercel-deployment.md`；线上演示保持 Mock 模式，不修改 FormWink 店铺。

Next.js Web 可部署 Node 服务或 Vercel Preview，必须使用 PostgreSQL 而非临时磁盘上的 SQLite。Worker 部署至支持常驻任务的隔离服务；使用同一环境的数据库、单个消费者起步。数据库 migration 应在发布前独立执行；不得让多个实例自动改 schema。

本机生产构建预览：`npm run build && npm start`（仍只绑定 127.0.0.1）。本目录没有继承上级项目部署目标。

上线检查：真实账号受控邮件与回调、域名、权限、退订持续阻断、远端 suppression 对账、并发去重、额度、超时未知结果处理、退出行为、监控与数据保留。检查未完成前保持 `DRY_RUN=true`。

回滚：先关闭真实发送并暂停新事件投递；保存当前 DB 快照；回滚 Web/Worker 代码到已验证版本；只使用向后兼容 migration，破坏性变更另作恢复演练。不要删除 outbox、consent_history、suppression 或幂等记录；远端托管运行是否停止需独立确认，不能用本地暂停推定。

## 项目地图

- `src/app/api/[...path]/route.ts`：管理 API 与 Webhook 路由
- `src/lib/domain.ts`：许可、分群、工作流 schema/校验/模拟/已确认节点编译
- `src/lib/webhooks.ts`、`jobs.ts`：验签、立即抑制、去重、任务处理
- `src/lib/shopify.ts`、`providers.ts`：服务端集成边界
- `src/lib/email.tsx`：React Email 安全渲染
- `src/components/`：八个工作台页面与画布
- `docs/architecture.md`、`docs/security-and-compliance.md`、`docs/api-integrations.md`：实施和边界
- `docs/acceptance.md`：分阶段验收及剩余工作
