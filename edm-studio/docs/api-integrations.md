# 接口复核与适配

复核日期：2026-10-20。只读取官方公开文档和 FormWink 公开首页，没有真实账号调用或发信。PRD 中引用的文档是产品背景，接口字段以实际官方页面校正。

## 已确认的差异

- Resend 业务事件实际 REST 路径为 `POST /events/send`，字段为 `event`、`contact_id` 或 `email` 二选一、可选 `payload`。不是 PRD 的 `/events`。[官方 Send Event](https://resend.com/docs/api-reference/events/send-event)
- Automation create 使用 `name/status/steps/connections`；REST trigger 配置为 `event_name`，send_email 为 `template.id`。status 为 disabled/enabled；修改 status 使用 PATCH。创建默认保持 disabled；停止接收新事件不等于已证明终止所有在途运行。[Create](https://resend.com/docs/api-reference/automations/create-automation)、[Update](https://resend.com/docs/api-reference/automations/update-automation)
- Broadcast 使用 `segment_id`、from、subject、html/text，可创建草稿再调用 send；退订占位符为 `{{{RESEND_UNSUBSCRIBE_URL}}}`。[Create Broadcast](https://resend.com/docs/api-reference/broadcasts/create-broadcast)
- Contacts 是独立 `/contacts`；加入 Segment 为 `/contacts/:contact/segments/:segment`。未调用已弃用 Audiences API。全局 unsubscribed 与 topic opt_out 要分别处理。[Contacts](https://resend.com/docs/api-reference/contacts/create-contact)、[Segment membership](https://resend.com/docs/api-reference/contacts/add-contact-to-segment)
- Template 需单独 publish；本地 first_name 变量不等于远端自定义变量约定。保留变量名称和映射应单独验收，本版只对本地 HTML 做安全变量插值。[Templates](https://resend.com/docs/api-reference/templates/create-template)
- Shopify 2026-07 schema 中旧 `Customer.email/emailMarketingConsent` 已弃用，本项目已换成 `defaultEmailAddress.emailAddress/marketingState/marketingUpdatedAt/marketingOptInLevel`。官方 validate 工具校验记录见 `shopify-validation.txt`。[Customer](https://shopify.dev/docs/api/admin-graphql/2026-07/objects/Customer)

## 管理路由

`/api/bootstrap` 聚合页面数据；其余均为可单独调用的 JSON API。成功响应 no-store；无授权 401，跨站 403，参数错误 422，安全门禁 409。

| 路由                                                     | 方法             | 实现                                  |
| -------------------------------------------------------- | ---------------- | ------------------------------------- |
| /api/auth/login, /logout                                 | POST             | 单运营账号会话                        |
| /api/contacts                                            | GET              | 搜索、状态过滤、20 条分页             |
| /api/contacts/:id                                        | GET/PATCH/DELETE | 详情、暂停/备注、仅 DEMO 删除         |
| /api/contacts/:id/unsubscribe                            | POST             | 立即阻断并排队远端同步                |
| /api/segments                                            | GET/POST         | 分群列表/创建                         |
| /api/segments/:id                                        | PATCH/DELETE     | 规则更新/删除引用保护                 |
| /api/templates                                           | GET/POST         | 模板 CRUD                             |
| /api/templates/preview                                   | POST             | React Email 安全预览                  |
| /api/templates/:id                                       | PATCH/DELETE     | 编辑/删除引用保护                     |
| /api/templates/:id/publish, /test                        | POST             | 本地发布/白名单模拟测试               |
| /api/workflows                                           | GET/POST         | 列表/创建                             |
| /api/workflows/:id                                       | GET/PATCH/DELETE | 草稿与布局保存                        |
| /api/workflows/:id/validate, /simulate, /publish, /pause | POST             | 校验、轨迹、模拟快照、暂停            |
| /api/campaigns                                           | GET/POST         | 活动草稿                              |
| /api/campaigns/:id/simulate, /send                       | POST             | 模拟；真实发送返回安全门禁            |
| /api/events                                              | GET              | 邮件、审计、任务日志                  |
| /api/jobs/run, /api/jobs/:id/retry                       | POST             | 消费/重试任务                         |
| /api/metrics/overview                                    | GET              | 数据库派生统计                        |
| /api/integrations/shopify/connect, /sync                 | POST             | 验证现有 token / 分页同步排队         |
| /api/integrations/resend/verify                          | POST             | 检查 Domains API 状态                 |
| /api/settings                                            | PATCH            | 显示名称/关闭 live 开关；开启暂不开放 |
| /api/webhooks/shopify, /resend                           | POST             | 签名验证、幂等收据与 outbox           |

## 未核实的能力不编造

复杂节点的完整 REST schema、托管运行终止语义、实际账户 Automation 发信计费、是否有适合本应用的 Usage API 尚未实测。提供的 adapter 不是“接入完成”的证明。真实 UI 入口保持 409，缺少的 OAuth、Segment 远端差集同步、模板远端发布、实际 Broadcast 发送和归因需继续实施并用账号验证。

AUP、账号额度、域名状态均在上线时重新确认，不在代码中硬编码 PRD 中的免费额度。参考：[Resend AUP](https://resend.com/legal/acceptable-use)、[Pricing](https://resend.com/pricing)、[Shopify access tokens](https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens)、[Webhook verification](https://shopify.dev/docs/apps/build/webhooks/verify-deliveries)、[Protected customer data](https://shopify.dev/docs/apps/launch/protected-customer-data)。
