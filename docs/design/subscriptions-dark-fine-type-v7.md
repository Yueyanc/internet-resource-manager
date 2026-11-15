# 订阅管理 UI 概念稿 · Fine Type V7

产物：`subscriptions-dark-fine-type-v7.png`。使用内置 image_gen 基于 V6 编辑生成。
仅更新设计产物，未修改应用代码；文生图中的细节需在实际实现时重新校验。

## 调整方向

- 保留深炭灰、黄绿强调、大圆角和全部信息分区。
- 降低标题、统计、品牌名和价格的字号与字重，并同步缩小图标。
- 周期与续费日期明确作为辅助文字，不与价格争抢层级。
- 保留原有卡片空间，不通过新增字段或装饰填满留白，也不将整张页面缩小。

## 完整生成提示词

Use case: ui-mockup, precise typography refinement.
Image 1 is the EDIT TARGET, the approved general visual direction for the Chinese IRM subscription management UI. The user likes the charcoal/lime rounded-card design, BUT the text is much too large and heavy, making it look coarse rather than refined.

MAKE A STRONG, IMMEDIATELY VISIBLE TYPOGRAPHIC SCALE CORRECTION. Do not just generate the same design with a tiny type change. Reduce the current oversized text by roughly 35–45% while keeping the entire dashboard, its card sizes and its overall canvas scale unchanged. This is NOT zooming out the whole image: the cards, gaps and modules remain approximately the same size; typography and matching decorative icons become smaller, lighter and better set within them. The increased interior negative space should look intentional and premium.

KEEP UNCHANGED:
- Dark neutral charcoal background, matte rounded dark-gray card surfaces, restrained acid-lime accents and small violet chart accents.
- Compact icon rail, dark header with IRM brand/search, one page title, lime new button.
- FOUR separate summary cards across the top-left area, first lime, three dark.
- SIX membership-style subscription cards, two columns by three rows, still sparse printed card faces.
- THREE right utility cards: renewal calendar, next three renewals and category-spend donut.
- All exact content, numeric values, renewal dates, and functionality from the reference.
- Minimal visible text and progressive-disclosure controls; do NOT add descriptions or new fields to fill space after shrinking the text.
- No card-outline proliferation, no silver/metal/glass reflections, no heavy bevel/shadow, no bright blue recoloring.

DESIRED TYPE SIZES AT AN APPROXIMATELY 1536px-wide DESKTOP UI CANVAS:
Brand "IRM": 18–20px, medium weight, NOT the current 30px display size.
Page title "订阅管理": 22–24px, medium weight 500–550, NOT huge bold display text. Small resource-count badge 11px.
Search and button labels: 12–13px normal/medium. Primary CTA label no larger than normal UI copy.
Summary labels: 11–12px normal weight, perhaps muted dark text on lime and muted gray on dark. Summary values: 25–27px medium, not bold chunky 40px. Small cancellation note 10–11px.
Subscription service names: 15–16px medium weight 450–500, NOT 26–28px.
Subscription prices: 23–25px medium weight 500, not 38–40px bold. The "/ 月" or "/ 年" suffix should be a separate much smaller 11px secondary text baseline-aligned with the price, NOT the same large size. Currency symbols slightly smaller than the digits.
Subscription date: 10–11px secondary text, discreet bottom-right, not a second large line.
Right utility panel headings: 13–14px medium, NOT 24px bold. Calendar month 12–13px, weekdays 10px, date numerals 11–12px. Recent-renewal list names and dates 12px normal. Donut legend labels and percentages 11–12px.
All essential type must remain clean and readable, no blurry micro-text. Avoid anything below 10px. Establish a clear three-level hierarchy instead of everything being large/bold.
Use a beautifully spaced modern UI sans-serif with authentic clean Simplified Chinese and refined Latin glyphs, consistent zero tracking, aligned baselines, tabular numerals in statistics and prices. Slightly soften bright-white text to off-white; secondary labels use legible medium gray.

ICON SCALE MUST MATCH THE FINER TYPE:
Service logos 25–29px, NOT current 50–60px giant symbols.
Summary icons 16px in 28–30px circular accent backgrounds, not giant 50px badges.
Toolbar and navigation glyphs 15–18px with generous but not oversized click targets.
Small ellipsis menus should be tiny and quiet.
The donut stays graphic and useful, but its legend uses finer small type.

SPACING AND CARD COMPOSITION:
Keep the overall card modules and dashboard geometry essentially unchanged. Summary values should have room to breathe and not span almost the whole card. Each membership card has a small service-logo/name group toward upper left, then a large area of calm negative space; a finely set price lower left and a tiny renewal date lower right. Keep 24–28px consistent internal inset, even gutters, precise alignment. No stretching names across the whole card. No additional captions or trend charts. No large decorative background letters.
Do not shrink the entire workspace to get small text. Do not place the screen within a larger black artboard. Full-bleed normal desktop UI screenshot.

EXACT CONTENT, PRESERVE:
Summary cards: "月均" "¥507"; "年度" "¥6,084"; "本月待付" "¥1,289"; "即将到期" "6", small "2 项待取消".
Tabs "全部" and "临期"; header "订阅管理"; small "+ 新建"; search placeholder "搜索".
Membership cards:
"ChatGPT Plus" "$20" small "/ 月" tiny "11/18 续费";
"Claude Pro" "$20" small "/ 月" tiny "11/20 续费";
"iCloud+" "¥21" small "/ 月" tiny "11/22 续费";
"Spotify" "¥18" small "/ 月" tiny "11/25 续费";
"Cloud VPS" "$120" small "/ 年" tiny "11/28 续费";
"Figma" "$15" small "/ 月" tiny "11/30 续费".
Right cards "续费日历", "11 月", "最近续费", "支出分布"; short rows ChatGPT 11/18, Claude 11/20, iCloud+ 11/22; legend AI 57%, 工具 25%, 云 14%, 生活 4%. Use simple "A" letter avatars, not invented photos.

Output one exceptionally crisp, premium high-fidelity desktop UI design image, same overall composition and aspect as input, no device mockup, no extra screens, no watermark. The final result must visibly read as SMALLER, MORE DELICATE, MORE PROFESSIONALLY TYPESSET UI, not the current oversized dashboard typography.

