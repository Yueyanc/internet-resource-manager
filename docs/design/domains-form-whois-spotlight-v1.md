# Domains: WHOIS Spotlight v1

## Design
- Design-only concept generated with built-in `image_gen`; no application source changes.
- Reference: `subscription-form-minimal-sheet-v1.png` (Concept A).
- Warm Alabaster workspace (#F6F5F1), milky modal (#FBFAF7), fine white edge, soft shadow, teal emphasis, graphite action.
- Domain-first borderless monospace hero, one read-only WHOIS ribbon, two frameless account/purpose rows.
- Metadata, counts and readiness are illustrative design content, not real RDAP results or evidence of implemented backend behavior.
- Production must distinguish pending, failed and successful RDAP results; never infer success from missing data.

## Visual Review
- Inspected generated PNG: 1536 x 1024 (3:2), full-bleed without browser chrome.
- Domain, registrar, expiry, DNSSEC, nameserver and Chinese property rows are readable; no boxed input or textarea.
- Modal preserves reference warmth, restrained glass treatment, calm spacing and active Domains sidebar.
- Minor generated deviation: the optional remarks link uses a small note icon rather than the requested plus. Treat the specified `+ 备注说明` as authoritative for implementation.
- This is a bitmap design artifact, not browser or functionality verification. Application checks/build/Playwright were not run because no application code was changed.

## Generation Prompt

```text
Create a high-fidelity ui-mockup PNG, full-bleed 3:2 desktop composition, 1536x1024. Use the supplied image as the exact STYLE REFERENCE: Concept A Warm Alabaster frosted glass, not its subscription content. Preserve the same quiet Chinese typography, warm off-white workspace #F6F5F1, modal #FBFAF7, white 1px specular inner edge, diffuse soft shadow, translucent milky glass. No browser chrome, device frame, watermark, arrows, decorative orbs, or marketing text.

Replace the workspace with 资源管家 domain inventory. Left sidebar has 域名 clearly ACTIVE, plus 服务器, IP 与节点, 订阅管理, 账号与身份. Background has softly blurred domain summary cards and a domain table, quiet utilitarian layout. Center a COMPACT modal, approximately 540 logical px wide with 22px corners (about 690 physical px wide in this composition), centered in generous whitespace. Modal sharp and crisp against blurred workspace.

This is a jewel-like Raycast / Linear Spotlight Domain Card, not a traditional form. NO boxed text inputs, textareas, stacked labeled fields or heavy borders. Exact modal hierarchy:
1 top quiet caption 添加域名 at left and thin × close at right.
2 hero: small rounded emerald/teal globe-DNS icon tile at left; next to it large bold BORDERLESS MONOSPACE craftstudio.io. Below domain, subtle subtitle 输入主域名，自动通过 RDAP 同步注册商与到期日. At right discreet emerald status RDAP 已就绪. Carefully fit subtitle and badge, no overlaps. Can put subtitle under whole hero row to fit.
3 one refined frosted Live WHOIS/DNS preview ribbon, subtle 8px rounded surface, not a form. Top metadata: Cloudflare, Inc. and emerald dot DNSSEC 已启用 at left; at right 2027-08-19 到期 and pale warm amber pill 278 天后. Use two well-aligned compact rows if necessary for calm legibility. Underneath one small muted monospace line EXACTLY: NS · kiki.ns.cloudflare.com . No extra text after nameserver.
4 delicate hairline then exactly two frameless inline property rows, quiet left labels and right aligned values with little chevrons:
注册商账号     Cloudflare · ops@craftstudio.io ▾
域名用途       主力生产 · API 与控制台 ▾
5 generous quiet footer: left muted + 备注说明; right 取消 then matte graphite #18181B pill 添加域名.
Prioritize readable precise Chinese and monospace domain, calm whitespace and reference fidelity. No manual registrar/expiry fields. All metadata is a designed example, a successful fetched-preview state.
```

