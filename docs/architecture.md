# 架构基线

## 产品范围

个人互联网资源管理：记录有哪些账号、服务器、IP、域名、应用，以及它们归属
哪个项目、运行在哪里、什么时候续费。不是企业 CMDB，也不做密码管理器或远程终端。

## 部署模型

首版单实例模块化单体，Go 服务内嵌 Web，SQLite WAL 存储，后台任务在同一进程。
不强制依赖 Redis、PostgreSQL、Prometheus、Grafana 或外部监控平台。

浏览器通过 `/api/v1` REST JSON 访问服务（始终受 `localOnly` loopback Host 与 `CrossOriginProtection` 保护）。当前通过 TanStack Query 刷新数据；
确有实时需求时再加 SSE。Agent 使用独立 `/agent/v1` 单向出站上报协议（仅接受一次性注册令牌与可撤销机器 Bearer 凭据，支持通过 `IRM_AGENT_LISTEN_ADDR` 在 Tailscale/组网地址单独监听而不暴露管理台），
绝不复用浏览器会话，更不开放远程执行命令或反向通道。

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
- `@irm/ui` 提供统一主题与基础重置；不要把所有 antd 控件再无意义地包一层。
- `apps/web/src/features` 按 auth / subscriptions / accounts / servers / domains / ips / preferences 纵向组织；
  `layouts` 持有工作台与全局新建，路由守卫统一处理初始化、登录和过期会话。
- 业务 CSS 位于 Web，费用、账号、服务器与 IP 节点指标派生逻辑分别位于 subscriptions/utils、accounts/utils、servers/utils 与 ips/utils，组件不承担日期推演。
- Tailwind 管布局和自定义区域；CSS layer 顺序为 theme/base/antd/components/utilities。
- shadcn 只在具体需求出现时加入，并使用同源设计 Token。当前只有配置和 `cn` 工具。
- 作者添加的界面操作图标统一 `lucide-react`；允许保留 antd 内建图标；订阅、账号、服务器与网络运营商的品牌标志作为静态本地 SVG 资源存放在 `features/subscriptions/assets/brands/`、`features/accounts/assets/brands/`、`features/servers/assets/brands/` 与 `features/ips/assets/brands/`，不运行时外链第三方图标服务。
- ESLint + Stylistic 管 JS/TS/TSX 格式，2 空格、单引号、分号、导入排序。
- Zod 校验 API 响应。不存在的后端不是成功空列表；界面区分加载、空、失败。

工作台使用 Ant Design 原生样式：默认浅色、默认蓝色，ConfigProvider 只切换明暗算法和语言，
不覆盖组件配色、圆角、字号或控件高度。汇总采用 Card / Statistic，侧面分区采用标准 Card。
自定义布局、弹窗与日历通过同步到 `:root` 的 antd 实际 token 渲染，避免 Portal 样式缺失与主题漂移。
`app/preferences-context` 与 `app/app-providers` 管理语言、明暗和菜单展开状态，不引入额外状态库。
只在本机 localStorage 保存这三项非敏感偏好，不保存会话、密码、资源内容或真实账户资料。
`app/messages` 提供类型检查的中英词典，antd locale 与 dayjs、Intl 格式同步；资源名称和用户备注不翻译。
服务端协议仍使用稳定错误码，前端在英文界面按错误码提供可理解的失败提示，不将错误改成成功。

列表首屏仅显示品牌标志/名称、分类与续费方式副标题、原币价格/周期和续费状态胶囊，完整记录通过详情抽屉展示。
新建订阅采用居中三步向导弹窗（预设搜索/分类点选、档位填入与日期推算、续费意向与扣款渠道），编辑沿用右侧抽屉。
编辑、确认付款顺延、管理链接与归档后删除位于卡片操作菜单；完整分类和状态筛选保留在筛选面板。
日历点选与月份切换不变，最近三项日程可展开为整月清单；分类图形按真实月均值绘制，不显示虚构趋势。
头像使用当前管理员用户名首字母，暂不提供上传或用户资料编辑。

侧栏为默认容器背景，Logo 位于侧栏顶部。导航统一使用 antd Menu：展开显示两级菜单，
收起使用 inlineCollapsed 的原生浮层，不再保留定制胶囊组件。默认展开菜单。
明暗模式以带名称提示和 `aria-pressed` 的太阳/月亮图标按钮切换，继续复用同一持久化偏好。
恢复默认样式后，主题与导航宽度使用 v2 本机偏好，从浅色和展开状态开始；旧 v1 深色/窄栏
设置不再决定新页面的初始外观，语言偏好与服务端业务数据不受影响。

## 后端约定

`chi/v5` 路由、标准库 HTTP/JSON/slog、modernc SQLite、Goose 迁移、sqlc 查询。
入口只管理配置和进程生命周期。域名规则放 internal/domainname，订阅校验和日期规则
放 internal/subscription，账号与身份校验及保活顺延规则放 internal/account，
密码与令牌散列放 internal/auth，存储放 internal/storage。
HTTP DTO 与数据库模型分开，错误不向客户端泄露 SQL、内部路径或密钥。

当前健康接口查询数据库真实状态，返回 `auth=true`、`agentIngest=true`、`domainLookup=false`。
域名输入做 IDNA 规范化、大小写统一、长度和标签校验、重复检查；此验证只说明
格式合法，不代表域名已注册、归用户所有或可以查询到到期日。

所有资源、菜单计数、汇率接口均需数据库会话；仅 health、auth/status、setup、login、logout
公开。auth/status 会验证 Cookie，但不会向未登录者暴露用户名。setup 在管理员存在后返回
409，管理员与首次会话同事务落库，数据库单例约束防止第二个管理员。
Cookie 使用 HttpOnly / SameSite=Strict、7 天有效期，直接 TLS 时附加 Secure；
只存令牌 SHA-256 摘要。退出先撤销数据库会话再清理 Cookie。
Argon2id 使用 64 MiB / 2 次 / 1 lane；登录全局互斥限制并发内存，连续 5 次失败冷却
60 秒（内存状态，重启重置）。应用仍限制 loopback Host 防 DNS rebinding，并由标准库
CrossOriginProtection 阻止跨站写入。没有把 Host/CSRF 防护当作身份认证。

## 订阅与费用

`00002_auth`、`00003_subscriptions`、`00004_subscription_preset` 与 `00010_subscription_accounts` 通过 Goose 增量迁移，不重建原域名表。
查询只在 db/queries 编辑，通过 pnpm db:generate 生成并检查入库。
订阅保存可选 `preset_key` 标识符（仅限 `[a-z0-9_-]`，自定义项为空串），前端优先按 `preset_key` 匹配本地 SVG 品牌图标，旧记录可按名称安全回退。
订阅通过双可空外键 `account_id`（权益归属账号）与 `billing_account_id`（代扣 / 商店账号，如 App Store 内购、PayPal、88VIP 主号，均配置 `ON DELETE SET NULL`）显式关联 `accounts` 实体，并保留 `account` 文本作为可选补充备注；保存订阅时支持在同一 SQLite 事务内通过 `createAccount` / `createBillingAccount` 原子快速新建并绑定上游账号，当两处指向同一账号时自动去重收敛为主归属账号。
订阅金额使用整数百分之一货币单位，不以浮点数持久化。HTTP 严格校验币种、周期、
分类、日期、金额、外键有效性与 URL 协议；管理网址只在浏览器打开，后端不请求该网址。
月末顺延使用目标月最后一天截断，非 Go AddDate 默认溢出行为。顺延只推进一周期，
不擅自跳过未确认的逾期账单；条件更新检查客户端旧日期，重复请求返回 409。
归档项不参与有效计数、费用统计或日历，无法顺延，但可以编辑恢复。

汇率持久化在 preferences，CNY 为固定锚点 1，可选择任意支持币种为本位币。
初始数值明确是手动参考而非实时行情。前端纯函数计算月均、年度、剩余月度计划、
分类占比和日历投影；买断不计月均，年均按月均乘 12，自定义周期按 365.2425 天/年。
计划扣款从记录的到期日逐周期投影，不代表付款记录，也不会自动更新到期日期。
API 失败时统计显示不可用而非 0，归档与支付确认均由用户显式操作。

## 账号与身份台账及零知识加密保险箱

`00005_accounts` 增量创建 `accounts` 表，支持记录国内外平台身份、生态与区服码、账号角色（核心枢纽 / 主力日常 / 备用小号）、主登录方式、两步验证与恢复码状态、国内实名主体标签、防回收保活周期（月/季/半年/年/自定义天数）及外部密码库引用位置。
`recovery_account_id` 与 `sso_account_id` 采用可空自引用外键（`ON DELETE SET NULL`），存储层阻止自环引用与无效 ID，支持在界面统计核心身份枢纽的下游影响面与双向跳转。
保活打卡（`POST /api/v1/accounts/{id}/checkin`）与订阅顺延采用一致的月末日期截断与 `expectedDate` 乐观并发校验。
`00007_account_vault` 增量创建物理隔离的 `vault_config` 与 `account_secrets`（`ON DELETE CASCADE`）密文表：采用浏览器端零知识加密方案，由主密码与应急恢复密钥分别通过 Web Crypto `PBKDF2-SHA256`（600,000 次迭代）派生包裹密钥加密随机 256 位 `vault_key`；账号密码、`otpauth://` / Base32 TOTP 种子与一次性恢复码在浏览器内存以 `AES-256-GCM`（绑定 `accountId` 作为 AAD 防密文串改调包）加密后上传，Go 后端与 SQLite 全程不接触明文或主密码，换任意浏览器凭同一主密码即可拉取盐值与包裹密钥在内存解锁，并在前端按 RFC 6238 实时计算 6/8 位动态验证码（15 分钟无操作自动清空内存密钥锁定）。
常规备注未加密，后端继续对实名备注与手机提示拦截 15 位以上连续数字以防误填完整身份证或银行卡号，并严格禁止存储服务器 SSH 密码；安全中心网址仅允许无内嵌凭据的 HTTP/HTTPS 链接并在浏览器端打开。

## IP 与节点台账

`00006_ips` 增量创建 `ips` 主表以及 `ip_domains`、`ip_accounts` 多对多关联表，并预留可空 `subscription_id`（关联服务器或宽带费用订阅）与 `server_id`（供后续 `/servers` 模块对接）。
`internal/ipaddr` 使用标准库 `net/netip` 对 IPv4、IPv6 及 CIDR 做严格解析与规范化（包含 IPv4-in-IPv6 展开、6to4 `2002::/16`、NAT64 `64:ff9b::/96`、CGNAT `100.64.0.0/10`、RFC1918、回环、链路本地 `169.254.0.0/16` 等非公网分类识别），并拦截代理连接串（`vmess://`、`vless://`、`ss://`、`trojan://`、`hysteria2://` 等）、PEM 私钥或明文密码字段。
元数据归属查询（`POST /api/v1/ips/lookup-preview` 与 `POST /api/v1/ips/{id}/lookup`）仅针对公网可路由地址发起受 SSRF 传输层校验保护的 OpenRDAP HTTPS 查询（禁重定向或受检重定向目标 IP 必须为公网全局单播）并辅以 PTR 与 Team Cymru DNS TXT ASN 兜底；同步时保留 `lookup_source`、`lookup_checked_at`、`lookup_error`，且绝不覆盖用户加入 `manual_locks_json` 的人工锁定字段，查询失败时也不清空已有记录。
按需连通性探测（`POST /api/v1/ips/{id}/probe`）严格限制在公网单主机 IP（`/32` 或 `/128`），直接按已校验的 `netip.AddrPort` 拨号（零 DNS 解析，杜绝 DNS Rebinding），HTTP/HTTPS 探测使用 `http.ErrUseLastResponse` 禁止跟随重定向；私有网段、CGNAT 或 CIDR 子网统一标记为 `skipped_non_public`，未探测状态保持 `unchecked`，不将未探测或内网跳过伪造为在线或离线。
当前尚未实现定时后台巡检与通过远程代理出口自动实测流媒体解锁状态（流媒体与 AI 解锁画像目前由人工核验录入并配合周期复检提醒维护）。

## 服务器台账与一键探针监控

`00008_servers` 增量创建 `servers` 主表与 `server_domains` 多对多关联表，并复用 `00006_ips` 预留的 `ips.server_id` 列实现服务器与 IP 节点的双向绑定；`00009_server_agents` 增量创建 `agent_enroll_tokens`（15 分钟过期、单次消费、仅存令牌 SHA-256 摘要）与 `server_agents`（机器令牌 SHA-256 摘要、最新遥测快照、防重启月周期累计流量及 Docker 容器 JSON）。
`internal/serverhost` 对 IPv4/IPv6/内网 IP 使用 `net/netip.ParseAddr` 严格解析规范化，对主机名、地区码与 `ssh_user` 过滤空白与 Shell 元字符，并在所有字段中拦截 PEM / OpenSSH 私钥头与内嵌凭据 URL；系统不存储任何 SSH 密码、私钥或开启远程终端，前端仅利用端口与用户名生成本地 `ssh` 命令供用户复制。
费用模型以可选 `subscription_id`（`ON DELETE SET NULL`）为唯一账单事实源：支持无周期账单（自有硬件/永久免费机，可记录独立试用或过保提醒日）、关联已有订阅、或在保存服务器的同一 SQLite 事务内原子创建并绑定新订阅；汇总月均基础设施成本时对多台机器共享的同一订阅 ID 自动去重。

接入链路支持双轨工作流与精简手工兜底：
1. **常驻出站探针（`irm-agent`）**：管理员在 `/api/v1/servers/enroll-tokens` 生成一次性 `irm_enroll_` 令牌；目标机执行 `/agent/v1/install.sh`，脚本先下载 `/agent/v1/binary/{os}/{arch}.sha256` 并在运行前严格核验二进制 SHA-256 校验和，再调用 `POST /agent/v1/enroll` 换取可独立吊销（`DELETE /api/v1/servers/{id}/agent`）的 `irm_agent_` 凭据并配置 systemd / nohup 常驻 `run` 守护。对于网卡仅挂载 RFC1918 私网 IP 的 VPC 云主机，服务端从真实 TCP `RemoteAddr`（绝不信任可伪造的 `X-Forwarded-For`）识别公网出口 IP，结合受 SSRF 保护的 OpenRDAP 自动推断服务商预设与机房地区，并以非破坏方式回填未人工锁定的硬件/系统/网络字段。周期流量按服务器 `traffic_reset_day` 计算账期键 `YYYY-MM-DD`，通过单调计数器正增量累加（宿主机重启计数器归零时保留已有累计值继续累加）。
2. **零回连只读快照（`IRM1:`）**：当本机运行在 `127.0.0.1` 且远端机器无法回连时，提供纯 POSIX `/bin/sh` 单行只读采集脚本输出 `IRM1:<base64>` 压缩令牌，粘贴至 `POST /api/v1/servers/import-snapshot` 即可零手工填表完成自动建档（标记为 `snapshot` 快照建档状态），也支持本机终端通过 `ssh user@host 'sh -s' | irm-agent enroll -oneshot` 管道直传。
3. **特权与状态诚实边界**：Docker 容器与 Compose 标签发现通过标准库只读请求 `/var/run/docker.sock` 实现，默认关闭且界面明确提示 Docker Socket 高权限风险，仅在管理员显式开启 `--docker` 时采集；探针状态严格区分 `online`（实时在线）、`stale`（超过 `max(3 * interval, 90s)` 未上报，明确标注「心跳丢失」且绝不伪造为宿主机已关机离线）、`snapshot`（一次性快照建档）与 `none`（仅手工台账）。

## 后续模块与边界

1. 安全增强：完整授权、通用限流、密码修改与恢复、2FA、公网安全审查；当前不支持公网。
2. 域名：OpenRDAP 优先，WHOIS 兜底；保留来源、采集时间、失败状态、人工覆盖。
   注册到期、注册商续费截止、TLS 到期分别存储；所有外部访问防 SSRF。
3. 定时任务：gocron 调度；任务状态、next_run_at、重试、租约和通知去重必须落库。
4. 通知：SMTP/go-mail 和 Webhook，先实现一个渠道，不提前引入大量平台 SDK。
5. 监控演进：历史时序采样聚合与保留期清理、systemd 单元状态发现、HTTP 应用层健康检查（需继续严格区分心跳丢失、容器运行与 HTTP 健康）。
6. 资源关系：账号/服务商/项目/服务器/IP/域名/应用分别建模，显式关系关联。
   Compose 标签只展示容器归属提示，不自动把任意进程当作一个业务项目。

账号首版已支持平台、区服、登录标识、上游救援邮箱/SSO 枢纽关联、安全保活姿态和外部密码库位置引用。未来需要集成 API Token 时，
使用独立主密钥加密、日志脱敏、最小权限，密钥不能与数据库一起明文存放。
监控历史需要聚合、保留期限和容量测试，不无限累积高频样本。

订阅一期尚不提供实时汇率、扣款同步、支付流水、提醒邮件或自动取消。
规划中菜单（手机卡 / eSIM）不加载假数据，不提供假装可用的页面。

## 验证层次

`pnpm check` 运行 ESLint、TS、API transport 与费用计算测试、Go 认证/订阅/域名 API、
数据库重开持久化与日期边界测试、gofmt 与 vet。
`pnpm build` 验证 Web 和两份 Go 二进制。Playwright 验证桌面/移动端实际增删查、
API 故障状态、控制台异常和页面横向溢出。Go 交叉编译不等于 Linux 运行测试；
Docker 配置提交不等于镜像已经构建或部署。Playwright 使用每轮全新独立空库，测试
首次初始化/登录/退出、订阅编辑/归档/顺延、月历/汇率、域名旧流程、故障与桌面/移动端溢出。
GitHub Actions 执行相应检查和容器构建。
