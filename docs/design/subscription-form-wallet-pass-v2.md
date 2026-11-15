# Concept B: Sculpted Wallet Pass

- Artifact: `subscription-form-wallet-pass-v2.png`, generated with the built-in `image_gen` tool, 1536 x 1024 desktop concept.
- Reference: `subscriptions-glass-v10-implemented-dark.png`, inspected before generation.
- Direction: one sculpted smoked-glass subscription pass with an open middle, followed by three restrained inline rows. Service, amount, billing interval and renewal date live on the pass rather than in stacked form fields.
- Palette targets: obsidian canvas `#0C0E12`, modal `#14181F`, primary button `#1B2624`, pearl typography and subtle emerald ambient sheen. Intended modal width 560 CSS px, radius 24px; pass radius 18px. Raster geometry and colors are illustrative, not implementation measurements.
- Visual inspection: calm spacing, readable Chinese, no overlapping content, no browser chrome, no dashed perforations or chip clouds. The second row was refined to remove its input-like capsule.
- Fidelity caveats: the generated strategy wording appears as `正常续用` but should be verified against exact copy during implementation; the second-row dropdown chevron is absent and the optional-details prompt retains a tiny terminal punctuation mark. These are raster mockup limitations, not proposed specification changes.
- No application source was changed. This is a static design artifact, not an interactive or tested implementation; application checks/build/Playwright were not run.

## Generation Prompt

Create a full-bleed 3:2 desktop screenshot using the supplied V10 dashboard as the exact aesthetic reference. Softly dim the dashboard beneath a centered 560px smoked obsidian frosted-glass modal. Header: 新建订阅 and quiet close icon. One sculpted Apple Wallet-style pass: emerald OpenAI mark, ChatGPT Plus, AI 与生产力, 更换服务, spacious empty middle, US$20 / 月, ≈ ¥144/月, and 12/14 续费. Below it only three borderless rows: 续费策略 with 自动扣款 · 正常续用 capsule; 归属与扣款 with plain ai.work@gmail.com · Apple 账户代扣 dropdown text; + 添加退订链接、首期特惠价或备注. Footer: 取消 and 保存订阅 in smoked #1B2624. Crisp Chinese typography, restrained specular edges, generous negative space. No traditional stacked form rectangles, multiple pods, chip clouds, dashed perforations, browser chrome, device frame or watermark. Refinement: remove the second-row capsule while preserving the single pass and all glass materials.
