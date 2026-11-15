# Concept A: Frameless Inline Sheet

- Deliverable: `subscription-form-minimal-sheet-v1.png` (1536 x 1024).
- Method: built-in `image_gen`, using `subscriptions-glass-v10-implemented-light.png` as the visual reference.
- Direction: one luminous warm-alabaster glass sheet over the softly blurred subscription dashboard; frameless title and price, five quiet property rows, optional details demoted to footer links.
- Palette: warm alabaster `#F6F5F1`, milky glass `#FBFAF7`, graphite `#18181B`, muted stone `#8C857E`, restrained emerald accents.
- Visual inspection: foreground Chinese labels are readable, layout is uncluttered, no nested field boxes, browser chrome, device frame, or watermark. Warm champagne-sage background and restrained glass treatment follow V10.
- Mockup limitations: generated raster, not pixel-exact implementation specifications. The optional footer links omit the requested leading plus signs, and dimensions are visually interpreted rather than exact CSS measurements.
- Scope: design artifacts only; no application source changes or runtime verification required.

## Generation Prompt

Create a full-bleed 3:2 desktop UI mockup, using the V10 screenshot as the exact dashboard and aesthetic reference. Softly blur and gently dim the dashboard beneath a centered approximately 600px-wide, 22px-radius milky warm-alabaster frosted-glass modal, with a white specular inner edge and soft shadow. Use extreme restraint: no nested bordered boxes, dashed boxes, chip clouds, or rectangular input borders.

Place a quiet `新建订阅` caption and close control above an airy hero: emerald OpenAI icon, borderless `ChatGPT Plus` title, muted `点击更换预设或直接输入名称`, inline `US$ 20`, tiny `/ 月` selector, and `≈ ¥144 / 月`. Below one delicate hairline, arrange five spacious property rows with monochrome icons: `所属分类` / green dot `AI 与生产力`; `下次扣款` / `2026-12-14` and `30 天后`; `续费方式` / automatic-manual segmented control; `续退意向` / `正常续用`; `账号与渠道` / `openai@gmail.com · Apple Store`. Footer: quiet optional links `+ 续费原价`, `+ 退订网址`, `+ 备注`, then `取消` and graphite pill `保存订阅`. Sharp Chinese typography, generous whitespace, no annotations or watermark.
