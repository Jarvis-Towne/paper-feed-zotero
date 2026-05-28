# Manual Acceptance Checklist

## Environment

- Zotero 8 或更新版本
- 插件已通过 `npm start` 或已安装的 XPI 加载
- 不修改 Zotero 安装目录

## First-Run Flow

1. 打开 Zotero 偏好设置中的 `Paper Feed`
2. 确认可以看到：
   - 期刊 RSS 列表
   - 关键词规则
   - 自动抓取开关与抓取间隔
   - `导入旧配置`
   - `保存配置`
   - `手动抓取`
   - `复制 RSS 链接`
   - `应用到 Zotero 订阅`
3. `健康检查 URL` 和 `RSS URL` 已显示为当前实例实际端口

## Legacy Import

1. 点击 `导入旧配置`
2. 选择旧版项目目录
3. 验证：
   - 找到 `journals.dat` 时，期刊文本框被填充
   - 找到 `keywords.dat` 时，关键词文本框被填充
   - 缺少某个文件时，只更新已有来源的那部分配置
   - 缺少两个文件时，显示明确错误

## Manual Fetch

1. 点击 `手动抓取`
2. 验证：
   - `最近运行时间` 更新
   - `最近成功时间` 更新
   - `缓存条目数` 更新
   - 失败的 RSS 源会写入 `最近错误`

## Local RSS Endpoint

1. 在浏览器打开偏好页里的 `RSS URL`
2. 验证返回 RSS XML
3. 在浏览器打开 `健康检查 URL`
4. 验证返回 JSON summary
5. 对 AI 摘要，浏览器打开 `/paper-feed/ai/YYYY-MM-DD`
6. 验证返回渲染后的 HTML 摘要页面，而不是 RSS XML

## Native Zotero Feed

1. 点击 `应用到 Zotero 订阅`
2. 验证 Zotero 左侧出现对应 feed
3. 若开发实例端口变化，再次点击后应修复到当前 URL

## AI Summary Flow

1. 在 `AI 摘要配置` 中启用 AI 总结
2. 填写 OpenAI-compatible API 的 Base URL、API Key、Model
3. 在研究方向 prompt 中按重要性从高到低填写关注方向
4. 点击 `测试 AI 连接`
5. 验证：
   - 按钮旁边显示连接成功或明确错误
   - API 后台能看到一次连接测试请求
   - 缺少必要配置时不发请求，并显示缺失字段
6. 点击 `应用到 Zotero AI 订阅`
7. 验证 Zotero 左侧出现独立的 AI summary feed
8. 点击 `手动抓取`
9. 验证：
   - 普通抓取先完成，`Paper Feed` 普通订阅更新
   - API 后台出现文献批量请求
   - 候选文献超过 25 篇时，AI 阶段分批发送
   - 所有批次完成后出现最终 HTML 生成请求
   - AI summary feed 出现 `AI Literature Summary - YYYY-MM-DD` 条目
   - 条目内容是 HTML 摘要，并按用户关注方向和重要性分类
   - 每篇入选文献包含标题、作者、期刊和中文总结
   - 双击 AI summary 条目会打开带当前端口的 HTML 页面，例如 `http://127.0.0.1:23119/paper-feed/ai/YYYY-MM-DD`
   - 浏览器打开该 HTML 页面不会出现 `127.0.0.1 拒绝连接`

## AI Retry Behavior

1. 使用无效 API Key 或不可用 Base URL 触发一次 AI 失败
2. 验证：
   - 普通 RSS 抓取仍然成功
   - `最近错误` 包含 AI 失败原因
   - AI summary feed 不写入损坏条目
3. 修复 API 配置后再次点击 `手动抓取`
4. 验证：
   - 近 24 小时内此前失败的候选文献会再次提交 AI
   - 成功写入 HTML 摘要后，这些候选文献不会在后续运行中重复提交

## Restart Recovery

1. 开启自动抓取并保存
2. 重启 Zotero
3. 验证：
   - 配置仍然存在
   - 本地端点仍能访问
   - 自动抓取调度恢复

## Edge Cases

- 某个 RSS 源超时，不应阻断其他源
- 某个 RSS XML 异常，不应导致已缓存结果丢失
- 原生 Zotero feed 刷新失败时，本地 RSS 仍然可用
