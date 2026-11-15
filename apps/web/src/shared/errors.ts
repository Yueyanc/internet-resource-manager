import { ApiError } from '@irm/api-client';

import type { Locale } from '../app/messages';

const errors: Record<string, string> = {
  unavailable: 'Could not connect to the service. Check that the server is running.',
  invalid_response: 'The server returned an invalid response.',
  unauthorized: 'Your session has expired. Sign in again.',
  invalid_credentials: 'Incorrect username or password.',
  rate_limited: 'Too many attempts. Please wait 60 seconds.',
  initialized: 'The workspace is already initialized. Sign in instead.',
  invalid_subscription: 'Check the subscription details and try again.',
  invalid_account: 'Check the account details and try again.',
  not_keepalive: 'Keep-alive reminders are not enabled for this account.',
  invalid_vault: 'Check the encrypted vault payload and try again.',
  vault_initialized: 'The encrypted vault has already been initialized.',
  vault_uninitialized: 'Set up the encrypted vault first.',
  invalid_ip: 'Check the IP address, CIDR, or linked resources and try again.',
  invalid_server: 'Check the server specifications, IP addresses, or linked resources and try again.',
  invalid_snapshot: 'Could not parse the snapshot text. Paste the complete IRM1:... token or JSON output.',
  invalid_enroll_token: 'The enrollment token is invalid or has expired.',
  enroll_token_used: 'This one-time enrollment token has already been used.',
  invalid_agent_token: 'The agent credential is invalid or has been revoked.',
  binary_not_available: 'Prebuilt agent binary is not available for this OS/architecture yet.',
  non_public_ip: 'Metadata auto-lookup is only available for public IP addresses.',
  lookup_failed: 'Could not query RDAP / PTR metadata right now. You can fill fields manually.',
  probe_not_allowed: 'Reachability probing is restricted to public single IP addresses.',
  probe_disabled: 'Configure a probe mode and port before running a reachability check.',
  not_reviewable: 'Periodic purity review is not enabled for this node.',
  invalid_domain: 'Enter a valid domain without a protocol, path or port.',
  already_exists: 'This resource already exists.',
  conflict: 'The record has changed. Refresh and try again.',
  not_found: 'This resource no longer exists.',
  invalid_rates: 'Enter positive rates for every currency. CNY must remain 1.',
  already_up_to_date: 'Already running the latest version.',
  operation_in_progress: 'A system update or rollback is already in progress.',
  update_not_supported: 'Online binary replacement is disabled in development builds. Use manual commands instead.',
  rollback_version_not_allowed: 'The selected version is not in the allowed rollback list.',
  no_local_backup: 'No local previous-version backup binary was found.',
  no_database_backup: 'No SQLite snapshot backup was found for the selected version.',
  update_failed: 'System version switch failed. Check server connectivity and try again.',
  restart_not_supported: 'Online restart is not supported in this runtime environment.',
  internal_error: 'The operation failed. Please try again later.',
};

export function errorMessage(error: unknown, locale: Locale = 'zh-CN') {
  if (locale === 'en-US') return error instanceof ApiError ? errors[error.code] ?? 'The request failed. Please try again.' : 'The operation failed. Please try again.';
  return error instanceof Error ? error.message : '操作失败，请稍后重试';
}
