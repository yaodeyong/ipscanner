import { useEffect, useState } from "react";
import { Button, Input, Select, Space, Table, Tag } from "antd";
import { SearchOutlined } from "@ant-design/icons";
import axios from "axios";

function formatDateTime(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

const actionLabels = {
  create: "新增IP",
  update: "编辑IP",
  release: "释放IP",
  resolve_conflict: "解决冲突",
  scan_apply: "扫描写入",
};

const actionColors = {
  create: "green",
  update: "blue",
  release: "orange",
  resolve_conflict: "purple",
  scan_apply: "cyan",
};

export default function LogsPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pagination, setPagination] = useState({ current: 1, pageSize: 50, total: 0 });
  const [filterAction, setFilterAction] = useState("");
  const [filterIp, setFilterIp] = useState("");

  const loadLogs = async (page = pagination.current, pageSize = pagination.pageSize) => {
    setLoading(true);
    try {
      const params = { page, pageSize };
      if (filterAction) params.action = filterAction;
      if (filterIp) params.ip = filterIp;
      const res = await axios.get("/api/logs", { params });
      const data = res.data?.data || {};
      setRows((data.items || []).map((r) => ({ ...r, key: r.id })));
      setPagination({ current: page, pageSize, total: data.pagination?.total || 0 });
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLogs(1, pagination.pageSize);
  }, [filterAction]);

  const columns = [
    { title: "ID", dataIndex: "id", key: "id", width: 60 },
    { title: "时间", dataIndex: "created_at", key: "created_at", width: 170, render: formatDateTime },
    { title: "用户", dataIndex: "user", key: "user", width: 100 },
    {
      title: "操作", dataIndex: "action", key: "action", width: 120,
      render: (v) => <Tag color={actionColors[v] || "default"}>{actionLabels[v] || v}</Tag>,
    },
    {
      title: "IP 地址", dataIndex: "ip_address", key: "ip_address", width: 130,
      filterDropdown: ({ setSelectedKeys, selectedKeys, confirm, clearFilters }) => (
        <div style={{ padding: 8 }}>
          <Input placeholder="搜索 IP" value={selectedKeys[0]}
            onChange={(e) => setSelectedKeys(e.target.value ? [e.target.value] : [])}
            onPressEnter={() => { setFilterIp(selectedKeys[0] || ""); confirm(); loadLogs(1, pagination.pageSize); }}
            style={{ marginBottom: 8, display: "block", width: 160 }} />
          <Space>
            <Button type="primary" size="small" icon={<SearchOutlined />}
              onClick={() => { setFilterIp(selectedKeys[0] || ""); confirm(); loadLogs(1, pagination.pageSize); }}>搜索</Button>
            <Button size="small" onClick={() => { clearFilters?.(); setFilterIp(""); confirm(); loadLogs(1, pagination.pageSize); }}>重置</Button>
          </Space>
        </div>
      ),
      filterIcon: (filtered) => <SearchOutlined style={{ color: filtered ? "#1677ff" : undefined }} />,
    },
    { title: "详情", dataIndex: "details", key: "details", ellipsis: true },
  ];

  return (
    <>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <Space>
          <span style={{ fontWeight: 500 }}>操作类型：</span>
          <Select value={filterAction} onChange={(v) => setFilterAction(v)} style={{ width: 140 }}
            options={[
              { label: "全部", value: "" },
              { label: "新增IP", value: "create" },
              { label: "编辑IP", value: "update" },
              { label: "释放IP", value: "release" },
              { label: "解决冲突", value: "resolve_conflict" },
              { label: "扫描写入", value: "scan_apply" },
            ]}
          />
        </Space>
        <Button onClick={() => loadLogs(1, pagination.pageSize)}>刷新</Button>
      </div>

      <div className="table-scroll-wrap">
        <Table className="compact-table" columns={columns} dataSource={rows} loading={loading}
          scroll={{ x: "max-content", y: "calc(100vh - 300px)" }}
          pagination={{
            ...pagination, showSizeChanger: true,
            pageSizeOptions: ["20", "50", "100", "200"],
            showTotal: (t) => `共 ${t} 条`,
          }}
          onChange={(next, _f, _s, extra) => {
            if (extra.action === "paginate") loadLogs(next.current, next.pageSize);
          }}
          rowClassName={(_, index) => (index % 2 === 0 ? "row-even" : "row-odd")}
        />
      </div>
    </>
  );
}
