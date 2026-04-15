import { useEffect, useState } from "react";
import {
  Alert,
  Button,
  Form,
  Input,
  Modal,
  Select,
  Space,
  Table,
  Tag,
} from "antd";
import {
  SyncOutlined,
  DownloadOutlined,
} from "@ant-design/icons";
import axios from "axios";

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}年${pad(date.getMonth() + 1)}月${pad(date.getDate())}日 ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function ipToNumber(ip) {
  const parts = String(ip || "").split(".").map((v) => Number(v));
  if (parts.length !== 4 || parts.some((n) => Number.isNaN(n))) return 0;
  return parts[0] * 256 ** 3 + parts[1] * 256 ** 2 + parts[2] * 256 + parts[3];
}

function normalizeMacStr(mac) {
  return String(mac || "")
    .replace(/[^0-9a-fA-F]/g, "")
    .toUpperCase();
}

/** 冲突记录里除「当前分配 MAC」外的其它 MAC，用于展开行展示 */
function getConflictExtraMacs(record) {
  if (record.display_status !== "conflict" || !record.conflict_macs) return [];
  const assigned = normalizeMacStr(record.assigned_mac);
  return String(record.conflict_macs)
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean)
    .filter((mac) => normalizeMacStr(mac) !== assigned);
}

export default function OverviewPage() {
  const [healthText, setHealthText] = useState("尚未检测后端连接");
  const [rows, setRows] = useState([]);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 200, total: 0 });
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [summary, setSummary] = useState({ totalDevices: 0, onlineDevices: 0, offlineDevices: 0, conflictDevices: 0 });
  const [editingRow, setEditingRow] = useState(null);
  const [editForm] = Form.useForm();
  const [scanPreview, setScanPreview] = useState({ open: false, changes: [] });
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);
  /** 与后端 /api/ips 查询参数一致，避免表格列「前端过滤」导致本页不足 50 条却仍显示多页 */
  const [listFilters, setListFilters] = useState({ ip: "", mac: "", status: "" });

  const tableColumns = [
    { title: "序号", key: "index", width: 50, render: (_, __, index) => (pagination.current - 1) * pagination.pageSize + index + 1 },
    {
      title: "IP 地址",
      dataIndex: "ip_address",
      key: "ip_address",
      width: 120,
      defaultSortOrder: "ascend",
      sorter: (a, b) => ipToNumber(a.ip_address) - ipToNumber(b.ip_address),
      sortDirections: ["ascend", "descend"],
    },
    {
      title: "状态",
      dataIndex: "display_status",
      key: "display_status",
      width: 60,
      render: (status) => {
        if (status === "online") return <Tag color="green">在线</Tag>;
        if (status === "conflict") return <Tag color="red">冲突</Tag>;
        return <Tag>离线</Tag>;
      },
    },
    { title: "名称", dataIndex: "hostname", key: "hostname", width: 180 },
    {
      title: "制造商",
      dataIndex: "vendor",
      key: "vendor",
      width: 250,
      sorter: (a, b) => String(a.vendor || "").localeCompare(String(b.vendor || ""), "zh-CN"),
      sortDirections: ["ascend", "descend"],
    },
    { title: "MAC 地址", dataIndex: "assigned_mac", key: "assigned_mac", width: 150 },
    { title: "部门", dataIndex: "department", key: "department" },
    { title: "用户", dataIndex: "owner_user", key: "owner_user" },
    { title: "备注", dataIndex: "note", key: "note" },
    { title: "最后在线时间", dataIndex: "last_online", key: "last_online", render: (value) => formatDateTime(value) },
    {
      title: "操作",
      key: "actions",
      width: 88,
      render: (_, record) => (
        <Button size="small" onClick={() => {
          setEditingRow(record);
          editForm.setFieldsValue({ department: record.department || "", owner_user: record.owner_user || "", note: record.note || "" });
        }}>编辑</Button>
      ),
    },
  ];

  const checkBackend = async () => {
    try {
      const res = await axios.get("/api/health");
      setHealthText(`后端正常: ${res.data?.data?.service || "ipscanner-backend"}`);
    } catch {
      setHealthText("后端连接失败，请检查 backend 服务是否启动");
    }
  };

  const loadIps = async (page = pagination.current, pageSize = pagination.pageSize, filters = listFilters) => {
    setLoading(true);
    try {
      const params = { page, pageSize };
      const ip = String(filters.ip || "").trim();
      const mac = String(filters.mac || "").trim();
      const status = String(filters.status || "").trim();
      if (ip) params.ip = ip;
      if (mac) params.mac = mac;
      if (status) params.status = status;

      const res = await axios.get("/api/ips", { params });
      const payload = res.data?.data;
      const items = payload?.items || [];
      const total = payload?.pagination?.total || 0;
      const summaryData = payload?.summary || {};
      setRows(items.slice(0, pageSize).map((item) => ({ ...item, key: item.id })));
      setSummary({
        totalDevices: summaryData.totalDevices || 0,
        onlineDevices: summaryData.onlineDevices || 0,
        offlineDevices: summaryData.offlineDevices || 0,
        conflictDevices: summaryData.conflictDevices || 0,
      });
      setPagination({ current: page, pageSize, total });
    } catch {
      setHealthText("读取 IP 列表失败，请检查后端或数据库配置");
    } finally {
      setLoading(false);
    }
  };

  const handleSearch = () => {
    loadIps(1, pagination.pageSize, listFilters);
  };

  const handleResetFilters = () => {
    const empty = { ip: "", mac: "", status: "" };
    setListFilters(empty);
    loadIps(1, pagination.pageSize, empty);
  };

  const handleManualScan = async () => {
    setScanning(true);
    try {
      const res = await axios.post("/api/scan", { apply: false });
      const changes = res.data?.data?.changes || [];
      if (!changes.length) {
        setHealthText("扫描完成：未发现变更，无需写入数据库");
      } else {
        setScanPreview({ open: true, changes });
        setHealthText(`扫描完成：发现 ${changes.length} 条变更，请确认是否写入`);
      }
    } catch {
      setHealthText("手动扫描失败，请检查后端扫描接口");
    } finally {
      setScanning(false);
    }
  };

  const applyScanChanges = async () => {
    setScanning(true);
    try {
      await axios.post("/api/scan", { apply: true });
      setScanPreview({ open: false, changes: [] });
      setHealthText("扫描结果已写入数据库");
      await loadIps(1, pagination.pageSize);
    } catch {
      setHealthText("写入扫描结果失败，请重试");
    } finally {
      setScanning(false);
    }
  };

  const handleSaveRowEdit = async () => {
    if (!editingRow) return;
    const values = await editForm.validateFields();
    await axios.put(`/api/ips/${editingRow.ip_address}`, {
      assigned_mac: editingRow.assigned_mac,
      status: editingRow.status,
      note: values.note || null,
      department: values.department || null,
      owner_user: values.owner_user || null,
    });
    setEditingRow(null);
    await loadIps(pagination.current, pagination.pageSize);
  };

  useEffect(() => {
    checkBackend();
    loadIps(1, 200, { ip: "", mac: "", status: "" });
  }, []);

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <span style={{ fontSize: 15, color: "#666" }}>
          总设备: {summary.totalDevices} | 在线: <span style={{ color: "#52c41a" }}>{summary.onlineDevices}</span> | 离线: {summary.offlineDevices} | 冲突: <span style={{ color: "#ff4d4f" }}>{summary.conflictDevices}</span>
        </span>
        <Space>
          <Button icon={<SyncOutlined />} onClick={checkBackend}>检测后端</Button>
          <Button icon={<DownloadOutlined />} onClick={() => { const a = document.createElement("a"); a.href = "/api/ips/export"; a.click(); }}>导出 Excel</Button>
          <Button onClick={() => loadIps()}>刷新列表</Button>
          <Button type="primary" loading={scanning} onClick={handleManualScan}>手动扫描</Button>
        </Space>
      </div>

      <Alert title={healthText} type="info" showIcon style={{ marginBottom: 16 }} />

      <div style={{ marginBottom: 12, padding: "10px 12px", background: "#fafafa", borderRadius: 8, border: "1px solid #f0f0f0" }}>
        <Space wrap align="center">
          <span style={{ color: "#666", marginRight: 4 }}>筛选（走后端分页）：</span>
          <Input
            allowClear
            placeholder="IP 模糊"
            style={{ width: 160 }}
            value={listFilters.ip}
            onChange={(e) => setListFilters((f) => ({ ...f, ip: e.target.value }))}
            onPressEnter={handleSearch}
          />
          <Input
            allowClear
            placeholder="MAC 模糊"
            style={{ width: 180 }}
            value={listFilters.mac}
            onChange={(e) => setListFilters((f) => ({ ...f, mac: e.target.value }))}
            onPressEnter={handleSearch}
          />
          <Select
            allowClear
            placeholder="库内状态"
            style={{ width: 140 }}
            value={listFilters.status || undefined}
            onChange={(v) => setListFilters((f) => ({ ...f, status: v || "" }))}
            options={[
              { value: "free", label: "free 空闲" },
              { value: "assigned", label: "assigned 已分配" },
              { value: "conflict", label: "conflict 冲突" },
              { value: "unknown", label: "unknown 未知" },
            ]}
          />
          <Button type="primary" onClick={handleSearch}>查询</Button>
          <Button onClick={handleResetFilters}>重置</Button>
        </Space>
      </div>

      <div className="table-scroll-wrap">
        <Table
          className="compact-table"
          columns={tableColumns}
          dataSource={rows}
          loading={loading}
          scroll={{ x: "max-content", y: "calc(100vh - 300px)" }}
          pagination={{
            ...pagination,
            showSizeChanger: true,
            pageSizeOptions: ["50", "100", "200", "500"],
            showQuickJumper: true,
            showTotal: (total) => `共 ${total} 条（当前每页 ${pagination.pageSize} 条）`,
          }}
          expandable={{
            rowExpandable: (record) => getConflictExtraMacs(record).length > 0,
            expandedRowRender: (record) => {
              const extras = getConflictExtraMacs(record);
              if (!extras.length) return null;
              return (
                <div style={{ padding: "8px 48px 12px", background: "#fff7e6", borderRadius: 4 }}>
                  <div style={{ marginBottom: 8, color: "#d46b08", fontWeight: 500 }}>冲突中的其它 MAC（待处理）</div>
                  <Space orientation="vertical" size={6} style={{ width: "100%" }}>
                    {extras.map((mac) => (
                      <div key={mac} style={{ fontSize: 13 }}>
                        <Tag color="orange">{mac}</Tag>
                        <span style={{ color: "#666" }}>冲突设备（待处理） · 来自冲突记录</span>
                      </div>
                    ))}
                  </Space>
                </div>
              );
            },
          }}
          rowSelection={{ selectedRowKeys, onChange: (keys) => setSelectedRowKeys(keys) }}
          onChange={(next, _filters, _sorter, extra) => {
            if (extra.action === "paginate") loadIps(next.current, next.pageSize);
          }}
          rowClassName={(_, index) => (index % 2 === 0 ? "row-even" : "row-odd")}
        />
      </div>

      <Modal
        open={scanPreview.open}
        title="扫描结果差异预览"
        onCancel={() => setScanPreview({ open: false, changes: [] })}
        onOk={applyScanChanges}
        okText="确认写入数据库"
        cancelText="取消"
        confirmLoading={scanning}
        width={1200}
      >
        <Table
          size="small"
          rowKey={(row) => `${row.type}-${row.ip}-${row.mac}`}
          pagination={false}
          dataSource={scanPreview.changes}
          scroll={{ x: "max-content" }}
          columns={[
            {
              title: "类型",
              dataIndex: "type",
              key: "type",
              width: 160,
              render: (v) => (v === "new" ? "新增设备" : v === "mac_changed" ? "MAC变更" : v === "meta_changed" ? "名称/制造商变更" : v),
            },
            { title: "IP", dataIndex: "ip", key: "ip", width: 120 },
            { title: "当前MAC", dataIndex: "mac", key: "mac", width: 150 },
            { title: "原MAC", dataIndex: "previousMac", key: "previousMac", width: 150 },
            { title: "原名称", dataIndex: "previousHostname", key: "previousHostname", width: 140 },
            { title: "原制造商", dataIndex: "previousVendor", key: "previousVendor", width: 160 },
            { title: "名称", dataIndex: "hostname", key: "hostname", width: 140 },
            { title: "制造商", dataIndex: "vendor", key: "vendor", width: 160 },
            { title: "说明", dataIndex: "message", key: "message", width: 220, ellipsis: true },
          ]}
        />
      </Modal>

      <Modal
        open={!!editingRow}
        title={`编辑 ${editingRow?.ip_address || ""}`}
        onCancel={() => setEditingRow(null)}
        onOk={handleSaveRowEdit}
        okText="保存"
        cancelText="取消"
      >
        <Form form={editForm} layout="vertical">
          <Form.Item label="部门" name="department"><Input placeholder="请输入部门" /></Form.Item>
          <Form.Item label="用户" name="owner_user"><Input placeholder="请输入用户" /></Form.Item>
          <Form.Item label="备注" name="note"><Input.TextArea rows={3} placeholder="请输入备注" /></Form.Item>
        </Form>
      </Modal>
    </>
  );
}
