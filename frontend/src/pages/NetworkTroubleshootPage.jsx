import { useEffect, useMemo, useState } from "react";
import {
  Alert,
  Button,
  Card,
  Col,
  Input,
  Row,
  Select,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from "antd";
import { RadarChartOutlined, SaveOutlined, FileTextOutlined } from "@ant-design/icons";
import axios from "axios";

const { Text, Paragraph } = Typography;

function getTestMs(test) {
  if (!test || !test.ok) return null;
  const avg = Number(test.detail?.avgMs);
  if (Number.isFinite(avg)) return avg;
  const ms = Number(test.detail?.ms);
  if (Number.isFinite(ms)) return ms;
  const m = String(test.summary || "").match(/(\d+)\s*ms/i);
  return m ? Number(m[1]) : null;
}

export default function NetworkTroubleshootPage() {
  const [running, setRunning] = useState(false);
  const [loadingReports, setLoadingReports] = useState(false);
  const [conclusionLoading, setConclusionLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [reports, setReports] = useState([]);
  const [currentReportId, setCurrentReportId] = useState(null);
  const [baselineReportId, setBaselineReportId] = useState(null);
  const [conclusion, setConclusion] = useState(null);
  const [diagLabel, setDiagLabel] = useState("");

  const loadReports = async () => {
    setLoadingReports(true);
    try {
      const res = await axios.get("/api/system/network-diag/reports", { params: { limit: 30 } });
      const items = res.data?.data?.items || [];
      setReports(items);
      if (!currentReportId && items.length) setCurrentReportId(items[0].id);
      if (!baselineReportId && items.length > 1) setBaselineReportId(items[1].id);
    } catch {
      message.error("加载历史报告失败");
    } finally {
      setLoadingReports(false);
    }
  };

  const runDiag = async () => {
    setRunning(true);
    try {
      const res = await axios.get("/api/system/network-diag", {
        timeout: 180000,
        params: { label: diagLabel || undefined },
      });
      const data = res.data?.data || null;
      setResult(data);
      if (data?.reportId) setCurrentReportId(data.reportId);
      await loadReports();
      message.success("诊断完成并已入库");
    } catch {
      message.error("诊断失败，请检查后端是否运行");
    } finally {
      setRunning(false);
    }
  };

  const loadCurrentReportDetail = async (id) => {
    if (!id) {
      setResult(null);
      return;
    }
    try {
      const res = await axios.get(`/api/system/network-diag/reports/${id}`);
      setResult(res.data?.data || null);
    } catch {
      message.error("加载报告详情失败");
    }
  };

  const generateConclusion = async () => {
    if (!currentReportId) {
      message.warning("请先选择当前报告");
      return;
    }
    setConclusionLoading(true);
    try {
      const res = await axios.get("/api/system/network-diag/conclusion", {
        params: {
          currentId: currentReportId,
          baselineId: baselineReportId || undefined,
        },
      });
      setConclusion(res.data?.data || null);
      message.success("结论报告已生成");
    } catch {
      message.error("生成结论失败");
    } finally {
      setConclusionLoading(false);
    }
  };

  useEffect(() => {
    loadReports();
  }, []);

  useEffect(() => {
    if (currentReportId) loadCurrentReportDetail(currentReportId);
  }, [currentReportId]);

  useEffect(() => {
    setConclusion(null);
  }, [currentReportId, baselineReportId]);

  const compare = useMemo(() => {
    const baseline = reports.find((x) => Number(x.id) === Number(baselineReportId));
    if (!baseline || !baseline.__detail || !result) return null;
    const previous = baseline.__detail;
    const rows = (result.tests || []).map((t) => {
      const old = (previous.tests || []).find((x) => x.label === t.label);
      const msNew = getTestMs(t);
      const msOld = getTestMs(old);
      const delta = Number.isFinite(msNew) && Number.isFinite(msOld) ? msNew - msOld : null;
      return {
        key: t.label,
        label: t.label,
        current: t.summary || "-",
        previous: old?.summary || "-",
        delta,
      };
    });
    return {
      latestAt: result.created_at || result.generated_at || "-",
      previousAt: previous.created_at || previous.generated_at || "-",
      rows,
    };
  }, [reports, baselineReportId, result]);

  useEffect(() => {
    const target = reports.find((x) => Number(x.id) === Number(baselineReportId));
    if (!target || target.__detail) return;
    axios
      .get(`/api/system/network-diag/reports/${target.id}`)
      .then((res) => {
        const detail = res.data?.data || null;
        setReports((list) =>
          list.map((r) => (Number(r.id) === Number(target.id) ? { ...r, __detail: detail } : r))
        );
      })
      .catch(() => {});
  }, [baselineReportId, reports]);

  return (
    <div style={{ maxWidth: 1200 }}>
      <Alert
        type="info"
        showIcon
        style={{ marginBottom: 16 }}
        title="网络排障专页：诊断入库 -> 原因排序 -> 两次对比 -> 一键结论报告"
      />

      <Card style={{ marginBottom: 16 }} title="运行与报告选择">
        <Space wrap>
          <Input
            placeholder="本次标签（可选，如：有线直连 / WiFi）"
            value={diagLabel}
            onChange={(e) => setDiagLabel(e.target.value)}
            style={{ width: 280 }}
          />
          <Button type="primary" icon={<RadarChartOutlined />} loading={running} onClick={runDiag}>
            立即诊断（约20~40秒）
          </Button>
          <Button icon={<SaveOutlined />} loading={loadingReports} onClick={loadReports}>
            刷新历史
          </Button>
          <Button
            icon={<FileTextOutlined />}
            loading={conclusionLoading}
            disabled={!currentReportId}
            onClick={generateConclusion}
          >
            一键结论报告
          </Button>
        </Space>

        <Space style={{ marginTop: 12 }} wrap>
          <Text>当前报告：</Text>
          <Select
            style={{ width: 340 }}
            value={currentReportId}
            onChange={setCurrentReportId}
            options={reports.map((r) => ({
              value: r.id,
              label: `#${r.id} ${r.created_at || r.generated_at || "-"} ${r.label ? `(${r.label})` : ""}`,
            }))}
          />
          <Text>对比基线：</Text>
          <Select
            allowClear
            style={{ width: 340 }}
            value={baselineReportId}
            onChange={setBaselineReportId}
            options={reports
              .filter((r) => Number(r.id) !== Number(currentReportId))
              .map((r) => ({
                value: r.id,
                label: `#${r.id} ${r.created_at || r.generated_at || "-"} ${r.label ? `(${r.label})` : ""}`,
              }))}
          />
        </Space>
      </Card>

      <Row gutter={[16, 16]}>
        <Col span={24}>
          <Card title="自动判断（最可能原因）">
            {!result ? (
              <Text type="secondary">先运行一次诊断。</Text>
            ) : (
              <Space orientation="vertical" style={{ width: "100%" }}>
                {(result.hints || []).map((h, idx) => (
                  <Alert
                    key={`${h.title}-${idx}`}
                    type={h.level === "high" ? "error" : h.level === "medium" ? "warning" : "info"}
                    showIcon
                    title={h.title}
                    description={h.detail}
                  />
                ))}
              </Space>
            )}
          </Card>
        </Col>

        <Col span={24}>
          <Card title="本次诊断摘要">
            {!result ? (
              <Text type="secondary">暂无数据</Text>
            ) : (
              <Space orientation="vertical" style={{ width: "100%" }}>
                <Text>
                  生成时间：{result.generatedAtLocal || result.generatedAt || result.created_at} · {result.hostname} · {result.platform}
                </Text>
                <Text>{result.proxy ? `代理: ${result.proxy}` : "代理: 未检测到 HTTP(S)_PROXY（直连）"}</Text>
                <Table
                  size="small"
                  rowKey="label"
                  pagination={false}
                  dataSource={result.tests || []}
                  columns={[
                    { title: "项目", dataIndex: "label", key: "label" },
                    {
                      title: "状态",
                      dataIndex: "ok",
                      key: "ok",
                      width: 80,
                      render: (ok) => (ok ? <Tag color="green">正常</Tag> : <Tag color="red">异常</Tag>),
                    },
                    { title: "结果", dataIndex: "summary", key: "summary", width: 220 },
                  ]}
                />
                <Text strong>默认路由（有效跃点越小越优先）</Text>
                <Table
                  size="small"
                  rowKey={(r) => `${r.interfaceAlias}-${r.nextHop}-${r.effectiveMetric}`}
                  pagination={false}
                  dataSource={result.defaultRoutes || []}
                  columns={[
                    { title: "接口", dataIndex: "interfaceAlias", key: "interfaceAlias" },
                    { title: "下一跳", dataIndex: "nextHop", key: "nextHop", width: 150 },
                    { title: "路由跃点", dataIndex: "routeMetric", key: "routeMetric", width: 100 },
                    { title: "接口跃点", dataIndex: "interfaceMetric", key: "interfaceMetric", width: 100 },
                    { title: "有效跃点", dataIndex: "effectiveMetric", key: "effectiveMetric", width: 100 },
                  ]}
                />
                <Text strong>网卡链路速率</Text>
                <Table
                  size="small"
                  rowKey={(r) => `${r.name}-${r.mac}`}
                  pagination={false}
                  dataSource={result.adapters || []}
                  columns={[
                    { title: "网卡", dataIndex: "name", key: "name" },
                    { title: "状态", dataIndex: "status", key: "status", width: 100 },
                    { title: "链路速率", dataIndex: "linkSpeedRaw", key: "linkSpeedRaw", width: 140 },
                    {
                      title: "解析值",
                      dataIndex: "linkSpeedMbps",
                      key: "linkSpeedMbps",
                      width: 120,
                      render: (v) => (v ? `${v} Mbps` : "-"),
                    },
                    { title: "MAC", dataIndex: "mac", key: "mac", ellipsis: true },
                  ]}
                />
              </Space>
            )}
          </Card>
        </Col>

        <Col span={24}>
          <Card title={`报告对比${compare ? `：${compare.previousAt} -> ${compare.latestAt}` : ""}`}>
            {!compare ? (
              <Text type="secondary">请选择“当前报告”和“对比基线”。</Text>
            ) : (
              <Table
                size="small"
                rowKey="label"
                pagination={false}
                dataSource={compare.rows}
                columns={[
                  { title: "项目", dataIndex: "label", key: "label" },
                  { title: "上次", dataIndex: "previous", key: "previous", width: 180 },
                  { title: "本次", dataIndex: "current", key: "current", width: 180 },
                  {
                    title: "变化",
                    dataIndex: "delta",
                    key: "delta",
                    width: 120,
                    render: (delta) => {
                      if (!Number.isFinite(delta)) return "-";
                      if (delta > 0) return <Text type="danger">+{delta} ms</Text>;
                      if (delta < 0) return <Text type="success">{delta} ms</Text>;
                      return "0 ms";
                    },
                  },
                ]}
              />
            )}
          </Card>
        </Col>

        <Col span={24}>
          <Card title="一键结论报告（可直接发网管）">
            {!conclusion ? (
              <Text type="secondary">点击上方「一键结论报告」生成。</Text>
            ) : (
              <Paragraph
                copyable
                style={{
                  marginBottom: 0,
                  maxHeight: 360,
                  overflow: "auto",
                  background: "#0d1117",
                  color: "#c9d1d9",
                  padding: 12,
                  borderRadius: 8,
                  fontFamily: "ui-monospace, Consolas, monospace",
                  fontSize: 12,
                  whiteSpace: "pre-wrap",
                }}
              >
                {conclusion.textReport}
              </Paragraph>
            )}
          </Card>
        </Col>
      </Row>
    </div>
  );
}
