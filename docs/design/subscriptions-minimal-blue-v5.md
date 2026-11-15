# 订阅管理 UI 概念稿 · Minimal Blue V5

产物：`subscriptions-minimal-blue-v5.png`。使用内置 image_gen 基于用户提供的 V4 截图编辑生成。
仅设计探索，未修改应用代码；图中示例数据不得作为运行时种子。

## 信息层级调整

- 保留四张统计卡、六张实体订阅卡，以及三个右侧辅助信息卡。
- 首屏卡面仅呈现品牌、价格/周期和续费日期，隐藏账号和支付渠道。
- 统计标签缩短，去掉重复说明、币种代码、金额小数和年份。
- 导航规划项折叠为更多资源，完整筛选收进面板。
- 最近续费只显示三项与短日期，分类花费使用短标签和比例，避免重复费用总览。
- 不通过缩小字号塞入更多内容；用减少重复和拉开间距改善扫描效率。
- 文生图可能存在文字与日历细节误差，实现时以真实接口和计算规则为准。

## 完整生成提示词

Use case: ui-mockup. Image 1 is the edit target, a Chinese subscription manager design.
Make the next UI concept by radically REDUCING VISIBLE TEXT AND COGNITIVE DENSITY. The user has identified the actual issue: too many words, repeated labels, dense side content, too much simultaneous information. Do not merely recolor or polish the same dense screen again. The result must be visibly much simpler at first glance, with approximately HALF the visible text of the input.

KEEP: a muted BLUE theme, light background, rounded independent information-card sections, six tactile membership-card-like subscription cards, sidebar navigation, summary statistics and a compact renewal calendar. Do NOT remove all information-card sections or turn the subscriptions back into generic data panels. Keep the functional modules but use progressive disclosure for secondary details. No explanatory copy inside the interface.

OVERALL VISUAL: exceptionally refined and airy, contemporary software with Apple Wallet-like card composition. Porcelain white, very light neutral gray, restrained muted blue around #4266AE. Matte material, very subtle glass at the edges, clean hairline borders, almost invisible soft contact shadows. No grainy metal, brushed stripes, bright gradients, heavy bevels or colored fog. Large breathing spaces and precise alignment. NOT smaller type: REDUCE THE WORDS, preserve readable sizes. Show the full usable desktop screen straight-on at high landscape resolution, around 1920x1280. No device, outer artboard, annotations or marketing copy.

CONCRETE INFORMATION REDUCTION:
1. Remove the redundant top breadcrumb, date and service-status line entirely. Have one clean header only: "订阅管理" with tiny count "6", a small search field with placeholder "搜索", a quiet filter icon button and one muted-blue "+ 新建" button. No duplicate page title elsewhere. No always-visible category select. The filter button represents the full category/status settings in a closed popover.
2. Left sidebar: tasteful small logo and "IRM". Only visible actual navigation items "订阅" with count 6, "域名" with count 3, then collapsed "更多资源" with a chevron. Do not list four "规划中" rows. Current planned modules are hidden behind the collapsed more section. At the bottom show a small avatar and "admin", a settings outline icon and logout outline icon; no long settings sentence. Keep a recognizable sidebar, not just an unlabeled icon rail.
3. FOUR separate small white summary cards remain, with each showing ONLY ONE SHORT LABEL AND ONE NUMBER:
"月均" above "¥507",
"年度" above "¥6,084",
"本月待付" above "¥1,289",
"即将到期" above "6".
Only the last card can have one tiny muted-red "2 项待取消" note. Remove all other repeated explanatory footnotes, repeated currency codes and ornamental summary icons. Plenty of padding and clean negative space.
4. Above the subscription grid: show ONLY two quiet segmented tabs "全部" and "临期". At the right show one small sort icon control, no long sorting text. The full auto/manual/cancel/archived filters are accessible from the closed filter popover, not dumped into a six-label toolbar.
5. Keep six beautiful wallet-style subscription cards arranged TWO columns by THREE rows. Every card face has just THREE readable information groups: service identity, price/cycle, renewal date. Remove EVERY account label, Visa number, payment identifier, redundant USD/CNY code, divider, decimal ".00", category, auto-payment status, plan description, star decoration and duplicate date label. Do NOT replace the removed text with other words. Let the cards breathe.
Printed card composition: modest monochrome logo and service name in the upper left, a tiny ellipsis upper right; lots of blank central area; a beautifully set price near lower left and very small date at lower right. Subtle physical wallet-card feel through shape and faint edge depth, not textured 3D effects. Approximate landscape ratio 1.65:1, 16px corners, generous internal space. Name 16–18px medium, amount 28–30px medium, date 11–12px.
Exact visible text per card, NO MORE:
A. "ChatGPT Plus", "$20 / 月", "11/18 续费". Tiny red dot only, no warning sentence.
B. "Claude Pro", "$20 / 月", "11/20 续费".
C. "iCloud+", "¥21 / 月", "11/22 续费".
D. "Spotify", "¥18 / 月", "11/25 续费". Tiny red dot only.
E. "Cloud VPS", "$120 / 年", "11/28 续费".
F. "Figma", "$15 / 月", "11/30 续费".
Colors: first card deep muted ink-blue with soft white text, second porcelain white, third frosted pale white, fourth matte graphite with soft white text, fifth light silver gray WITHOUT texture, sixth porcelain white. No giant brand marks. No inner form fields, chips, action bars or progress bars. Hover/detail information is not visible in this default overview.

RIGHT SIDEBAR: keep THREE clearly separate rounded white utility cards, but dramatically reduce their visible content.
A. Calendar card with one concise heading "续费日历", one short month "11 月" flanked by chevrons, small weekday labels, and a compact clean month grid. Blue today highlight on 13, tiny blue/red renewal dots. No full repeated year, no current-month button, no extra legend paragraph.
B. A compact card titled "最近续费". Show ONLY THREE upcoming items instead of repeating all six subscriptions. Rows contain a small monochrome brand icon, short name "ChatGPT", "Claude", "iCloud+", with the short dates "11/18", "11/20", "11/22" aligned at right. NO amounts, weekdays, repeated year, full plan names or explanatory sentences. A tiny upper-right chevron icon opens the complete schedule. Rows have comfortable vertical spacing, not a dense ledger.
C. A compact card titled "支出分布". Four thin restrained blue/gray contribution bars, each with ONE short category at left and ONE percent at right: "AI" "57%", "工具" "25%", "云" "14%", "生活" "4%". No category icons, currency amounts, full long category names or total footer because those repeat the summary. Minimal calm information.
These are true separate CARD SECTIONS with 12px radii, extremely subtle border and white surface, not floating text or a single mega-wrapper. The six subscription cards sit directly on the page canvas, no enclosing giant card.

TYPE AND SPACE: normal-weight concise Chinese text, no all-bold typography, no decorative typography. Clear main/subordinate hierarchy; a smaller tasteful page heading, not a huge title. Preserve readable type, increase whitespace, avoid turning the removed information into huge graphics. Approximately 50% less text than the input. No clutter, no overlapping elements, no irrelevant labels. The crucial transformation is information hierarchy and progressive disclosure, NOT another minor surface-material revision. All six subscription cards and four summaries and the three right information cards should remain fully visible.

