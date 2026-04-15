import { useMemo, useState } from "react";
import { Layout, Menu, Typography } from "antd";
import {
  LaptopOutlined,
  WarningOutlined,
  FileTextOutlined,
  SettingOutlined,
  ToolOutlined,
} from "@ant-design/icons";
import OverviewPage from "./pages/OverviewPage";
import ConflictsPage from "./pages/ConflictsPage";
import LogsPage from "./pages/LogsPage";
import SettingsPage from "./pages/SettingsPage";
import NetworkTroubleshootPage from "./pages/NetworkTroubleshootPage";

const { Header, Sider, Content } = Layout;
const { Title, Text } = Typography;

const menuItems = [
  { key: "overview", icon: <LaptopOutlined />, label: "IP 地址总览" },
  { key: "conflicts", icon: <WarningOutlined />, label: "冲突列表" },
  { key: "logs", icon: <FileTextOutlined />, label: "日志查询" },
  { key: "net-troubleshoot", icon: <ToolOutlined />, label: "网络排障" },
  { key: "settings", icon: <SettingOutlined />, label: "系统设置" },
];

const pageComponents = {
  overview: OverviewPage,
  conflicts: ConflictsPage,
  logs: LogsPage,
  "net-troubleshoot": NetworkTroubleshootPage,
  settings: SettingsPage,
};

function App() {
  const [activeMenu, setActiveMenu] = useState("overview");

  const pageTitle = useMemo(() => {
    const current = menuItems.find((item) => item.key === activeMenu);
    return current ? current.label : "IP 地址总览";
  }, [activeMenu]);

  const PageComponent = pageComponents[activeMenu] || OverviewPage;

  return (
    <Layout style={{ height: "100vh", overflow: "hidden" }}>
      <Sider theme="light" width={200}>
        <div className="logo-wrap">
          <Title level={4} style={{ margin: 0 }}>IPScanner</Title>
          <Text type="secondary">内网 IP 管理系统</Text>
        </div>
        <Menu
          mode="inline"
          selectedKeys={[activeMenu]}
          items={menuItems}
          onClick={({ key }) => setActiveMenu(key)}
        />
      </Sider>

      <Layout style={{ overflow: "hidden" }}>
        <Header className="top-header">
          <Title level={4} style={{ margin: 0 }}>{pageTitle}</Title>
        </Header>

        <Content className="main-content">
          <PageComponent />
        </Content>
      </Layout>
    </Layout>
  );
}

export default App;
