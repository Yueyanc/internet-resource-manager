# 架构基线

## 产品范围

个人互联网资源管理：记录有哪些账号、服务器、IP、域名、应用，以及它们归属
哪个项目、运行在哪里、什么时候续费。不是企业 CMDB，也不做密码管理器或远程终端。

## 部署模型

首版单实例模块化单体，Go 服务内嵌 Web，SQLite WAL 存储，后台任务在同一进程。
不强制依赖 Redis、PostgreSQL、Prometheus、Grafana 或外部监控平台。

浏览器通过 `/api/v1` REST JSON 访问服务。当前通过 TanStack Query 刷新数据；
确有实时需求时再加 SSE。Agent 后续使用独立 `/agent/v1` HTTPS 上报协议，
不会复用浏览器会话，更不会开放远程执行命令。

SQLite 只承诺个人自托管、单实例场景。多实例/多租户上线前必须评估 PostgreSQL、
任务竞争、权限隔离和数据迁移，不能视为修改连接字符串即可完成。

## 目录与依赖方向

```text
apps/web -> packages/api-client / packages/ui
apps/server -> internal/server / internal/storage / internal/webui
apps/agent -> internal/collector / internal/protocol
internal/storage -> db migrations / sqlc generated queries
```

Go 共用根 `go.mod/go.sum`；JS 使用 pnpm workspace 和唯一锁文件。
`apps/server/package.json` 对 Web 的开发依赖仅用于 Turbo 构建排序。
只有 Web 构建任务写入 `internal/webui/assets`，然后 Server 编译并内嵌产物。
不提交前端生成资源和二进制，Go 查询生成代码则提交并由 CI 检查漂移。

## 前端约定

- React、TypeScript、Vite；TanStack Router 和 Query。
- antd 主导表格、表单、弹窗、反馈；不重复安装另一套表单/表格引擎。
- `@irm/ui` 提供统一主题与辅助组件；不要把所有 antd 控件再无意义地包一层。
- Tailwind 管布局和自定义区域；CSS layer 顺序为 theme/base/antd/components/utilities。
- shadcn 只在具体需求出现时加入，并使用同源设计 Token。当前只有配置和 `cn` 工具。
- 作者添加的图标统一 `lucide-react`；允许保留 antd 内建图标。
- ESLint + Stylistic 管 JS/TS/TSX 格式，2 空格、单引号、分号、导入排序。
- Zod 校验 API 响应。不存在的后端不是成功空列表；界面区分加载、空、失败。

## 后端约定

`chi/v5` 路由、标准库 HTTP/JSON/slog、modernc SQLite、Goose 迁移、sqlc 查询。
入口只管理配置和进程生命周期。业务规则放 internal/domain，存储放 internal/storage。
HTTP DTO 与数据库模型分开，错误不向客户端泄露 SQL、内部路径或密钥。

当前健康接口查询数据库真实状态，并明确返回 auth/domainLookup/agentIngest=false。
域名输入做 IDNA 规范化、大小写统一、长度和标签校验、重复检查；此验证只说明
格式合法，不代表域名已注册、归用户所有或可以查询到到期日。

当前接口无认证，仅支持本地开发，限制 loopback Host 以防止 DNS rebinding。
Host 限制与跨站写入防护不是身份认证，不能替代登录。

## 后续模块与边界

1. 登录：首次创建管理员、Argon2id、HttpOnly/Secure 会话 Cookie、CSRF、限流。
2. 域名：OpenRDAP 优先，WHOIS 兜底；保留来源、采集时间、失败状态、人工覆盖。
   注册到期、注册商续费截止、TLS 到期分别存储；所有外部访问防 SSRF。
3. 定时任务：gocron 调度；任务状态、next_run_at、重试、租约和通知去重必须落库。
4. 通知：SMTP/go-mail 和 Webhook，先实现一个渠道，不提前引入大量平台 SDK。
5. Agent：Linux amd64/arm64，一次性注册令牌换取可撤销的机器凭据，出站 HTTPS。
   gopsutil 采集主机，Docker 官方 SDK 发现容器和 Compose 标签，不自造底层监控库。
6. 资源关系：账号/服务商/项目/服务器/IP/域名/应用分别建模，显式关系关联。
   Compose 标签等只提供候选归属，不自动把任意进程当作一个业务项目。

Agent 当前只有 `inspect` 命令，输出本机真实快照；未实现注册、上报、Docker 采集、
网络统计和 systemd 发现，不提供一个假装成功的安装脚本。
后续安装必须验证发行文件校验和与来源；Docker socket 权限需用户明确授权。
服务状态需要区分：心跳丢失、进程存在、容器运行、HTTP 健康。

账号首版保存平台、登录标识、所属资源和外部密码库链接。未来需要集成 API Token 时，
使用独立主密钥加密、日志脱敏、最小权限，密钥不能与数据库一起明文存放。
监控历史需要聚合、保留期限和容量测试，不无限累积高频样本。

## 验证层次

`pnpm check` 运行 ESLint、TS、API transport 测试、Go API/数据库测试、gofmt 与 vet。
`pnpm build` 验证 Web 和两份 Go 二进制。Playwright 验证桌面/移动端实际增删查、
API 故障状态、控制台异常和页面横向溢出。Go 交叉编译不等于 Linux 运行测试；
Docker 配置提交不等于镜像已经构建或部署。GitHub Actions 执行相应检查和容器构建。
