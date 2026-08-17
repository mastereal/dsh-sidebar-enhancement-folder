# dsh-sidebar-enhancement-folder

给 [dsh-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar) 的**每个文件编辑标签页**加一个「打开所在文件夹」按钮：按钮内嵌在该标签自己的工具栏里（md/html 在「预览/编辑」旁边，PDF/图片/二进制查看器在标题栏），**永远指向该标签自己的文件**，不依赖哪个窗格是活动的。

> **English**: One "open containing folder" button per editor tab in dsh-better-sidebar, embedded in that tab's own toolbar. Each button targets its own tab's file regardless of the active pane.

---

## ⚠️ 免责声明（请先读）

**本插件是 vibecoding（与 AI 协作、边聊边写）出来的作品，作者纯自用，没有经过大规模测试，也没有在其他人的环境里验证过。**

- 它直接操作 better-sidebar 的 DOM（向编辑器工具栏插入按钮、MutationObserver 自愈），**better-sidebar 升级后可能失效**；
- 安装与使用**有风险**：可能出现按钮错位、残留等问题，请自行评估后再装；
- 作者不对任何数据丢失、功能异常或使用后果负责；
- 如果遇到问题，欢迎提 issue，但**不保证修复时间**。

> **English**: This plugin was **vibecoded** (built collaboratively with AI). It is for **personal use**, not battle-tested, and injects buttons into better-sidebar's DOM — **install at your own risk**. No warranty of any kind.

---

## 功能

- **每标签一个按钮**：内嵌在工具栏行内（md/html 在预览/编辑旁边；PDF/图片/二进制在标题栏），非活动标签也有效，切换到它就显示
- **指向自己的文件**：按钮路径取自该标签自己的 `editorTitle`，没有"活动窗格"判断逻辑
- **跟随布局**：按钮活在窗格自己的 DOM 里，拖标签/拆分窗格/调宽度都跟着走；自愈机制每轮清理重复/残留按钮
- **Windows 定位可靠**：`explorer /select` 参数经过真实窗口标题验证（`windowsVerbatimArguments` + 引号），支持带空格/中文的文件名；文件缺失时自动上溯到最近存在的目录
- **宿主侧路径解析**：剥离 `file://` 前缀，相对路径按会话工作目录解析

## 依赖

- DeepSeek Harness（DSH）Web GUI
- [dsh-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar) ^0.12（依赖其 `paneTab`/`editorTitle`/`editorModeToggle` 类名后缀）
- **仅 Windows**（使用 `explorer.exe /select`）

## 安装

```sh
# 方式一：GitHub release tarball
dsh plugin --profile web add https://github.com/mastereal/dsh-sidebar-enhancement-folder/archive/refs/tags/v1.0.1.tar.gz

# 方式二：npm（发布后可用）
dsh plugin --profile web add dsh-sidebar-enhancement-folder
```

装完重启 `dsh web`，浏览器**硬刷新（Ctrl+Shift+R）**，并**关闭所有旧 DSH 窗口/标签页**（旧实例会残留旧代码，造成按钮重复）。

## 使用

在侧边栏打开任意文件，每个编辑标签页的工具栏里会出现一个文件夹按钮；点击即在系统资源管理器中打开该文件所在文件夹并选中文件。

## 排障

控制台日志前缀 `[dsh-sidebar-enhancement-folder]`：

- `client loaded (v1.0.1)` —— 浏览器端已加载
- `paneTabs: editors=N buttons=M` —— 按钮同步计数
- `reveal clicked: <路径>` —— 发送给宿主的路径

宿主窗口会打印 `[dsh-sidebar-enhancement-folder] reveal select/open <路径>`。定位到错误文件夹时，看 `reveal clicked` 一行就知道标签携带的路径是什么。

## 工作原理（简）

better-sidebar 会把所有标签的内容都渲染进 DOM（非活动标签只是 `display:none`），且每个 editor 标签必有 `span[class*="editorTitle"][title=路径]`。客户端给每个 `paneTab` 的工具栏嵌入一个按钮、从该 paneTab 自己的 `editorTitle` 读取路径，再由防抖自愈（store 订阅 + MutationObserver + 2 秒心跳）清理重复/残留并在布局变化后重建。宿主路由为 `/dsh-sidebar-enhancement-folder/reveal`。

## 许可

MIT © 2026 mastereal

---

*Vibecoded with DeepSeek Harness · 纯自用作品，谨慎安装*
