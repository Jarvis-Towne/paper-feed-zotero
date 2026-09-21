# ACS 订阅与元数据修复

日期：2026-09-21

## 修复内容

1. 自动将 ACS 旧版 `action/showFeed?type=axatoc&jc=...` 地址转换为官方 `/rss/{jc}/asap.xml`；`etoc` 转为 `/rss/{jc}/currentIssue.xml`。无需手动重填订阅列表。
2. 单独解析新版 ACS RSS，兼容其非标准 DOI 命名空间，并保留期刊、卷期页码。不会把频道编辑邮箱当作论文作者。
3. 输出 RSS 写入 Zotero 支持的 `dc:creator`、`dc:identifier` 和标准 PRISM 元数据。作者列表分项保存、输出，避免破坏姓名中的逗号。
4. 对保留条目中已有 DOI、缺作者的论文，查询 Crossref 精确 DOI 元数据；每轮最多 50 条，结果写入缓存。未收录 DOI 不会阻塞后续批次；网络失败保留已抓取论文并报告问题。
5. 再次抓取时补充已有缓存的缺失信息，保留原 GUID，不计为新论文。已有作者的论文不重复请求 Crossref。

## 安装与使用

在 Zotero 的插件管理页面选择“从文件安装插件”，安装项目根目录的 `paper-feed-v0.2.0.xpi`，按提示重启 Zotero。执行 Paper Feed 的手动抓取/缓存重建，刷新 Paper Feed 订阅。

历史缺失较多时，后续刷新继续分批补全。来源与 Crossref 均没有的信息保持缺失；已保存到普通文库的论文不会被此修复自动改写。

## 验证范围

- 本次提交的独立源码副本中，52 项单元测试通过，覆盖地址迁移、ACS XML、DOI 提取、作者与元数据缓存/输出、重复条目更新、Crossref 404/失败与分批推进。本地含其他尚未提交修改的工作区共 64 项测试通过。
- 配置清单内 12 个 ACS ASAP 订阅和 JACS 当期订阅实网验证通过，全部返回条目均读到 DOI。
- 两篇真实样本分别补到 8 位、6 位作者，输出 XML 作者数量与 DOI 一致。
- TypeScript 检查和 XPI 构建通过，修改的源码及新测试 ESLint 通过。原有 RSS 测试中的控制字符正则仍有一项已有 lint 报错。
- 网络测试采用 Node HTTP + XML DOM 适配器调用插件实现，尚未在 Zotero 桌面内完成安装及界面验收。

可重跑网络检查（在 `paper-feed` 内）：`node --import tsx tests/zotero/acsFeed.live.ts`。

依据：[ACS 官方 RSS 列表](https://pubs.acs.org/pages/rss)、[Zotero 官方 RSS 解析器](https://github.com/zotero/zotero/blob/main/resource/feeds/FeedProcessor.mjs)。
