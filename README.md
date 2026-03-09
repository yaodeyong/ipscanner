# IPScanner

内网 IP 管理系统（React + Node.js + SQLite）。

## 特点

- **零数据库配置**：使用 SQLite，无需安装 MySQL 或其他数据库服务
- 启动时自动建表，数据保存在本地 `backend/data/ipscanner.db` 文件中
- 支持网络扫描、IP 分配管理、冲突检测

## 快速启动

1. 安装依赖（自动安装前后端）：

```bash
npm install
```

2. 启动：

```bash
npm run dev
```

首次启动会自动创建数据库文件和所有表，无需手动初始化。

## 可选配置

根目录 `.env` 文件支持以下配置（均为可选）：

```env
PORT=3001                              # 后端端口
DB_PATH=./backend/data/ipscanner.db    # 数据库文件路径
```

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
