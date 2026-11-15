package storage

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/json"
	"errors"
	"time"

	"github.com/Yueyanc/internet-resource-manager/internal/serverhost"
	"github.com/Yueyanc/internet-resource-manager/internal/storage/queries"
)

type ServerRecord struct {
	queries.Server
	DomainIDs []string
	IPIDs     []string
	Telemetry serverhost.Telemetry
}

func (s *Store) ListServers(ctx context.Context) ([]ServerRecord, error) {
	rows, err := s.queries.ListServers(ctx)
	if err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return []ServerRecord{}, nil
	}
	domainLinks, err := s.queries.ListAllServerDomains(ctx)
	if err != nil {
		return nil, err
	}
	ipLinks, err := s.queries.ListAllServerIPs(ctx)
	if err != nil {
		return nil, err
	}
	agentRows, err := s.queries.ListServerAgents(ctx)
	if err != nil {
		return nil, err
	}

	domainsByServer := make(map[string][]string, len(rows))
	for _, link := range domainLinks {
		domainsByServer[link.ServerID] = append(domainsByServer[link.ServerID], link.DomainID)
	}
	ipsByServer := make(map[string][]string, len(rows))
	for _, link := range ipLinks {
		if link.ServerID.Valid && link.ServerID.String != "" {
			ipsByServer[link.ServerID.String] = append(ipsByServer[link.ServerID.String], link.ID)
		}
	}
	now := time.Now().UTC()
	telemetryByServer := make(map[string]serverhost.Telemetry, len(agentRows))
	for _, ag := range agentRows {
		telemetryByServer[ag.ServerID] = agentRowToTelemetry(ag, now)
	}

	out := make([]ServerRecord, 0, len(rows))
	for _, row := range rows {
		doms := domainsByServer[row.ID]
		if doms == nil {
			doms = []string{}
		}
		ips := ipsByServer[row.ID]
		if ips == nil {
			ips = []string{}
		}
		tel, ok := telemetryByServer[row.ID]
		if !ok {
			tel = serverhost.DefaultTelemetry()
		}
		out = append(out, ServerRecord{
			Server:    row,
			DomainIDs: doms,
			IPIDs:     ips,
			Telemetry: tel,
		})
	}
	return out, nil
}

func (s *Store) GetServer(ctx context.Context, id string) (ServerRecord, error) {
	row, err := s.queries.GetServer(ctx, id)
	if errors.Is(err, sql.ErrNoRows) {
		return ServerRecord{}, ErrNotFound
	}
	if err != nil {
		return ServerRecord{}, err
	}
	doms, err := s.queries.ListServerDomainsByServer(ctx, id)
	if err != nil {
		return ServerRecord{}, err
	}
	ips, err := s.queries.ListServerIPsByServer(ctx, nullString(id))
	if err != nil {
		return ServerRecord{}, err
	}
	tel := serverhost.DefaultTelemetry()
	if ag, err := s.queries.GetServerAgent(ctx, id); err == nil {
		tel = agentRowToTelemetry(ag, time.Now().UTC())
	} else if !errors.Is(err, sql.ErrNoRows) {
		return ServerRecord{}, err
	}
	if doms == nil {
		doms = []string{}
	}
	if ips == nil {
		ips = []string{}
	}
	return ServerRecord{
		Server:    row,
		DomainIDs: doms,
		IPIDs:     ips,
		Telemetry: tel,
	}, nil
}

func (s *Store) SaveServer(ctx context.Context, id string, input serverhost.Input) (ServerRecord, error) {
	tagsSlice := input.Tags
	if tagsSlice == nil {
		tagsSlice = []string{}
	}
	tagsJSON, err := json.Marshal(tagsSlice)
	if err != nil {
		return ServerRecord{}, err
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return ServerRecord{}, err
	}
	defer func() { _ = tx.Rollback() }()
	qtx := s.queries.WithTx(tx)

	now := time.Now().UTC().Format(time.RFC3339Nano)
	created := now
	if id == "" {
		id = rand.Text()
	} else {
		old, err := qtx.GetServer(ctx, id)
		if errors.Is(err, sql.ErrNoRows) {
			return ServerRecord{}, ErrNotFound
		}
		if err != nil {
			return ServerRecord{}, err
		}
		created = old.CreatedAt
	}

	if input.AccountID != "" {
		if _, err := qtx.GetAccount(ctx, input.AccountID); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return ServerRecord{}, ErrInvalidLink
			}
			return ServerRecord{}, err
		}
	}

	subscriptionID := input.SubscriptionID
	if subscriptionID != "" {
		if _, err := qtx.GetSubscription(ctx, subscriptionID); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return ServerRecord{}, ErrInvalidLink
			}
			return ServerRecord{}, err
		}
	} else if input.CreateSubscription != nil {
		subInput := *input.CreateSubscription
		if subInput.AccountID == "" && subInput.CreateAccount == nil && input.AccountID != "" {
			subInput.AccountID = input.AccountID
		}
		subAccountID, err := resolveOrCreateAccountTx(ctx, qtx, subInput.AccountID, subInput.CreateAccount, now)
		if err != nil {
			return ServerRecord{}, err
		}
		subBillingAccountID, err := resolveOrCreateAccountTx(ctx, qtx, subInput.BillingAccountID, subInput.CreateBillingAccount, now)
		if err != nil {
			return ServerRecord{}, err
		}
		if subBillingAccountID != "" && subBillingAccountID == subAccountID {
			subBillingAccountID = ""
		}
		var subArchived int64
		if subInput.Archived {
			subArchived = 1
		}
		createdSub, err := qtx.SaveSubscription(ctx, queries.SaveSubscriptionParams{
			ID:                 rand.Text(),
			PresetKey:          subInput.PresetKey,
			Name:               subInput.Name,
			AmountMinor:        subInput.AmountMinor,
			Currency:           subInput.Currency,
			Cycle:              subInput.Cycle,
			IntervalDays:       subInput.IntervalDays,
			DueDate:            subInput.DueDate,
			Category:           subInput.Category,
			RenewalMode:        subInput.RenewalMode,
			Intention:          subInput.Intention,
			RenewalAmountMinor: subInput.RenewalAmountMinor,
			AccountID:          nullString(subAccountID),
			BillingAccountID:   nullString(subBillingAccountID),
			Account:            subInput.Account,
			PaymentMethod:      subInput.PaymentMethod,
			ManagementUrl:      subInput.ManagementURL,
			Notes:              subInput.Notes,
			Archived:           subArchived,
			CreatedAt:          now,
			UpdatedAt:          now,
		})
		if err != nil {
			return ServerRecord{}, err
		}
		subscriptionID = createdSub.ID
	}

	for _, domainID := range input.DomainIDs {
		if _, err := qtx.GetDomain(ctx, domainID); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return ServerRecord{}, ErrInvalidLink
			}
			return ServerRecord{}, err
		}
	}

	for _, ipID := range input.IPIDs {
		if _, err := qtx.GetIP(ctx, ipID); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return ServerRecord{}, ErrInvalidLink
			}
			return ServerRecord{}, err
		}
	}

	var archived int64
	if input.Archived {
		archived = 1
	}

	saved, err := qtx.SaveServer(ctx, queries.SaveServerParams{
		ID:              id,
		PresetKey:       input.PresetKey,
		Name:            input.Name,
		Hostname:        input.Hostname,
		Provider:        input.Provider,
		Kind:            input.Kind,
		Status:          input.Status,
		Region:          input.Region,
		Datacenter:      input.Datacenter,
		Os:              input.OS,
		Arch:            input.Arch,
		CpuCores:        input.CPUCores,
		MemoryMb:        input.MemoryMB,
		DiskGb:          input.DiskGB,
		DiskType:        input.DiskType,
		BandwidthMbps:   input.BandwidthMbps,
		TrafficGb:       input.TrafficGB,
		TrafficRule:     input.TrafficRule,
		TrafficResetDay: input.TrafficResetDay,
		Ipv4:            input.IPv4,
		Ipv6:            input.IPv6,
		PrivateIp:       input.PrivateIP,
		PortNote:        input.PortNote,
		SshPort:         input.SSHPort,
		SshUser:         input.SSHUser,
		ConsoleUrl:      input.ConsoleURL,
		SubscriptionID:  nullString(subscriptionID),
		AccountID:       nullString(input.AccountID),
		ExpireDate:      input.ExpireDate,
		TagsJson:        string(tagsJSON),
		Notes:           input.Notes,
		Archived:        archived,
		CreatedAt:       created,
		UpdatedAt:       now,
	})
	if err != nil {
		return ServerRecord{}, err
	}

	if err := qtx.DeleteServerDomains(ctx, id); err != nil {
		return ServerRecord{}, err
	}
	for _, domainID := range input.DomainIDs {
		if err := qtx.InsertServerDomain(ctx, queries.InsertServerDomainParams{
			ServerID:  id,
			DomainID:  domainID,
			CreatedAt: now,
		}); err != nil {
			return ServerRecord{}, err
		}
	}

	if err := qtx.ClearServerIPs(ctx, queries.ClearServerIPsParams{
		UpdatedAt: now,
		ServerID:  nullString(id),
	}); err != nil {
		return ServerRecord{}, err
	}
	for _, ipID := range input.IPIDs {
		if err := qtx.AssignIPToServer(ctx, queries.AssignIPToServerParams{
			ServerID:  nullString(id),
			UpdatedAt: now,
			ID:        ipID,
		}); err != nil {
			return ServerRecord{}, err
		}
	}

	if err := tx.Commit(); err != nil {
		return ServerRecord{}, err
	}

	doms := input.DomainIDs
	if doms == nil {
		doms = []string{}
	}
	ips := input.IPIDs
	if ips == nil {
		ips = []string{}
	}
	tel := serverhost.DefaultTelemetry()
	if ag, err := s.queries.GetServerAgent(ctx, id); err == nil {
		tel = agentRowToTelemetry(ag, time.Now().UTC())
	}
	return ServerRecord{
		Server:    saved,
		DomainIDs: doms,
		IPIDs:     ips,
		Telemetry: tel,
	}, nil
}

func (s *Store) DeleteServer(ctx context.Context, id string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	qtx := s.queries.WithTx(tx)

	now := time.Now().UTC().Format(time.RFC3339Nano)
	if err := qtx.ClearServerIPs(ctx, queries.ClearServerIPsParams{
		UpdatedAt: now,
		ServerID:  nullString(id),
	}); err != nil {
		return err
	}
	n, err := qtx.DeleteServer(ctx, id)
	if err != nil {
		return err
	}
	if n == 0 {
		return ErrNotFound
	}
	return tx.Commit()
}
