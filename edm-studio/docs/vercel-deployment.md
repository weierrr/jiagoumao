# Vercel 在线演示

项目为 `formwink-edm-studio`，独立于原加购猫 Vercel 项目。生产环境的演示站点不等于已接通真实营销：`DEMO_MODE=true`、`DRY_RUN=true`、`EMAIL_PROVIDER=mock`，真实发送仍有代码门禁。

## 构建与数据库

- 使用本目录 `vercel.json`，构建命令为 `npm run build:vercel`，先生成 PostgreSQL Prisma Client，再运行 Next.js 构建。
- Preview 和 Production 使用两个独立 Neon Free 资源，位于新加坡；函数区域为 `sin1`。不复用其他应用的数据或密钥。
- 构建不自动修改数据库。发布前使用该环境的连接执行 `npm run db:migrate:postgresql`，首次演示初始化运行 `npm run db:seed`；不要把测试套件指向 Production。
- SQLite 的 `.db` 文件、`.env*`、本地凭据及构建产物均不上传。`.env.example` 仅保留空密钥和安全默认值。
- 每个环境配置独立 `ADMIN_PASSWORD` 和 `SESSION_SECRET`。`APP_URL` 可设置为正式域名；Preview 未配置时使用 Vercel 提供的 `VERCEL_URL`。会话 Cookie 为 Secure、HttpOnly、SameSite=Strict。

## 执行任务

Vercel Functions 不运行原本的常驻 `npm run worker`。在线演示可以通过“同步客户”和事件页“处理待办任务”执行有界任务批次；不会自动在后台持续消费任务。真实 Webhook 自动消费、定时重试及延迟营销须先接入并验收独立 Worker 或可靠任务调度服务，本次不开放。

## 发布顺序

1. 在独立本地目录验证 SQLite 测试与类型检查；使用另一个构建目录生成 PostgreSQL Client。
2. 对隔离 Preview 数据库部署迁移，在专用测试 schema 中执行回归测试。
3. 显式指定 `vercel deploy --environment preview`，完成登录、刷新会话、八个页面和移动端验证。
4. 使用独立 Production 数据库初始化演示，部署相同代码至 Production，再执行只读和鉴权检查。

新 Vercel 项目的首次部署可能自动分配到 Production，即使请求 Preview。本次遇到的未配置正式账号的初始化部署不作为验收结果，最终以实际标记为 Preview 的部署通过测试后发布。

回滚时重新部署上一个已验证提交，保持数据与发送门禁，不删除许可历史、抑制名单和任务记录。

## 2026-10-20 验证结果

- SQLite 全套测试 39/39、类型检查通过；Vercel 云端 Next.js + PostgreSQL Client 构建通过。
- Neon 隔离测试 schema 首轮 38/39 通过，定位到活动逐收件人查询造成 5 秒事务超时；改为批量查询和写入后，该失败用例在同一隔离 schema 重跑通过，SQLite 全套也重新通过。
- 最终 Preview：`https://formwink-edm-studio-rkhn9o873-wesleyy0409-7901s-projects.vercel.app`。
- Preview 浏览器验收通过：八个页面、客户查询、分群创建/删除、模板与暗色预览、工作流模拟、设置门禁、移动端无横向溢出。
- Preview API 实测：匿名和错误密码均返回 401；登录后返回 200，Cookie 带 Secure/HttpOnly，刷新会话仍有效；活动模拟记录 13 位收件人的决策，重复请求返回 duplicate；开启真实发送返回 409。
- Preview 与 Production 分别使用独立密码、会话密钥和数据库。凭据仅保存在 Vercel 环境变量与本机被 Git 忽略的 `.vercel/` 中。
- 当前按 CLI 从独立项目目录部署；原加购猫生产项目和本地未提交改动保持独立。
