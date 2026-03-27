# Paper Feed for Zotero：自动化文献精准筛选与推送工具

[![Zotero](https://img.shields.io/badge/Zotero-8-green?style=flat-square&logo=zotero&logoColor=CC2936)](https://www.zotero.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![License](https://img.shields.io/badge/License-AGPL--3.0-orange?style=flat-square)](./LICENSE)

这是一个 Zotero 插件项目，将“期刊 RSS 抓取 + 关键词规则筛选 + 本地 RSS 推送 + Zotero 原生订阅接入”整合到 Zotero 内部完成。用户不再依赖 GitHub Actions、GitHub Pages 或外部脚本，可以直接在 Zotero 中维护配置、执行抓取、查看运行状态并订阅筛选结果。
如果你不想本地抓取，请使用 [paper feed](https://github.com/Jarvis-Towne/paper-feed) 。

---

## 功能特性

- 在 Zotero 偏好设置页维护期刊 RSS 列表与关键词规则。
- 支持手动抓取和基于时间间隔的自动抓取。
- 将命中文献缓存为插件自己的本地数据，不写入 Zotero 主数据库。
- 通过本地 HTTP 端点输出 RSS 订阅源。
- 一键创建或修复 Zotero 原生订阅。
- 在设置页查看服务状态、RSS 地址、最近运行时间和错误信息。

---
## 快速上手

1. 下载 xpi 文件拖入 Zotero 的 `工具-帮助界面` 安装本插件。
2. `编辑-设置-paper feed` 打开本插件界面。
3. 划拉到第二个卡片-订阅设置，填写偏好参数，点击应用到 Zotero ，创建订阅。
4. 在配置卡片中配置目标期刊的 RSS 链接和关键词，期刊名可留空。
5. 勾选自动抓取，填写间隔时间。
6. 保存设置-手动抓取，等待1-2分钟，时长取决于你填写的RSS链接数量。
7. 成功后打开 Zetero 左侧文献管理栏，划拉到最后即可看到新增的订阅。
8. 享受你的阅读。

---

## 工作流程

1. 用户在 Zotero 插件设置页配置期刊 RSS 源和关键词规则。
2. 插件抓取远程 RSS 数据并完成标准化、去重与关键词匹配。
3. 命中的文献结果写入插件的 JSON 快照。
4. 本地服务生成 RSS 输出。
5. Zotero 或其他 RSS 阅读器通过本地地址读取筛选后的订阅源。

---

## 注意事项

- 期刊 RS S链接可在各大期刊官网找到。
- 本仓库提供了作者收集的计算材料学相关期刊 RSS 链接合集（见 RSS 目录），欢迎其他领域用户贡献各自领域期刊 RSS 链接。
- 如有配置文件，点击 `导入配置`，选择导入配置即可。
- 本地 RSS 地址只在 Zotero 运行期间可访问。
- 自动抓取同样依赖 Zotero 运行，不会在后台独立常驻。
- [paper feed](https://github.com/Jarvis-Towne/paper-feed) 项目可云端抓取，但仍需打开 Zotero 更新订阅。

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
