# Paper Feed for Zotero：自动化文献精准筛选与推送工具

[![Zotero](https://img.shields.io/badge/Zotero-8-green?style=flat-square&logo=zotero&logoColor=CC2936)](https://www.zotero.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-AGPL--3.0-orange?style=flat-square)](./LICENSE)

当前版本：`0.2.0`。

这是一个 Zotero 插件项目，将“期刊 RSS 抓取 + 关键词规则筛选 + 可选 AI 总结 + 本地 RSS 推送 + Zotero 原生订阅接入”整合到 Zotero 内部完成。用户不再依赖 GitHub Actions、GitHub Pages 或外部脚本，可以直接在 Zotero 中维护配置、执行抓取、查看运行状态并订阅筛选结果。
如果你不想本地抓取，请使用基于GitHub Actions在线运行的 [paper feed](https://github.com/Jarvis-Towne/paper-feed) 。

---

## 功能特性

- 在 Zotero 偏好设置页维护期刊 RSS 列表与关键词规则。
- 支持手动抓取和基于时间间隔的自动抓取。
- 通过本地 HTTP 端点输出 RSS 订阅源。
- 可选 AI 总结：按您感兴趣的研究方向 prompt，对当前文献池中尚未总结过的文献生成独立 HTML 订阅；支持每隔若干小时或每天固定时间运行。
- AI 摘要条目会指向当前 Zotero 本地服务端口的 HTML 页面，双击条目可在浏览器中查看完整排版。

---

## 快速上手

1. 下载 xpi 文件拖入 Zotero 的 `工具-帮助界面` 安装本插件。
2. `编辑-设置-paper feed` 打开本插件界面。
3. 划拉到第二个卡片-订阅设置，填写偏好参数，点击 `应用到 Zotero 订阅` 创建订阅。
4. 在配置卡片中配置目标期刊的 RSS 链接和关键词，期刊名可留空。
5. 勾选自动抓取，填写间隔时间。
6. 保存配置后点击 `手动抓取`，等待 1-2 分钟，时长取决于你填写的 RSS 链接数量。
7. 成功后打开 Zotero 左侧文献管理栏，划拉到最后即可看到新增的订阅。
8. 享受你的阅读。

### AI 总结

AI 总结默认关闭。不启用时，原有抓取、缓存和普通 RSS 订阅流程不受影响。

1. 在设置页的 `AI 摘要配置` 中勾选启用。
2. 填写 OpenAI-compatible Chat Completions API 的 Base URL、API Key 和 Model。
3. 选择 AI 总结时间：默认每隔 24 小时总结一次，也可以改为每天固定时间开始总结。
4. 在研究方向 prompt 中按重要性从高到低写入感兴趣的研究方向。
5. 点击 `测试 AI 连接`，按钮旁会显示连接状态。
6. 点击 `应用到 Zotero AI 订阅` 创建或修复第二个 Zotero feed。
7. AI 总结触发时，会从当前文献池中选择尚未成功提交过 AI 的候选文献生成 AI HTML 摘要。
8. AI 摘要条目右侧摘要栏可直接预览；双击条目会在浏览器中打开该 HTML 摘要页面。

---

## 工作流程

1. 用户在 Zotero 插件设置页配置期刊 RSS 源和关键词规则。
2. 插件抓取远程 RSS 数据并完成标准化、去重与关键词匹配。
3. 命中的文献结果写入插件的 JSON 快照。
4. 本地服务生成普通 RSS 输出。
5. 若启用 AI 总结，插件按配置的间隔或每日固定时间，从缓存中选择尚未成功提交过 AI 的候选文献，按批次提交给 AI 分类和总结；所有批次完成后，再汇总生成最终 HTML 摘要。
6. Zotero 或其他 RSS 阅读器通过本地地址读取普通订阅源和 AI 摘要订阅源。
7. AI 摘要订阅中的条目链接会被输出为当前 Zotero 本地服务端口的 HTML 页面，避免端口变化导致 `127.0.0.1` 无法连接。

## 本地端点

- 普通 RSS：`/paper-feed/rss/default`
- AI 摘要 RSS：`/paper-feed/rss/ai`
- AI 摘要 HTML：`/paper-feed/ai/YYYY-MM-DD`

完整 URL 中的端口由 Zotero 本地服务决定，通常类似 `http://127.0.0.1:23119/...`。如果 Zotero 重启后端口变化，点击 `应用到 Zotero 订阅` 和 `应用到 Zotero AI 订阅` 可修复两个订阅的 URL。

---

## 注意事项

- 期刊 RSS 链接可在各大期刊官网找到。
- 本仓库提供了作者收集的计算材料学相关期刊 RSS 链接合集（见 RSS 目录），欢迎其他领域用户贡献各自领域期刊 RSS 链接。
- 如有配置文件，点击 `导入配置`，选择导入配置即可。
- 本地 RSS 地址只在 Zotero 运行期间可访问。
- 自动抓取同样依赖 Zotero 运行，不会在后台独立常驻。
- [paper feed](https://github.com/Jarvis-Towne/paper-feed) 项目可基于 GitHub Actions 实现云端抓取，但仍需打开 Zotero 更新订阅。
- AI 摘要调用失败不会阻断普通 RSS 抓取。失败的候选文献不会被标记为已提交 AI，下次抓取会继续重试。

---

## 技术栈

- TypeScript
- zotero-plugin-scaffold
- zotero-plugin-toolkit
- Zotero 8 API

---

## 许可证

本项目使用 [AGPL-3.0-or-later](./LICENSE) 许可证。

## 友情链接

`https://linux.do/`
