import { useEffect, useState } from "react";
import { Button, Input, Modal, Table, Tag, Space, Form, message } from "antd";
import { SearchOutlined } from "@ant-design/icons";
import axios from "axios";

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

export default function ConflictsPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filterResolved, setFilterResolved] = useState("0");
  const [resolveModal, setResolveModal] = useState({ open: false, record: null });
  const [resolveForm] = Form.useForm();

  const loadConflicts = async () => {
    setLoading(true);
    try {
      const res = await axios.get("/api/conflicts", { params: { resolved: filterResolved } });
      setRows((res.data?.data?.items || []).map((r) => ({ ...r, key: r.id })));
    } catch {
      message.error("加载冲突列表失败");
    } finally {
      setLoading(false);
    }
  };

  const handleResolve = async () => {
    const record = resolveModal.record;
    if (!record) return;
    const values = await resolveForm.validateFields();
    try {
      await axios.put(`/api/conflicts/${record.id}/resolve`, {
        resolution_note: values.resolution_note || "",
        keep_mac: values.keep_mac || null,
      });
      message.success("冲突已解决");
      setResolveModal({ open: false, record: null });
      resolveForm.resetFields();
      await loadConflicts();
    } catch {
      message.error("解决冲突失败");
    }
  };

  useEffect(() => {
    loadConflicts();
  }, [filterResolved]);

  const columns = [
    { title: "ID", dataIndex: "id", key: "id", width: 60 },
    {
      title: "IP 地址", dataIndex: "ip_address", key: "ip_address", width: 130,
      filterDropdown: ({ setSelectedKeys, selectedKeys, confirm, clearFilters }) => (
        <div style={{ padding: 8 }}>
          <Input placeholder="搜索 IP" value={selectedKeys[0]}
            onChange={(e) => setSelectedKeys(e.target.value ? [e.target.value] : [])}
            onPressEnter={() => confirm()} style={{ marginBottom: 8, display: "block", width: 160 }} />
          <Space>
            <Button type="primary" size="small" icon={<SearchOutlined />} onClick={() => confirm()}>搜索</Button>
            <Button size="small" onClick={() => { clearFilters?.(); confirm(); }}>重置</Button>
          </Space>
        </div>
      ),
      onFilter: (value, record) => String(record.ip_address || "").includes(value),
      filterIcon: (filtered) => <SearchOutlined style={{ color: filtered ? "#1677ff" : undefined }} />,
    },
    {
      title: "冲突 MAC 地址", dataIndex: "mac_addresses", key: "mac_addresses", width: 280,
      render: (macs) => (macs || "").split(",").map((m, i) => <Tag key={i} color="orange">{m.trim()}</Tag>),
    },
    { title: "首次检测", dataIndex: "detected_at", key: "detected_at", width: 170, render: formatDateTime },
    { title: "最后检测", dataIndex: "last_detected", key: "last_detected", width: 170, render: formatDateTime },
    {
      title: "状态", dataIndex: "resolved", key: "resolved", width: 80,
      render: (v) => v ? <Tag color="green">已解决</Tag> : <Tag color="red">未解决</Tag>,
    },
    { title: "解决时间", dataIndex: "resolved_at", key: "resolved_at", width: 170, render: formatDateTime },
    { title: "解决说明", dataIndex: "resolution_note", key: "resolution_note", ellipsis: true },
    {
      title: "操作", key: "actions", width: 90,
      render: (_, record) => record.resolved ? null : (
        <Button size="small" type="primary" onClick={() => {
          const macs = (record.mac_addresses || "").split(",").map((m) => m.trim()).filter(Boolean);
          setResolveModal({ open: true, record });
          resolveForm.setFieldsValue({ resolution_note: "", keep_mac: macs[0] || "" });
        }}>解决</Button>
      ),
    },
  ];

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <Space>
          <span style={{ fontWeight: 500 }}>筛选：</span>
          {[
            { label: "未解决", value: "0" },
            { label: "已解决", value: "1" },
            { label: "全部", value: "" },
          ].map((opt) => (
            <Button key={opt.value} type={filterResolved === opt.value ? "primary" : "default"} size="small"
              onClick={() => setFilterResolved(opt.value)}>{opt.label}</Button>
          ))}
        </Space>
        <Button onClick={loadConflicts}>刷新</Button>
      </div>

      <div className="table-scroll-wrap">
        <Table className="compact-table" columns={columns} dataSource={rows} loading={loading}
          scroll={{ x: "max-content", y: "calc(100vh - 300px)" }}
          pagination={{ showSizeChanger: true, pageSizeOptions: ["20", "50", "100"], showTotal: (t) => `共 ${t} 条` }}
          rowClassName={(_, index) => (index % 2 === 0 ? "row-even" : "row-odd")}
        />
      </div>

      <Modal open={resolveModal.open} title={`解决冲突 - ${resolveModal.record?.ip_address || ""}`}
        onCancel={() => { setResolveModal({ open: false, record: null }); resolveForm.resetFields(); }}
        onOk={handleResolve} okText="确认解决" cancelText="取消"
      >
        <Form form={resolveForm} layout="vertical">
          <Form.Item label="保留的 MAC 地址" name="keep_mac"
            extra={`当前冲突 MAC: ${resolveModal.record?.mac_addresses || ""}`}>
            <Input placeholder="输入要保留的 MAC 地址，留空保持当前值" />
          </Form.Item>
          <Form.Item label="解决说明" name="resolution_note">
            <Input.TextArea rows={3} placeholder="请输入解决说明（可选）" />
          </Form.Item>
        </Form>
      </Modal>
    </>
  );
}
