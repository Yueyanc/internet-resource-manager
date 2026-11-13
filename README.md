# Internet Resource Manager

面向个人的互联网资源台账与监控平台，优先低配置、自托管。

> 当前是可运行的基础架构，不是生产就绪版本。尚无登录和权限控制，
> 请勿暴露到公网或不可信局域网。默认只监听本机，并限制 loopback Host。

## 当前能力

- React 管理界面：antd 主 UI，Tailwind 辅助样式，Lucide 图标。
- 域名真实录入、列表、搜索、删除；SQLite 持久化，启动时自动迁移。
- 后端健康检查、统一 JSON 错误、Zod 响应校验。
- Agent 本机真实采集命令：主机、CPU、内存和根分区信息。
- pnpm workspace、Turborepo、统一 ESLint 格式规则、Go / Web / E2E 测试。
- 构建后的 Web 内嵌到 Go 服务，运行不需要 Node.js。

**尚未实现**：登录、RDAP/WHOIS 自动查询、DNS/HTTP/TLS 监控、通知、
Agent 注册和上报、Docker 发现、服务器/IP/账号台账、费用管理。
shadcn 的辅助接入配置已预留，没有为了占位而安装未使用的组件。

## 本地开发

需要 Node.js 24、pnpm 12、Go 1.27。精确 JS 版本见锁文件。

```sh
pnpm install --frozen-lockfile
go mod download
pnpm dev
```

- Web: http://127.0.0.1:5173
- API: http://127.0.0.1:8787/api/v1/health
- 数据库：仓库根目录 `data/irm.db`，不会提交到 Git。
- Vite 代理 `/api` 到 Go，同源调用无需额外 CORS 配置。
- Go 源码修改后需重启对应 dev 进程；目前不额外引入热重载守护程序。

## 常用命令

```sh
pnpm check          # ESLint、类型、测试、gofmt 检查、go vet
pnpm lint:fix       # 自动修复 JS/TS/TSX 代码及格式
pnpm format         # 同一套 ESLint 修复入口
pnpm build          # 生成 dist/server、dist/agent，前端已内嵌
pnpm test:e2e       # 桌面/移动端流程；首次需安装 Playwright Chromium
pnpm db:generate    # SQL 修改后重新生成 Go 查询代码
pnpm db:migrate     # 单独执行迁移；服务启动也会自动执行
./dist/server
./dist/agent inspect
```

E2E 使用独立端口 5183/8887 与 `data/e2e`，不使用日常开发数据库。
测试数据只允许出现在测试中；运行时不会初始化样例资源。

## 配置

| 环境变量 | 默认值 | 说明 |
| --- | --- | --- |
| `IRM_LISTEN_ADDR` | `127.0.0.1:8787` | Go 监听地址 |
| `IRM_DATA_DIR` | `data` | SQLite 目录，相对进程工作目录 |
| `IRM_API_TARGET` | `http://127.0.0.1:8787` | 仅 Vite 开发代理使用 |

`.env.example` 是说明模板，Go 不会自动加载 `.env`。通过终端环境或 Compose
注入变量，不把密钥加入 Vite 的 `VITE_*` 环境变量。

## 本机容器运行

```sh
docker compose -f deploy/compose.yaml up --build -d
```

访问 http://127.0.0.1:8787。Compose 只发布到宿主机 loopback，数据存放在
命名卷 `irm_data`。容器内部监听全部接口不代表可以安全公网部署。
当前阶段不要配置公网反向代理。容器不包含 Node.js，且以非 root 用户运行。

备份当前 SQLite 时应先停止服务再复制数据库文件，或使用 SQLite 一致性备份
接口，不能只在运行时随意复制主文件而忽略 WAL。后续凭据加密接入后还必须
独立备份主密钥。不要把数据库或主密钥推送到 GitHub。

架构与路线见 [docs/architecture.md](docs/architecture.md)。
