# Internet Resource Manager

面向个人的互联网资源台账与监控平台，优先低配置、自托管。

> 当前是 v0.1 本机私有工作台，不是生产就绪版本。已接入单管理员登录，
> 但尚未完成公网安全审查、完整授权和通用限流。请勿暴露到公网或不可信局域网。
> 默认只监听本机，并始终限制 loopback Host。

## 当前能力

- React 管理界面：antd 主 UI，Tailwind 辅助样式，Lucide 图标。
- 首次创建唯一管理员、Argon2id 密码哈希、7 天 HttpOnly / SameSite=Strict 会话、退出撤销。
- 登录连续失败 5 次后冷却 60 秒；初始化后关闭初始化接口，不开放注册。
- 两级折叠菜单、资源计数、全局新建；移动端抽屉导航。
- 全局双境毛玻璃主题：白日模式采用暖白雪花石膏与香槟青玉微光 + 石墨深灰主按钮，黑夜模式采用碳黑曜石烟熏毛玻璃与翡翠极光微光 + 暗色翡翠边框玻璃主按钮（由 `@irm/ui` 统一注入 Ant Design v6 Token 与全局磨砂卡片/表格/浮层/表单组件样式，保留 1x 桌面精细字号）。
- 使用 antd 两级 Menu 和原生收起浮层，不保留定制胶囊导航；左下角展开/收起和明暗切换，右上角当前用户与语言菜单。
- 明暗切换使用太阳/月亮图标按钮，不使用 Switch；带悬浮提示和当前状态语义。
- 简体中文 / English 界面，antd 控件、日期、金额与校验提示同步切换；语言、主题、菜单状态保存在本机浏览器。
- 订阅卡只展示必要信息，完整账号、支付方式、备注、涨价提示和原币/本位币金额保留在详情抽屉。
- 新建订阅采用三步向导弹窗（选择服务 → 方案与日期 → 续费与渠道），内置 66 项国内外常用服务预设（B 站、QQ 音乐、网易云音乐、88VIP、百度网盘、ChatGPT、Claude、Cursor、iCloud+、Spotify、Netflix、云主机与域名等）、常见档位一键填入与扣款渠道快捷标签；支持第二步直接保存或自定义空白订阅。
- 本地打包预设品牌 SVG 图标（66 枚订阅预设 + 20 枚账号与邮箱/社媒专用图标 + 12 枚网络运营商/组网专用图标 + 8 枚云厂商与虚拟化/NAS 专用图标，离线可用，运行时不请求外部 favicon 服务），未关联预设时按名称智能回退或显示分类图标。
- 账号与身份台账（`/accounts`）与端到端加密保险箱：覆盖国内外邮箱、社媒与即时通讯、多区服生态通行证（Apple/Google/Steam 等）、开发者与云、AI 工具、影音游戏与支付账号；采用三步预设向导创建（内置 37 项国内外平台预设与多区服快捷切换），支持卡片/表格双视图、登录标识一键防窥脱敏、上游救援邮箱与 SSO 枢纽绑定及影响面筛选、防回收保活打卡顺延、国内实名占用盘点，并与在用订阅双向参照。内置零知识端到端加密保险箱（浏览器本地 Web Crypto `PBKDF2-SHA256` + `AES-256-GCM` 双层密钥包裹，支持跨浏览器主密码解锁、应急恢复密钥重置与无操作自动锁定），一站式托管账号登录密码（含随机强密码生成器）、实时 RFC 6238 2FA 动态验证码（TOTP 倒计时与一键复制）及一次性恢复码，服务端与 SQLite 仅保存密文；严格禁止存储服务器 SSH 密码或完整证件/银行卡号。
- 服务器与算力台账及一键探针监控（`/servers`）：覆盖云主机 / VPS、独立服务器、NAT 共享 IP 主机、家庭内网 HomeLab（PVE / Mac mini 等）与私有存储 NAS（群晖 / Unraid / TrueNAS）；默认提供**一键命令自动建档与常驻监控**（15 分钟一次性令牌注册 `irm-agent`，SHA-256 校验安装，自动采集并回填 CPU 型号与核数、内存/Swap、NVMe/SSD/HDD/RAID 根分区、公网/组网 IP、SSH 端口及基于 RDAP ASN 的服务商与机房地区，每 5 秒出站上报实时 CPU/Load、实时上下行网速、对齐重置日的防重启周期累计流量、在线时长与 TCP 连接数，并支持显式授权的 `/var/run/docker.sock` 只读容器与 Compose 标签发现）以及**零网络回连 POSIX 只读快照粘贴建档**（`IRM1:...`，无需向本机开放任何入站端口），同时提供精简至 3 项核心输入的**极简手工录入**（内置 17 项云厂商与设备预设、智能单框地址识别、同事务同步新建或绑定周期订阅）。严格区分「实时在线」「心跳丢失（绝不将失联伪造为宿主机关机离线）」「快照建档」与未接入状态；仅利用端口与用户名生成本地 `ssh` 命令，严禁存储 SSH 密码或私钥，不开放远程命令执行。
- IP 与节点台账（`/ips`）：面向出口纯净度与解锁画像的 IPv4 / IPv6 / CIDR 管理页面，覆盖住宅原生家宽、海外云与常规 VPS、弹性公网 IP、国内入口与专线中转、家庭动态公网及 Tailscale/WireGuard 内网组网；内置 22 项商家与线路预设、卡片/表格双视图、IP 防窥掩码（`154.12.*.*`）、7 项 AI 与流媒体解锁矩阵（ChatGPT / Claude / Gemini / Netflix / Disney+ / YouTube / TikTok）、RDAP / PTR / Cymru DNS 归属查询（支持手动字段锁定）、防 SSRF 公网单 IP 按需连通性探测（TCP / HTTP / HTTPS，内网与保留地址段自动标记跳过）、周期性纯净度复检打卡，以及与在用订阅、解析域名、固定登录账号的显式关联及到期退订联动预警；严禁存储代理连接串（vmess/vless/ss/trojan 等）、SSH 密码或私钥。
- 订阅新建、编辑、搜索、分类与状态筛选、排序、停用归档与恢复、归档后永久删除。
- 月/季/半年/年/两年/三年/自定义天数与一次性买断；确认付款后顺延一周期，处理月底及闰年。
- 多币种参考折算、月均与年度预算、本月计划待付、30 天到期提醒、月历与分类支出。
- 本位币与手动汇率设置，支持 CNY / USD / HKD / EUR / GBP / JPY。
- 域名真实录入、列表、搜索、删除；SQLite 持久化，启动时自动迁移。
- 后端健康检查、统一 JSON 错误、Zod 响应校验。
- Agent 出站采集与上报（`apps/agent`）：支持 `inspect`（含 `-compact` 输出 `IRM1:` 快照）、`enroll`、`report`、`run` 守护上报模式，构建时同步纯 Go 交叉编译 `dist/irm-agent-linux-amd64` 与 `dist/irm-agent-linux-arm64`。
- pnpm workspace、Turborepo、统一 ESLint 格式规则、Go / Web / E2E 测试。
- 构建后的 Web 内嵌到 Go 服务，运行不需要 Node.js。

**尚未实现**：实时汇率、真实扣款同步与支付流水、邮件/Webhook 告警通知、管理员密码修改/找回与登录 2FA、
多用户与细粒度授权、API Token 加密保险箱、域名 RDAP/WHOIS 自动到期查询与 DNS/TLS 定时监控、
IP 流媒体解锁自动代理脚本探测与后台定时巡检、服务器监控历史时序留存图表与 systemd 单元发现、手机卡与 eSIM 台账。
用户头像当前使用真实登录用户名的首字母，不生成虚构人像；尚无头像上传功能。
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
- 第一次打开自动进入 `/setup` 创建管理员，以后进入 `/login`；默认工作页为 `/subscriptions`。
- Go 源码修改后需重启对应 dev 进程；目前不额外引入热重载守护程序。

## 常用命令

```sh
pnpm check          # ESLint、类型、测试、gofmt 检查、go vet
pnpm lint:fix       # 自动修复 JS/TS/TSX 代码及格式
pnpm format         # 同一套 ESLint 修复入口
pnpm build          # 生成 dist/server、dist/agent 及 dist/irm-agent-linux-{amd64,arm64}，前端已内嵌
pnpm test:e2e       # 桌面/移动端流程；首次需安装 Playwright Chromium
pnpm db:generate    # SQL 修改后重新生成 Go 查询代码
pnpm db:migrate     # 单独执行迁移；服务启动也会自动执行
./dist/server
./dist/agent inspect
./dist/agent inspect -compact
```

E2E 使用独立端口 5183/8887，每次创建 `data/e2e/<运行时间>` 空库，不使用日常开发数据库。
测试数据只允许出现在测试中；运行时不会初始化样例资源。

## 费用口径

金额以整数百分之一货币单位持久化，卡片保留原币种。内置汇率只是可编辑的起始
参考值，不是实时或经过日期核验的市场报价；所有汇率先以 CNY 为锚点，再折算至本位币。
月均与年度预算只统计未归档的周期订阅，一次性项目不计入周期预算。
自定义天数按 365.2425 天/年折算；本月待付和日历从已记录的下次到期日推演后续周期，
同月多次扣款分别计数。这些都是计划值，不是支付流水，也不证明已经扣款或取消订阅。
逾期不会自动改写日期；只有主动确认付款才会顺延。顺延操作带旧日期校验，防止重复请求
把同一笔账单推进两次。涨价金额仅作预警，不自动覆盖当前价格。

## 账户安全边界

管理员和会话保存在 SQLite；会话仅存令牌 SHA-256 摘要，密码使用 Argon2id
（64 MiB、2 次、1 lane）。本机 HTTP Cookie 不设 Secure；直接 HTTPS 请求会设 Secure。
浏览器写请求受标准库跨源保护与 SameSite Cookie 约束，数据接口均验证会话。
登录限流是单进程全局冷却，重启后重置，不能替代公网防护；尚无自动密码恢复入口。
不要把用户名密码备注当保险箱使用，不要在支付方式中记录完整卡号或安全码。

## 配置

| 环境变量 | 默认值 | 说明 |
| --- | --- | --- |
| `IRM_LISTEN_ADDR` | `127.0.0.1:8787` | Go 管理台与主服务监听地址（默认仅放行 loopback Host，可通过 `IRM_ALLOWED_ORIGINS` 显式授权反向代理域名） |
| `IRM_ALLOWED_ORIGINS` | 空 | 逗号分隔的受信任源（如 `https://irm.example.com`），用于反向代理下放行对应 `Host` 与同源 `CrossOriginProtection` |
| `IRM_TRUST_PROXY` | `false` | 设为 `true` 时信任来自本机/内网反向代理转发的 `X-Forwarded-Proto`（自动启用 `Secure` Cookie）与 `X-Real-IP` |
| `IRM_ADMIN_USER` / `IRM_ADMIN_PASSWORD` | 空 | 可选：首次启动空库时幂等初始化唯一管理员账号（已初始化时自动跳过，不覆盖现有账户数据） |
| `IRM_AGENT_LISTEN_ADDR` | 空（复用主监听端口） | 可选：在 Tailscale / 内网地址单独开启仅挂载 `/agent/v1` 的探针上报监听，不暴露 Web UI 与 `/api/v1` |
| `IRM_AGENT_BIN_DIR` | `dist` | 存放预编译 `irm-agent` 二进制的目录，供 `/agent/v1/binary/{os}/{arch}` 下发与 SHA-256 校验 |
| `IRM_DATA_DIR` | `data` | SQLite 目录，相对进程工作目录 |
| `IRM_API_TARGET` | `http://127.0.0.1:8787` | 仅 Vite 开发代理使用（代理 `/api` 与 `/agent`） |

`.env.example` 是说明模板，Go 不会自动加载 `.env`。通过终端环境或 Compose
注入变量，不把密钥加入 Vite 的 `VITE_*` 环境变量。

## 容器运行与 CI/CD 自动部署

本机容器运行：

```sh
docker compose -f deploy/compose.yaml up --build -d
```

访问 http://127.0.0.1:8787。Compose 只发布到宿主机 loopback，数据存放在
命名卷 `irm_data`。容器内包含预编译的 `server` 与 `irm-agent-linux-{amd64,arm64}`，不包含 Node.js，且以非 root 用户运行。

CI/CD 流水线（GitHub Actions）：

- `.github/workflows/ci.yaml`：`main` 推送与 PR 自动执行 `pnpm check`、`sqlc` 漂移校验、`pnpm build`、Playwright E2E 与 Docker 构建验证。
- `.github/workflows/deploy-alpha.yaml`：当在 `main` 分支打 `v*` 标签并推送时，自动校验该标签归属 `main` 分支、执行质量门禁、构建带版本号与双架构探针的镜像推送至 GHCR，并通过 SSH 滚动部署至 Alpha 服务器（`deploy/compose.alpha.yaml`）。

备份当前 SQLite 时应先停止服务再复制数据库文件，或使用 SQLite 一致性备份
接口，不能只在运行时随意复制主文件而忽略 WAL。不要把数据库或主密钥推送到 GitHub。

架构与路线见 [docs/architecture.md](docs/architecture.md)。
