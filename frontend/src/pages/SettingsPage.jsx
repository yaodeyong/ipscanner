import { useEffect, useState } from "react";
import { Button, Card, Descriptions, Modal, Statistic, Row, Col, Space, message } from "antd";
import {
  DatabaseOutlined,
  ClockCircleOutlined,
  DeleteOutlined,
  CloudDownloadOutlined,
} from "@ant-design/icons";
import axios from "axios";

export default function SettingsPage() {
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(false);
  const [importingOui, setImportingOui] = useState(false);

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

  return (
    <div style={{ maxWidth: 900 }}>
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
            <Statistic title="未解决冲突" value={counts.unresolved_conflicts || 0} prefix={<DatabaseOutlined />}
              valueStyle={counts.unresolved_conflicts > 0 ? { color: "#ff4d4f" } : undefined} />
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

      <Card title="数据维护">
        <Space direction="vertical" size="middle" style={{ width: "100%" }}>
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
