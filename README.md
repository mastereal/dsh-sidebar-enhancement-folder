# sidebar-enhancement-folder

**Reveal the containing folder** of any file open in a
[dsh-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar) editor
tab — one small button per tab, embedded in that editor's own toolbar
(next to the built-in 预览/编辑 toggle for markdown/html; in the title bar
for PDF/image/binary viewers). The button always points at **that tab's own
file**, regardless of which pane is active.

Works for files with spaces / non-ASCII names (the Windows `explorer /select`
argument is built with `windowsVerbatimArguments` and verified against real
window titles).

## Features

- One outline folder button per editor tab, embedded inline in the toolbar
- Each button targets its own tab's file — no active-window logic
- PDF / image / binary viewers supported (button in the title bar)
- Follows every layout change (drag, split, resize) because it lives inside
  the pane's own DOM; a self-heal pass removes any leftover/duplicate button
  after rebuilds
- Host-side path resolution: strips `file://`, resolves relative paths
  against the session cwd, walks up to the nearest existing directory when
  the file is missing

## Requirements

- DeepSeek Harness (DSH) web GUI
- [dsh-better-sidebar](https://github.com/omdsh-dev/DSH-better-sidebar) ^0.12

## Installation

From the plugin market (once listed) or via CLI:

```sh
# tarball from a GitHub release
dsh plugin --profile web add https://github.com/mastereal/sidebar-enhancement-folder/archive/refs/tags/v1.0.0.tar.gz

# or from npm (when published)
dsh plugin --profile web add sidebar-enhancement-folder
```

Restart `dsh web` and hard-refresh the browser (Ctrl+Shift+R). Close older
DSH tabs/windows first so stale plugin instances cannot duplicate buttons.

## Usage

Open any file in the sidebar editor. A small folder button appears in the
toolbar of every editor tab (also on hidden tabs — it shows when the tab
becomes active). Click it to open the containing folder in the OS file
manager, with the file selected.

Windows only (uses `explorer.exe /select`).

## Troubleshooting

Console logs are prefixed `[sidebar-enhancement-folder]`:

- `client loaded (v1.0.0)` — the browser bundle is running
- `paneTabs: editors=N buttons=M` — button sync counters
- `reveal clicked: <path>` — the exact path sent to the host

The host prints `[sidebar-enhancement-folder] reveal select/open <path>` on
every request. If a click opens the wrong folder, the `reveal clicked` line
shows which path the tab carried.

## How it works

better-sidebar renders every tab's content in the DOM (hidden tabs are just
`display:none`), and every editor tab carries
`span[class*="editorTitle"][title=<path>]`. The client embeds one button per
`paneTab` into its toolbar row, reads the path from that paneTab's own
`editorTitle`, and a debounced self-heal pass (store subscription + host
MutationObserver + 2s heartbeat) removes duplicates/strays and re-binds after
layout changes. The host route is `/sidebar-enhancement-folder/reveal`.

## License

MIT © 2026 mastereal

---

## 中文说明

**功能**：better-sidebar 的每个文件编辑标签页的工具栏里都有一个"打开所在
文件夹"按钮（md/html 在预览/编辑旁边，PDF 等查看器在标题栏），点击即在
系统资源管理器中打开该文件所在文件夹并选中文件。按钮永远指向**该标签自己
的文件**，不依赖活动窗格；布局调整后自动跟随并清理残留。

**安装**：见上方 Installation（市场收录后也可在插件市场一键安装）。

**仅 Windows**。控制台日志前缀 `[sidebar-enhancement-folder]`，宿主窗口
会打印每次定位的目标路径。
