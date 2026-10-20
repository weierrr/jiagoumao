"use client";
import { useEffect, useState, useCallback, useRef } from "react";
import {
  LayoutDashboard,
  Users,
  Layers3,
  Megaphone,
  Workflow,
  PanelsTopLeft,
  Activity,
  Settings2,
  ArrowUpRight,
  ArrowRight,
  Mail,
  ShoppingBag,
  Check,
  ShieldCheck,
  ChevronDown,
  Plus,
  RefreshCw,
  Zap,
  Clock3,
  MousePointerClick,
  Send,
  X,
  CircleHelp,
  LogOut,
  LoaderCircle,
  Bell,
  ExternalLink,
} from "lucide-react";
import { api, date, useUI } from "@/lib/client";
import WorkflowEditor from "./workflow-editor";
import {
  Customers,
  Segments,
  Templates,
  Campaigns,
  Events,
  Settings,
} from "./views";
const nav = [
  { id: "overview", label: "总览", english: "Overview", icon: LayoutDashboard },
  { id: "customers", label: "客户", english: "Customers", icon: Users },
  { id: "segments", label: "客户分群", english: "Segments", icon: Layers3 },
  { id: "campaigns", label: "邮件活动", english: "Campaigns", icon: Megaphone },
  {
    id: "workflows",
    label: "自动化工作流",
    english: "Workflows",
    icon: Workflow,
  },
  {
    id: "templates",
    label: "邮件模板",
    english: "Templates",
    icon: PanelsTopLeft,
  },
  { id: "events", label: "事件日志", english: "Events", icon: Activity },
  { id: "settings", label: "设置与连接", english: "Settings", icon: Settings2 },
];
export function Badge({ status }: { status: string }) {
  const labels: Record<string, string> = {
    draft: "草稿",
    demo_published: "模拟已发布",
    paused: "已暂停",
    locked: "待验证",
    SUBSCRIBED: "已订阅",
    UNSUBSCRIBED: "已退订",
    PENDING: "待确认",
    NOT_SUBSCRIBED: "未订阅",
    simulated: "模拟完成",
    pending: "待处理",
    processing: "处理中",
    done: "已完成",
    dead: "需要处理",
    blocked: "已阻断",
  };
  return (
    <span
      className={`badge ${["SUBSCRIBED", "done", "demo_published"].includes(status) ? "green" : ["dead", "blocked", "UNSUBSCRIBED"].includes(status) ? "red" : ["PENDING", "pending", "locked"].includes(status) ? "orange" : "gray"}`}
    >
      {labels[status] || status}
    </span>
  );
}
export function Modal({
  title,
  children,
  onClose,
  wide = false,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
  wide?: boolean;
}) {
  const element = useRef<HTMLElement>(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const old = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusable = () =>
      Array.from(
        element.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input, select, textarea, a[href], [tabindex="0"]',
        ) || [],
      );
    focusable()[0]?.focus();
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") close.current();
      if (e.key === "Tab") {
        const items = focusable();
        const first = items[0],
          last = items[items.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("keydown", key);
      document.body.style.overflow = old;
      previous?.focus();
    };
  }, []);
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        ref={element}
        className={`modal ${wide ? "wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-heading">
          <h2>{title}</h2>
          <button className="icon-button" aria-label="关闭" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        {children}
      </section>
    </div>
  );
}
export function Empty({ text }: { text: string }) {
  return (
    <div className="empty">
      <Mail size={28} />
      <p>{text}</p>
    </div>
  );
}
export default function Studio() {
  const { page, setPage, toast, notify } = useUI();
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  const [login, setLogin] = useState(false);
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [workflow, setWorkflow] = useState<any>(null);
  const [help, setHelp] = useState(false);
  const load = useCallback(async () => {
    try {
      const d = await api("bootstrap");
      setData(d);
      setLogin(false);
      setError("");
    } catch (e: any) {
      if (e.status === 401) setLogin(true);
      else setError(e.message);
    }
  }, []);
  useEffect(() => {
    const initial = location.hash.slice(1);
    if (nav.some((n) => n.id === initial)) setPage(initial);
    load();
  }, [load, setPage]);
  const go = (id: string) => {
    setWorkflow(null);
    setPage(id);
  };
  const sync = async () => {
    setBusy(true);
    try {
      await api("integrations/shopify/sync", "POST", {});
      await api("jobs/run", "POST", {});
      await load();
      notify(
        data.mode.demo
          ? "DEMO 样本已同步，真实店铺未连接"
          : "同步任务已处理，请在事件日志查看结果",
      );
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  if (login)
    return (
      <div className="login-screen">
        <div className="login-card">
          <div className="brand-symbol">
            <Mail size={27} />
          </div>
          <h1>EDM Studio</h1>
          <p>登录你的邮件工作台</p>
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              try {
                await api("auth/login", "POST", { password });
                await load();
              } catch (e) {
                setError((e as Error).message);
              } finally {
                setBusy(false);
              }
            }}
          >
            <label>
              运营密码
              <input
                type="password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </label>
            {error && <p className="error-text">{error}</p>}
            <button className="primary" disabled={busy}>
              登录工作台
            </button>
          </form>
        </div>
      </div>
    );
  if (!data)
    return (
      <div className="loading-screen">
        <div className="brand-symbol">
          <Mail size={24} />
        </div>
        <h2>EDM Studio</h2>
        {error ? (
          <>
            <p>{error}</p>
            <button onClick={load}>重试</button>
          </>
        ) : (
          <>
            <LoaderCircle className="spin" size={24} />
            <p>正在打开你的工作台…</p>
          </>
        )}
      </div>
    );
  const active = nav.find((n) => n.id === page)!;
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a className="brand" href="#overview" onClick={() => go("overview")}>
          <span className="brand-symbol">
            <Mail size={21} />
          </span>
          <span>
            EDM <b>Studio</b>
            <small>SHOPIFY EMAIL WORKSPACE</small>
          </span>
        </a>
        <button className="store-switch" onClick={() => go("settings")}>
          <span className="store-avatar">fw</span>
          <span>
            <strong>{data.store.name}</strong>
            <small>单店工作空间</small>
          </span>
          <ChevronDown size={14} />
        </button>
        <div className="nav-label">工作空间</div>
        <nav>
          {nav.slice(0, 6).map((n) => (
            <button
              key={n.id}
              className={page === n.id ? "active" : ""}
              onClick={() => go(n.id)}
            >
              <n.icon size={18} />
              <span>{n.label}</span>
              {n.id === "workflows" && <small>{data.workflows.length}</small>}
            </button>
          ))}
        </nav>
        <div className="nav-label second">管理</div>
        <nav>
          {nav.slice(6).map((n) => (
            <button
              key={n.id}
              className={page === n.id ? "active" : ""}
              onClick={() => go(n.id)}
            >
              <n.icon size={18} />
              {n.label}
              {n.id === "settings" && <span className="nav-alert" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="demo-note">
            <span className="badge purple">
              {data.mode.demo ? "DEMO" : "PREVIEW"}
            </span>
            <strong>安心试用每一个想法</strong>
            <p>
              {data.mode.dryRun
                ? "所有发送均为模拟，不产生真实邮件。"
                : "真实发送仍受上线验收门禁限制。"}
            </p>
            <button className="text-button" onClick={() => go("settings")}>
              查看上线准备 <ArrowUpRight size={14} />
            </button>
          </div>
          <button className="profile" onClick={() => setHelp(true)}>
            <span className="avatar">F</span>
            <span>
              <strong>工作台管理员</strong>
              <small>
                {data.mode.localSession ? "本地预览会话" : "已验证会话"}
              </small>
            </span>
            <CircleHelp size={17} />
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            工作空间 <span>/</span> <strong>{active?.label}</strong>
          </div>
          <div className="top-actions">
            <span className="environment">
              <span className="status-dot" />
              {data.mode.demo ? "DEMO 演示环境" : "测试环境"}
            </span>
            <span className="divider" />
            <button
              className="icon-button"
              aria-label="查看事件通知"
              onClick={() => go("events")}
            >
              <Bell size={18} />
            </button>
            <button
              className="avatar small-avatar"
              aria-label="账号帮助"
              onClick={() => setHelp(true)}
            >
              F
            </button>
          </div>
        </header>
        <main
          className={workflow ? "main-content editor-content" : "main-content"}
        >
          {workflow ? (
            <WorkflowEditor
              key={workflow.id}
              workflow={workflow}
              templates={data.templates}
              onBack={() => setWorkflow(null)}
              onSaved={load}
            />
          ) : (
            <>
              {page === "overview" && (
                <Overview
                  data={data}
                  go={go}
                  sync={sync}
                  busy={busy}
                  openWorkflow={setWorkflow}
                />
              )}
              {page === "customers" && (
                <Customers data={data} reload={load} sync={sync} busy={busy} />
              )}
              {page === "segments" && <Segments data={data} reload={load} />}
              {page === "templates" && <Templates data={data} reload={load} />}
              {page === "campaigns" && <Campaigns data={data} reload={load} />}
              {page === "workflows" && (
                <Workflows data={data} reload={load} open={setWorkflow} />
              )}
              {page === "events" && <Events />}
              {page === "settings" && <Settings data={data} reload={load} />}
            </>
          )}
        </main>
        <footer className="app-footer">
          <span>
            EDM Studio <span className="footer-dot">·</span>{" "}
            每一次联系，都恰到好处。
          </span>
          <span>
            {data.mode.demo ? "演示数据 · 不代表真实业务表现" : "单店工作空间"}{" "}
            <span className="footer-dot">·</span> v0.1.0
          </span>
        </footer>
      </div>
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          {toast}
        </div>
      )}
      {help && (
        <Modal title="关于工作台" onClose={() => setHelp(false)}>
          <div className="modal-body">
            <p>
              这里管理客户营销许可、分群、邮件资产和自动化工作流。先创建模板，再连接工作流节点，选择模拟客户测试。
            </p>
            <div className="notice">
              当前版本支持本地完整模拟闭环。真实发送需要完成服务商政策、域名、计费及账号集成验收；详见项目
              README。
            </div>
            <button
              onClick={() => {
                setHelp(false);
                go("settings");
              }}
            >
              查看连接与上线条件 <ArrowRight size={15} />
            </button>
            {!data.mode.localSession && (
              <button
                onClick={async () => {
                  await api("auth/logout", "POST");
                  setHelp(false);
                  setLogin(true);
                }}
              >
                <LogOut size={15} />
                退出登录
              </button>
            )}
          </div>
        </Modal>
      )}
    </div>
  );
}
function Overview({
  data,
  go,
  sync,
  busy,
  openWorkflow,
}: {
  data: any;
  go: (p: string) => void;
  sync: () => void;
  busy: boolean;
  openWorkflow: (w: any) => void;
}) {
  const m = data.metrics;
  const max = Math.max(...m.chart.map((d: any) => d.delivered), 1);
  const [chartMode, setChartMode] = useState<"delivered" | "clicked">(
    "delivered",
  );
  const stats = [
    {
      label: "可营销联系人",
      value: m.eligible,
      foot: `共 ${m.total} 位客户`,
      icon: Users,
      color: "purple",
    },
    {
      label: "近 7 日发送",
      value: m.sent,
      foot: data.mode.demo ? "服务商受理 · DEMO 样本" : "服务商受理事件",
      icon: Send,
      color: "blue",
    },
    {
      label: "成功投递",
      value: m.delivered,
      foot: "收件服务器已接受",
      icon: Mail,
      color: "green",
    },
    {
      label: "链接点击",
      value: m.clicked,
      foot: "点击事件次数",
      icon: MousePointerClick,
      color: "orange",
    },
  ];
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">YOUR EMAIL WORKSPACE</div>
          <h1>
            让每一次联系，都恰到好处<span className="title-dot">.</span>
          </h1>
          <p>从一封欢迎邮件开始，与每一位客户建立长久的联系。</p>
        </div>
        <button onClick={sync} disabled={busy}>
          <RefreshCw size={15} className={busy ? "spin" : ""} />
          {busy ? "正在同步" : "同步客户"}
        </button>
        <button className="primary" onClick={() => go("campaigns")}>
          <Plus size={16} />
          创建邮件活动
        </button>
      </div>
      <div className="demo-banner">
        <span className="banner-icon">
          <ShieldCheck size={20} />
        </span>
        <div>
          <strong>
            {data.mode.demo ? "你的创意，可以放心试。" : "先验证，再开始发送。"}
          </strong>
          <span>
            {data.mode.demo
              ? "当前为 DEMO 演示环境，客户与历史指标均为模拟数据，不会发送真实邮件。"
              : "当前真实发送保持关闭；请完成连接与集成验收。"}
          </span>
        </div>
        <button className="text-button" onClick={() => go("settings")}>
          查看环境设置 <ArrowRight size={15} />
        </button>
      </div>
      <div className="stat-grid">
        {stats.map((s) => (
          <div className="stat-card" key={s.label}>
            <div className="stat-top">
              <span>{s.label}</span>
              <span className={`stat-icon ${s.color}`}>
                <s.icon size={17} />
              </span>
            </div>
            <div className="stat-value">
              {s.value.toLocaleString()}
              <small>{s.label === "可营销联系人" ? "人" : "次"}</small>
            </div>
            <div className="stat-foot">{s.foot}</div>
          </div>
        ))}
      </div>
      <div className="overview-grid">
        <section className="panel performance">
          <div className="section-heading">
            <div>
              <h2>每一次抵达，都有迹可循</h2>
              <p>
                邮件表现 <span className="tiny-label">DEMO</span>
              </p>
            </div>
            <span className="date-chip">
              最近 7 天 <ChevronDown size={13} />
            </span>
          </div>
          <div className="chart-legend">
            <button
              onClick={() => setChartMode("delivered")}
              className={chartMode === "delivered" ? "selected" : ""}
            >
              <i className="legend-dot violet" />
              成功投递 <strong>{m.delivered}</strong>
            </button>
            <button
              onClick={() => setChartMode("clicked")}
              className={chartMode === "clicked" ? "selected" : ""}
            >
              <i className="legend-dot mint" />
              链接点击 <strong>{m.clicked}</strong>
            </button>
          </div>
          <div
            className="chart"
            role="img"
            aria-label="最近七天投递和点击事件数量柱状图"
          >
            <div className="chart-axis">
              {[1, 0.75, 0.5, 0.25, 0].map((v) => (
                <span key={v}>{Math.round(max * v)}</span>
              ))}
            </div>
            <div className="chart-plot">
              <div className="gridlines">
                {[0, 1, 2, 3, 4].map((i) => (
                  <i key={i} />
                ))}
              </div>
              <div className="bars">
                {m.chart.map((d: any) => (
                  <div
                    className="bar-group"
                    key={d.date}
                    title={`${d.date} 投递 ${d.delivered} / 点击 ${d.clicked}`}
                  >
                    <div
                      className={`bar ${chartMode === "delivered" ? "emphasis" : ""}`}
                      style={{ height: `${(d.delivered / max) * 100}%` }}
                    >
                      <span>{d.delivered}</span>
                    </div>
                    <div
                      className={`bar clicks ${chartMode === "clicked" ? "emphasis" : ""}`}
                      style={{ height: `${(d.clicked / max) * 100}%` }}
                    >
                      <span>{d.clicked}</span>
                    </div>
                    <small>{d.date.slice(5).replace("-", "/")}</small>
                  </div>
                ))}
              </div>
            </div>
          </div>
          <div className="chart-bottom">
            <span>投递与点击单独统计，模拟决策不会计入真实发送。</span>
            <button className="text-button" onClick={() => go("events")}>
              查看事件 <ArrowUpRight size={13} />
            </button>
          </div>
        </section>
        <section className="panel readiness">
          <div className="section-heading">
            <div>
              <h2>发送前，再检查一步</h2>
              <p>真实环境连接状态</p>
            </div>
            <span className="iconbox purple">
              <ShieldCheck size={18} />
            </span>
          </div>
          <div className="readiness-list">
            {[
              {
                icon: ShoppingBag,
                name: "Shopify 店铺",
                desc: data.store.shopDomain,
                status:
                  data.store.connectStatus === "connected"
                    ? "已连接"
                    : "演示连接",
              },
              {
                icon: Mail,
                name: "发件域名",
                desc: "验证你的品牌发件身份",
                status: data.store.domainVerified ? "已验证" : "待验证",
              },
              {
                icon: Activity,
                name: "事件回传",
                desc: data.receipts.length
                  ? "已接收签名事件"
                  : "等待真实签名回调",
                status: data.receipts.length ? "有记录" : "待验证",
              },
              {
                icon: ShieldCheck,
                name: "营销政策许可",
                desc: "确认店铺与邮件素材适用性",
                status: "待确认",
              },
            ].map((s) => (
              <div className="readiness-row" key={s.name}>
                <s.icon size={18} />
                <div>
                  <strong>{s.name}</strong>
                  <small>{s.desc}</small>
                </div>
                <span className="small muted">{s.status}</span>
              </div>
            ))}
          </div>
          <button className="wide-button" onClick={() => go("settings")}>
            完成连接设置 <ArrowRight size={15} />
          </button>
        </section>
      </div>
      <section className="panel journey-panel">
        <div className="journey-copy">
          <span className="eyebrow">A BETTER FIRST HELLO</span>
          <h2>把第一声「你好」，交给工作流。</h2>
          <p>客户订阅后，在合适的时刻送上你的品牌问候。</p>
          <button
            className="primary soft"
            onClick={() =>
              openWorkflow(
                data.workflows.find((w: any) => w.kind === "welcome"),
              )
            }
          >
            打开欢迎工作流 <ArrowUpRight size={15} />
          </button>
        </div>
        <div className="journey-route">
          <div className="journey-step">
            <span className="iconbox purple">
              <ShoppingBag size={24} />
            </span>
            <strong>客户订阅</strong>
            <small>Shopify</small>
          </div>
          <div className="route-line">
            <span />
          </div>
          <div className="journey-step">
            <span className="iconbox green">
              <ShieldCheck size={24} />
            </span>
            <strong>检查营销许可</strong>
            <small>Consent guard</small>
          </div>
          <div className="route-line">
            <span />
          </div>
          <div className="journey-step">
            <span className="iconbox purple">
              <Mail size={24} />
            </span>
            <strong>欢迎邮件</strong>
            <small>Resend / Mock</small>
          </div>
        </div>
      </section>
      <div className="section-heading lower-heading">
        <div>
          <h2>让沟通，顺其自然</h2>
          <p>从这些预置流程开始，建立你的客户旅程。</p>
        </div>
        <button className="text-button" onClick={() => go("workflows")}>
          全部工作流 <ArrowRight size={15} />
        </button>
      </div>
      <div className="workflow-cards">
        {data.workflows.map((w: any) => (
          <WorkflowCard key={w.id} w={w} onClick={() => openWorkflow(w)} />
        ))}
      </div>
      <div className="overview-grid bottom-grid">
        <section className="panel">
          <div className="section-heading">
            <h2>最近发生</h2>
            <button className="text-button" onClick={() => go("events")}>
              全部事件 <ArrowUpRight size={14} />
            </button>
          </div>
          {data.recentEvents.slice(0, 4).map((e: any) => (
            <div className="activity-row" key={e.id}>
              <span className="activity-point" />
              <div>
                <strong>
                  {(
                    {
                      "email.delivered": "邮件已投递",
                      "email.clicked": "链接被点击",
                      "email.sent": "邮件已受理",
                      "email.simulated": "模拟发送决策",
                      "marketing.blocked": "营销发送已阻断",
                    } as Record<string, string>
                  )[e.eventType] || e.eventType}
                </strong>
                <small>{e.demo ? "DEMO · 模拟数据" : "Resend 回传"}</small>
              </div>
              <time>{date(e.occurredAt)}</time>
            </div>
          ))}
        </section>
        <section className="panel health-panel">
          <h2>每一位客户的意愿，都被尊重</h2>
          <p>以有效订阅为起点，把退订、抑制和发送频率放在每次发送之前。</p>
          <div className="health-numbers">
            <div>
              <strong>{m.unsubscribed}</strong>
              <span>抑制名单</span>
            </div>
            <div>
              <strong>{m.bounced}</strong>
              <span>退信事件</span>
            </div>
            <div>
              <strong>{m.complained}</strong>
              <span>投诉事件</span>
            </div>
          </div>
          <button className="text-button" onClick={() => go("customers")}>
            查看客户许可 <ArrowRight size={14} />
          </button>
        </section>
      </div>
    </>
  );
}
function WorkflowCard({ w, onClick }: { w: any; onClick: () => void }) {
  const Icon =
    w.kind === "welcome"
      ? Zap
      : w.kind === "post-purchase"
        ? ShoppingBag
        : Clock3;
  return (
    <button className="workflow-card" onClick={onClick}>
      <div className="workflow-card-top">
        <span
          className={`iconbox ${w.kind === "welcome" ? "purple" : w.kind === "post-purchase" ? "green" : "orange"}`}
        >
          <Icon size={20} />
        </span>
        <Badge status={w.status} />
      </div>
      <h3>{w.name}</h3>
      <p>{w.description || "设计属于你的邮件旅程。"}</p>
      <div className="workflow-card-bottom">
        <span>
          {JSON.parse(w.draftJson).nodes.length} 个节点 · v{w.version}
        </span>
        <ArrowUpRight size={17} />
      </div>
    </button>
  );
}
function Workflows({
  data,
  reload,
  open,
}: {
  data: any;
  reload: () => Promise<void>;
  open: (w: any) => void;
}) {
  const notify = useUI((s) => s.notify);
  const create = async () => {
    try {
      const w = await api("workflows", "POST", {
        name: "新的欢迎流程",
        kind: "welcome",
        definition: {
          nodes: [
            {
              id: "trigger",
              type: "trigger",
              position: { x: 180, y: 40 },
              data: {
                label: "新客户订阅",
                eventName: "shopify.customer.subscribed",
              },
            },
            {
              id: "send",
              type: "send_email",
              position: { x: 180, y: 220 },
              data: {
                label: "发送欢迎邮件",
                templateId:
                  data.templates.find((t: any) => t.category === "Welcome")
                    ?.id || data.templates[0]?.id,
              },
            },
            {
              id: "end",
              type: "end",
              position: { x: 180, y: 400 },
              data: { label: "结束" },
            },
          ],
          edges: [
            { id: "a", source: "trigger", target: "send" },
            { id: "b", source: "send", target: "end" },
          ],
        },
      });
      await reload();
      open(w);
    } catch (e) {
      notify((e as Error).message);
    }
  };
  return (
    <>
      <div className="page-heading">
        <div>
          <div className="eyebrow">AUTOMATIONS</div>
          <h1>自动化工作流</h1>
          <p>用一条清晰的路径，让每封邮件在合适的时候抵达。</p>
        </div>
        <button className="primary" onClick={create}>
          <Plus size={16} />
          创建工作流
        </button>
      </div>
      <div className="notice">
        <ShieldCheck size={18} />
        所有节点可编辑与模拟。当前只有 Trigger → Send Email 支持 Resend
        结构编译；复杂节点与弃单流程等待真实退出验收。
      </div>
      <div className="workflow-cards">
        {data.workflows.map((w: any) => (
          <WorkflowCard key={w.id} w={w} onClick={() => open(w)} />
        ))}
      </div>
      <section className="panel guide-panel">
        <h2>一个流程，三步开始</h2>
        <div>
          <p>
            <strong>1. 连接节点</strong>选择触发事件，连接邮件与规则，保存画布。
          </p>
          <p>
            <strong>2. 模拟一次</strong>选择客户，检查许可与分支的每一步决策。
          </p>
          <p>
            <strong>3. 发布模拟版本</strong>
            生成固定版本；后续编辑草稿不会改变已发布快照。
          </p>
        </div>
      </section>
    </>
  );
}
