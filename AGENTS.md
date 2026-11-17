# Internet Resource Manager

Independent personal internet-resource inventory and monitoring monorepo.
Never copy source, patches, credentials, or API assumptions from sibling projects.

## Boundaries

- `apps/web`: Vite entrypoint, routing, feature screens, Web adapters.
- `apps/server`: Go server entrypoint and lifecycle only.
- `apps/agent`: Go agent entrypoint; outbound-only reporting when implemented.
- `packages/ui`: antd theme, shared domain UI, shadcn components only as needed.
- `packages/api-client`: fetch transport, Zod contracts, TanStack Query options.
- `internal`: Go domain logic, collectors, persistence, protocol, HTTP adapters.
- `db`: Goose SQL migrations and sqlc queries; generated queries are checked in.

## Rules

- pnpm only, one pnpm lockfile. Server and Agent share one root Go module.
- antd is the primary UI. Tailwind is for layout and custom areas. Lucide is the
  only authored icon library; antd internal icons are allowed.
- Do not add another table, form, or state library without a concrete need.
- ESLint Flat Config and Stylistic own JS/TS/TSX formatting. No competing Prettier
  setup. Go uses gofmt. Generated sqlc files must come from `pnpm db:generate`.
- Never turn a missing backend, failed lookup, or missing heartbeat into success,
  an empty catalogue, or a confirmed offline server. No runtime demo resources.
- The scaffold has no authentication. Keep it loopback-only. Production use must
  first implement authentication, authorization, rate limits, and a security review.
- Never commit data files, secrets, real agent snapshots, or credentials.
- Domain network probes must prevent SSRF and redirect/DNS-rebinding bypasses.
- Docker socket access is privileged, including read-only filesystem mounts.
- No SSH password storage, remote shell, or arbitrary command execution.

## Verification & Release

Run `pnpm check`, `pnpm build`, and relevant Playwright tests before finishing.
Distinguish local tests, cross-compilation, Docker builds, and deployment evidence.
Record unfinished capabilities in README and `docs/architecture.md`.
Pushing a `vX.Y.Z` Git tag triggers `.github/workflows/release.yaml` to build and publish the GitHub Release assets and GHCR container image (no automatic SSH server deployment).

