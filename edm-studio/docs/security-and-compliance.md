# 安全、许可与上线门禁

## 范围

2026-10-20，仅在本地 DEMO 开发/测试。未发送邮件，未读真实客户，未变更 FormWink 店铺，未部署生产。公开首页的家居类目观察不是 Resend 账号许可证明。

## 许可优先级

允许营销必须同时满足 Shopify SUBSCRIBED、未退订、无 suppression、未手动暂停。OR 分群只能扩大行为匹配，不能绕过许可。负向状态优先，重新同步或迟到订阅事件不会移除 suppression。初始 PENDING 不写永久 suppression，正式确认后可正常进入订阅；实际退订则不能由同步自动恢复。重新许可需未来独立、可审计的再订阅流程。

任何负向 Resend/Shopify 事件在签名验证后、ACK 前写入阻断。未知收件人的负向事件关闭 store.liveEnabled，需人工核对。联系人的远端退订回写失败不会影响本地阻断。禁止批量把客户改成 subscribed。

## 身份与来源

所有管理路由通过认证检查。仅绑定 loopback 的 DEMO 有明确开发例外；公开 Preview 必须先设置管理员密码、SESSION_SECRET 和 HTTPS APP_URL，禁止转发无密码本地端口。会话使用 HMAC、过期时间与安全 Cookie；拒绝跨站写操作。登录限速是单进程实现，生产需要外部访问网关/持久化限速，不把它作为抗暴力破解的完整方案。

Webhook 不需要管理员登录，必须有 Shopify HMAC 或 Resend Svix 签名和有效时间。Shopify 域名白名单，eventId 唯一；同 ID 不同 hash 返回 409。只接受有限尺寸 payload。没有跳过验签开关。

## 邮件内容

React Email 把文字与变量作为 React 文本渲染；仅允许 HTTPS 的按钮/图片链接。禁止任意 HTML 编辑，iframe 使用 sandbox。用户填写公司名称、实际邮政地址、联系原因，页脚自动附带 Resend unsubscribe placeholder。客户端暗色预览只是近似，真实客户端展示仍需实测。

当前真实发送入口全部被阻断，因此不会使用 /emails 绕过营销许可。未来测试发送须白名单受控邮箱，营销群发走 Broadcasts + Segment；退订及费用口径以实际账户验证为准。

## 数据保留与删除

Store 保存凭据引用，不保存浏览器可见 token。Webhook 只保存 raw_body_hash；排队 payload 仅保留业务所需字段，完成即清空。不保存收货地址、卡号或付款明细。Checkout 恢复 URL 字段仅定义为 encryptedCheckoutUrl，当前不采集；开启前必须实现独立加密与密钥轮转，不能写明文。

建议生产策略（尚未自动执行）：成功收据与普通事件保留 30 天，失败任务处理后最晚 30 天清理；审计/许可证据按适用要求设置最短合理期限；抑制名单采用必要的最小标识避免重新导入。

数据请求/删除主题会记审计并停止真实发送，当前为人工处理队列而非完整自动隐私删除管道。处理步骤：确认请求与店铺 → 导出本地及 provider 数据 → 停止所有关联计划/托管运行 → 删除或匿名化双方个人资料 → 保留必要拒发凭证 → 在要求期限内完成记录。客户详情支持本机 JSON 导出；DEMO 删除接口保留 suppression 但不适用于真实删除验收。

## 生产前必须完成

- FormWink 自有应用授权、protected customer data 权限、token 续期机制。
- Resend 店铺/素材政策确认、DNS、可控测试邮箱、计费与额度。
- 远端 suppression/全局退订/topics 对账，不因新同步恢复已退订联系人。
- Template variables/退订 URL 在 Automation 场景的实际验证。
- 活动名单发送前复核、远端差集同步、真实频率限制与计费。
- Automation 取消/退出实测、版本切换无重叠、发送结果不确定时禁止盲重试。
- 弃单完成状态二次查询、付款与退订竞态、恢复 URL 加密。
- PostgreSQL 并发、恢复、数据保留、隐私删除、生产鉴权和监控。
