# 订阅管理 UI 概念稿 · Dark Bento V6

产物：`subscriptions-dark-bento-v6.png`。使用内置 image_gen，参考用户提供的深灰黄绿仪表盘风格及 V5 的精简信息结构生成。
仅设计探索，未修改应用代码；示例资源不作为运行时种子。

## 视觉方向

- 采用参考图的深炭灰画布、哑光深灰大圆角分区、荧光黄绿强调和少量淡紫辅助图形。
- 紧凑圆形图标导航、胶囊控件、四项独立统计、六张简洁订阅卡及三个右侧辅助卡。
- 保留低文字密度，分类花费改用图形占比，卡面仅展示品牌、价格和短续费日期。
- 不再采用玻璃金属反光，不增加虚构历史增长趋势。
- 第二轮定向修正补回第四张临期统计卡，并将生成的人像替换为字母头像。
- 文生图中的文字、日期和比例仍需在实际开发时校验。

## 首轮提示词

Use case: ui-mockup / style-transfer design exploration.
Create ONE high-fidelity Chinese subscription management desktop dashboard for "IRM", adopting the VISUAL STYLE OF IMAGE 1.
Image 1 role: PRIMARY STYLE REFERENCE. Study its distinctive charcoal background, soft matte dark-gray rounded bento cards, generous radii, lime-yellow highlights, quiet violet secondary visualization, circular icon navigation, pill controls, typography and restrained diagrammatic accents. This is the requested new art direction.
Image 2 role: CONTENT AND INFORMATION-HIERARCHY REFERENCE ONLY. Keep its simplified subscription content and functional modules, but NOT its light/blue visual styling.
Do not reproduce the medical/marketing dashboard subject or English copy from Image 1. Build the IRM SUBSCRIPTION MANAGEMENT screen in that visual language.

STYLE:
Background deep neutral charcoal #20211F, matte panels #2D2F2B and #32342F. Main highlight acid lime / chartreuse around #D5FF75, used confidently but selectively, like Image 1. Warm off-white text, gray secondary text, a small amount of soft violet #9A80E8 only in the spend visualization or a tiny secondary badge. Predominantly charcoal, not navy or purple. No blue theme for this exploration: the latest supplied style reference takes precedence.
Large 22–28px rounded corners on section cards. Flat velvety surfaces, almost no border, extremely subtle shadows, no silver, chrome, metal grain, glass shine, gradients or neon bloom. Slight broad matte tonal depth inside cards is fine. Circle buttons and circular icon backgrounds from the reference. Smooth restrained modern shapes. Consistent 20–24px gutters. Precise easy-to-scan layout. High-end lively product UI, not generic dark-mode admin.
The reference uses bold graphic hierarchy, NOT excessive explanatory text. Preserve the user's preference for LESS TEXT: concise labels, clearly set prices, comfortable open space. No paragraphs. Never shrink type just to fit dense fields.

FULL SCREEN COMPOSITION:
A crisp straight-on full desktop UI screenshot, high-resolution landscape around 1920x1280 or equivalent. No device frame, no perspective, no outer floating app/window frame, no annotations, no external decoration. The UI fills the canvas. Everything important is fully visible.
Left compact navigation rail ~74px wide, circular outline-icon buttons. Small lime layered IRM symbol at top, the subscription / wallet icon in an active lime circle, other resource icons in dark-gray circles, settings and user avatar anchored at bottom. Familiar Lucide-like icons, no invented chat or healthcare features.
At top of main workspace a restrained dark horizontal bar with "IRM" brand, a pill-shaped search field with search icon and short "搜索", and small settings / profile icon controls at right. Below, a page-heading row "订阅管理" and small muted count "6". Right side a quiet filter icon control and lime pill "+ 新建". No duplicate breadcrumb, full date header, connectivity copy, or repeated title.

FOUR SEPARATE SUMMARY CARDS BELOW HEADING:
A row of four equally sized large rounded statistic cards, unmistakably like the top row in Image 1. First card LIME with dark text and a small dark wallet icon in a translucent circular spot. Remaining three dark gray with small lime circular icons. One short label and one bold number, lots of internal breathing room. Tiny purely schematic visual accents may be used, but DO NOT invent historical growth or positive trend percentages.
Exact text:
1. "月均" with "¥507" on the lime card.
2. "年度" with "¥6,084".
3. "本月待付" with "¥1,289".
4. "即将到期" with "6" and a tiny soft-violet or muted-coral "2 项待取消".
No paragraphs or multiple currency footnotes. Make these info-card sections remain clear and distinct.

BELOW STATS: wide left region about 68–70% for subscriptions and narrow right 30–32% for utility modules.
Left filter row only a pill segmented control "全部" active lime, "临期" inactive gray; small sort icon at far right. No six-option long text toolbar.
Then SIX physical MEMBERSHIP-CARD-LIKE subscription cards in a TWO-COLUMN, THREE-ROW grid. These must feel like restrained actual card objects, not generic data form boxes: landscape wallet-card proportions about 1.7:1, rounded 20px corners, subtle edge depth, impeccable sparse printed layout. NO enclosing giant card around this grid.
The wallet card surfaces are dark charcoal with slightly different neutral tones, close to the reference's matte bento panels. At most one card may use a subtle very dark olive-tinted surface and one a very dark violet-gray surface; keep everything tonal, NOT six bright colored cards. No black/silver luxury-metal look from earlier versions. No plastic bevel, heavy shadow or shiny reflection. Their physical-card feeling comes from silhouette, composition and a faint edge.
Each card: monochrome recognisable service mark at upper left, medium-weight service name alongside, tiny ellipsis upper right, substantial negative space, large price lower left, tiny renewal date lower right. Marks mostly soft white; use a tiny lime accent on the selected card only. No payment accounts, Visa numbers, categories, full currency codes, redundant decimal places, paragraphs, progress bars, action button bars or bank chips.
Exact concise card contents:
"ChatGPT Plus" / "$20 / 月" / "11/18 续费"
"Claude Pro" / "$20 / 月" / "11/20 续费"
"iCloud+" / "¥21 / 月" / "11/22 续费"
"Spotify" / "¥18 / 月" / "11/25 续费"
"Cloud VPS" / "$120 / 年" / "11/28 续费"
"Figma" / "$15 / 月" / "11/30 续费".
A tiny muted-coral cancellation dot may appear on ChatGPT and Spotify, with no sentence label.

RIGHT COLUMN MUST KEEP THREE INDEPENDENT DARK ROUNDED INFORMATION CARDS:
1. "续费日历" with short centered month "11 月", circle chevrons, tiny weekday headings and a readable compact month grid. Today 13 in a lime circle/rounded chip, small lime dots for renewal dates, tiny violet/coral for cancellation. Compact, spacious, no extra legend text.
2. "最近续费" with only THREE rows: small service symbol, short name "ChatGPT", "Claude", "iCloud+" and dates "11/18", "11/20", "11/22". A small round chevron button opens the rest. No repeated amounts or weekday words.
3. "支出分布": a refined compact chart inspired by Image 1. Prefer a four-segment donut using lime, gray-green, muted violet and a pale gray segment, alongside a SHORT four-row legend: "AI 57%", "工具 25%", "云 14%", "生活 4%". Clean readable spacing, no duplicate total, no invented history. If space is too narrow use the reference's rounded horizontal segments instead; visual rather than a wall of text.

TYPOGRAPHY:
Beautiful modern authentic Simplified Chinese UI sans serif, round but restrained like Image 1, 24px page title, 14–16px module headings, 16–18px subscription names, 28–32px key values, legible small dates. Mostly medium/normal weights, not all bold. Generous negative space, strong consistent alignment, enough contrast, no muddled text. Avoid too many borders or separators. No text overlaps.
Final impression: unmistakably the DARK CHARCOAL + ACID LIME BENTO DASHBOARD STYLE of Image 1, thoughtfully adapted to a simplified real subscription-card collection. All four summaries, six membership cards and three utility cards remain present. No explanations outside the UI, no watermark.

## 定向修正提示词

Make a very precise correction to this IRM dashboard image. Keep its visual style, all six subscription membership cards, compact icon rail, colors, typography, lime accent, three right-side utility cards, layout and content essentially unchanged. The generated image accidentally omitted one important summary card.

In the SAME horizontal area above the two-column subscription grid and to the LEFT of the renewal-calendar card, render FOUR equally sized independent rounded summary cards instead of the current three. Keep the total row width unchanged by making each summary card narrower. Exact left-to-right order:
1. lime card "月均" with "¥507";
2. dark-gray card "年度" with "¥6,084";
3. dark-gray card "本月待付" with "¥1,289";
4. dark-gray card "即将到期" with "6" and tiny muted-coral text "2 项待取消".
Use compact neat statistics typography and small circle icons so all four fit naturally with 16px gutters. Remove the decorative bar-chart graphics from these four summary cards if necessary; do not squeeze or truncate text. Each must have its own clear rounded card boundary. The existing right calendar stays in its own column, unchanged.

Also replace both repeated photographic profile avatars with the same simple gray circle containing "A", so this personal-admin UI does not invent a person's identity. Everything else stays unchanged. Do not add additional labels, content, panels or decoration. Keep all six subscription cards, and keep the "最近续费" and "支出分布" cards. High-resolution straight-on product screenshot.

