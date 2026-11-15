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
	"github.com/Yueyanc/internet-resource-manager/internal/storage/queries"
)

type SyncStats struct {
	ZonesTotal       int `json:"zonesTotal"`
	DomainsImported  int `json:"domainsImported"`
	DomainsUpdated   int `json:"domainsUpdated"`
	RecordsSynced    int `json:"recordsSynced"`
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

func (s *Store) CreateCloudflareConnection(
	ctx context.Context,
	label string,
	accountID string,
	apiToken string,
	verify cloudsync.VerifySummary,
) (queries.ProviderConnection, error) {
	id := rand.Text()
	now := time.Now().UTC().Format(time.RFC3339Nano)

	accountID = strings.TrimSpace(accountID)
	if accountID != "" {
		if _, err := s.queries.GetAccount(ctx, accountID); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return queries.ProviderConnection{}, ErrInvalidLink
			}
			return queries.ProviderConnection{}, err
		}
	}

	aad := id + ":cloudflare"
	ciphertext, nonce, err := s.keyRing.SealJSON(aad, cloudsync.CloudflareCredentials{APIToken: apiToken})
	if err != nil {
		return queries.ProviderConnection{}, err
	}

	extName := strings.Join(verify.AccountNames, ", ")
	cleanLabel := strings.TrimSpace(label)
	if cleanLabel == "" {
		if len(verify.AccountNames) > 0 {
			cleanLabel = verify.AccountNames[0]
		} else {
			cleanLabel = "Cloudflare"
		}
	}

	scopes := verify.Scopes
	if scopes == nil {
		scopes = []string{}
	}
	scopesJSON, _ := json.Marshal(scopes)
	statsJSON, _ := json.Marshal(SyncStats{ZonesTotal: verify.ZonesCount})

	return s.queries.SaveProviderConnection(ctx, queries.SaveProviderConnectionParams{
		ID:                  id,
		Provider:            "cloudflare",
		Label:               cleanLabel,
		AccountID:           nullString(accountID),
		TokenHint:           cloudsync.MaskSecret(apiToken),
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

func (s *Store) DecryptCloudflareToken(conn queries.ProviderConnection) (string, error) {
	var creds cloudsync.CloudflareCredentials
	if err := s.keyRing.OpenJSON(conn.ID+":"+conn.Provider, conn.SecretCiphertext, conn.SecretNonce, &creds); err != nil {
		return "", err
	}
	return creds.APIToken, nil
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

func (s *Store) ReconcileCloudflareSnapshot(
	ctx context.Context,
	conn queries.ProviderConnection,
	snap cloudsync.Snapshot,
	domainLookuper domainname.Lookuper,
) (queries.ProviderConnection, SyncStats, error) {
	// 1. Pre-load active Servers & IPs to build fast IP / Hostname topology lookup maps
	serverRows, err := s.queries.ListServers(ctx)
	if err != nil {
		return conn, SyncStats{}, err
	}
	ipRows, err := s.queries.ListIPs(ctx)
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

	serverIDsByIP := make(map[string][]string)
	serverIDsByHost := make(map[string][]string)
	appendUnique := func(m map[string][]string, k, v string) {
		if k == "" || v == "" {
			return
		}
		if !slices.Contains(m[k], v) {
			m[k] = append(m[k], v)
		}
	}

	for _, srv := range serverRows {
		if srv.Archived != 0 {
			continue
		}
		appendUnique(serverIDsByIP, normalizeAddrKey(srv.Ipv4), srv.ID)
		appendUnique(serverIDsByIP, normalizeAddrKey(srv.Ipv6), srv.ID)
		appendUnique(serverIDsByIP, normalizeAddrKey(srv.PrivateIp), srv.ID)
		host := strings.Trim(strings.ToLower(strings.TrimSpace(srv.Hostname)), ".")
		if strings.Contains(host, ".") {
			appendUnique(serverIDsByHost, host, srv.ID)
		}
	}

	ipIDsByAddr := make(map[string][]string)
	ipParentServer := make(map[string]string)
	for _, ip := range ipRows {
		if ip.Archived != 0 {
			continue
		}
		addrKey := normalizeAddrKey(ip.Address)
		appendUnique(ipIDsByAddr, addrKey, ip.ID)
		if ip.ServerID.Valid && ip.ServerID.String != "" {
			ipParentServer[ip.ID] = ip.ServerID.String
		}
	}

	// 2. Run bounded concurrent RDAP/WHOIS lookups ONLY for zones missing Registrar or ExpireDate
	// (not in Cloudflare Registrar and not already populated in IRM)
	type lookupOutcome struct {
		res domainname.LookupResult
		err error
	}
	rdapResults := make(map[string]lookupOutcome)
	if domainLookuper != nil {
		var mu sync.Mutex
		var wg sync.WaitGroup
		sem := make(chan struct{}, 4)

		for _, zs := range snap.Zones {
			zName := zs.Name
			if zName == "" {
				continue
			}
			if _, inCFReg := snap.Registrar[zName]; inCFReg {
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

	// 3. Reconcile inside a single SQLite transaction
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

	for _, zs := range snap.Zones {
		normalizedName, normErr := domainname.NormalizeName(zs.Name)
		if normErr != nil {
			continue
		}

		// Match DNS records to IRM Servers & IPs
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

		// Match Cloudflare Tunnels & Pages belonging to this zone
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
			Provider:      "cloudflare",
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

		cfReg, hasCFReg := snap.Registrar[normalizedName]
		rdapOut, hasRDAP := rdapResults[normalizedName]

		consoleURL := "https://dash.cloudflare.com"
		if zs.AccountID != "" {
			consoleURL = "https://dash.cloudflare.com/" + zs.AccountID + "/" + normalizedName
		}

		old, exists := existingByName[normalizedName]
		if !exists {
			// Create brand-new domain from Cloudflare Zone!
			presetKey := "cloudflare"
			registrar := ""
			expireDate := ""
			autoRenew := int64(1)
			whoisPrivacy := int64(1)
			lookupSource := "cloudflare"
			lookupErrText := ""

			if hasCFReg {
				registrar = "Cloudflare"
				expireDate = cfReg.ExpiresAt
				if !cfReg.AutoRenew {
					autoRenew = 0
				}
				if !cfReg.Privacy {
					whoisPrivacy = 0
				}
				lookupSource = "cloudflare_registrar"
			} else if hasRDAP {
				if rdapOut.err == nil {
					if rdapOut.res.Registrar != "" {
						registrar = rdapOut.res.Registrar
					}
					if rdapOut.res.ExpireDate != "" {
						expireDate = rdapOut.res.ExpireDate
					}
					if rdapOut.res.PresetKey != "" {
						presetKey = rdapOut.res.PresetKey
					}
					lookupSource = "cloudflare+" + rdapOut.res.Source
				} else {
					lookupErrText = rdapOut.err.Error()
				}
			}

			domStatus := "active"
			if zs.Paused || zs.Status == "pending" {
				domStatus = "parked"
			}

			var tags []string
			if proxiedCount > 0 {
				tags = append(tags, "Cloudflare 橙云")
			}
			if len(zoneTunnels) > 0 {
				tags = append(tags, "CF Tunnel")
			}
			if tags == nil {
				tags = []string{}
			}
			tagsJSON, _ := json.Marshal(tags)

			newID := rand.Text()
			if _, err := qtx.SaveDomain(ctx, queries.SaveDomainParams{
				ID:                 newID,
				PresetKey:          presetKey,
				Name:               normalizedName,
				Registrar:          registrar,
				DnsProvider:        "Cloudflare DNS",
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
				TagsJson:           string(tagsJSON),
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
				DnsProvider:          "Cloudflare DNS",
				Status:               domStatus,
				ExpireDate:           expireDate,
				AutoRenew:            autoRenew,
				WhoisPrivacy:         whoisPrivacy,
				ManagementUrl:        consoleURL,
				RegistrarAccountID:   conn.AccountID,
				TagsJson:             string(tagsJSON),
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

		// Update existing domain non-destructively!
		presetKey := old.PresetKey
		if presetKey == "" {
			presetKey = "cloudflare"
		}
		registrar := old.Registrar
		expireDate := old.ExpireDate
		autoRenew := old.AutoRenew
		whoisPrivacy := old.WhoisPrivacy
		lookupSource := old.LookupSource
		lookupErrText := ""

		if hasCFReg {
			if registrar == "" || strings.EqualFold(registrar, "Cloudflare") {
				registrar = "Cloudflare"
			}
			if cfReg.ExpiresAt != "" {
				expireDate = cfReg.ExpiresAt
			}
			if cfReg.AutoRenew {
				autoRenew = 1
			} else {
				autoRenew = 0
			}
			lookupSource = "cloudflare_registrar"
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
				lookupSource = "cloudflare+" + rdapOut.res.Source
			} else {
				lookupErrText = rdapOut.err.Error()
			}
		} else if lookupSource == "" {
			lookupSource = "cloudflare"
		}

		dnsProvider := old.DnsProvider
		if dnsProvider == "" || strings.Contains(strings.ToLower(dnsProvider), "cloudflare") {
			dnsProvider = "Cloudflare DNS"
		}
		mgmtURL := old.ManagementUrl
		if mgmtURL == "" || mgmtURL == "https://dash.cloudflare.com" {
			mgmtURL = consoleURL
		}
		regAcct := old.RegistrarAccountID
		if !regAcct.Valid && conn.AccountID.Valid {
			regAcct = conn.AccountID
		}

		var tags []string
		if old.TagsJson != "" {
			_ = json.Unmarshal([]byte(old.TagsJson), &tags)
		}
		if proxiedCount > 0 && !slices.Contains(tags, "Cloudflare 橙云") && len(tags) < 20 {
			tags = append(tags, "Cloudflare 橙云")
		}
		if len(zoneTunnels) > 0 && !slices.Contains(tags, "CF Tunnel") && len(tags) < 20 {
			tags = append(tags, "CF Tunnel")
		}
		if tags == nil {
			tags = []string{}
		}
		tagsJSON, _ := json.Marshal(tags)

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
			TagsJson:             string(tagsJSON),
			ProviderConnectionID: nullString(conn.ID),
			ExternalZoneID:       zs.ZoneID,
			DnsRecordsJson:       string(recordsJSON),
			EdgeMetaJson:         string(edgeJSON),
			LookupSource:         lookupSource,
			LookupCheckedAt:      nowSec,
			LookupError:          lookupErrText,
			UpdatedAt:            nowNano,
			ID:                   old.ID,
		}); err != nil {
			return conn, SyncStats{}, err
		}

		// Additive merge for ServerIDs & IPIDs
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
