# IP 与节点 · RDAP Sheet V1

## Design Direction

- Design-only raster concept for the Create/Edit composer; the pictured state is Create.
- Reference: `subscription-form-minimal-sheet-v1.png` (Concept A).
- Canvas: 1536 x 1024, full-bleed 3:2 desktop workspace.
- Warm Alabaster workspace `#F6F5F1`, milky `#FBFAF7` glass sheet, white specular edge, soft floating shadow, approximately 600 logical px width and 22px radius.
- Signature detail: one recessed identity ribbon replaces separate ASN/geography/network-class inputs. Tiny locks indicate an override affordance.
- Large borderless IP hero, emerald region/risk accents, four frameless property rows, quiet optional footer links, graphite `#18181B` save action.
- Edit uses the same composition with existing values and an edit caption; no separate edit-state image generated.

## Visual Inspection

Inspected the reference before generation and visually inspected both generated passes. The final PNG has sharp foreground Chinese text and IP numerals, balanced whitespace, active IP navigation, a restrained identity ribbon, and no stacked rectangular inputs. The first pass misrendered the port as 445; a focused image edit corrected it to 443. Final foreground content is readable and does not overlap. Raster colors and font metrics are visual targets, not measured implementation tokens.

## Evidence Boundary

This is a static generated mockup, not an implemented screen or a successful live lookup. All IP, ASN, geography, residential/risk, unlock, host, and background status values are illustrative requested design content, not verified network facts. RDAP alone must not be assumed to establish city accuracy, residential purity, streaming unlock, or reachability. Implementation must distinguish independent data sources, pending/error/unknown states, and manual overrides rather than treating lookup failures as success.

No application source changed. Runtime checks, builds, and Playwright were not run because this deliverable is design-only.

## Generation Prompt

Built-in image_gen, with Concept A supplied as the visual reference:

```text
Create a polished full-bleed 3:2 desktop UI design mockup, ideally 1536x1024. Use the supplied image as the exact visual style reference, NOT as content to retain. Match Concept A Warm Alabaster Frosted Glass: workspace #F6F5F1, modal #FBFAF7 milky translucent warm-white glass, fine 1px white specular inner edge, soft floating shadow, delicate Chinese typography, understated dark graphite text. No browser chrome, device frame, watermark, annotations or callout arrows. No gradients or decorative blobs.

Background: light Chinese personal resource-management workspace titled "资源管家", same sidebar arrangement as reference; sidebar navigation "IP 与节点" ACTIVE. Main workspace is IP node cards softly blurred behind the focused modal. No subscription calendar. Centered approximately 600 logical px wide modal, 22px corner radius, with ample air and impeccable readable text. Render modal contents sharp, not blurry. Layout near reference proportions with enough horizontal room for all text, no overlaps.

Modal content exact:
Top small quiet caption left "新建 IP 节点", fine × close icon right.
Hero row: left rounded emerald-tinted square tile "JP"; next to it large crisp BORDERLESS MONOSPACE IP input text "154.21.88.142", beneath muted subtitle "东京家宽出口 · 输入 IP 自动解析归属". Right compact quiet pill button "↻ 自动查询 RDAP", underneath subtle emerald pill "原生住宅 · 低风险 ▾". Fit hero naturally across width, IP text about 25 logical px, no rectangular input borders.
Signature network identity ribbon under hero: ONE calm shallow recessed frosted strip, containing inline groups with tiny subtle lock icons beside the groups for manual override: "AS2516 · KDDI Corporation" then "日本 东京" then "ISP 家宽原生". Use fine typography and restrained spacing. This must NOT become five separate inputs.
One delicate hairline below.
Four spacious frameless key-value property rows, subtle thin line icons on left beside labels, right aligned inline controls:
"流媒体解锁" -> small clean pills "Netflix 原生" emerald tint, "ChatGPT 可用" emerald tint, "Disney+" neutral tint, small + icon. No tag cloud.
"节点定位" -> one soft pill segmented control with "主力出口" selected white inset, "流媒体落地", "备用".
"连通探测" -> text "TCP · 443 端口 ▾"
"承载宿主" -> text "Tokyo-Edge-01 · DMIT ▾"
Quiet footer with optional muted text links on left "反向解析 PTR"  "绑定域名"  "关联账号"  "纯净度备注". Right "取消" plus matte graphite #18181B pill "保存节点". Footer links may use smaller fine type but remain legible.
EXTREME RESTRAINT. Absolutely no traditional stacked rectangular form textboxes for ASN, City, Country, PTR. No extra labels, no verbose helper paragraphs, no cluttered tags. Match reference fine Chinese sans typography, elegant baseline alignment and measured negative space. Foreground glass near-white rather than gray or tan. Preserve Chinese text verbatim and monospace numerals crisp. This is a design concept with illustrative values, not proof of an actual RDAP lookup.
```

## Correction Prompt

```text
Edit this UI mockup with one extremely precise text correction only: the connectivity property row currently says 'TCP · 445 端口'. Change it to EXACTLY 'TCP · 443 端口 ▾'. Last port digit must be 3, not 5. Preserve all other image content, typography, layout, frosted glass, spacing, Chinese labels and colors unchanged. Keep full-bleed 1536x1024 3:2.
```

