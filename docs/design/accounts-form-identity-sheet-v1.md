# Accounts & Identity Sheet V1

Design-only concept: Digital Identity Passport & Zero-Knowledge Credential Sheet.

- Output: accounts-form-identity-sheet-v1.png, 1536 x 1024, 3:2.
- Generated using built-in image_gen and both inspected local references.
- Aesthetic: subscription-form-minimal-sheet-v1.png.
- Background: accounts-v1-implemented-light.png.
- No application source changed. Application builds and tests were not run for this raster-only task.

## Design & Inspection

Milky alabaster glass, white specular edge, soft floating shadow, borderless identity hero, one recessed credential strip, five frameless property rows, and quiet disclosure-link footer preserve Concept A's grammar. Emerald highlights security and TOTP; amber highlights inactivity reminders.

Visual inspection confirmed readable Chinese, correct email and TOTP, all five rows, contained footer, and no overlapping content. The background remains recognizable beneath blur. Minor interpretation: the region badge sits beside the title; the credential strip is a rounded recessed bar rather than a full capsule, and eye/dice icons have faint button surfaces.

This static concept does not demonstrate interactive behavior or implemented encryption. Credentials are illustrative; the encryption label is requested design copy, not a verified security claim.

## Exact Generation Prompt

```text
Use case: ui-mockup. Create a pixel-polished full-bleed 3:2 desktop web UI mockup, 1536x1024 or larger matching ratio. Reference image 1 is the EXACT aesthetic reference: Warm Alabaster Frosted Glass Concept A subscription modal, same typography, negative space, subtle frost, frameless property rows. Reference image 2 is the actual Accounts & Identity dashboard to use behind the modal, adapted to landscape with sidebar, account cards and right identity overview. Do not use subscription dashboard. Softly blur and gently dim that background. Center a roughly 600 CSS-pixel wide (about 730 image pixels) luminous milky #FBFAF7 frosted sheet with 22px CSS radius, a 1px white specular inner edge and soft floating shadow. Sheet around x400..1135 y145..875 on 1536x1024; generous but purposeful spacing. No browser chrome, device frame, watermark or callout arrows. Flat front view, not perspective.

Modal exact content and composition:
Top quiet small caption 新建账号 left, fine × close icon right.
Airy identity hero: left Google multicolor G in softly rounded pale icon tile, bold borderless title Google 主账号, muted subtitle 点击切换平台预设 · 核心主号, tiny region badge US 美区 ▾. Right aligned crisp borderless monospace alex.work@gmail.com with 主登录标识 micro-caption underneath. Avoid overlap: use a smaller 17px CSS email to fit, title 25px.
Next personalized signature strip: slim recessed frosted horizontal capsule, emerald tiny lock + 端到端加密凭据 along upper left. Within this ONE strip two inline slots separated by vertical hairline: 密码 •••••••••••• plus tiny eye and dice outline icons; 2FA 动态码 then emerald tabular 482 910 plus small circular countdown 24s. TOTP value is clickable edit-secret affordance; no extra helper copy.
One delicate horizontal hairline then five spacious FRAMELESS property rows with small monochrome outline icons and muted left labels, right aligned values:
folder icon 所属分类 | emerald dot 邮箱与身份 ▾
key icon 认证方式 | calm very pale pill segmented control: 密码直登 active white / 通行密钥 / SSO 授权
linked account icon 救援账号 | iCloud 备用 · me@icloud.com ▾
refresh/calendar icon 闲置保活 | 每 90 天签到 and small warm amber 防回收提醒 pill
badge icon 实名状态 | 未实名 ▾
Quiet footer with muted small progressive links 手机尾号  恢复码  安全网址  备注 on left; 取消 text button and matte graphite #18181B rounded pill 保存账号 right.

EXTREME RESTRAINT. NO stacked rectangular input boxes, no field borders, no numbered section headers, no cluttered multi-column grid, no cards within modal except the one sleek credential strip. Match reference 1 precisely in warm offwhite luminosity and light neutral gray text, not yellow/beige theme. Sparse emerald, blue Google accents and amber reminder. All Chinese text must be accurate, clean, readable simplified Chinese, professionally typeset sans-serif, zero letter spacing. Keep all modal content comfortably contained and aligned. Render this as a real high-fidelity app screenshot, not a presentation.
```

