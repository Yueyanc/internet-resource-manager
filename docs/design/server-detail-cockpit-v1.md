# Concept A: Full-Page Personalized Server Cockpit

- Route: `/servers/$id`. Dedicated host workspace, not a drawer.
- Deliverable: [server-detail-cockpit-v1.png](./server-detail-cockpit-v1.png), 1536 x 1024, pure 3:2 desktop viewport. Generated with built-in `image_gen`, using `accounts-v1-implemented-light.png` as Image 1.
- Direction: inherit the reference's Warm Alabaster canvas (`#F6F5F1`), champagne/jade daylight mist, milky glass surfaces, fine Chinese typography, inset monospace copy slots, emerald status accents, and matte graphite (`#18181B`) primary actions.
- Hierarchy: persistent sidebar/topbar; back navigation and host switcher; full-width host passport with identity, SSH/IP copy slots and hardware nameplate; four telemetry cards; Compose-grouped services beside billing and linked resources.
- Layout intent: flexible service workspace and a 336px aside at implementation scale. The raster is a visual reference, not a pixel-accurate layout specification. Hardware uses a compact 2 x 2 nameplate for readability.
- Interaction intent: copy SSH with transient copied feedback; switch host without leaving the cockpit; open associated domains/cloud account; edit metadata and extend billing. Probe reinstall requires confirmation. Console access means an existing provider link, not an embedded remote shell or arbitrary execution.

## Review And Implementation Boundaries

Visually inspected the saved PNG: full viewport, all principal sections visible, no browser/device frame, no obvious overlapping text. Copy slots and telemetry remain legible; graphite actions and selected server navigation follow Image 1.

The generation prompt requested the complete user-supplied Concept A content, exact Image 1 styling, a 3:2 application viewport, fictional fixtures, and no annotations or chrome. No application source was modified.

Illustrative data only: documentation IPv4 `198.51.100.42`, private/overlay addresses, and `example.com` domains are not live inventory. The requested storage fixture is internally inconsistent: 62/73 GiB implies 11 GiB free, not 7.2 GiB. Resolve from backend measurements before implementation. The 12/12 badge summarizes a larger inventory than the seven example rows shown; a real UI must expose the remaining items. Generated sidebar counters are illustrative, not authoritative.

Online status must require a fresh valid heartbeat; unknown/stale/error states must remain distinct. Metrics and Docker availability must not be fabricated when collectors fail. Docker socket access remains privileged. The scaffold stays loopback-only until authentication, authorization, rate limits, and security review exist.

This is a design-only raster deliverable: no functional interactions, backend verification, application build, or Playwright validation are claimed.
