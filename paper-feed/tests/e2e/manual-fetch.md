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
   - `保存并抓取`
   - `复制 RSS 链接`
   - `创建/修复 Zotero 订阅`
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

1. 点击 `保存并抓取`
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

## Native Zotero Feed

1. 点击 `创建/修复 Zotero 订阅`
2. 验证 Zotero 左侧出现对应 feed
3. 若开发实例端口变化，再次点击后应修复到当前 URL

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
