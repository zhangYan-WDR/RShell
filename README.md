# RShell 终极终端 🚀

[![Platform](https://img.shields.io/badge/Platform-macOS%20%7C%20Windows-blue?style=flat-square)](#)
[![Electron](https://img.shields.io/badge/Electron-v30.5-68a063?logo=electron&style=flat-square)](#)
[![React](https://img.shields.io/badge/React-v18.3-20232a?logo=react&style=flat-square)](#)
[![License](https://img.shields.io/badge/License-MIT-brightgreen?style=flat-square)](#)

**RShell** 是一款融合了 **Termius**、**WindTerm** 与 **Xshell** 优秀桌面特性的全能型 SSH 终端与 SFTP 客户端。采用现代化的极客视觉风格（深色霓虹、玻璃内核、流光边框），具备高性能多标签页管理、智能联想自动补全、双栏可视化 SFTP 传输、系统级资源监控及跳板机穿透等核心能力，为系统管理员与开发者提供爽快的现场连接体验。

---

## ✨ 核心特色与功能亮点

### 🧠 1. 智能终端联想补全 (Terminal Suggestions)
* **光标跟随悬浮框**：在终端键入字符时，系统会自动将输入前缀与您最近的 50 条历史命令（`LocalStorage` 级持久化）进行模糊检索，并在光标下方实时显示高可用的匹配候选框。
* **高响应键位劫持**：支持使用 `↓` / `↑` 选择候选项，`Tab` 或 `Enter` 快速补全，`ESC` 隐藏浮窗，体验行云流水。
* **竞态校准与防抖**：采用独创的 **50ms/250ms 双重长度校验算法**。只在屏幕真实字符增长（如发生 `Tab` 补全）或空行时才对本地缓冲区进行校正，解决高延迟网络环境下，屏幕刷新率与按键速率不一致导致的字符重复/叠词（如 `dockcker`）痛点。
* **终端提示符兼容**：无缝适配包括 macOS 默认 Zsh `%`、`❯` 以及 Linux 常用 `#`、`$` 等各种主流终端提示符。

### 🔍 2. 全局终端内容检索 (Cmd+F / Ctrl+F)
* **快捷检索面板**：在活跃终端中按下 `Command+F` (Mac) 或 `Ctrl+F` (Windows/Linux) 会在右上方弹出精致的毛玻璃搜索栏。
* **高效率交互**：支持 `Enter` 查找下一个、`Shift+Enter` 查找上一个，且搜索栏拥有**动态位置避让机制**，在右侧快捷命令面板展开时会自动左移避让，防止遮挡。

### 🌍 3. 可视化双栏 SFTP 文件树与断点控制
* **拖拽与双栏布局**：提供本地/远程双栏独立目录浏览器，支持文件从本地到远程的直接拖拽式上传、双击下载。
* **高性能传输优化**：使用百分比整数变更节流机制（Throttle），将 SFTP 每秒上千次重绘通知缩减为最多 100 次，彻底杜绝了大文件传输时 UI 线程拥堵导致的黑屏与卡死。
* **传输队列控制**：支持查看实时传输队列，可对上传/下载任务进行**暂停、继续、取消**操作，并支持一键清除已完成任务。

### 🛡️ 4. 凭据托管与跳板机网络穿透 (Bastion Tunnel)
* **Termius 风格卡片管理**：提供可视化分组卡片，支持主机的“开发环境”、“生产环境”、“测试环境”分组筛选。
* **密码/密钥独立托管**：密码凭据与 SSH 私钥可独立在全局托管库中存储，主机配置只需关联对应的凭据 ID 即可，避免重复录入并提升数据安全性。
* **多跳跳板机隧道**：支持关联任意主机配置作为跳板机进行级联穿透，满足多重网络隔离与堡垒机内网接入需求。

### 📊 5. 实时系统遥测与空间分析 (Server Telemetry)
* **2秒级高频遥测**：建立 SSH 实时数据通道，直接解析远端 Linux `/proc` 文件系统，以折线微图展示 2s 粒度的 **CPU 负载**、**RAM 内存占比**、**网络下载/上传实时流速 (RX/TX)** 以及磁盘占用率。
* **深度目录空间分析**：支持一键触发远程目录扫描，以占比进度条清晰显示子目录的磁盘占用空间大小，便于清理垃圾文件。

---

## 🛠️ 技术栈架构

RShell 采用前沿、轻量且高度解耦的桌面端混合技术栈：

* **应用外壳 (Shell)**: [Electron v30.5](https://www.electronjs.org/) —— 负责桌面整合、多窗管理、原生系统 API 交互。
* **构建系统 (Builder)**: [Vite v5.4](https://vitejs.dev/) + [@vitejs/plugin-react](https://github.com/vitejs/vite-plugin-react) —— 毫秒级热更新，生产环境打包极致轻量。
* **前端框架 (Frontend)**: [React v18.3](https://react.dev/) —— 声明式 UI 渲染，Hooks 状态驱动。
* **终端核心 (Terminal)**: [xterm.js v5.3](https://xtermjs.org/) —— 高性能画布级渲染终端；
  * `xterm-addon-fit`：自适应终端行宽与高度调整；
  * `xterm-addon-search`：终端文本全局高性能搜索内核。
* **SSH 底层连接**: [node-ssh2 v1.17](https://github.com/mscdex/ssh2) —— 纯 JS 实现的 SSH 客户端，性能优异，支持复杂的隧道转发。
* **图标库**: [Lucide React v0.344](https://lucide.dev/) —— 现代化的扁平化极客图标。

---

## 🚀 开发者指南

### 本地开发环境运行

1. **克隆仓库并安装依赖**
   ```bash
   git clone https://github.com/zhangYan-WDR/RShell.git
   cd RShell
   npm install
   ```

2. **启动开发服务器**
   ```bash
   npm run dev
   ```
   *该命令将启动后台 Vite 服务，并拉起 Electron GUI 窗口进行实时热更新开发。*

### 生产打包构建

RShell 提供了已经配置好的免配置一键打包命令（已适配国内 npmmirror Electron 源）：

```bash
npm run package
```
* 构建成功后，安装包会生成在 `dist-package/` 目录下：
  * **macOS 平台**：将生成适用于 Apple Silicon (arm64) 的独立安装包 `RShell-1.0.0-arm64.dmg`。

---

## 📂 目录结构说明

```
RShell/
├── build/                # 应用打包所需的图标资源
├── dist/                 # 前端打包输出目录（打包时生成）
├── dist-package/         # DMG 安装包输出目录（打包时生成）
├── scripts/              # 开发与打包辅助脚本
│   ├── dev.js            # 启动开发服务器的脚本
│   └── prep-icons.js     # 图标资源预处理
├── src/                  # 前端 React 源代码目录
│   ├── components/       # 可复用组件目录
│   │   ├── SSHDashboard.jsx  # SSH 核心仪表盘（核心视图）
│   │   └── Logo.jsx          # 流光图标组件
│   ├── App.jsx           # App 入口组件
│   ├── index.css         # 主体 CSS 霓虹样式设计系统
│   └── main.jsx          # React 根节点挂载器
├── main.js               # Electron 主进程入口 (IPC通信、数据迁移)
├── preload.js            # Electron 预加载脚本 (安全桥接)
├── ssh-manager.js        # SSH 通道/SFTP传输多线程管理核心模块
├── vite.config.js        # Vite 构建配置文件
├── package.json          # 依赖管理与打包指令
└── README.md             # 项目说明文档
```

---

## 📄 开源许可证

本项目基于 **MIT License** 许可协议开源，欢迎自由分发、修改和在您的项目中使用。
