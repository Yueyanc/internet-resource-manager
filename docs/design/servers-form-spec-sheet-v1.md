# Servers Form Spec Sheet v1

## Artifact

- PNG: `servers-form-spec-sheet-v1.png` (1536 x 1024, 3:2).
- Reference: `subscription-form-minimal-sheet-v1.png`, inspected before generation.
- Generated with the built-in image_gen tool; design-only, no application source changes.
- Direction: Cloud Host Spec Strip & SSH Endpoint Sheet.

## Design Notes

Concept A's warm alabaster workspace (#F6F5F1) and milky frosted modal (#FBFAF7) remain the visual baseline. A white inner edge, soft shadow, quiet graphite action, and emerald accents preserve its restrained hierarchy.

The host name and monospace SSH endpoint share the hero. A single four-cell hardware strip replaces separate numeric inputs. Four frameless property rows carry location, OS, billing, and account. Secondary metadata stays in the footer. Manual entry is selected; the alternate probe mode is only a visual affordance, not an implemented capability.

## Visual Inspection

Inspected the generated raster at full composition: foreground Chinese labels and monospace endpoint are legible, all four hardware values fit, property rows align cleanly, and footer actions do not overlap. The selected server navigation, blurred server cards, warm glass, and thin separators match the reference direction. Raster generation is not a guarantee of exact font metrics or sampled hex values.

This is a static Create/Edit visual specification, not a working form. Background hosts, counts, statuses, account, and endpoint are illustrative mockup content only; they are not runtime data or verified infrastructure. No backend, interaction, application tests, or deployment verification is claimed. Application checks/build/Playwright were not run because no source code was modified.

## Generation Prompt

```text
Use case: ui-mockup. Create a high-fidelity full-bleed 3:2 desktop web UI mockup, 1536x1024, for the Chinese personal internet-resource app 资源管家. The supplied reference is STYLE REFERENCE ONLY: exactly match Concept A's Warm Alabaster Frosted Glass modal aesthetic, fine Chinese typography, gentle blur, restrained dark typography, translucent white inner edge and quiet spacious frameless property rows. Replace the subscription composer with a server composer. No browser chrome, device frame, watermark or annotations.

Background #F6F5F1 light resource workspace, left sidebar with 资源管家 brand, navigation 订阅管理, 账号与身份, 服务器, 域名, IP与节点; 服务器 selected. Softly blurred plausible server cards behind modal, not subscription cards. Main heading 服务器. No gradients or decorative orbs.

Centered modal approximately 610 CSS pixels wide, displayed at about 760 image pixels wide, 22 CSS px corner radius. Milky #FBFAF7 warm-alabaster frosted glass, thin white specular inner rim and soft diffused shadow, matching supplied reference very closely. Calm generous inner padding. All foreground typography sharp and accurately typeset, Chinese modern sans serif with fine restrained weights; endpoint in true monospace. Top bar on one line: 新建服务器 left; compact subtle segmented pill 探针一键接入 / 手动录入 center-right, 手动录入 active; quiet × far right.

Airy host hero below: left rounded slate/emerald server icon, borderless bold title Tokyo-Edge-01, muted subtitle 点击更换云厂商预设 · DMIT Pro. Right borderless inline monospace root@45.76.210.18:22, below tiny emerald dot and VPS 实例 ▾. Give hero columns room, endpoint must not collide with title; title about 23 CSS px and endpoint about 14 CSS px.

Signature hardware strip below hero: ONE sculpted refined translucent glass strip, 4 equal cells with delicate vertical hairlines, not separate cards. Small muted labels over bold values: 处理器 / 2 vCPU; 内存 / 4 GB; 存储 / 80 GB NVMe; 月流量 / 2 TB 双向. All values fit gracefully.

One delicate hairline then four spacious FRAMELESS key-value rows, labels aligned left, values aligned right; no boxed inputs. Row 1 机房地区 -> 日本 · 东京 TYO ▾. Row 2 系统镜像 -> Debian 12 · x86_64 ▾. Row 3 续费账单 -> US$ 39.90 / 季 plus small warm pill 关联订阅 ▾. Row 4 归属账号 -> DMIT · ops@work.dev ▾. Optional thin outline icons beside row labels consistent with reference.
Quiet footer left muted optional links IPv6 / 内网, 控制台网址, 标签, 备注. Footer right 取消 and matte graphite #18181B pill 保存服务器. Keep footer on one comfortable line with no collisions.
Extreme restraint: no traditional multi-row boxed input grids, no radio walls, no dark terminal blocks, no heavy panels, no neon, no extra explanatory copy. Faithful warm glass palette, no beige/brown saturation. Foreground crisp, background softly blurred.
```

