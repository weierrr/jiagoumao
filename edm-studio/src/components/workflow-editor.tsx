"use client";
import { useCallback, useEffect, useState } from "react";
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  Handle,
  Position,
  addEdge,
  applyNodeChanges,
  applyEdgeChanges,
  type Node,
  type Edge,
  type NodeProps,
  type Connection,
  type NodeChange,
  type EdgeChange,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  Zap,
  Mail,
  GitBranch,
  Clock3,
  Timer,
  CircleStop,
  Check,
  Save,
  Play,
  Upload,
  Pause,
  ArrowLeft,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { api, useUI } from "@/lib/client";
const types = {
  trigger: { label: "事件触发", icon: Zap, color: "purple" },
  condition: { label: "规则判断", icon: GitBranch, color: "orange" },
  delay: { label: "延迟", icon: Clock3, color: "blue" },
  wait_for_event: { label: "等待事件", icon: Timer, color: "blue" },
  send_email: { label: "发送邮件", icon: Mail, color: "green" },
  end: { label: "结束", icon: CircleStop, color: "gray" },
};
type NodeKind = keyof typeof types;
function FlowNode({ data, selected }: NodeProps) {
  const kind = data.kind as NodeKind;
  const type = types[kind];
  const Icon = type.icon;
  return (
    <div className={`flow-node ${selected ? "selected" : ""}`}>
      <div className="node-header">
        <span className={`iconbox ${type.color}`}>
          <Icon size={17} />
        </span>
        <span>{String(data.label)}</span>
        <span className="node-dot" />
      </div>
      <div className="node-sub">
        {kind === "trigger"
          ? String(data.eventName || "请选择触发事件")
          : kind === "delay"
            ? `等待 ${Number(data.duration || 0) / 3600} 小时`
            : kind === "send_email"
              ? "发送前重新检查营销许可"
              : kind === "condition"
                ? `${data.field} ${data.op} ${data.value}`
                : kind === "wait_for_event"
                  ? `等待 ${data.eventName || "事件"} / 超时分支`
                  : "没有后续操作"}
      </div>
      {kind !== "trigger" && <Handle type="target" position={Position.Top} />}
      <div className="node-handles">
        {kind === "condition" || kind === "wait_for_event" ? (
          <>
            <span>{kind === "condition" ? "满足" : "收到事件"}</span>
            <span>{kind === "condition" ? "不满足" : "超时"}</span>
            <Handle
              type="source"
              position={Position.Bottom}
              id={kind === "condition" ? "true" : "event"}
              style={{ left: "28%" }}
            />
            <Handle
              type="source"
              position={Position.Bottom}
              id={kind === "condition" ? "false" : "timeout"}
              style={{ left: "72%" }}
            />
          </>
        ) : kind !== "end" ? (
          <Handle type="source" position={Position.Bottom} />
        ) : null}
      </div>
    </div>
  );
}
const nodeTypes = { studio: FlowNode };
export default function WorkflowEditor({
  workflow,
  templates,
  onBack,
  onSaved,
}: {
  workflow: any;
  templates: any[];
  onBack: () => void;
  onSaved: () => Promise<void>;
}) {
  const definition = JSON.parse(workflow.draftJson);
  const [nodes, setNodes] = useState<Node[]>(
    definition.nodes.map((n: any) => ({
      ...n,
      type: "studio",
      data: { ...n.data, kind: n.type },
    })),
  );
  const [edges, setEdges] = useState<Edge[]>(
    definition.edges.map((e: any) => ({
      ...e,
      type: "smoothstep",
      animated: false,
    })),
  );
  const [name, setName] = useState(workflow.name);
  const [selected, setSelected] = useState<string>("send");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [contacts, setContacts] = useState<any[]>([]);
  const [contactId, setContactId] = useState("");
  const [purchase, setPurchase] = useState(false);
  const [unsubscribe, setUnsubscribe] = useState(false);
  const [eventReceived, setEventReceived] = useState(false);
  const notify = useUI((s) => s.notify);
  useEffect(() => {
    api("contacts")
      .then((r) => {
        setContacts(r.items);
        setContactId(r.items[0]?.id || "");
      })
      .catch((e) => notify(e.message));
  }, [notify]);
  const toDefinition = () => ({
    nodes: nodes.map((n) => ({
      id: n.id,
      type: n.data.kind,
      position: n.position,
      data: Object.fromEntries(
        Object.entries(n.data).filter(([k]) => k !== "kind"),
      ),
    })),
    edges: edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle || null,
      label: typeof e.label === "string" ? e.label : undefined,
    })),
  });
  const save = async () =>
    api(`workflows/${workflow.id}`, "PATCH", {
      name,
      definition: toDefinition(),
    });
  const act = async (action: string) => {
    setBusy(true);
    try {
      if (action !== "pause") await save();
      if (action === "save") {
        notify("草稿已保存，画布布局已同步");
        await onSaved();
        return;
      }
      const r = await api(
        `workflows/${workflow.id}/${action}`,
        "POST",
        action === "simulate"
          ? {
              contactId,
              purchaseDuringDelay: purchase,
              unsubscribeDuringDelay: unsubscribe,
              eventReceived,
            }
          : {},
      );
      setResult(r);
      if (action === "publish") notify("已发布模拟版本，不会真实发送邮件");
      if (action === "pause") notify("工作流已暂停");
      await onSaved();
    } catch (e) {
      notify((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const selectedNode = nodes.find((n) => n.id === selected);
  const update = (key: string, value: unknown) =>
    setNodes((ns) =>
      ns.map((n) =>
        n.id === selected ? { ...n, data: { ...n.data, [key]: value } } : n,
      ),
    );
  const add = (kind: NodeKind) => {
    const id = `${kind}_${Date.now()}`;
    setNodes((ns) => [
      ...ns,
      {
        id,
        type: "studio",
        position: { x: 450, y: Math.max(40, ns.length * 60) },
        data: {
          kind,
          label: types[kind].label,
          ...(kind === "trigger"
            ? { eventName: "shopify.customer.subscribed" }
            : {}),
          ...(kind === "send_email" ? { templateId: templates[0]?.id } : {}),
          ...(["delay", "wait_for_event"].includes(kind)
            ? { duration: 3600 }
            : {}),
          ...(kind === "wait_for_event"
            ? { eventName: "shopify.order.paid" }
            : {}),
          ...(kind === "condition"
            ? { field: "ordersCount", op: "eq", value: 0 }
            : {}),
        },
      },
    ]);
    setSelected(id);
  };
  const onNodesChange = useCallback(
    (changes: NodeChange[]) => setNodes((ns) => applyNodeChanges(changes, ns)),
    [],
  );
  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => setEdges((es) => applyEdgeChanges(changes, es)),
    [],
  );
  const onConnect = useCallback(
    (c: Connection) =>
      setEdges((es) => addEdge({ ...c, type: "smoothstep" }, es)),
    [],
  );
  return (
    <div className="editor-page">
      <div className="editor-top">
        <button
          className="icon-button"
          aria-label="返回工作流"
          onClick={onBack}
        >
          <ArrowLeft size={19} />
        </button>
        <input
          className="workflow-title"
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="工作流名称"
        />
        <span className="badge purple">模拟环境</span>
        <div className="spacer" />
        <button disabled={busy} onClick={() => act("save")}>
          <Save size={15} />
          保存草稿
        </button>
        <button disabled={busy} onClick={() => act("validate")}>
          <Check size={15} />
          校验
        </button>
        <button disabled={busy} onClick={() => act("simulate")}>
          <Play size={15} />
          模拟
        </button>
        <button
          disabled={busy}
          onClick={() => act("pause")}
          aria-label="暂停流程"
        >
          <Pause size={15} />
        </button>
        <button
          className="primary"
          disabled={busy}
          onClick={() => act("publish")}
        >
          <Upload size={15} />
          模拟发布
        </button>
      </div>
      <div className="canvas-shell">
        <aside className="node-library">
          <div className="eyebrow">节点库</div>
          <p className="muted small">点击添加，拖动连线</p>
          {Object.entries(types).map(([key, v]) => (
            <button key={key} onClick={() => add(key as NodeKind)}>
              <span className={`iconbox ${v.color}`}>
                <v.icon size={16} />
              </span>
              {v.label}
              <Plus size={13} />
            </button>
          ))}
          <div className="library-note">
            条件与等待节点需要连接两个出口。延迟与等待事件当前仅支持模拟。
          </div>
        </aside>
        <div className="flow-canvas">
          <ReactFlow
            nodes={nodes}
            edges={edges}
            nodeTypes={nodeTypes}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={(_, n) => setSelected(n.id)}
            fitView
            fitViewOptions={{ padding: 0.35 }}
            minZoom={0.25}
            maxZoom={1.5}
            deleteKeyCode={["Backspace", "Delete"]}
          >
            <Background color="#d9dfe9" gap={22} />
            <Controls />
            <MiniMap nodeColor="#d7cffa" maskColor="rgba(247,249,252,.7)" />
          </ReactFlow>
          <div className="canvas-label">
            <span className="status-dot" />
            编辑草稿 · 保存后可重新打开
          </div>
        </div>
        <aside className="node-properties">
          <div className="eyebrow">节点属性</div>
          {selectedNode ? (
            <>
              <h3>{types[selectedNode.data.kind as NodeKind].label}</h3>
              <label>
                节点名称
                <input
                  value={String(selectedNode.data.label || "")}
                  onChange={(e) => update("label", e.target.value)}
                />
              </label>
              <div className="field-note mono">{selectedNode.id}</div>
              {["trigger", "wait_for_event"].includes(
                String(selectedNode.data.kind),
              ) && (
                <label>
                  事件名称
                  <input
                    value={String(selectedNode.data.eventName || "")}
                    onChange={(e) => update("eventName", e.target.value)}
                  />
                </label>
              )}
              {selectedNode.data.kind === "send_email" && (
                <label>
                  邮件模板
                  <select
                    value={String(selectedNode.data.templateId || "")}
                    onChange={(e) => update("templateId", e.target.value)}
                  >
                    <option value="">选择模板</option>
                    {templates.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                        {t.publishedAt ? "" : "（未发布）"}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {["delay", "wait_for_event"].includes(
                String(selectedNode.data.kind),
              ) && (
                <label>
                  等待时间（小时，最长 720）
                  <input
                    type="number"
                    min={1 / 3600}
                    max={720}
                    step="any"
                    value={Number(selectedNode.data.duration || 0) / 3600}
                    onChange={(e) =>
                      update(
                        "duration",
                        Math.round(Number(e.target.value) * 3600),
                      )
                    }
                  />
                </label>
              )}
              {selectedNode.data.kind === "condition" && (
                <>
                  <label>
                    判断字段
                    <select
                      value={String(selectedNode.data.field)}
                      onChange={(e) => update("field", e.target.value)}
                    >
                      <option value="ordersCount">订单数</option>
                      <option value="totalSpent">消费金额</option>
                      <option value="marketingState">营销订阅状态</option>
                    </select>
                  </label>
                  <label>
                    条件
                    <select
                      value={String(selectedNode.data.op)}
                      onChange={(e) => update("op", e.target.value)}
                    >
                      <option value="eq">等于</option>
                      <option value="neq">不等于</option>
                      <option value="gte">大于等于</option>
                      <option value="lte">小于等于</option>
                    </select>
                  </label>
                  <label>
                    比较值
                    <input
                      value={String(selectedNode.data.value)}
                      onChange={(e) =>
                        update(
                          "value",
                          selectedNode.data.field === "marketingState"
                            ? e.target.value
                            : Number(e.target.value),
                        )
                      }
                    />
                  </label>
                </>
              )}
              <button
                className="danger text-button"
                onClick={() => {
                  setNodes((ns) => ns.filter((n) => n.id !== selected));
                  setEdges((es) =>
                    es.filter(
                      (e) => e.source !== selected && e.target !== selected,
                    ),
                  );
                  setSelected("");
                }}
              >
                <Trash2 size={14} />
                移除节点
              </button>
            </>
          ) : (
            <p className="muted">选择一个节点以编辑属性</p>
          )}
          <hr />
          <div className="eyebrow">模拟场景</div>
          <label>
            测试联系人
            <select
              value={contactId}
              onChange={(e) => setContactId(e.target.value)}
            >
              {contacts.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.firstName} · {c.marketingState}
                </option>
              ))}
            </select>
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={purchase}
              onChange={(e) => setPurchase(e.target.checked)}
            />
            等待期间完成购买
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={unsubscribe}
              onChange={(e) => setUnsubscribe(e.target.checked)}
            />
            等待期间退订
          </label>
          <label className="check">
            <input
              type="checkbox"
              checked={eventReceived}
              onChange={(e) => setEventReceived(e.target.checked)}
            />
            等待事件已收到
          </label>
          <p className="field-note">
            时间会快进。模拟不代表托管平台已通过退出行为验证。
          </p>
        </aside>
      </div>
      {result && (
        <div className="simulation-result">
          <div className="section-heading">
            <h3>
              {result.trace
                ? "模拟执行轨迹"
                : result.valid !== undefined
                  ? "工作流校验"
                  : "操作结果"}
            </h3>
            <button
              className="icon-button"
              onClick={() => setResult(null)}
              aria-label="关闭结果"
            >
              <X size={16} />
            </button>
          </div>
          {result.trace ? (
            <div className="trace-grid">
              {result.trace.map((t: any, i: number) => (
                <div className={`trace-item ${t.status}`} key={i}>
                  <span className="trace-number">{i + 1}</span>
                  <div>
                    <strong>{t.label}</strong>
                    <p>{t.action}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <>
              <p>
                {result.valid === true
                  ? "✓ 图结构与模板校验通过"
                  : result.errors?.join("；") || "已保存"}
              </p>
              {result.warnings?.map((w: string) => (
                <p className="muted small" key={w}>
                  {w}
                </p>
              ))}
              {result.compileMessage && (
                <p className="muted small">{result.compileMessage}</p>
              )}
              {result.compiled && (
                <details>
                  <summary>查看 Resend 编译结果</summary>
                  <pre>{JSON.stringify(result.compiled, null, 2)}</pre>
                </details>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
