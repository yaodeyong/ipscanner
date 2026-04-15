# IPScanner

内网 IP 管理系统（React + Node.js + SQLite）。

## 特点

- **零数据库配置**：使用 SQLite，无需安装 MySQL 或其他数据库服务
- 启动时自动建表，数据保存在本地 `backend/data/ipscanner.db` 文件中
- 支持网络扫描、IP 分配管理、冲突检测
- 提供「网络排障」专页：一键诊断、自动原因提示、快照对比（有线/无线）

## 快速启动

1. 安装依赖（自动安装前后端）：

```bash
npm install
```

2. 启动（一条命令同时起后端 + 前端）：

```bash
npm run dev
```

首次启动会自动创建数据库文件和所有表，无需手动初始化。

在浏览器打开前端后，侧边栏进入 **系统设置**，可使用 **网络诊断** 在页面上查看 ping/TCP/HTTPS 等结果（与终端 `npm run net:diag` 同源）。

## 可选配置

根目录 `.env` 文件支持以下配置（均为可选）：

```env
PORT=3001                              # 后端端口
DB_PATH=./backend/data/ipscanner.db    # 数据库文件路径

# 扫描（可选）：提高发现 MAC、减少「在线却显示离线」
# SCAN_PING_TIMEOUT_MS=1200            # ping 单次等待毫秒，默认 800
# SCAN_SUBNET_PREFIXES=192.168.10      # 要预热的 /24 前三段，多个用逗号
# SCAN_PING_BATCH_SIZE=24              # 每批并发 ping 数
# SCAN_SKIP_WARM=0                     # 设为 1 则不做整段 ping（不推荐）
```

说明：扫描依赖本机 **ARP**。会先对网段内 `.1`～`.254` 做 **ping 预热** 再读 `arp -a`；若仍误判，多半是 **ICMP 被禁** 或 **不在同一二层网段**，可适当增大 `SCAN_PING_TIMEOUT_MS` 并确认 `SCAN_SUBNET_PREFIXES` 与现场网段一致（如 `192.168.10`）。

## 导入 OUI 厂商数据（可选）

```bash
cd backend
npm run import:oui
```

## 当前进度

- 已完成 M1 基础骨架：
  - 后端服务启动、SQLite 数据库自动初始化
  - V1 API 路由
  - 前端管理界面基础壳
  - 网络扫描、设备发现、冲突检测
