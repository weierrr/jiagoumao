"use client";
import { useCallback, useEffect, useState } from "react";
import {
  Search,
  Plus,
  RefreshCw,
  ArrowRight,
  ArrowUpRight,
  Users,
  Mail,
  MoreHorizontal,
  X,
  Save,
  Play,
  Upload,
  ShieldCheck,
  Check,
  AlertCircle,
  Clock3,
  Download,
  Trash2,
  Sun,
  Moon,
  Filter,
  Activity,
  Copy,
} from "lucide-react";
import { api, date, money, useUI } from "@/lib/client";
import { Badge, Empty, Modal } from "./studio";
type Props = { data: any; reload: () => Promise<void> };
function Heading({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <div className="eyebrow">{eyebrow}</div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {children}
    </div>
  );
}
export function Customers({
  data,
  reload,
  sync,
  busy,
}: Props & { sync: () => void; busy: boolean }) {
  const notify = useUI((s) => s.notify);
  const [q, setQ] = useState("");
  const [state, setState] = useState("");
  const [page, setPage] = useState(1);
  const [list, setList] = useState<any>({ items: [], total: 0, pages: 0 });
  const [detail, setDetail] = useState<any>(null);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      setList(
        await api(
          `contacts?q=${encodeURIComponent(q)}&state=${state}&page=${page}`,
        ),
      );
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, [q, state, page, notify]);
  useEffect(() => {
    const timer = setTimeout(load, 180);
    return () => clearTimeout(timer);
  }, [load, data]);
  const open = async (id: string) => {
    try {
      const c = await api(`contacts/${id}`);
      setDetail(c);
      setNotes(c.notes);
    } catch (e) {
      notify((e as Error).message);
    }
  };
  const update = async (payload: any) => {
    try {
      await api(`contacts/${detail.id}`, "PATCH", payload);
      await open(detail.id);
      await load();
      await reload();
      notify("客户信息已保存");
    } catch (e) {
      notify((e as Error).message);
    }
  };
  const exportDetail = () => {
    const blob = new Blob([JSON.stringify(detail, null, 2)], {
      type: "application/json",
    });
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = `contact-${detail.id}.json`;
    a.click();
    URL.revokeObjectURL(href);
    notify("客户数据已导出至本机");
  };
  return (
    <>
      <Heading
        eyebrow="YOUR AUDIENCE"
        title="每一次联系，都从许可开始"
        description="了解你的客户，也尊重他们希望如何被联系。"
      >
        <button onClick={sync} disabled={busy}>
          <RefreshCw size={15} className={busy ? "spin" : ""} />
          同步客户
        </button>
      </Heading>
      <div className="mini-stats">
        <span>
          <strong>{data.metrics.total}</strong>全部客户
        </span>
        <span>
          <i className="legend-dot mint" />
          <strong>{data.metrics.eligible}</strong>可营销
        </span>
        <span>
          <i className="legend-dot muted-dot" />
          <strong>{data.metrics.unsubscribed}</strong>抑制名单
        </span>
        <span className="badge purple">
          {data.mode.demo ? "DEMO 客户" : "店铺客户"}
        </span>
      </div>
      <section className="panel table-panel">
        <div className="table-toolbar">
          <div className="search-input">
            <Search size={16} />
            <input
              aria-label="搜索客户"
              placeholder="搜索姓名或邮箱…"
              value={q}
              onChange={(e) => {
                setQ(e.target.value);
                setPage(1);
              }}
            />
          </div>
          <select
            aria-label="筛选订阅状态"
            value={state}
            onChange={(e) => {
              setState(e.target.value);
              setPage(1);
            }}
          >
            <option value="">全部订阅状态</option>
            <option value="SUBSCRIBED">已订阅</option>
            <option value="UNSUBSCRIBED">已退订</option>
            <option value="PENDING">待确认</option>
            <option value="NOT_SUBSCRIBED">未订阅</option>
          </select>
          <span className="muted small">
            {loading ? "正在加载…" : `${list.total} 位客户`}
          </span>
        </div>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>客户</th>
                <th>营销许可</th>
                <th>许可来源</th>
                <th>订单数</th>
                <th>累计消费</th>
                <th>最近购买</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {list.items.map((c: any, i: number) => (
                <tr
                  key={c.id}
                  onClick={() => open(c.id)}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") open(c.id);
                  }}
                >
                  <td>
                    <div className="customer-cell">
                      <span className={`avatar tone-${i % 4}`}>
                        {c.firstName.slice(0, 1)}
                        {c.lastName.slice(0, 1)}
                      </span>
                      <div>
                        <strong>
                          {c.firstName} {c.lastName}
                        </strong>
                        <small>{c.email}</small>
                      </div>
                    </div>
                  </td>
                  <td>
                    <Badge status={c.paused ? "paused" : c.marketingState} />
                  </td>
                  <td>
                    <span className="small muted">{c.consentSource}</span>
                  </td>
                  <td>{c.ordersCount}</td>
                  <td>{money(c.totalSpent, data.store.currency)}</td>
                  <td className="muted small">{date(c.lastOrderAt)}</td>
                  <td>
                    <ArrowUpRight size={16} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!loading && !list.items.length && (
          <Empty text="没有符合条件的客户，试试其他关键词。" />
        )}
        <div className="table-footer">
          <span>仅有效订阅且未被抑制的客户可进入营销流程。</span>
          <div>
            <button disabled={page <= 1} onClick={() => setPage((p) => p - 1)}>
              上一页
            </button>
            <span>
              {page} / {Math.max(1, list.pages)}
            </span>
            <button
              disabled={page >= list.pages}
              onClick={() => setPage((p) => p + 1)}
            >
              下一页
            </button>
          </div>
        </div>
      </section>
      {detail && (
        <Modal title="客户详情" onClose={() => setDetail(null)} wide>
          <div className="modal-body">
            <div className="customer-detail-head">
              <span className="avatar large">
                {detail.firstName.slice(0, 1)}
              </span>
              <div>
                <h2>
                  {detail.firstName} {detail.lastName}
                </h2>
                <p>{detail.email}</p>
              </div>
              <Badge status={detail.marketingState} />
            </div>
            <div className="detail-columns">
              <div>
                <h3>营销许可记录</h3>
                <div className="notice compact">
                  {detail.suppression
                    ? "此邮箱已在抑制名单中，任何同步都不会自动恢复订阅。"
                    : detail.paused
                      ? "已手动暂停营销。"
                      : "每次模拟发送前都会重新检查许可。"}
                </div>
                <dl>
                  <dt>Shopify Customer ID</dt>
                  <dd className="mono">{detail.shopifyCustomerGid || "—"}</dd>
                  <dt>Resend Contact ID</dt>
                  <dd className="mono">{detail.resendContactId || "—"}</dd>
                  <dt>首次订阅</dt>
                  <dd>{date(detail.consentAt)}</dd>
                  <dt>同步时间</dt>
                  <dd>{date(detail.syncAt)}</dd>
                </dl>
                {detail.history.map((h: any) => (
                  <div className="timeline-item" key={h.id}>
                    <strong>
                      {h.oldState} → {h.newState}
                    </strong>
                    <p>
                      {h.source} · {date(h.occurredAt)}
                    </p>
                  </div>
                ))}
                <h3>客户分群</h3>
                <div className="chips">
                  {detail.segments.length ? (
                    detail.segments.map((s: any) => (
                      <span className="badge purple" key={s.id}>
                        {s.name}
                      </span>
                    ))
                  ) : (
                    <span className="muted small">暂无可营销分群</span>
                  )}
                </div>
              </div>
              <div>
                <h3>最近订单与互动</h3>
                {detail.orders.length ? (
                  detail.orders.map((o: any) => (
                    <div className="activity-row" key={o.id}>
                      <span>{money(o.totalAmount, o.currency)}</span>
                      <span>{o.financialStatus}</span>
                      <time>{date(o.placedAt)}</time>
                    </div>
                  ))
                ) : (
                  <p className="muted small">暂无已同步的订单明细</p>
                )}
                {detail.events.slice(0, 5).map((e: any) => (
                  <div className="activity-row" key={e.id}>
                    <span className="small">{e.eventType}</span>
                    <time>{date(e.occurredAt)}</time>
                  </div>
                ))}
                <label>
                  内部备注
                  <textarea
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    rows={4}
                  />
                </label>
                <button onClick={() => update({ notes })}>
                  <Save size={14} />
                  保存备注
                </button>
                <hr />
                <label className="check">
                  <input
                    type="checkbox"
                    checked={detail.paused}
                    onChange={(e) => update({ paused: e.target.checked })}
                  />
                  暂停此客户的营销
                </label>
                <button
                  className="danger text-button"
                  onClick={async () => {
                    try {
                      await api(
                        `contacts/${detail.id}/unsubscribe`,
                        "POST",
                        {},
                      );
                      await open(detail.id);
                      await load();
                      await reload();
                      notify("已退订；本地立即阻断，远端同步已排队");
                    } catch (e) {
                      notify((e as Error).message);
                    }
                  }}
                >
                  为此客户退订
                </button>
                <button className="text-button" onClick={exportDetail}>
                  <Download size={14} />
                  导出客户数据
                </button>
              </div>
            </div>
          </div>
        </Modal>
      )}
    </>
  );
}
export function Segments({ data, reload }: Props) {
  const notify = useUI((s) => s.notify);
  const [edit, setEdit] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const fresh = () =>
    setEdit({
      name: "",
      description: "",
      rules: {
        mode: "AND",
        rules: [{ field: "ordersCount", op: "gte", value: 1 }],
      },
    });
  const setRule = (index: number, key: string, value: any) =>
    setEdit({
      ...edit,
      rules: {
        ...edit.rules,
        rules: edit.rules.rules.map((r: any, i: number) =>
          i === index ? { ...r, [key]: value } : r,
        ),
      },
    });
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await api(
        `segments${edit.id ? `/${edit.id}` : ""}`,
        edit.id ? "PATCH" : "POST",
        { name: edit.name, description: edit.description, rules: edit.rules },
      );
      await reload();
      setEdit(null);
      notify("分群已保存，人数已重新计算");
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Heading
        eyebrow="SMART SEGMENTS"
        title="把合适的内容，送给合适的人"
        description="用购买行为与兴趣分群，营销许可始终是共同前提。"
      >
        <button className="primary" onClick={fresh}>
          <Plus size={16} />
          创建分群
        </button>
      </Heading>
      <div className="notice">
        <ShieldCheck size={18} />
        所有分群均自动排除退订、抑制和手动暂停的客户。AND / OR
        规则不能绕过许可检查。
      </div>
      <div className="segment-grid">
        {data.segments.map((s: any) => (
          <button
            className="panel segment-card"
            key={s.id}
            onClick={() => setEdit({ ...s, rules: JSON.parse(s.rulesJson) })}
          >
            <span className="iconbox purple">
              <Users size={20} />
            </span>
            <h2>{s.name}</h2>
            <p>{s.description || "自定义客户分群"}</p>
            <div className="segment-count">
              {s.count}
              <small>位可营销客户</small>
            </div>
            <div className="segment-footer">
              <span>
                {s.rules.rules.length} 条规则 · {s.rules.mode}
              </span>
              <ArrowUpRight size={17} />
            </div>
          </button>
        ))}
      </div>
      {!data.segments.length && (
        <Empty text="创建第一个分群，从了解你的客户开始。" />
      )}
      {edit && (
        <Modal
          title={edit.id ? "编辑分群" : "创建分群"}
          onClose={() => setEdit(null)}
          wide
        >
          <form onSubmit={save} className="modal-body">
            <label>
              分群名称
              <input
                required
                value={edit.name}
                onChange={(e) => setEdit({ ...edit, name: e.target.value })}
              />
            </label>
            <label>
              分群描述
              <input
                value={edit.description}
                onChange={(e) =>
                  setEdit({ ...edit, description: e.target.value })
                }
              />
            </label>
            <div className="rule-builder">
              <div className="rule-top">
                匹配
                <select
                  value={edit.rules.mode}
                  onChange={(e) =>
                    setEdit({
                      ...edit,
                      rules: { ...edit.rules, mode: e.target.value },
                    })
                  }
                >
                  <option value="AND">所有条件（AND）</option>
                  <option value="OR">任一条件（OR）</option>
                </select>
                <span>并始终满足营销许可</span>
              </div>
              {edit.rules.rules.map((r: any, i: number) => (
                <div className="rule-row" key={i}>
                  <select
                    aria-label="规则字段"
                    value={r.field}
                    onChange={(e) => setRule(i, "field", e.target.value)}
                  >
                    <option value="marketingState">订阅状态</option>
                    <option value="ordersCount">订单数</option>
                    <option value="totalSpent">累计消费金额</option>
                    <option value="daysSinceOrder">距离最近购买天数</option>
                    <option value="tag">客户标签</option>
                  </select>
                  <select
                    aria-label="比较方式"
                    value={r.op}
                    onChange={(e) => setRule(i, "op", e.target.value)}
                  >
                    <option value="eq">等于</option>
                    <option value="neq">不等于</option>
                    <option value="gte">大于等于</option>
                    <option value="lte">小于等于</option>
                    <option value="contains">包含标签</option>
                  </select>
                  <input
                    aria-label="规则值"
                    value={r.value}
                    onChange={(e) => setRule(i, "value", e.target.value)}
                  />
                  <button
                    type="button"
                    className="icon-button"
                    aria-label="移除规则"
                    disabled={edit.rules.rules.length === 1}
                    onClick={() =>
                      setEdit({
                        ...edit,
                        rules: {
                          ...edit.rules,
                          rules: edit.rules.rules.filter(
                            (_: any, j: number) => j !== i,
                          ),
                        },
                      })
                    }
                  >
                    <X size={17} />
                  </button>
                </div>
              ))}
              <button
                type="button"
                className="text-button"
                onClick={() =>
                  setEdit({
                    ...edit,
                    rules: {
                      ...edit.rules,
                      rules: [
                        ...edit.rules.rules,
                        { field: "ordersCount", op: "gte", value: 1 },
                      ],
                    },
                  })
                }
              >
                <Plus size={14} />
                添加条件
              </button>
            </div>
            <div className="modal-actions">
              {edit.id && (
                <button
                  type="button"
                  className="danger"
                  onClick={async () => {
                    try {
                      await api(`segments/${edit.id}`, "DELETE");
                      setEdit(null);
                      await reload();
                      notify("分群已删除");
                    } catch (e) {
                      notify((e as Error).message);
                    }
                  }}
                >
                  <Trash2 size={14} />
                  删除
                </button>
              )}
              <button type="button" onClick={() => setEdit(null)}>
                取消
              </button>
              <button className="primary" disabled={busy}>
                <Save size={15} />
                保存分群
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
export function Templates({ data, reload }: Props) {
  const notify = useUI((s) => s.notify);
  const [edit, setEdit] = useState<any>(null);
  const [preview, setPreview] = useState("");
  const [dark, setDark] = useState(false);
  const [busy, setBusy] = useState(false);
  const [testEmail, setTestEmail] = useState("alex@example.com");
  const open = (t: any) => {
    setEdit({ ...t, content: JSON.parse(t.schemaJson) });
    setPreview(t.html);
  };
  const fresh = () => {
    setEdit({
      name: "新的品牌邮件",
      subject: "来自品牌的一封问候",
      category: "Newsletter",
      content: data.defaultContent,
    });
    setPreview("");
  };
  useEffect(() => {
    if (!edit) return;
    let alive = true;
    const timer = setTimeout(() => {
      api("templates/preview", "POST", edit.content)
        .then((r) => {
          if (alive) setPreview(r.html);
        })
        .catch(() => {});
    }, 450);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [edit]);
  const update = (key: string, value: string) =>
    setEdit({ ...edit, content: { ...edit.content, [key]: value } });
  const save = async (publish = false) => {
    setBusy(true);
    try {
      const saved = await api(
        `templates${edit.id ? `/${edit.id}` : ""}`,
        edit.id ? "PATCH" : "POST",
        {
          name: edit.name,
          category: edit.category,
          subject: edit.subject,
          content: edit.content,
        },
      );
      let result = saved;
      if (publish)
        result = await api(`templates/${saved.id}/publish`, "POST", {});
      setEdit({ ...result, content: JSON.parse(result.schemaJson) });
      await reload();
      notify(publish ? "模板已发布至本地模拟环境" : "模板草稿已保存");
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Heading
        eyebrow="EMAIL TEMPLATES"
        title="一封好邮件，从这里开始"
        description="把品牌的温度，写进客户愿意打开的每一封邮件。"
      >
        <button className="primary" onClick={fresh}>
          <Plus size={16} />
          创建模板
        </button>
      </Heading>
      <div className="template-grid">
        {data.templates.map((t: any, i: number) => {
          const c = JSON.parse(t.schemaJson);
          return (
            <button
              className="template-card"
              key={t.id}
              onClick={() => open(t)}
            >
              <div className={`template-thumbnail template-tone-${i % 4}`}>
                <div className="mini-email">
                  <div className="mini-brand">{c.brand}</div>
                  <div className="mini-line" />
                  <div className="mini-heading">{c.heading}</div>
                  <div className="mini-copy" />
                  <div className="mini-copy short" />
                  <span className="mini-cta">{c.buttonText}</span>
                  <div className="mini-line" />
                  <small>Unsubscribe · {c.brand}</small>
                </div>
              </div>
              <div className="template-meta">
                <span className="eyebrow">{t.category}</span>
                <h3>{t.name}</h3>
                <div>
                  <Badge status={t.publishedAt ? "demo_published" : "draft"} />
                  <span>
                    v{t.version} <ArrowUpRight size={15} />
                  </span>
                </div>
              </div>
            </button>
          );
        })}
      </div>
      {edit && (
        <Modal
          title={edit.id ? "编辑邮件模板" : "创建邮件模板"}
          onClose={() => setEdit(null)}
          wide
        >
          <div className="template-editor">
            <div className="template-fields">
              <label>
                模板名称
                <input
                  value={edit.name}
                  onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                />
              </label>
              <label>
                邮件类别
                <select
                  value={edit.category}
                  onChange={(e) =>
                    setEdit({ ...edit, category: e.target.value })
                  }
                >
                  {[
                    "Welcome",
                    "Post-purchase",
                    "Checkout Reminder",
                    "Newsletter",
                  ].map((c) => (
                    <option key={c}>{c}</option>
                  ))}
                </select>
              </label>
              <label>
                邮件主题
                <input
                  value={edit.subject}
                  onChange={(e) =>
                    setEdit({ ...edit, subject: e.target.value })
                  }
                />
              </label>
              <label>
                预标题
                <input
                  value={edit.content.preheader}
                  onChange={(e) => update("preheader", e.target.value)}
                />
              </label>
              <label>
                主标题
                <input
                  value={edit.content.heading}
                  onChange={(e) => update("heading", e.target.value)}
                />
              </label>
              <label>
                正文
                <textarea
                  rows={7}
                  value={edit.content.body}
                  onChange={(e) => update("body", e.target.value)}
                />
              </label>
              <p className="field-note">
                支持 {"{{ first_name }}"}。内容由服务端安全转义。
              </p>
              <div className="form-row">
                <label>
                  按钮文字
                  <input
                    value={edit.content.buttonText}
                    onChange={(e) => update("buttonText", e.target.value)}
                  />
                </label>
                <label>
                  按钮链接
                  <input
                    type="url"
                    value={edit.content.buttonUrl}
                    onChange={(e) => update("buttonUrl", e.target.value)}
                  />
                </label>
              </div>
              <label>
                品牌名称
                <input
                  value={edit.content.brand}
                  onChange={(e) => update("brand", e.target.value)}
                />
              </label>
              <label>
                公司联系地址
                <input
                  value={edit.content.address}
                  onChange={(e) => update("address", e.target.value)}
                />
              </label>
              <label>
                品牌 Logo 链接（HTTPS，可选）
                <input
                  value={edit.content.logoUrl}
                  onChange={(e) => update("logoUrl", e.target.value)}
                />
              </label>
              <label>
                主图链接（HTTPS，可选）
                <input
                  value={edit.content.imageUrl}
                  onChange={(e) => update("imageUrl", e.target.value)}
                />
              </label>
              <div className="notice compact">
                退订入口与联系原因会自动加入页脚，不能移除。
              </div>
            </div>
            <div className={`email-preview ${dark ? "dark-preview" : ""}`}>
              <div className="preview-toolbar">
                <span>邮件预览</span>
                <button
                  className="icon-button"
                  aria-label="切换暗色模拟预览"
                  onClick={() => setDark(!dark)}
                >
                  {dark ? <Sun size={16} /> : <Moon size={16} />}
                </button>
              </div>
              <p className="preview-subject">主题：{edit.subject}</p>
              <iframe
                title="邮件内容预览"
                srcDoc={preview}
                sandbox=""
                referrerPolicy="no-referrer"
              />
              <p className="field-note">
                {dark
                  ? "暗色为近似检查，需用真实邮件客户端验收。"
                  : "预览使用 Alex 作为示例姓名。"}
              </p>
              <div className="test-email">
                <label>
                  受控测试邮箱
                  <input
                    type="email"
                    value={testEmail}
                    onChange={(e) => setTestEmail(e.target.value)}
                  />
                </label>
                <button
                  disabled={!edit.id || busy}
                  onClick={async () => {
                    setBusy(true);
                    try {
                      const r = await api(`templates/${edit.id}/test`, "POST", {
                        email: testEmail,
                      });
                      notify(r.message);
                    } catch (e) {
                      notify((e as Error).message);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  <Play size={14} />
                  测试已保存版本（模拟）
                </button>
              </div>
            </div>
          </div>
          <div className="modal-actions">
            {edit.id && (
              <button
                className="danger"
                disabled={busy}
                onClick={async () => {
                  try {
                    await api(`templates/${edit.id}`, "DELETE");
                    setEdit(null);
                    await reload();
                    notify("模板已删除");
                  } catch (e) {
                    notify((e as Error).message);
                  }
                }}
              >
                <Trash2 size={14} />
                删除
              </button>
            )}
            <span className="muted small">
              {edit.publishedAt ? "本地已发布" : "草稿 · 编辑后需重新发布"}
            </span>
            <button disabled={busy} onClick={() => save()}>
              <Save size={15} />
              保存草稿
            </button>
            <button
              className="primary"
              disabled={busy}
              onClick={() => save(true)}
            >
              <Upload size={15} />
              保存并发布模板
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
export function Campaigns({ data, reload }: Props) {
  const notify = useUI((s) => s.notify);
  const [create, setCreate] = useState(false);
  const [form, setForm] = useState({
    name: "",
    templateId: data.templates[0]?.id || "",
    segmentId: data.segments[0]?.id || "",
  });
  const [busy, setBusy] = useState("");
  const run = async (id: string) => {
    setBusy(id);
    try {
      const r = await api(`campaigns/${id}/simulate`, "POST", {});
      await reload();
      notify(
        r.duplicate
          ? "该活动已模拟完成，没有重复处理"
          : `模拟完成：${r.recipientCount} 位客户；${r.frequencyBlocked || 0} 位因 24 小时频率限制跳过`,
      );
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy("");
    }
  };
  return (
    <>
      <Heading
        eyebrow="CAMPAIGNS"
        title="给这一季，写一封信"
        description="选择一个分群与模板，让你的品牌消息有的放矢。"
      >
        <button className="primary" onClick={() => setCreate(true)}>
          <Plus size={16} />
          创建邮件活动
        </button>
      </Heading>
      <div className="notice">
        <Mail size={18} />
        活动按营销邮件处理。当前执行仅生成模拟发送决策，真实 Broadcast
        发送仍受上线门禁限制。
      </div>
      <section className="panel table-panel">
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>邮件活动</th>
                <th>目标分群</th>
                <th>邮件模板</th>
                <th>状态</th>
                <th>处理人数</th>
                <th>创建时间</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {data.campaigns.map((c: any) => (
                <tr key={c.id}>
                  <td>
                    <strong>{c.name}</strong>
                    <small className="block muted">营销活动 · DEMO</small>
                  </td>
                  <td>
                    {data.segments.find((s: any) => s.id === c.segmentId)
                      ?.name || "—"}
                  </td>
                  <td>
                    {data.templates.find((t: any) => t.id === c.templateId)
                      ?.name || "—"}
                  </td>
                  <td>
                    <Badge status={c.status} />
                  </td>
                  <td>{c.recipientCount}</td>
                  <td className="small muted">{date(c.createdAt)}</td>
                  <td>
                    <button
                      disabled={!!busy || c.status === "simulated"}
                      onClick={() => run(c.id)}
                    >
                      <Play size={14} />
                      {c.status === "simulated" ? "已模拟" : "模拟发送"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!data.campaigns.length && <Empty text="第一封品牌消息，等你开始。" />}
      </section>
      <section className="panel guide-panel">
        <h2>发送前，我们会再确认一次</h2>
        <div>
          <p>
            <strong>许可仍有效</strong>重新计算分群，排除退订、抑制和暂停客户。
          </p>
          <p>
            <strong>不过度打扰</strong>同一客户 24
            小时内已模拟发送，将跳过本次活动。
          </p>
          <p>
            <strong>不重复处理</strong>
            活动拥有唯一发送决策，再次点击不会重复创建。
          </p>
        </div>
      </section>
      {create && (
        <Modal title="创建邮件活动" onClose={() => setCreate(false)}>
          <form
            className="modal-body"
            onSubmit={async (e) => {
              e.preventDefault();
              try {
                await api("campaigns", "POST", form);
                setCreate(false);
                setForm({ ...form, name: "" });
                await reload();
                notify("活动草稿已创建");
              } catch (e) {
                notify((e as Error).message);
              }
            }}
          >
            <label>
              活动名称
              <input
                required
                placeholder="例如：十一月灵感手记"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
              />
            </label>
            <label>
              客户分群
              <select
                required
                value={form.segmentId}
                onChange={(e) =>
                  setForm({ ...form, segmentId: e.target.value })
                }
              >
                <option value="">选择分群</option>
                {data.segments.map((s: any) => (
                  <option key={s.id} value={s.id}>
                    {s.name} · {s.count} 人
                  </option>
                ))}
              </select>
            </label>
            <label>
              邮件模板
              <select
                required
                value={form.templateId}
                onChange={(e) =>
                  setForm({ ...form, templateId: e.target.value })
                }
              >
                <option value="">选择模板</option>
                {data.templates.map((t: any) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                    {t.publishedAt ? "" : "（草稿）"}
                  </option>
                ))}
              </select>
            </label>
            <div className="modal-actions">
              <button type="button" onClick={() => setCreate(false)}>
                取消
              </button>
              <button className="primary">创建草稿</button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
export function Events() {
  const notify = useUI((s) => s.notify);
  const [data, setData] = useState<any>({ events: [], audit: [], jobs: [] });
  const [tab, setTab] = useState("events");
  const [type, setType] = useState("");
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    try {
      setData(
        await api(`events${type ? `?type=${encodeURIComponent(type)}` : ""}`),
      );
    } catch (e) {
      notify((e as Error).message);
    }
  }, [type, notify]);
  useEffect(() => {
    load();
  }, [load]);
  const run = async () => {
    setBusy(true);
    try {
      const r = await api("jobs/run", "POST", {});
      await load();
      notify(`已扫描 ${r.scanned} 项，完成 ${r.processed} 项`);
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <Heading
        eyebrow="EVENTS & OBSERVABILITY"
        title="每一步，都有记录"
        description="从发送决策到投递回传，追踪发生了什么，以及为什么。"
      >
        <button onClick={load}>
          <RefreshCw size={15} />
          刷新日志
        </button>
        <button disabled={busy} onClick={run}>
          <Play size={15} />
          处理待办任务
        </button>
      </Heading>
      <div className="tabs">
        {[
          ["events", "邮件事件"],
          ["audit", "操作日志"],
          ["jobs", "任务与重试"],
        ].map(([id, label]) => (
          <button
            key={id}
            className={tab === id ? "selected" : ""}
            onClick={() => setTab(id)}
          >
            {label}
            {id === "jobs" &&
              data.jobs.filter((j: any) => j.status === "dead").length > 0 && (
                <span className="badge red">
                  {data.jobs.filter((j: any) => j.status === "dead").length}
                </span>
              )}
          </button>
        ))}
      </div>
      <section className="panel table-panel">
        {tab === "events" && (
          <>
            <div className="table-toolbar">
              <select
                aria-label="事件类型"
                value={type}
                onChange={(e) => setType(e.target.value)}
              >
                <option value="">全部事件类型</option>
                {[
                  "email.simulated",
                  "marketing.blocked",
                  "email.sent",
                  "email.delivered",
                  "email.clicked",
                  "email.opened",
                  "email.bounced",
                  "email.complained",
                ].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
              <span className="muted small">
                最近 100 条 · Opened 为像素估算
              </span>
            </div>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>事件类型</th>
                    <th>时间</th>
                    <th>联系人</th>
                    <th>来源</th>
                    <th>事件 ID</th>
                  </tr>
                </thead>
                <tbody>
                  {data.events.map((e: any) => (
                    <tr key={e.id}>
                      <td>
                        <span
                          className={`event-dot ${e.eventType.includes("blocked") ? "red-dot" : ""}`}
                        />
                        <strong className="small">{e.eventType}</strong>
                      </td>
                      <td className="small muted">{date(e.occurredAt)}</td>
                      <td className="mono small">{e.contactId || "—"}</td>
                      <td>
                        <span
                          className={`badge ${e.demo ? "purple" : "green"}`}
                        >
                          {e.demo ? "DEMO" : "LIVE"}
                        </span>
                      </td>
                      <td
                        className="mono small truncated"
                        title={e.providerEventId}
                      >
                        {e.providerEventId}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!data.events.length && (
              <Empty text="暂无匹配事件，先模拟运行一个工作流。" />
            )}
          </>
        )}
        {tab === "audit" && (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>操作</th>
                  <th>详情</th>
                  <th>时间</th>
                </tr>
              </thead>
              <tbody>
                {data.audit.map((a: any) => (
                  <tr key={a.id}>
                    <td className="mono small">{a.action}</td>
                    <td>{a.detail}</td>
                    <td className="small muted">{date(a.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!data.audit.length && <Empty text="你的操作会在这里留下记录。" />}
          </div>
        )}
        {tab === "jobs" && (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>任务</th>
                  <th>状态</th>
                  <th>尝试次数</th>
                  <th>下次运行</th>
                  <th>错误原因</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {data.jobs.map((j: any) => (
                  <tr key={j.id}>
                    <td className="mono small">{j.kind}</td>
                    <td>
                      <Badge status={j.status} />
                    </td>
                    <td>{j.attempts} / 5</td>
                    <td className="small">{date(j.nextRunAt)}</td>
                    <td className="small error-text">{j.lastError || "—"}</td>
                    <td>
                      {["dead", "pending"].includes(j.status) && (
                        <button
                          onClick={async () => {
                            try {
                              await api(`jobs/${j.id}/retry`, "POST", {});
                              await load();
                              notify("任务已重新排队");
                            } catch (e) {
                              notify((e as Error).message);
                            }
                          }}
                        >
                          <RefreshCw size={13} />
                          重试
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!data.jobs.length && (
              <Empty text="暂无任务。同步客户或接收签名事件后，会在这里显示。" />
            )}
          </div>
        )}
      </section>
    </>
  );
}
export function Settings({ data, reload }: Props) {
  const notify = useUI((s) => s.notify);
  const [name, setName] = useState(data.store.name);
  const [busy, setBusy] = useState("");
  const check = async (target: string) => {
    setBusy(target);
    try {
      const r = await api(
        target === "shopify"
          ? "integrations/shopify/connect"
          : "integrations/resend/verify",
        "POST",
        {},
      );
      await reload();
      notify(r.message || "连接状态已更新");
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy("");
    }
  };
  return (
    <>
      <Heading
        eyebrow="SETTINGS & CONNECTIONS"
        title="连接你的品牌世界"
        description="在真正开始发送之前，让每个环节准备就绪。"
      />
      <div className="settings-grid">
        <div>
          <section className="panel settings-card">
            <div className="section-heading">
              <h2>工作空间</h2>
              <span className="badge purple">
                {data.mode.demo ? "DEMO" : "PREVIEW"}
              </span>
            </div>
            <label>
              店铺显示名称
              <input value={name} onChange={(e) => setName(e.target.value)} />
            </label>
            <label>
              店铺域名
              <input value={data.store.shopDomain} readOnly />
            </label>
            <p className="field-note">
              真实域名与凭据仅通过服务端环境配置，浏览器不会接收密钥。
            </p>
            <button
              onClick={async () => {
                try {
                  await api("settings", "PATCH", { name });
                  await reload();
                  notify("工作空间已更新");
                } catch (e) {
                  notify((e as Error).message);
                }
              }}
            >
              <Save size={15} />
              保存设置
            </button>
          </section>
          <section className="panel settings-card">
            <div className="section-heading">
              <h2>Shopify</h2>
              <Badge
                status={
                  data.store.connectStatus === "connected" ? "done" : "pending"
                }
              />
            </div>
            <p>从你已授权的店铺同步客户、订单摘要与营销许可。</p>
            <dl>
              <dt>当前连接</dt>
              <dd>
                {data.store.connectStatus === "connected"
                  ? "已验证服务端访问令牌"
                  : "尚未连接真实店铺"}
              </dd>
              <dt>最近同步</dt>
              <dd>{date(data.store.lastSyncAt)}</dd>
              <dt>API 版本</dt>
              <dd className="mono">2026-07</dd>
            </dl>
            <button disabled={!!busy} onClick={() => check("shopify")}>
              <RefreshCw size={15} />
              检查 Shopify 连接
            </button>
          </section>
          <section className="panel settings-card">
            <div className="section-heading">
              <h2>Resend</h2>
              <Badge status={data.store.domainVerified ? "done" : "pending"} />
            </div>
            <p>
              通过已验证的品牌域名发送营销邮件，并接收投递、点击与退订回传。
            </p>
            <dl>
              <dt>当前发送方式</dt>
              <dd>
                {data.mode.dryRun
                  ? "MockProvider · 模拟发送"
                  : data.mode.provider}
              </dd>
              <dt>域名状态</dt>
              <dd>{data.store.domainVerified ? "已验证" : "未验证"}</dd>
              <dt>账号用量与费用</dt>
              <dd>尚未核实，以账户后台报价为准</dd>
            </dl>
            <button disabled={!!busy} onClick={() => check("resend")}>
              <RefreshCw size={15} />
              检查发件域名
            </button>
          </section>
        </div>
        <div>
          <section className="panel settings-card safety-card">
            <div className="section-heading">
              <h2>发送安全开关</h2>
              <ShieldCheck size={21} />
            </div>
            <div className="switch-row">
              <div>
                <strong>真实邮件发送</strong>
                <p>当前版本保持关闭</p>
              </div>
              <button
                className="toggle"
                role="switch"
                aria-checked={false}
                aria-label="真实邮件发送"
                onClick={() =>
                  notify("完成真实集成验收前保持关闭；本地模拟功能可正常使用")
                }
              >
                <span />
              </button>
            </div>
            <div className="notice compact">
              模拟运行不会创建真实收件人、投递邮件或消耗服务商发送额度。
            </div>
            <h3>上线前需要完成</h3>
            <div className="gate-list">
              {data.gates.map((g: string, i: number) => (
                <div key={i}>
                  <Clock3 size={15} />
                  <span>{g}</span>
                </div>
              ))}
            </div>
          </section>
          <section className="panel settings-card">
            <h2>受控测试与数据保护</h2>
            <p>
              测试地址需加入服务端白名单。DEMO 仅接受 example.com
              示例邮箱或明确配置的地址，且不会实际投递。
            </p>
            <p>
              客户详情支持数据导出、暂停营销与退订。隐私删除请求进入操作日志，并立即阻断真实发送。
            </p>
            <div className="settings-code">
              DRY_RUN=true
              <br />
              EMAIL_PROVIDER=mock
              <br />
              DEMO_MODE=true
            </div>
            <p className="field-note">
              设置真实环境时使用独立数据库；不要把 DEMO 客户迁移到真实联系人。
            </p>
          </section>
          <section className="panel settings-card">
            <h2>弃单提醒</h2>
            <span className="badge orange">等待集成验证</span>
            <p>
              画布与场景模拟已开放。确认付款后停止、退订后停止、重复事件不重复发送前，不开放真实发布。
            </p>
          </section>
        </div>
      </div>
    </>
  );
}
