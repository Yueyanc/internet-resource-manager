package storage

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/json"
	"errors"
	"net/netip"
	"slices"
	"strings"
	"sync"
	"time"

	"github.com/Yueyanc/internet-resource-manager/internal/cloudsync"
	"github.com/Yueyanc/internet-resource-manager/internal/domainname"
	"github.com/Yueyanc/internet-resource-manager/internal/ipaddr"
	"github.com/Yueyanc/internet-resource-manager/internal/storage/queries"
)

type SyncStats struct {
	ZonesTotal       int `json:"zonesTotal"`
	DomainsImported  int `json:"domainsImported"`
	DomainsUpdated   int `json:"domainsUpdated"`
	RecordsSynced    int `json:"recordsSynced"`
	ServersImported  int `json:"serversImported"`
	ServersUpdated   int `json:"serversUpdated"`
	IPsImported      int `json:"ipsImported"`
	IPsUpdated       int `json:"ipsUpdated"`
	ServerLinksAdded int `json:"serverLinksAdded"`
	IPLinksAdded     int `json:"ipLinksAdded"`
	TunnelsTotal     int `json:"tunnelsTotal"`
	TunnelsHealthy   int `json:"tunnelsHealthy"`
	PagesTotal       int `json:"pagesTotal"`
}

func (s *Store) ListProviderConnections(ctx context.Context) ([]queries.ProviderConnection, error) {
	rows, err := s.queries.ListProviderConnections(ctx)
	if err != nil {
		return nil, err
	}
	if rows == nil {
		return []queries.ProviderConnection{}, nil
	}
	return rows, nil
}

func (s *Store) GetProviderConnection(ctx context.Context, id string) (queries.ProviderConnection, error) {
	row, err := s.queries.GetProviderConnection(ctx, id)
	if errors.Is(err, sql.ErrNoRows) {
		return queries.ProviderConnection{}, ErrNotFound
	}
	return row, err
}

func (s *Store) CreateProviderConnection(
	ctx context.Context,
	provider string,
	label string,
	defaultLabel string,
	accountID string,
	tokenHint string,
	creds cloudsync.Credentials,
	scopes []string,
	accountNames []string,
	initialStats SyncStats,
) (queries.ProviderConnection, error) {
	id := rand.Text()
	now := time.Now().UTC().Format(time.RFC3339Nano)
	cleanProvider := strings.ToLower(strings.TrimSpace(provider))

	accountID = strings.TrimSpace(accountID)
	if accountID != "" {
		if _, err := s.queries.GetAccount(ctx, accountID); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return queries.ProviderConnection{}, ErrInvalidLink
			}
			return queries.ProviderConnection{}, err
		}
	}

	aad := id + ":" + cleanProvider
	ciphertext, nonce, err := s.keyRing.SealJSON(aad, creds)
	if err != nil {
		return queries.ProviderConnection{}, err
	}

	extName := strings.Join(accountNames, ", ")
	cleanLabel := strings.TrimSpace(label)
	if cleanLabel == "" {
		if len(accountNames) > 0 && strings.TrimSpace(accountNames[0]) != "" {
			cleanLabel = strings.TrimSpace(accountNames[0])
		} else if strings.TrimSpace(defaultLabel) != "" {
			cleanLabel = strings.TrimSpace(defaultLabel)
		} else {
			cleanLabel = cleanProvider
		}
	}

	if scopes == nil {
		scopes = []string{}
	}
	scopesJSON, _ := json.Marshal(scopes)
	statsJSON, _ := json.Marshal(initialStats)

	return s.queries.SaveProviderConnection(ctx, queries.SaveProviderConnectionParams{
		ID:                  id,
		Provider:            cleanProvider,
		Label:               cleanLabel,
		AccountID:           nullString(accountID),
		TokenHint:           tokenHint,
		SecretCiphertext:    ciphertext,
		SecretNonce:         nonce,
		ScopesJson:          string(scopesJSON),
		ExternalAccountName: extName,
		Status:              "ok",
		LastSyncedAt:        "",
		LastError:           "",
		StatsJson:           string(statsJSON),
		CreatedAt:           now,
		UpdatedAt:           now,
	})
}

func (s *Store) DecryptProviderCredentials(conn queries.ProviderConnection) (cloudsync.Credentials, error) {
	var creds cloudsync.Credentials
	if err := s.keyRing.OpenJSON(conn.ID+":"+conn.Provider, conn.SecretCiphertext, conn.SecretNonce, &creds); err != nil {
		return nil, err
	}
	return creds, nil
}

func (s *Store) RecordProviderSyncError(ctx context.Context, conn queries.ProviderConnection, syncErr error) (queries.ProviderConnection, error) {
	now := time.Now().UTC().Format(time.RFC3339Nano)
	return s.queries.UpdateProviderConnectionSyncState(ctx, queries.UpdateProviderConnectionSyncStateParams{
		Status:              "error",
		LastSyncedAt:        conn.LastSyncedAt,
		LastError:           syncErr.Error(),
		ScopesJson:          conn.ScopesJson,
		ExternalAccountName: conn.ExternalAccountName,
		StatsJson:           conn.StatsJson,
		UpdatedAt:           now,
		ID:                  conn.ID,
	})
}

func (s *Store) DeleteProviderConnection(ctx context.Context, id string) error {
	count, err := s.queries.DeleteProviderConnection(ctx, id)
	if err != nil {
		return err
	}
	if count == 0 {
		return ErrNotFound
	}
	return nil
}

func normalizeAddrKey(raw string) string {
	clean := strings.TrimSpace(raw)
	if clean == "" {
		return ""
	}
	if addr, err := netip.ParseAddr(clean); err == nil {
		return addr.Unmap().String()
	}
	if pfx, err := netip.ParsePrefix(clean); err == nil {
		if (pfx.Addr().Is4() && pfx.Bits() == 32) || (pfx.Addr().Is6() && pfx.Bits() == 128) {
			return pfx.Addr().Unmap().String()
		}
	}
	return ""
}

func zoneMatchesHostname(zoneName, hostname string) bool {
	z := strings.Trim(strings.ToLower(strings.TrimSpace(zoneName)), ".")
	h := strings.Trim(strings.ToLower(strings.TrimSpace(hostname)), ".")
	if z == "" || h == "" {
		return false
	}
	return h == z || strings.HasSuffix(h, "."+z)
}

func providerRegistrarDisplayName(provider string) string {
	switch strings.ToLower(strings.TrimSpace(provider)) {
	case "cloudflare":
		return "Cloudflare"
	case "porkbun":
		return "Porkbun"
	case "spaceship":
		return "Spaceship"
	case "aliyun":
		return "阿里云 (万网)"
	case "tencent":
		return "腾讯云"
	case "vercel":
		return "Vercel"
	case "digitalocean":
		return "DigitalOcean"
	default:
		return provider
	}
}

func providerDefaultPresetKey(provider string) string {
	switch strings.ToLower(strings.TrimSpace(provider)) {
	case "cloudflare":
		return "cloudflare"
	case "porkbun":
		return "porkbun"
	case "spaceship":
		return "spaceship"
	case "aliyun":
		return "aliyun_wanwang"
	case "tencent":
		return "tencent_dnspod"
	case "vercel":
		return "vercel_domains"
	case "digitalocean":
		return "digitalocean_dns"
	default:
		return ""
	}
}

func mergeTagsLimited(existingJSON string, incoming []string) string {
	var tags []string
	if existingJSON != "" {
		_ = json.Unmarshal([]byte(existingJSON), &tags)
	}
	for _, t := range incoming {
		clean := strings.TrimSpace(t)
		if clean != "" && !slices.Contains(tags, clean) && len(tags) < 20 {
			tags = append(tags, clean)
		}
	}
	if tags == nil {
		tags = []string{}
	}
	raw, _ := json.Marshal(tags)
	return string(raw)
}

func (s *Store) ReconcileUnifiedSnapshot(
	ctx context.Context,
	conn queries.ProviderConnection,
	snap cloudsync.UnifiedSnapshot,
	domainLookuper domainname.Lookuper,
) (queries.ProviderConnection, SyncStats, error) {
	provider := strings.ToLower(strings.TrimSpace(snap.Provider))
	if provider == "" {
		provider = strings.ToLower(strings.TrimSpace(conn.Provider))
	}

	serverRows, err := s.queries.ListServers(ctx)
	if err != nil {
		return conn, SyncStats{}, err
	}
	ipRows, err := s.queries.ListIPs(ctx)
	if err != nil {
		return conn, SyncStats{}, err
	}
	ipAccountLinks, err := s.queries.ListAllIPAccounts(ctx)
	if err != nil {
		return conn, SyncStats{}, err
	}
	existingDomains, err := s.ListDomains(ctx)
	if err != nil {
		return conn, SyncStats{}, err
	}

	existingByName := make(map[string]DomainRecord, len(existingDomains))
	for _, d := range existingDomains {
		existingByName[strings.ToLower(d.Name)] = d
	}

	appendUnique := func(m map[string][]string, k, v string) {
		if k == "" || v == "" {
			return
		}
		if !slices.Contains(m[k], v) {
			m[k] = append(m[k], v)
		}
	}

	serverByID := make(map[string]queries.Server, len(serverRows))
	serverByExtID := make(map[string]string)
	serverIDsByIP := make(map[string][]string)
	serverIDsByHost := make(map[string][]string)
	serverIDsByShortName := make(map[string][]string)

	indexServer := func(srv queries.Server) {
		serverByID[srv.ID] = srv
		if srv.ExternalID != "" {
			serverByExtID[srv.ExternalID] = srv.ID
		}
		if srv.Archived != 0 {
			return
		}
		appendUnique(serverIDsByIP, normalizeAddrKey(srv.Ipv4), srv.ID)
		appendUnique(serverIDsByIP, normalizeAddrKey(srv.Ipv6), srv.ID)
		appendUnique(serverIDsByIP, normalizeAddrKey(srv.PrivateIp), srv.ID)
		host := strings.Trim(strings.ToLower(strings.TrimSpace(srv.Hostname)), ".")
		if host != "" {
			appendUnique(serverIDsByHost, host, srv.ID)
			short := strings.Split(host, ".")[0]
			if short != "" {
				appendUnique(serverIDsByShortName, short, srv.ID)
			}
		}
		nm := strings.ToLower(strings.TrimSpace(srv.Name))
		if nm != "" {
			appendUnique(serverIDsByShortName, nm, srv.ID)
		}
	}
	for _, srv := range serverRows {
		indexServer(srv)
	}

	ipByAddr := make(map[string]queries.Ip, len(ipRows))
	ipIDsByAddr := make(map[string][]string)
	ipParentServer := make(map[string]string)
	ipAccountsSet := make(map[string][]string)
	for _, link := range ipAccountLinks {
		ipAccountsSet[link.IpID] = append(ipAccountsSet[link.IpID], link.AccountID)
	}
	indexIP := func(ip queries.Ip) {
		addrKey := normalizeAddrKey(ip.Address)
		if addrKey != "" {
			ipByAddr[addrKey] = ip
		}
		if ip.Archived != 0 {
			return
		}
		appendUnique(ipIDsByAddr, addrKey, ip.ID)
		if ip.ServerID.Valid && ip.ServerID.String != "" {
			ipParentServer[ip.ID] = ip.ServerID.String
		}
	}
	for _, ip := range ipRows {
		indexIP(ip)
	}

	// Bounded concurrent RDAP/WHOIS lookups ONLY for zones missing Registrar or ExpireDate
	type lookupOutcome struct {
		res domainname.LookupResult
		err error
	}
	rdapResults := make(map[string]lookupOutcome)
	if domainLookuper != nil && len(snap.Zones) > 0 {
		var mu sync.Mutex
		var wg sync.WaitGroup
		sem := make(chan struct{}, 4)

		for _, zs := range snap.Zones {
			zName := strings.ToLower(strings.TrimSpace(zs.Name))
			if zName == "" {
				continue
			}
			if regInfo, inReg := snap.Registrar[zName]; inReg && regInfo.ExpiresAt != "" {
				continue
			}
			if old, exists := existingByName[zName]; exists && old.ExpireDate != "" && old.Registrar != "" {
				continue
			}

			wg.Add(1)
			go func(domain string) {
				defer wg.Done()
				sem <- struct{}{}
				defer func() { <-sem }()

				lctx, cancel := context.WithTimeout(ctx, 6*time.Second)
				defer cancel()
				r, lerr := domainLookuper.Lookup(lctx, domain)
				mu.Lock()
				rdapResults[domain] = lookupOutcome{res: r, err: lerr}
				mu.Unlock()
			}(zName)
		}
		wg.Wait()
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return conn, SyncStats{}, err
	}
	defer func() { _ = tx.Rollback() }()
	qtx := s.queries.WithTx(tx)

	nowNano := time.Now().UTC().Format(time.RFC3339Nano)
	nowSec := time.Now().UTC().Format(time.RFC3339)

	stats := SyncStats{
		ZonesTotal: len(snap.Zones),
		PagesTotal: len(snap.Pages),
	}
	seenTunnelIDs := make(map[string]string)
	for _, t := range snap.Tunnels {
		if t.ID != "" {
			seenTunnelIDs[t.ID] = t.Status
		}
	}
	stats.TunnelsTotal = len(seenTunnelIDs)
	for _, st := range seenTunnelIDs {
		if strings.EqualFold(st, "healthy") {
			stats.TunnelsHealthy++
		}
	}

	// =========================================================================
	// Phase 1: Reconcile Synced Servers
	// =========================================================================
	extServerToIRM := make(map[string]string)

	for _, ss := range snap.Servers {
		var matchedID string
		if ss.ExternalID != "" {
			matchedID = serverByExtID[ss.ExternalID]
		}
		if matchedID == "" {
			if ids := serverIDsByIP[normalizeAddrKey(ss.IPv4)]; len(ids) == 1 {
				matchedID = ids[0]
			}
		}
		if matchedID == "" {
			if ids := serverIDsByIP[normalizeAddrKey(ss.PrivateIP)]; len(ids) == 1 {
				matchedID = ids[0]
			}
		}
		if matchedID == "" {
			cleanHost := strings.Trim(strings.ToLower(strings.TrimSpace(ss.Hostname)), ".")
			if ids := serverIDsByHost[cleanHost]; len(ids) == 1 {
				matchedID = ids[0]
			} else if short := strings.Split(cleanHost, ".")[0]; short != "" {
				if sids := serverIDsByShortName[short]; len(sids) == 1 {
					matchedID = sids[0]
				}
			}
		}

		metaJSON, _ := json.Marshal(ss.Meta)
		sshPort := ss.SSHPort
		if sshPort <= 0 || sshPort > 65535 {
			sshPort = 22
		}
		kind := normalizeSyncedServerKind(ss.Kind)
		status := normalizeSyncedServerStatus(ss.Status)
		region := firstNonEmptyStr(ss.Region, "US")
		arch := normalizeSyncedServerArch(ss.Arch)
		diskType := normalizeSyncedServerDiskType(ss.DiskType)
		trafficRule := normalizeSyncedServerTrafficRule(ss.TrafficRule)
		cleanExpire := normalizeOptionalISODate(ss.ExpireDate)

		if matchedID == "" {
			newSrvID := rand.Text()
			tagsJSON := mergeTagsLimited("", ss.Tags)
			srvName := strings.TrimSpace(ss.Name)
			if srvName == "" {
				srvName = firstNonEmptyStr(ss.Hostname, ss.IPv4, "Synced-Server")
			}

			if _, err := qtx.SaveServer(ctx, queries.SaveServerParams{
				ID:              newSrvID,
				PresetKey:       ss.PresetKey,
				Name:            srvName,
				Hostname:        ss.Hostname,
				Provider:        ss.ProviderName,
				Kind:            kind,
				Status:          status,
				Region:          region,
				Datacenter:      ss.Datacenter,
				Os:              ss.OS,
				Arch:            arch,
				CpuCores:        ss.CPUCores,
				MemoryMb:        ss.MemoryMB,
				DiskGb:          ss.DiskGB,
				DiskType:        diskType,
				BandwidthMbps:   ss.BandwidthMbps,
				TrafficGb:       ss.TrafficGB,
				TrafficRule:     trafficRule,
				TrafficResetDay: ss.TrafficResetDay,
				Ipv4:            ss.IPv4,
				Ipv6:            ss.IPv6,
				PrivateIp:       ss.PrivateIP,
				PortNote:        "",
				SshPort:         sshPort,
				SshUser:         "root",
				ConsoleUrl:      ss.ConsoleURL,
				SubscriptionID:  sql.NullString{},
				AccountID:       conn.AccountID,
				ExpireDate:      cleanExpire,
				TagsJson:        tagsJSON,
				Notes:           "",
				Archived:        0,
				CreatedAt:       nowNano,
				UpdatedAt:       nowNano,
			}); err != nil {
				return conn, SyncStats{}, err
			}

			savedSrv, err := qtx.UpdateServerSyncMeta(ctx, queries.UpdateServerSyncMetaParams{
				PresetKey:            ss.PresetKey,
				Name:                 srvName,
				Hostname:             ss.Hostname,
				Provider:             ss.ProviderName,
				Kind:                 kind,
				Status:               status,
				Region:               region,
				Datacenter:           ss.Datacenter,
				Os:                   ss.OS,
				Arch:                 arch,
				CpuCores:             ss.CPUCores,
				MemoryMb:             ss.MemoryMB,
				DiskGb:               ss.DiskGB,
				DiskType:             diskType,
				BandwidthMbps:        ss.BandwidthMbps,
				TrafficGb:            ss.TrafficGB,
				TrafficResetDay:      ss.TrafficResetDay,
				Ipv4:                 ss.IPv4,
				Ipv6:                 ss.IPv6,
				PrivateIp:            ss.PrivateIP,
				ConsoleUrl:           ss.ConsoleURL,
				AccountID:            conn.AccountID,
				ExpireDate:           cleanExpire,
				TagsJson:             tagsJSON,
				ProviderConnectionID: nullString(conn.ID),
				ExternalID:           ss.ExternalID,
				ProviderMetaJson:     string(metaJSON),
				UpdatedAt:            nowNano,
				ID:                   newSrvID,
			})
			if err != nil {
				return conn, SyncStats{}, err
			}

			indexServer(savedSrv)
			if ss.ExternalID != "" {
				extServerToIRM[ss.ExternalID] = newSrvID
			}
			stats.ServersImported++
			continue
		}

		// Non-destructive enrich of existing server
		oldSrv := serverByID[matchedID]
		acct := oldSrv.AccountID
		if !acct.Valid && conn.AccountID.Valid {
			acct = conn.AccountID
		}
		cpu := oldSrv.CpuCores
		if cpu == 0 && ss.CPUCores > 0 {
			cpu = ss.CPUCores
		}
		mem := oldSrv.MemoryMb
		if mem == 0 && ss.MemoryMB > 0 {
			mem = ss.MemoryMB
		}
		disk := oldSrv.DiskGb
		if disk == 0 && ss.DiskGB > 0 {
			disk = ss.DiskGB
		}
		bw := oldSrv.BandwidthMbps
		if bw == 0 && ss.BandwidthMbps > 0 {
			bw = ss.BandwidthMbps
		}
		trafficGB := oldSrv.TrafficGb
		if ss.TrafficGB > 0 {
			trafficGB = ss.TrafficGB
		}
		resetDay := oldSrv.TrafficResetDay
		if ss.TrafficResetDay > 0 {
			resetDay = ss.TrafficResetDay
		}
		expDate := oldSrv.ExpireDate
		if cleanExpire != "" {
			expDate = cleanExpire
		}
		tagsJSON := mergeTagsLimited(oldSrv.TagsJson, ss.Tags)

		// Preserve existing providerMeta if new sync is overlay-only (e.g. Tailscale enriching a VPS)
		mergedMeta := string(metaJSON)
		if provider == "tailscale" && oldSrv.ProviderMetaJson != "" && oldSrv.ProviderMetaJson != "{}" {
			var prevMeta cloudsync.ServerProviderMeta
			if json.Unmarshal([]byte(oldSrv.ProviderMetaJson), &prevMeta) == nil && prevMeta.TrafficTotalBytes > 0 {
				prevMeta.LastSeenAt = ss.Meta.LastSeenAt
				prevMeta.ClientVersion = ss.Meta.ClientVersion
				rawM, _ := json.Marshal(prevMeta)
				mergedMeta = string(rawM)
			}
		}

		updatedSrv, err := qtx.UpdateServerSyncMeta(ctx, queries.UpdateServerSyncMetaParams{
			PresetKey:            firstNonEmptyStr(oldSrv.PresetKey, ss.PresetKey),
			Name:                 firstNonEmptyStr(oldSrv.Name, ss.Name),
			Hostname:             firstNonEmptyStr(oldSrv.Hostname, ss.Hostname),
			Provider:             firstNonEmptyStr(oldSrv.Provider, ss.ProviderName),
			Kind:                 firstNonEmptyStr(oldSrv.Kind, kind),
			Status:               firstNonEmptyStr(oldSrv.Status, status),
			Region:               firstNonEmptyStr(oldSrv.Region, region),
			Datacenter:           firstNonEmptyStr(oldSrv.Datacenter, ss.Datacenter),
			Os:                   firstNonEmptyStr(oldSrv.Os, ss.OS),
			Arch:                 firstNonEmptyStr(oldSrv.Arch, arch),
			CpuCores:             cpu,
			MemoryMb:             mem,
			DiskGb:               disk,
			DiskType:             firstNonEmptyStr(oldSrv.DiskType, diskType),
			BandwidthMbps:        bw,
			TrafficGb:            trafficGB,
			TrafficResetDay:      resetDay,
			Ipv4:                 firstNonEmptyStr(oldSrv.Ipv4, ss.IPv4),
			Ipv6:                 firstNonEmptyStr(oldSrv.Ipv6, ss.IPv6),
			PrivateIp:            firstNonEmptyStr(oldSrv.PrivateIp, ss.PrivateIP),
			ConsoleUrl:           firstNonEmptyStr(oldSrv.ConsoleUrl, ss.ConsoleURL),
			AccountID:            acct,
			ExpireDate:           expDate,
			TagsJson:             tagsJSON,
			ProviderConnectionID: nullString(conn.ID),
			ExternalID:           firstNonEmptyStr(ss.ExternalID, oldSrv.ExternalID),
			ProviderMetaJson:     mergedMeta,
			UpdatedAt:            nowNano,
			ID:                   oldSrv.ID,
		})
		if err != nil {
			return conn, SyncStats{}, err
		}

		indexServer(updatedSrv)
		if ss.ExternalID != "" {
			extServerToIRM[ss.ExternalID] = oldSrv.ID
		}
		stats.ServersUpdated++
	}

	// =========================================================================
	// Phase 2: Reconcile Synced IPs
	// =========================================================================
	for _, sip := range snap.IPs {
		parsed, perr := ipaddr.ParseAddress(sip.Address)
		if perr != nil {
			continue
		}
		addrKey := normalizeAddrKey(parsed.Canonical)
		if addrKey == "" {
			continue
		}

		var linkedSrvID string
		if sip.HostExternalID != "" {
			linkedSrvID = extServerToIRM[sip.HostExternalID]
		}
		if linkedSrvID == "" {
			if sids := serverIDsByIP[addrKey]; len(sids) == 1 {
				linkedSrvID = sids[0]
			}
		}

		scope := normalizeSyncedIPScope(sip.NetworkScope)
		cat := normalizeSyncedIPCategory(sip.Category)
		region := firstNonEmptyStr(sip.Region, "US")
		asnType := normalizeSyncedIPASNType(sip.ASNType)
		originType := normalizeSyncedIPOriginType(sip.OriginType)
		role := normalizeSyncedIPRole(sip.Role)
		status := normalizeSyncedIPStatus(sip.Status)
		risk := normalizeSyncedIPRiskLevel(sip.RiskLevel)

		oldIP, exists := ipByAddr[addrKey]
		if !exists {
			newIPID := rand.Text()
			tagsJSON := mergeTagsLimited("", sip.Tags)
			probeStatus := "unchecked"
			if !parsed.ProbingAllowed {
				probeStatus = "skipped_non_public"
			}

			if _, err := qtx.SaveIP(ctx, queries.SaveIPParams{
				ID:              newIPID,
				PresetKey:       sip.PresetKey,
				Address:         parsed.Canonical,
				Version:         int64(parsed.Version),
				PrefixLen:       int64(parsed.PrefixLen),
				NetworkScope:    scope,
				Category:        cat,
				Provider:        firstNonEmptyStr(sip.ProviderName, provider),
				Label:           sip.Label,
				Region:          region,
				City:            sip.City,
				Asn:             0,
				AsnOrg:          "",
				PtrRecord:       "",
				AsnType:         asnType,
				OriginType:      originType,
				RiskLevel:       risk,
				PurityNote:      sip.PurityNote,
				UnlocksJson:     "{}",
				TagsJson:        tagsJSON,
				ManualLocksJson: "[]",
				LookupSource:    provider,
				LookupCheckedAt: nowSec,
				LookupError:     "",
				Role:            role,
				Status:          status,
				ReviewCycle:     "none",
				ReviewDays:      0,
				NextReviewDate:  "",
				LastReviewedAt:  "",
				ProbeMode:       "none",
				ProbePort:       0,
				ProbeStatus:     probeStatus,
				ProbeLatencyMs:  0,
				ProbeCheckedAt:  "",
				ProbeError:      "",
				SubscriptionID:  sql.NullString{},
				ServerID:        nullString(linkedSrvID),
				HostLabel:       sip.HostLabel,
				ConsoleUrl:      sip.ConsoleURL,
				Notes:           "",
				Archived:        0,
				CreatedAt:       nowNano,
				UpdatedAt:       nowNano,
			}); err != nil {
				return conn, SyncStats{}, err
			}

			savedIP, err := qtx.UpdateIPSyncMeta(ctx, queries.UpdateIPSyncMetaParams{
				PresetKey:            sip.PresetKey,
				Provider:             firstNonEmptyStr(sip.ProviderName, provider),
				Label:                sip.Label,
				Region:               region,
				City:                 sip.City,
				RiskLevel:            risk,
				PurityNote:           sip.PurityNote,
				Status:               status,
				ServerID:             nullString(linkedSrvID),
				HostLabel:            sip.HostLabel,
				ConsoleUrl:           sip.ConsoleURL,
				TagsJson:             tagsJSON,
				ProviderConnectionID: nullString(conn.ID),
				ExternalID:           sip.ExternalID,
				UpdatedAt:            nowNano,
				ID:                   newIPID,
			})
			if err != nil {
				return conn, SyncStats{}, err
			}

			if conn.AccountID.Valid && conn.AccountID.String != "" {
				_ = qtx.InsertIPAccount(ctx, queries.InsertIPAccountParams{
					IpID:      newIPID,
					AccountID: conn.AccountID.String,
					CreatedAt: nowNano,
				})
				ipAccountsSet[newIPID] = append(ipAccountsSet[newIPID], conn.AccountID.String)
			}

			indexIP(savedIP)
			stats.IPsImported++
			if linkedSrvID != "" {
				stats.ServerLinksAdded++
			}
			continue
		}

		// Non-destructive enrich of existing IP
		srvLink := oldIP.ServerID
		if (!srvLink.Valid || srvLink.String == "") && linkedSrvID != "" {
			srvLink = nullString(linkedSrvID)
			stats.ServerLinksAdded++
		}
		mergedRisk := oldIP.RiskLevel
		mergedPurity := oldIP.PurityNote
		if risk == "high" || (mergedRisk == "unassessed" && sip.RiskLevel != "") {
			mergedRisk = risk
			if sip.PurityNote != "" {
				mergedPurity = sip.PurityNote
			}
		}
		tagsJSON := mergeTagsLimited(oldIP.TagsJson, sip.Tags)

		updatedIP, err := qtx.UpdateIPSyncMeta(ctx, queries.UpdateIPSyncMetaParams{
			PresetKey:            firstNonEmptyStr(oldIP.PresetKey, sip.PresetKey),
			Provider:             firstNonEmptyStr(oldIP.Provider, sip.ProviderName),
			Label:                firstNonEmptyStr(oldIP.Label, sip.Label),
			Region:               firstNonEmptyStr(oldIP.Region, region),
			City:                 firstNonEmptyStr(oldIP.City, sip.City),
			RiskLevel:            mergedRisk,
			PurityNote:           mergedPurity,
			Status:               firstNonEmptyStr(oldIP.Status, status),
			ServerID:             srvLink,
			HostLabel:            firstNonEmptyStr(oldIP.HostLabel, sip.HostLabel),
			ConsoleUrl:           firstNonEmptyStr(oldIP.ConsoleUrl, sip.ConsoleURL),
			TagsJson:             tagsJSON,
			ProviderConnectionID: nullString(conn.ID),
			ExternalID:           firstNonEmptyStr(sip.ExternalID, oldIP.ExternalID),
			UpdatedAt:            nowNano,
			ID:                   oldIP.ID,
		})
		if err != nil {
			return conn, SyncStats{}, err
		}

		if conn.AccountID.Valid && conn.AccountID.String != "" && !slices.Contains(ipAccountsSet[oldIP.ID], conn.AccountID.String) {
			_ = qtx.InsertIPAccount(ctx, queries.InsertIPAccountParams{
				IpID:      oldIP.ID,
				AccountID: conn.AccountID.String,
				CreatedAt: nowNano,
			})
			ipAccountsSet[oldIP.ID] = append(ipAccountsSet[oldIP.ID], conn.AccountID.String)
		}

		indexIP(updatedIP)
		stats.IPsUpdated++
	}

	// =========================================================================
	// Phase 3: Reconcile Synced Domains, DNS Records & Edge Topology
	// =========================================================================
	defaultRegDisplay := providerRegistrarDisplayName(provider)
	defaultPreset := providerDefaultPresetKey(provider)

	for _, zs := range snap.Zones {
		normalizedName, normErr := domainname.NormalizeName(zs.Name)
		if normErr != nil {
			continue
		}

		var (
			autoServerIDs []string
			autoIPIDs     []string
			proxiedCount  int
		)
		enrichedRecords := make([]cloudsync.SyncedDNSRecord, 0, len(zs.Records))
		for _, rec := range zs.Records {
			if rec.Proxied {
				proxiedCount++
			}
			var recSrvIDs []string
			var recIPIDs []string

			switch rec.Type {
			case "A", "AAAA":
				addrKey := normalizeAddrKey(rec.Content)
				if addrKey != "" {
					for _, sid := range serverIDsByIP[addrKey] {
						if !slices.Contains(recSrvIDs, sid) {
							recSrvIDs = append(recSrvIDs, sid)
						}
						if !slices.Contains(autoServerIDs, sid) {
							autoServerIDs = append(autoServerIDs, sid)
						}
					}
					for _, ipid := range ipIDsByAddr[addrKey] {
						if !slices.Contains(recIPIDs, ipid) {
							recIPIDs = append(recIPIDs, ipid)
						}
						if !slices.Contains(autoIPIDs, ipid) {
							autoIPIDs = append(autoIPIDs, ipid)
						}
						if parentSrv := ipParentServer[ipid]; parentSrv != "" {
							if !slices.Contains(recSrvIDs, parentSrv) {
								recSrvIDs = append(recSrvIDs, parentSrv)
							}
							if !slices.Contains(autoServerIDs, parentSrv) {
								autoServerIDs = append(autoServerIDs, parentSrv)
							}
						}
					}
				}
			case "CNAME":
				targetHost := strings.Trim(strings.ToLower(strings.TrimSpace(rec.Content)), ".")
				for _, sid := range serverIDsByHost[targetHost] {
					if !slices.Contains(recSrvIDs, sid) {
						recSrvIDs = append(recSrvIDs, sid)
					}
					if !slices.Contains(autoServerIDs, sid) {
						autoServerIDs = append(autoServerIDs, sid)
					}
				}
			}

			rec.MatchedServerIDs = recSrvIDs
			rec.MatchedIPIDs = recIPIDs
			enrichedRecords = append(enrichedRecords, rec)
		}
		stats.RecordsSynced += len(enrichedRecords)

		var zoneTunnels []cloudsync.SyncedTunnelRoute
		for _, tun := range snap.Tunnels {
			if tun.Hostname != "" && zoneMatchesHostname(normalizedName, tun.Hostname) {
				zoneTunnels = append(zoneTunnels, tun)
			}
		}
		var zonePages []cloudsync.SyncedPagesProject
		for _, pg := range snap.Pages {
			var matchedDoms []string
			for _, cd := range pg.Domains {
				if zoneMatchesHostname(normalizedName, cd) {
					matchedDoms = append(matchedDoms, cd)
				}
			}
			if len(matchedDoms) > 0 {
				zonePages = append(zonePages, cloudsync.SyncedPagesProject{
					Name:      pg.Name,
					Subdomain: pg.Subdomain,
					Domains:   matchedDoms,
				})
			}
		}

		edgeMeta := cloudsync.DomainEdgeMeta{
			Provider:      provider,
			AccountName:   zs.AccountName,
			Plan:          zs.PlanName,
			ZoneStatus:    zs.Status,
			NameServers:   zs.NameServers,
			ProxiedCount:  proxiedCount,
			TotalRecords:  len(enrichedRecords),
			WorkerRoutes:  zs.WorkerRoutes,
			Tunnels:       zoneTunnels,
			PagesProjects: zonePages,
		}
		recordsJSON, _ := json.Marshal(enrichedRecords)
		edgeJSON, _ := json.Marshal(edgeMeta)

		regInfo, hasReg := snap.Registrar[normalizedName]
		rdapOut, hasRDAP := rdapResults[normalizedName]

		consoleURL := zs.ConsoleURL
		if consoleURL == "" {
			if provider == "cloudflare" {
				consoleURL = "https://dash.cloudflare.com"
				if zs.AccountID != "" {
					consoleURL = "https://dash.cloudflare.com/" + zs.AccountID + "/" + normalizedName
				}
			}
		}

		zoneDNSProvider := zs.DNSProviderName
		if zoneDNSProvider == "" && provider == "cloudflare" {
			zoneDNSProvider = "Cloudflare DNS"
		}

		zonePreset := firstNonEmptyStr(zs.DefaultPresetKey, defaultPreset)

		old, exists := existingByName[normalizedName]
		if !exists {
			presetKey := zonePreset
			registrar := ""
			dnsProv := zoneDNSProvider
			expireDate := ""
			autoRenew := int64(1)
			whoisPrivacy := int64(1)
			lookupSource := provider
			lookupErrText := ""

			if hasReg {
				registrar = defaultRegDisplay
				expireDate = regInfo.ExpiresAt
				if !regInfo.AutoRenew {
					autoRenew = 0
				}
				if !regInfo.Privacy {
					whoisPrivacy = 0
				}
				lookupSource = provider + "_registrar"
			}
			if hasRDAP {
				if rdapOut.err == nil {
					if registrar == "" && rdapOut.res.Registrar != "" {
						registrar = rdapOut.res.Registrar
					}
					if expireDate == "" && rdapOut.res.ExpireDate != "" {
						expireDate = rdapOut.res.ExpireDate
					}
					if dnsProv == "" && rdapOut.res.DNSProvider != "" {
						dnsProv = rdapOut.res.DNSProvider
					}
					if presetKey == "" && rdapOut.res.PresetKey != "" {
						presetKey = rdapOut.res.PresetKey
					}
					if !hasReg {
						lookupSource = provider + "+" + rdapOut.res.Source
					}
				} else if !hasReg {
					lookupErrText = rdapOut.err.Error()
				}
			}

			domStatus := "active"
			if zs.Paused || zs.Status == "pending" {
				domStatus = "parked"
			}

			var extraTags []string
			if proxiedCount > 0 {
				extraTags = append(extraTags, "Cloudflare 橙云")
			}
			if len(zoneTunnels) > 0 {
				extraTags = append(extraTags, "CF Tunnel")
			}
			tagsJSON := mergeTagsLimited("", extraTags)

			newID := rand.Text()
			if _, err := qtx.SaveDomain(ctx, queries.SaveDomainParams{
				ID:                 newID,
				PresetKey:          presetKey,
				Name:               normalizedName,
				Registrar:          registrar,
				DnsProvider:        dnsProv,
				Purpose:            "prod",
				Status:             domStatus,
				ExpireDate:         expireDate,
				AutoRenew:          autoRenew,
				WhoisPrivacy:       whoisPrivacy,
				IcpStatus:          "none",
				IcpNumber:          "",
				ManagementUrl:      consoleURL,
				SubscriptionID:     sql.NullString{},
				RegistrarAccountID: conn.AccountID,
				TagsJson:           tagsJSON,
				Notes:              "",
				Archived:           0,
				CreatedAt:          nowNano,
				UpdatedAt:          nowNano,
			}); err != nil {
				return conn, SyncStats{}, err
			}

			if _, err := qtx.UpdateDomainSyncMeta(ctx, queries.UpdateDomainSyncMetaParams{
				PresetKey:            presetKey,
				Registrar:            registrar,
				DnsProvider:          dnsProv,
				Status:               domStatus,
				ExpireDate:           expireDate,
				AutoRenew:            autoRenew,
				WhoisPrivacy:         whoisPrivacy,
				ManagementUrl:        consoleURL,
				RegistrarAccountID:   conn.AccountID,
				TagsJson:             tagsJSON,
				ProviderConnectionID: nullString(conn.ID),
				ExternalZoneID:       zs.ZoneID,
				DnsRecordsJson:       string(recordsJSON),
				EdgeMetaJson:         string(edgeJSON),
				LookupSource:         lookupSource,
				LookupCheckedAt:      nowSec,
				LookupError:          lookupErrText,
				UpdatedAt:            nowNano,
				ID:                   newID,
			}); err != nil {
				return conn, SyncStats{}, err
			}

			for _, sid := range autoServerIDs {
				if err := qtx.InsertServerDomain(ctx, queries.InsertServerDomainParams{
					ServerID:  sid,
					DomainID:  newID,
					CreatedAt: nowNano,
				}); err != nil {
					return conn, SyncStats{}, err
				}
				stats.ServerLinksAdded++
			}
			for _, ipid := range autoIPIDs {
				if err := qtx.InsertIPDomain(ctx, queries.InsertIPDomainParams{
					IpID:      ipid,
					DomainID:  newID,
					CreatedAt: nowNano,
				}); err != nil {
					return conn, SyncStats{}, err
				}
				stats.IPLinksAdded++
			}
			stats.DomainsImported++
			continue
		}

		// Non-destructive update of existing domain
		presetKey := firstNonEmptyStr(old.PresetKey, zonePreset)
		registrar := old.Registrar
		expireDate := old.ExpireDate
		autoRenew := old.AutoRenew
		whoisPrivacy := old.WhoisPrivacy
		lookupSource := old.LookupSource
		lookupErrText := ""

		if hasReg {
			if registrar == "" || strings.EqualFold(registrar, defaultRegDisplay) {
				registrar = defaultRegDisplay
			}
			if regInfo.ExpiresAt != "" {
				expireDate = regInfo.ExpiresAt
			}
			if regInfo.AutoRenew {
				autoRenew = 1
			} else {
				autoRenew = 0
			}
			if regInfo.Privacy {
				whoisPrivacy = 1
			} else {
				whoisPrivacy = 0
			}
			lookupSource = provider + "_registrar"
		} else if hasRDAP {
			if rdapOut.err == nil {
				if registrar == "" && rdapOut.res.Registrar != "" {
					registrar = rdapOut.res.Registrar
				}
				if expireDate == "" && rdapOut.res.ExpireDate != "" {
					expireDate = rdapOut.res.ExpireDate
				}
				if old.PresetKey == "" && rdapOut.res.PresetKey != "" {
					presetKey = rdapOut.res.PresetKey
				}
				lookupSource = provider + "+" + rdapOut.res.Source
			} else {
				lookupErrText = rdapOut.err.Error()
			}
		} else if lookupSource == "" {
			lookupSource = provider
		}

		dnsProvider := old.DnsProvider
		if zoneDNSProvider != "" && (dnsProvider == "" || strings.EqualFold(dnsProvider, zoneDNSProvider) || (provider == "cloudflare" && strings.Contains(strings.ToLower(dnsProvider), "cloudflare"))) {
			dnsProvider = zoneDNSProvider
		}
		mgmtURL := old.ManagementUrl
		if consoleURL != "" && (mgmtURL == "" || mgmtURL == "https://dash.cloudflare.com") {
			mgmtURL = consoleURL
		}
		regAcct := old.RegistrarAccountID
		if !regAcct.Valid && conn.AccountID.Valid {
			regAcct = conn.AccountID
		}

		var extraTags []string
		if proxiedCount > 0 {
			extraTags = append(extraTags, "Cloudflare 橙云")
		}
		if len(zoneTunnels) > 0 {
			extraTags = append(extraTags, "CF Tunnel")
		}
		tagsJSON := mergeTagsLimited(old.TagsJson, extraTags)

		// Preserve existing DNS/Edge snapshot if this sync is registrar-only (e.g. Porkbun/Aliyun registrar updating a Cloudflare-hosted zone)
		finalConnID := nullString(conn.ID)
		finalExtZoneID := zs.ZoneID
		finalRecordsJSON := string(recordsJSON)
		finalEdgeJSON := string(edgeJSON)
		if zs.RegistrarOnly && len(enrichedRecords) == 0 && len(zonePages) == 0 && old.DnsRecordsJson != "" && old.DnsRecordsJson != "[]" {
			finalConnID = old.ProviderConnectionID
			finalExtZoneID = old.ExternalZoneID
			finalRecordsJSON = old.DnsRecordsJson
			finalEdgeJSON = old.EdgeMetaJson
		}

		if _, err := qtx.UpdateDomainSyncMeta(ctx, queries.UpdateDomainSyncMetaParams{
			PresetKey:            presetKey,
			Registrar:            registrar,
			DnsProvider:          dnsProvider,
			Status:               old.Status,
			ExpireDate:           expireDate,
			AutoRenew:            autoRenew,
			WhoisPrivacy:         whoisPrivacy,
			ManagementUrl:        mgmtURL,
			RegistrarAccountID:   regAcct,
			TagsJson:             tagsJSON,
			ProviderConnectionID: finalConnID,
			ExternalZoneID:       finalExtZoneID,
			DnsRecordsJson:       finalRecordsJSON,
			EdgeMetaJson:         finalEdgeJSON,
			LookupSource:         lookupSource,
			LookupCheckedAt:      nowSec,
			LookupError:          lookupErrText,
			UpdatedAt:            nowNano,
			ID:                   old.ID,
		}); err != nil {
			return conn, SyncStats{}, err
		}

		for _, sid := range autoServerIDs {
			if !slices.Contains(old.ServerIDs, sid) {
				if err := qtx.InsertServerDomain(ctx, queries.InsertServerDomainParams{
					ServerID:  sid,
					DomainID:  old.ID,
					CreatedAt: nowNano,
				}); err != nil {
					return conn, SyncStats{}, err
				}
				stats.ServerLinksAdded++
			}
		}
		for _, ipid := range autoIPIDs {
			if !slices.Contains(old.IPIDs, ipid) {
				if err := qtx.InsertIPDomain(ctx, queries.InsertIPDomainParams{
					IpID:      ipid,
					DomainID:  old.ID,
					CreatedAt: nowNano,
				}); err != nil {
					return conn, SyncStats{}, err
				}
				stats.IPLinksAdded++
			}
		}
		stats.DomainsUpdated++
	}

	scopes := snap.Scopes
	if scopes == nil {
		scopes = []string{}
	}
	scopesJSON, _ := json.Marshal(scopes)
	statsJSON, _ := json.Marshal(stats)
	extName := conn.ExternalAccountName
	if len(snap.AccountNames) > 0 {
		extName = strings.Join(snap.AccountNames, ", ")
	}

	updatedConn, err := qtx.UpdateProviderConnectionSyncState(ctx, queries.UpdateProviderConnectionSyncStateParams{
		Status:              "ok",
		LastSyncedAt:        nowSec,
		LastError:           "",
		ScopesJson:          string(scopesJSON),
		ExternalAccountName: extName,
		StatsJson:           string(statsJSON),
		UpdatedAt:           nowNano,
		ID:                  conn.ID,
	})
	if err != nil {
		return conn, SyncStats{}, err
	}

	if err := tx.Commit(); err != nil {
		return conn, SyncStats{}, err
	}
	return updatedConn, stats, nil
}

func firstNonEmptyStr(values ...string) string {
	for _, v := range values {
		if t := strings.TrimSpace(v); t != "" {
			return t
		}
	}
	return ""
}

func normalizeOptionalISODate(raw string) string {
	s := strings.TrimSpace(raw)
	if len(s) >= 10 {
		if _, err := time.Parse("2006-01-02", s[:10]); err == nil {
			return s[:10]
		}
	}
	return ""
}

func normalizeSyncedServerKind(raw string) string {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "vps", "dedicated", "nat", "homelab", "nas":
		return strings.ToLower(strings.TrimSpace(raw))
	default:
		return "vps"
	}
}

func normalizeSyncedServerStatus(raw string) string {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "active", "standby", "maintenance", "retiring":
		return strings.ToLower(strings.TrimSpace(raw))
	default:
		return "active"
	}
}

func normalizeSyncedServerArch(raw string) string {
	s := strings.ToLower(strings.TrimSpace(raw))
	switch {
	case s == "arm64" || s == "aarch64" || strings.Contains(s, "arm"):
		return "arm64"
	case s == "other":
		return "other"
	default:
		return "amd64"
	}
}

func normalizeSyncedServerDiskType(raw string) string {
	s := strings.ToLower(strings.TrimSpace(raw))
	switch {
	case s == "nvme" || strings.Contains(s, "nvme"):
		return "nvme"
	case s == "ssd" || strings.Contains(s, "ssd") || strings.Contains(s, "essd"):
		return "ssd"
	case s == "hdd" || strings.Contains(s, "hdd") || strings.Contains(s, "sata"):
		return "hdd"
	case s == "raid":
		return "raid"
	default:
		return ""
	}
}

func normalizeSyncedServerTrafficRule(raw string) string {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "out_only", "out":
		return "out_only"
	case "unlimited":
		return "unlimited"
	default:
		return "both"
	}
}

func normalizeSyncedIPScope(raw string) string {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "overseas_exit", "domestic_entry", "overlay_private":
		return strings.ToLower(strings.TrimSpace(raw))
	default:
		return "overseas_exit"
	}
}

func normalizeSyncedIPCategory(raw string) string {
	s := strings.ToLower(strings.TrimSpace(raw))
	switch s {
	case "residential_isp", "cloud_vps", "floating_eip", "transit_relay", "home_ddns", "overlay_subnet":
		return s
	case "overlay_mesh":
		return "overlay_subnet"
	default:
		return "cloud_vps"
	}
}

func normalizeSyncedIPASNType(raw string) string {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "residential", "isp", "hosting", "mobile", "business", "private":
		return strings.ToLower(strings.TrimSpace(raw))
	default:
		return "hosting"
	}
}

func normalizeSyncedIPOriginType(raw string) string {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "native", "broadcast", "unknown":
		return strings.ToLower(strings.TrimSpace(raw))
	default:
		return "native"
	}
}

func normalizeSyncedIPRole(raw string) string {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "dedicated", "primary", "service", "standby":
		return strings.ToLower(strings.TrimSpace(raw))
	case "overlay":
		return "service"
	default:
		return "primary"
	}
}

func normalizeSyncedIPStatus(raw string) string {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "active", "degraded", "blocked", "retiring":
		return strings.ToLower(strings.TrimSpace(raw))
	default:
		return "active"
	}
}

func normalizeSyncedIPRiskLevel(raw string) string {
	switch strings.ToLower(strings.TrimSpace(raw)) {
	case "clean", "low", "medium", "high", "unassessed":
		return strings.ToLower(strings.TrimSpace(raw))
	case "high_risk":
		return "high"
	default:
		return "unassessed"
	}
}
