# Resend 官方接口复核

复核日期：2026-10-20。内容来自 Resend 官方文档页面的公开 Markdown；没有使用真实 API key，也没有发邮件。

已确认：

- Automation create: `POST /automations`，JSON 为 `name`、`status`、`steps`、`connections`；trigger 的配置使用 `event_name`，send_email 使用 `template: { id }`。`status` 为 `disabled` / `enabled`，更新使用 `PATCH /automations/:id`。参考：[Create Automation](https://resend.com/docs/api-reference/automations/create-automation)、[Update Automation](https://resend.com/docs/api-reference/automations/update-automation)。
- Business Event: `POST /events/send`，`event` 必填，`contact_id` 或 `email` 二选一，可选 `payload`。参考：[Send Event](https://resend.com/docs/api-reference/events/send-event)。
- Broadcast: 创建使用 `segment_id`、`from`、`subject`、`html/text`；`send=true` 可立即发送或配合 `scheduled_at`；营销退订 placeholder 为 `{{{RESEND_UNSUBSCRIBE_URL}}}`。参考：[Create Broadcast](https://resend.com/docs/api-reference/broadcasts/create-broadcast)。
- Contacts: 可传 `email`、`first_name`、`last_name`、`unsubscribed`、properties、segments、topics；加入分群路径为 `/contacts/:contact/segments/:segment`。不使用 deprecated Audiences API。参考：[Create Contact](https://resend.com/docs/api-reference/contacts/create-contact)、[Add Contact to Segment](https://resend.com/docs/api-reference/contacts/add-contact-to-segment)。
- Templates: 创建包含 `name`、`html`、可选 `text/from/subject/variables`；模板使用前要 publish。变量保留名包含 `RESEND_UNSUBSCRIBE_URL` 和 `contact`，本地的 `{{ first_name }}` 需要单独映射。参考：[Create Template](https://resend.com/docs/api-reference/templates/create-template)。
- Webhooks: `contact.topics.updated` 的 data 里含 email 和 topics，每个 topic 为 `opt_in`/`opt_out`；`suppression.added` 的 data 含 email、origin、source_id，硬退信或投诉也会触发抑制。参考：[contact.topics.updated](https://resend.com/docs/webhooks/contacts/topics-updated)、[suppression.added](https://resend.com/docs/webhooks/suppressions/added)。本项目用 Svix secret 验签。
- AUP 明确禁止 sexually explicit content、unsolicited/cold/purchased/scraped lists；投诉率须低于 0.08%，退信率低于 4%。参考：[Acceptable Use Policy](https://resend.com/legal/acceptable-use)。这些阈值和禁止项不能被理解成许可证明。

仍需真实账号验证：Automation 复杂 step 的具体 config、等待期间购买/退订是否可靠退出、Automation 发信的计费口径、业务事件与 Broadcast 的账号限额、远端模板变量解析、全局 suppression 与 topic opt-out 对账。适配器对这些点保持门禁，不作未验证承诺。
