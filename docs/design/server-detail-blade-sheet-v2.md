# Concept B: Server Blade Inspector Sheet v2

- Deliverable: `server-detail-blade-sheet-v2.png`, 1536 x 1024 (3:2), generated with the built-in image_gen tool.
- Image 1 style reference: `accounts-v1-implemented-dark.png`, inspected before generation and passed directly as the reference image.
- Direction: Carbon-Obsidian smoked glass, upper emerald ambient glow, fine Chinese desktop typography, recessed monospace SSH/IP slots. Primary actions remain dark emerald glass; no white buttons.
- Interaction intent: clicking a server opens a floating right-side inspector while the dimmed rack list and active sidebar remain visible. Previous/next and close preserve list context. SSH is copy-only, not remote command execution.
- Hierarchy: inspector toolbar, host identity and heartbeat, quick-connect slots, four ring gauges, then container matrix alongside billing/domain/account relationships.
- Illustrative data only: documentation IPv4 198.51.100.42, example.com subdomains, and illustrative private-overlay IP 100.90.1.12. Status, containers and billing are design fixtures, not backend evidence or runtime demo resources.
- Visual inspection: confirmed the saved PNG is readable, uses the requested dark palette, retains all three background hosts, four gauges, seven container rows and relationship tiles. No browser chrome or annotations. The generated sheet is approximately 940 image pixels wide rather than a literal 820; treat 820 CSS pixels as the implementation target. Generated text and ring arc proportions are visual guidance, not precise implementation specifications.

## Generation Prompt

Create a pure 3:2 desktop production UI mockup using Image 1 as the exact material, typography and color reference. Show /servers with a dimmed left rack workspace and a wide floating right smoked-glass host inspector. Use #0A0D0C / #111615 surfaces, restrained jade ambient light, thin specular edges and dark emerald active buttons, never white buttons. Include the host toolbar, Alpha-LAX-01 identity and heartbeat/hardware pills, recessed copy-only SSH and IP slots, CPU/memory/NVMe/traffic ring gauges, seven running-container rows, and billing, hosted-domain and cloud-account tiles with the supplied illustrative values. Preserve the sidebar and Tokyo-CN2-Edge, HomeLab-PVE and Synology-NAS list context. Fine Chinese desktop typography, dense organized spacing, no overlaps, frames or annotations.

Design artifact only. No application source was modified; application checks/build/Playwright were not run for this raster-and-note task.
