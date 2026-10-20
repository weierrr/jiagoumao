# Phase 验收记录

验收日期：2026-10-20（Asia/Shanghai）。本地环境：macOS、Node 24.18.1、Next 16.4.2、SQLite 临时测试数据库。云端演示部署及 Neon PostgreSQL 验收补充见 `docs/vercel-deployment.md`。未连接真实 Shopify/Resend，未发送邮件，未修改 FormWink。

## 已完成并通过

Phase 0 的本地安全 Spike：Resend 官方 REST 文档已复核，AUP 规则写入实现边界；Shopify GraphQL customers/orders/customer consent 查询用官方工具按 `2026-07` 校验通过；FormWink 公开域名与类目已记录；默认 `DEMO_MODE=true`、`DRY_RUN=true`、MockProvider。

Phase 1 的本地客户与事件管道：Prisma migration/seed、客户许可状态机、ConsentHistory、订单摘要、Shopify HMAC、Resend Svix、delivery ID 去重、raw hash 冲突、suppressions、隐私请求停发、outbox 租约/退避/死信/重试、worker。

Phase 2 的本地营销资产：模板 CRUD/安全渲染/纯文本/退订页脚/暗色近似预览/受控模拟测试；AND/OR 分群；活动模拟、许可重算、24 小时频率保护、一次性处理。

Phase 3 的本地工作流：React Flow 节点库、节点属性与连线、草稿位置保存、发布快照、schema/graph/cycle/branch 校验、Mock event 模拟、Welcome/Post-purchase 预置流程；只编译已确认的 Trigger → Send Email → End 结构。

Phase 4 的安全边界：弃单流程可编辑和模拟但 publish 返回 409；延迟/等待节点不伪装为已可执行的 Resend REST；真实发送开关返回 409；计费、域名、政策、账号集成和托管退出未验收时保持关闭。

## 自动化结果

- `npm test`：39/39 测试通过，包含新增公网域名、登录 Cookie 与刷新会话回归。
- `npm run typecheck`：通过。
- `npm run build`：通过，Next 生成页面和动态 API route。
- `npm run test:browser`：通过。覆盖总览、客户搜索与详情、分群创建/删除、模板 iframe/暗色预览、工作流校验/模拟、活动、事件、设置门禁、移动宽度无横向溢出。
- Shopify 官方 GraphQL validator：`docs/shopify-validation.txt`，2026-07，✅ VALID。
- 浏览器截图：`overview.png`、`customers.png`、`template.png`、`workflow.png`、`campaigns.png`、`settings.png`、`mobile.png`。

## 尚未验收

尚未配置或验证：Shopify OAuth/组织内授权、实际 access token 续期、protected customer data、真实 webhook 注册、Resend policy 书面许可、Resend DNS、受控真实测试邮箱、真实 template publish、Segment 差集同步、Broadcast 发信、Automation 的 delay/wait 条件配置、退订/购买期间远端退出、provider 幂等窗口、费用与用量、PostgreSQL 高并发/备份恢复、生产 SSO/MFA 与监控。在线演示的单账号密码保护已在 Preview 验证。

这些不是本地测试失败；它们需要真实账号和外部状态。代码在缺少这些证据时会保留本地模拟或返回清晰门禁错误。

## 真实 Preview 的顺序

1. 使用单独 PostgreSQL Preview 和独立 Shopify 测试店铺；配置管理员密码、HTTPS、token、webhook secret。
2. 只读连接检查和客户同步，核对 5 个受控测试客户的许可、金额、订单数量。
3. 注册签名 webhook，回放三次重复事件、乱序退订、退信/投诉/主题 opt_out，确认本地 10 秒级阻断和远端回写。
4. Resend 测试域名和策略批准后，用白名单测试邮箱完成一次 template/automation dry-run，再完成一次真实受控测试；记录 provider event 与 delivered/clicked webhook。
5. 验证购买/退订竞态和真实退出后，才考虑逐个打开 Post-purchase、Broadcast 和弃单 feature flag。失败时暂停发送、保留审计和 outbox，按 README 的回滚步骤处理。
