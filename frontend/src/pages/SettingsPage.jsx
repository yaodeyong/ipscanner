import { useEffect, useState } from "react";
import {
  Button,
  Card,
  Descriptions,
  Modal,
  Statistic,
  Row,
  Col,
  Space,
  message,
  Spin,
  Table,
  Typography,
} from "antd";
import {
  DatabaseOutlined,
  ClockCircleOutlined,
  DeleteOutlined,
  CloudDownloadOutlined,
  RadarChartOutlined,
} from "@ant-design/icons";
import axios from "axios";

const { Paragraph, Text } = Typography;

export default function SettingsPage() {
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [diagLoading, setDiagLoading] = useState(false);
  const [diagResult, setDiagResult] = useState(null);

  const loadInfo = async () => {
    setLoading(true);
    try {
      const res = await axios.get("/api/system/info");
      setInfo(res.data?.data || null);
    } catch {
      message.error("获取系统信息失败");
    } finally {
      setLoading(false);
    }
  };

  const runNetworkDiag = async () => {
    setDiagLoading(true);
    setDiagResult(null);
    try {
      const res = await axios.get("/api/system/network-diag", { timeout: 180000 });
      setDiagResult(res.data?.data || null);
      message.success("诊断完成");
    } catch {
      message.error("网络诊断失败或超时，请查看后端是否在运行");
    } finally {
      setDiagLoading(false);
    }
  };

  const handleClearLogs = () => {
    Modal.confirm({
      title: "确认清空日志",
      content: "此操作将删除所有审计日志记录，不可恢复。确定继续？",
      okText: "确认清空",
      okType: "danger",
      cancelText: "取消",
      onOk: async () => {
        try {
          await axios.delete("/api/system/logs");
          message.success("日志已清空");
          await loadInfo();
        } catch {
          message.error("清空日志失败");
        }
      },
    });
  };

  const formatUptime = (seconds) => {
    if (!seconds) return "-";
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = seconds % 60;
    const parts = [];
    if (h > 0) parts.push(`${h}小时`);
    if (m > 0) parts.push(`${m}分钟`);
    parts.push(`${s}秒`);
    return parts.join("");
  };

  useEffect(() => {
    loadInfo();
  }, []);

  const counts = info?.counts || {};

  const diagColumns = [
    { title: "项目", dataIndex: "label", key: "label", ellipsis: true },
    {
      title: "结果",
      dataIndex: "ok",
      key: "ok",
      width: 80,
      render: (ok) => (ok ? <Text type="success">正常</Text> : <Text type="danger">异常</Text>),
    },
    { title: "摘要", dataIndex: "summary", key: "summary", width: 200 },
  ];

  return (
    <div style={{ maxWidth: 1100 }}>
      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        <Col span={6}>
          <Card hoverable>
            <Statistic title="IP 记录数" value={counts.ip_assignments || 0} prefix={<DatabaseOutlined />} />
          </Card>
        </Col>
        <Col span={6}>
          <Card hoverable>
            <Statistic title="设备数" value={counts.devices || 0} prefix={<DatabaseOutlined />} />
          </Card>
        </Col>
        <Col span={6}>
          <Card hoverable>
            <Statistic
              title="未解决冲突"
              value={counts.unresolved_conflicts || 0}
              prefix={<DatabaseOutlined />}
              {...(counts.unresolved_conflicts > 0 ? { styles: { content: { color: "#ff4d4f" } } } : {})}
            />
          </Card>
        </Col>
        <Col span={6}>
          <Card hoverable>
            <Statistic title="OUI 厂商数" value={counts.oui_vendors || 0} prefix={<CloudDownloadOutlined />} />
          </Card>
        </Col>
      </Row>

      <Card title="系统信息" style={{ marginBottom: 24 }} loading={loading}
        extra={<Button onClick={loadInfo} size="small">刷新</Button>}>
        <Descriptions column={2} bordered size="small">
          <Descriptions.Item label="数据库文件">{info?.dbPath || "-"}</Descriptions.Item>
          <Descriptions.Item label="数据库大小">{info?.dbSizeMB || "0"} MB</Descriptions.Item>
          <Descriptions.Item label="Node.js 版本">{info?.nodeVersion || "-"}</Descriptions.Item>
          <Descriptions.Item label="操作系统">{info?.platform || "-"}</Descriptions.Item>
          <Descriptions.Item label="服务运行时间">
            <ClockCircleOutlined style={{ marginRight: 4 }} />
            {formatUptime(info?.uptime)}
          </Descriptions.Item>
          <Descriptions.Item label="审计日志条数">{counts.audit_logs || 0}</Descriptions.Item>
        </Descriptions>
      </Card>

      <Card
        title="网络诊断"
        style={{ marginBottom: 24 }}
        extra={
          <Button type="primary" icon={<RadarChartOutlined />} loading={diagLoading} onClick={runNetworkDiag}>
            运行诊断（约 20～40 秒）
          </Button>
        }
      >
        <Paragraph type="secondary" style={{ marginBottom: 12 }}>
          与命令行 <Text code>npm run net:diag</Text> 使用相同逻辑；在「系统设置」页即可查看，便于插拔网线前后对比。
          启动前后端请仍使用根目录 <Text code>npm run dev</Text>。
        </Paragraph>
        <Spin spinning={diagLoading} description="正在 ping / TCP / HTTPS 探测，请稍候…">
          {!diagResult && !diagLoading ? (
            <Text type="secondary">点击右上角按钮运行，结果将显示在下方。</Text>
          ) : null}
          {diagResult ? (
            <Space orientation="vertical" size="middle" style={{ width: "100%" }}>
              <div>
                <Text strong>生成时间：</Text>
                {diagResult.generatedAtLocal || diagResult.generatedAt}
                <Text type="secondary" style={{ marginLeft: 12 }}>
                  {diagResult.hostname} · {diagResult.platform}
                </Text>
              </div>
              {diagResult.proxy ? (
                <Text type="warning">代理环境变量: {diagResult.proxy}</Text>
              ) : (
                <Text type="secondary">未检测到 HTTP(S)_PROXY（直连）</Text>
              )}
              <div>
                <Text strong style={{ display: "block", marginBottom: 8 }}>本机 IPv4</Text>
                <Table
                  size="small"
                  pagination={false}
                  rowKey={(r) => `${r.name}-${r.address}`}
                  dataSource={diagResult.interfaces || []}
                  columns={[
                    { title: "接口", dataIndex: "name", key: "name" },
                    { title: "地址", dataIndex: "address", key: "address", width: 140 },
                    { title: "掩码", dataIndex: "netmask", key: "netmask", width: 120 },
                    { title: "MAC", dataIndex: "mac", key: "mac", ellipsis: true },
                  ]}
                />
              </div>
              <div>
                <Text strong style={{ display: "block", marginBottom: 8 }}>探测摘要</Text>
                <Table
                  size="small"
                  pagination={false}
                  rowKey="label"
                  dataSource={diagResult.tests || []}
                  columns={diagColumns}
                />
              </div>
              <div>
                <Text strong style={{ display: "block", marginBottom: 8 }}>完整文本（可复制）</Text>
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
                  {diagResult.textReport}
                </Paragraph>
              </div>
            </Space>
          ) : null}
        </Spin>
      </Card>

      <Card title="数据维护">
        <Space orientation="vertical" size="middle" style={{ width: "100%" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: 500 }}>清空审计日志</div>
              <div style={{ color: "#999", fontSize: 13 }}>删除所有操作日志记录，释放数据库空间</div>
            </div>
            <Button danger icon={<DeleteOutlined />} onClick={handleClearLogs}>清空日志</Button>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ fontWeight: 500 }}>导入 OUI 厂商数据</div>
              <div style={{ color: "#999", fontSize: 13 }}>
                从 IEEE 官方下载最新 OUI 数据（需联网）。当前已有 {counts.oui_vendors || 0} 条记录。
                请在终端运行: <code style={{ background: "#f0f0f0", padding: "2px 6px", borderRadius: 3 }}>cd backend && npm run import:oui</code>
              </div>
            </div>
          </div>
        </Space>
      </Card>
    </div>
  );
}
