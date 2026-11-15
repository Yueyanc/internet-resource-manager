package storage

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/json"
	"errors"
	"time"

	"github.com/Yueyanc/internet-resource-manager/internal/domainname"
	"github.com/Yueyanc/internet-resource-manager/internal/storage/queries"
	"modernc.org/sqlite"
)

type DomainRecord struct {
	queries.Domain
	ServerIDs []string
	IPIDs     []string
}

func (s *Store) ListDomains(ctx context.Context) ([]DomainRecord, error) {
	rows, err := s.queries.ListDomains(ctx)
	if err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return []DomainRecord{}, nil
	}
	serverLinks, err := s.queries.ListAllServerDomains(ctx)
	if err != nil {
		return nil, err
	}
	ipLinks, err := s.queries.ListAllIPDomains(ctx)
	if err != nil {
		return nil, err
	}

	serversByDomain := make(map[string][]string, len(rows))
	for _, link := range serverLinks {
		serversByDomain[link.DomainID] = append(serversByDomain[link.DomainID], link.ServerID)
	}
	ipsByDomain := make(map[string][]string, len(rows))
	for _, link := range ipLinks {
		ipsByDomain[link.DomainID] = append(ipsByDomain[link.DomainID], link.IpID)
	}

	out := make([]DomainRecord, 0, len(rows))
	for _, row := range rows {
		srvs := serversByDomain[row.ID]
		if srvs == nil {
			srvs = []string{}
		}
		ips := ipsByDomain[row.ID]
		if ips == nil {
			ips = []string{}
		}
		out = append(out, DomainRecord{
			Domain:    row,
			ServerIDs: srvs,
			IPIDs:     ips,
		})
	}
	return out, nil
}

func (s *Store) SaveDomain(ctx context.Context, id string, input domainname.Input) (DomainRecord, error) {
	tagsSlice := input.Tags
	if tagsSlice == nil {
		tagsSlice = []string{}
	}
	tagsJSON, err := json.Marshal(tagsSlice)
	if err != nil {
		return DomainRecord{}, err
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return DomainRecord{}, err
	}
	defer func() { _ = tx.Rollback() }()
	qtx := s.queries.WithTx(tx)

	now := time.Now().UTC().Format(time.RFC3339Nano)
	created := now
	if id == "" {
		id = rand.Text()
	} else {
		old, err := qtx.GetDomain(ctx, id)
		if errors.Is(err, sql.ErrNoRows) {
			return DomainRecord{}, ErrNotFound
		}
		if err != nil {
			return DomainRecord{}, err
		}
		created = old.CreatedAt
	}

	if input.RegistrarAccountID != "" {
		if _, err := qtx.GetAccount(ctx, input.RegistrarAccountID); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return DomainRecord{}, ErrInvalidLink
			}
			return DomainRecord{}, err
		}
	}

	subscriptionID := input.SubscriptionID
	if subscriptionID != "" {
		if _, err := qtx.GetSubscription(ctx, subscriptionID); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return DomainRecord{}, ErrInvalidLink
			}
			return DomainRecord{}, err
		}
	} else if input.CreateSubscription != nil {
		subInput := *input.CreateSubscription
		if subInput.AccountID == "" && subInput.CreateAccount == nil && input.RegistrarAccountID != "" {
			subInput.AccountID = input.RegistrarAccountID
		}
		subAccountID, err := resolveOrCreateAccountTx(ctx, qtx, subInput.AccountID, subInput.CreateAccount, now)
		if err != nil {
			return DomainRecord{}, err
		}
		subBillingAccountID, err := resolveOrCreateAccountTx(ctx, qtx, subInput.BillingAccountID, subInput.CreateBillingAccount, now)
		if err != nil {
			return DomainRecord{}, err
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
			return DomainRecord{}, err
		}
		subscriptionID = createdSub.ID
	}

	for _, serverID := range input.ServerIDs {
		if _, err := qtx.GetServer(ctx, serverID); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return DomainRecord{}, ErrInvalidLink
			}
			return DomainRecord{}, err
		}
	}
	for _, ipID := range input.IPIDs {
		if _, err := qtx.GetIP(ctx, ipID); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return DomainRecord{}, ErrInvalidLink
			}
			return DomainRecord{}, err
		}
	}

	var autoRenew, whoisPrivacy, archived int64
	if input.AutoRenewEnabled() {
		autoRenew = 1
	}
	if input.WhoisPrivacyEnabled() {
		whoisPrivacy = 1
	}
	if input.Archived {
		archived = 1
	}

	saved, err := qtx.SaveDomain(ctx, queries.SaveDomainParams{
		ID:                 id,
		PresetKey:          input.PresetKey,
		Name:               input.Name,
		Registrar:          input.Registrar,
		DnsProvider:        input.DNSProvider,
		Purpose:            input.Purpose,
		Status:             input.Status,
		ExpireDate:         input.ExpireDate,
		AutoRenew:          autoRenew,
		WhoisPrivacy:       whoisPrivacy,
		IcpStatus:          input.ICPStatus,
		IcpNumber:          input.ICPNumber,
		ManagementUrl:      input.ManagementURL,
		SubscriptionID:     nullString(subscriptionID),
		RegistrarAccountID: nullString(input.RegistrarAccountID),
		TagsJson:           string(tagsJSON),
		Notes:              input.Notes,
		Archived:           archived,
		CreatedAt:          created,
		UpdatedAt:          now,
	})
	var sqliteErr *sqlite.Error
	if errors.As(err, &sqliteErr) && (sqliteErr.Code() == 2067 || sqliteErr.Code() == 1555) {
		return DomainRecord{}, ErrExists
	}
	if err != nil {
		return DomainRecord{}, err
	}

	var finalServerIDs []string
	if input.ServerIDs != nil {
		if err := qtx.DeleteDomainServers(ctx, id); err != nil {
			return DomainRecord{}, err
		}
		for _, srvID := range input.ServerIDs {
			if err := qtx.InsertServerDomain(ctx, queries.InsertServerDomainParams{
				ServerID:  srvID,
				DomainID:  id,
				CreatedAt: now,
			}); err != nil {
				return DomainRecord{}, err
			}
		}
		finalServerIDs = input.ServerIDs
	} else {
		finalServerIDs, err = qtx.ListDomainServersByDomain(ctx, id)
		if err != nil {
			return DomainRecord{}, err
		}
	}

	var finalIPIDs []string
	if input.IPIDs != nil {
		if err := qtx.DeleteDomainIPs(ctx, id); err != nil {
			return DomainRecord{}, err
		}
		for _, ipID := range input.IPIDs {
			if err := qtx.InsertIPDomain(ctx, queries.InsertIPDomainParams{
				IpID:      ipID,
				DomainID:  id,
				CreatedAt: now,
			}); err != nil {
				return DomainRecord{}, err
			}
		}
		finalIPIDs = input.IPIDs
	} else {
		finalIPIDs, err = qtx.ListDomainIPsByDomain(ctx, id)
		if err != nil {
			return DomainRecord{}, err
		}
	}

	if err := tx.Commit(); err != nil {
		return DomainRecord{}, err
	}

	if finalServerIDs == nil {
		finalServerIDs = []string{}
	}
	if finalIPIDs == nil {
		finalIPIDs = []string{}
	}

	return DomainRecord{
		Domain:    saved,
		ServerIDs: finalServerIDs,
		IPIDs:     finalIPIDs,
	}, nil
}

func (s *Store) DeleteDomain(ctx context.Context, id string) error {
	count, err := s.queries.DeleteDomain(ctx, id)
	if err != nil {
		return err
	}
	if count == 0 {
		return ErrNotFound
	}
	return nil
}
