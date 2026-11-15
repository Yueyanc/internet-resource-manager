# 订阅管理 UI 概念稿 · Refined Blue V4

产物：`subscriptions-refined-blue-v4.png`。使用内置 image_gen 基于用户提供的 V3 截图编辑生成。
仅设计探索，未修改应用代码；图中示例数据不作为运行时种子。

## 调整方向

- 保留蓝色主题、实体会员卡式订阅卡，以及独立统计和辅助信息卡分区。
- 降低蓝色饱和度，减少强反光、拉丝纹理、厚重倒角和投影。
- 改用哑光表面与轻薄边界，拉开主次信息层级，降低装饰对内容的干扰。
- 文生图中的日期、文字和金额需在实现中重新校验。

## 完整生成提示词

Use case: ui-mockup. Image 1 is the EDIT TARGET: a Chinese subscription management desktop UI. Create a refined next design iteration of this same screen.
User feedback: this design still feels cheap, but they cannot identify exactly why. They want a genuinely premium modern interface. Diagnose and fix the visual execution, NOT by adding more effects. Retain the blue theme, physical membership-card-like subscription items, and distinct information card sections.

Keep unchanged: app identity "IRM / 资源管家"; sidebar navigation groups and resource counts; heading "订阅管理"; search, category and new-subscription controls; FOUR SEPARATE top statistics cards; six subscription cards arranged two columns by three rows; THREE SEPARATE right utility cards for calendar, upcoming payments and category spend. Preserve all names, prices, dates and real functionality shown in the input. Do not remove information sections again. No outer device mockup or decorative framing.

ART DIRECTION: sophisticated contemporary private finance software, premium through precise typography, composition, material restraint and whitespace. Not skeuomorphic, not a neumorphic UI kit, not a shiny credit-card advertisement. Clean porcelain-white and neutral very-light-gray workspace. Blue accent is a quietly confident mid-blue around #4266AE, NOT vivid electric royal blue. Sparse accent usage: main CTA, active nav, calendar selection and restrained chart highlights only. Mostly dark gray text, soft neutral dividers. No all-blue icons, no bright blue currency numbers, no colored glass haze. An almost imperceptible cool-white light gradient is acceptable. No purple, pink, sand or rainbow color palette.

MAIN CORRECTIONS:
1. REMOVE the conspicuous brushed metal stripes, glittery grain, mottled silver texture, theatrical diagonal light sweeps, thick beveled/double edges and dense black shadows. These are the main cheap-looking artifacts. No 2010s embossed UI, no shiny chrome, no puffed plastic controls.
2. Font hierarchy: calm, beautifully proportioned authentic Simplified Chinese sans-serif and refined Latin type. Medium-weight 24px page heading instead of heavy display type. Normal-weight 13px interface text, medium-weight 14px panel headings, small 11px secondary metadata, medium-weight 28px statistic numbers. Avoid making everything large and bold. Excellent legibility, no excessively faint secondary text. Intentional line lengths and generous inner padding. Sharp type, zero overlap.
3. Clear, precise grid and rhythm: align all panel edges and text baselines. Comfortable 24px gutters and 24px internal padding, a coherent 8px spacing rhythm. Sidebar feels quiet rather than oversized. Make the screen feel curated, not densely assembled from a UI kit.
4. Buttons and controls: keep familiar Ant Design-like shapes and proportions, around 36px tall and 8px corners. Matte muted-blue primary button, no neon gradient and no bloom. Segmented filters use a white active segment and small blue text, not a giant blue glossy pill. Outline icons are 15–17px thin and subtle, not big blue decorative illustrations. Remove floating pill-shaped edit/renew buttons under cards; use a tiny discreet more menu on the card.
5. Information sections STAY AS CARDS. Four separate white summary cards with 12px radius, delicate 1px cool-gray outline and virtually no shadow. Each has a small muted-gray label, one main number, then small supporting text. Right column has three separate white rounded cards with consistent radius/padding and soft borders. No card-inside-card framing around the subscription collection. Small warning marks are muted red, not bright screaming red.

THE SUBSCRIPTION ITEMS MUST STILL FEEL LIKE ACTUAL MEMBERSHIP CARDS, NOT INFORMATION PANELS:
Use generous landscape wallet-card proportions near 1.7:1 with 16px corners, very faint edge depth and an exquisitely subtle soft contact shadow. Material feels like smooth matte ceramic / satin polymer / translucent frosted white, but NO obvious texture. A tiny edge highlight and broad almost invisible tonal shading give tactile reality; no heavy 3D extrusion.
Printed card layout, not UI widgets: upper left a modest 28px monochrome service mark, upper right a tiny ellipsis. Service name below in beautiful medium 18px type. Substantial clean negative space in the middle. Bottom left a well-set 30px medium-weight price, with much smaller currency and billing period. Bottom right small neatly aligned renewal date and payment identifier. No bars, tags, field labels, buttons, fake chips or fake card numbers on the face.
The card collection should feel like designed objects, but not an overstated bank-card rendering. First card can be velvety INK BLUE / charcoal-blue, second porcelain white, third very faint frosted white, fourth soft matte graphite, fifth neutral pale gray, sixth porcelain white. Most of the screen stays light. Dark card text is soft white, not luminous. Bright white cards have enough thin border contrast to stand off the background. No blue recoloring of every card, no multicolor brand icon tiles.

CONTENT TO PRESERVE:
Four top cards: "月均折算成本" "¥507.00" "CNY / 月"; "年度折算总支出" "¥6,084.00"; "本月剩余待付" "¥1,289.00" "6 笔计划扣款"; "30 天内到期" "6 项" "含 2 项待退订".
Six printed membership cards: ChatGPT Plus "$20.00" "USD / 月" "2026.11.18"; Claude Pro "$20.00" "USD / 月" "2026.11.20"; iCloud+ 200GB "¥21.00" "CNY / 月" "2026.11.22"; Spotify Premium "¥18.00" "CNY / 月" "2026.11.25"; Cloud VPS "$120.00" "USD / 年" "2026.11.28"; Figma Professional "$15.00" "USD / 月" "2026.11.30". Tiny cancellation dots only where appropriate.
Right cards: "到期日历" November 2026, tiny muted-blue marked dates; "即将到期的扣款" compact list with actual bills ¥144, ¥144, ¥21, ¥18, ¥864, ¥108; "分类花费" restrained thin blue-tonal bars and values ¥288, ¥129, ¥72, ¥18; "月均合计 ¥507.00".
Maintain the familiar left navigation and account footer, and all expected controls from the reference.

Output one extremely high-fidelity, crisp, complete desktop UI design screenshot at a generous landscape resolution, with all six cards and all utility modules visible. Straight-on flat screen, no device, no annotation, no watermark. The premium difference should be immediately visible: QUIETER BLUE, BEAUTIFUL TYPOGRAPHY, LESS SHINE, LIGHTER SHADOWS, SPACIOUS PRINTED CARD FACES, AND CLEAR WHITE INFORMATION CARD SECTIONS.

