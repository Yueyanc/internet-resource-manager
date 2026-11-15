package storage

import (
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/json"
	"errors"
	"slices"
	"time"

	"github.com/Yueyanc/internet-resource-manager/internal/ipaddr"
	"github.com/Yueyanc/internet-resource-manager/internal/storage/queries"
	"modernc.org/sqlite"
)

var ErrDuplicateIP = errors.New("duplicate ip address")

type IPRecord struct {
	queries.Ip
	DomainIDs  []string
	AccountIDs []string
}

func isUniqueConstraint(err error) bool {
	var sqliteErr *sqlite.Error
	return errors.As(err, &sqliteErr) && (sqliteErr.Code() == 2067 || sqliteErr.Code() == 1555)
}

func (s *Store) ListIPs(ctx context.Context) ([]IPRecord, error) {
	rows, err := s.queries.ListIPs(ctx)
	if err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return []IPRecord{}, nil
	}
	domainLinks, err := s.queries.ListAllIPDomains(ctx)
	if err != nil {
		return nil, err
	}
	accountLinks, err := s.queries.ListAllIPAccounts(ctx)
	if err != nil {
		return nil, err
	}

	domainsByIP := make(map[string][]string, len(rows))
	for _, link := range domainLinks {
		domainsByIP[link.IpID] = append(domainsByIP[link.IpID], link.DomainID)
	}
	accountsByIP := make(map[string][]string, len(rows))
	for _, link := range accountLinks {
		accountsByIP[link.IpID] = append(accountsByIP[link.IpID], link.AccountID)
	}

	out := make([]IPRecord, 0, len(rows))
	for _, row := range rows {
		doms := domainsByIP[row.ID]
		if doms == nil {
			doms = []string{}
		}
		accs := accountsByIP[row.ID]
		if accs == nil {
			accs = []string{}
		}
		out = append(out, IPRecord{
			Ip:         row,
			DomainIDs:  doms,
			AccountIDs: accs,
		})
	}
	return out, nil
}

func (s *Store) GetIP(ctx context.Context, id string) (IPRecord, error) {
	row, err := s.queries.GetIP(ctx, id)
	if errors.Is(err, sql.ErrNoRows) {
		return IPRecord{}, ErrNotFound
	}
	if err != nil {
		return IPRecord{}, err
	}
	doms, err := s.queries.ListIPDomainsByIP(ctx, id)
	if err != nil {
		return IPRecord{}, err
	}
	accs, err := s.queries.ListIPAccountsByIP(ctx, id)
	if err != nil {
		return IPRecord{}, err
	}
	if doms == nil {
		doms = []string{}
	}
	if accs == nil {
		accs = []string{}
	}
	return IPRecord{
		Ip:         row,
		DomainIDs:  doms,
		AccountIDs: accs,
	}, nil
}

func (s *Store) SaveIP(ctx context.Context, id string, input ipaddr.Input, parsed ipaddr.ParsedAddress) (IPRecord, error) {
	unlocksJSON, err := json.Marshal(input.Unlocks)
	if err != nil {
		return IPRecord{}, err
	}
	tagsJSON, err := json.Marshal(input.Tags)
	if err != nil {
		return IPRecord{}, err
	}
	locksJSON, err := json.Marshal(input.ManualLocks)
	if err != nil {
		return IPRecord{}, err
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return IPRecord{}, err
	}
	defer func() { _ = tx.Rollback() }()
	qtx := s.queries.WithTx(tx)

	now := time.Now().UTC().Format(time.RFC3339Nano)
	created := now
	lastReviewed := input.LastReviewedAt
	lookupSource := input.LookupSource
	var lookupCheckedAt, lookupError string
	if lookupSource != "" {
		lookupCheckedAt = time.Now().UTC().Format(time.RFC3339)
	}

	probeStatus := "unchecked"
	if !parsed.ProbingAllowed {
		probeStatus = "skipped_non_public"
	}
	var probeLatencyMs int64
	var probeCheckedAt, probeError string
	var serverID sql.NullString

	if id == "" {
		id = rand.Text()
	} else {
		old, err := qtx.GetIP(ctx, id)
		if errors.Is(err, sql.ErrNoRows) {
			return IPRecord{}, ErrNotFound
		}
		if err != nil {
			return IPRecord{}, err
		}
		created = old.CreatedAt
		serverID = old.ServerID
		if lastReviewed == "" && input.ReviewCycle != "none" {
			lastReviewed = old.LastReviewedAt
		}
		if lookupSource == "" {
			lookupSource = old.LookupSource
			lookupCheckedAt = old.LookupCheckedAt
			lookupError = old.LookupError
		}
		if parsed.ProbingAllowed &&
			old.Address == parsed.Canonical &&
			old.ProbeMode == input.ProbeMode &&
			old.ProbePort == input.ProbePort &&
			old.ProbeStatus != "skipped_non_public" {
			probeStatus = old.ProbeStatus
			probeLatencyMs = old.ProbeLatencyMs
			probeCheckedAt = old.ProbeCheckedAt
			probeError = old.ProbeError
		}
	}

	if input.SubscriptionID != "" {
		if _, err := qtx.GetSubscription(ctx, input.SubscriptionID); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return IPRecord{}, ErrInvalidLink
			}
			return IPRecord{}, err
		}
	}
	for _, domainID := range input.DomainIDs {
		if _, err := qtx.GetDomain(ctx, domainID); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return IPRecord{}, ErrInvalidLink
			}
			return IPRecord{}, err
		}
	}
	for _, accountID := range input.AccountIDs {
		if _, err := qtx.GetAccount(ctx, accountID); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return IPRecord{}, ErrInvalidLink
			}
			return IPRecord{}, err
		}
	}

	var archived int64
	if input.Archived {
		archived = 1
	}

	saved, err := qtx.SaveIP(ctx, queries.SaveIPParams{
		ID:              id,
		PresetKey:       input.PresetKey,
		Address:         parsed.Canonical,
		Version:         parsed.Version,
		PrefixLen:       parsed.PrefixLen,
		NetworkScope:    input.NetworkScope,
		Category:        input.Category,
		Provider:        input.Provider,
		Label:           input.Label,
		Region:          input.Region,
		City:            input.City,
		Asn:             input.ASN,
		AsnOrg:          input.ASNOrg,
		PtrRecord:       input.PTRRecord,
		AsnType:         input.ASNType,
		OriginType:      input.OriginType,
		RiskLevel:       input.RiskLevel,
		PurityNote:      input.PurityNote,
		UnlocksJson:     string(unlocksJSON),
		TagsJson:        string(tagsJSON),
		ManualLocksJson: string(locksJSON),
		LookupSource:    lookupSource,
		LookupCheckedAt: lookupCheckedAt,
		LookupError:     lookupError,
		Role:            input.Role,
		Status:          input.Status,
		ReviewCycle:     input.ReviewCycle,
		ReviewDays:      input.ReviewDays,
		NextReviewDate:  input.NextReviewDate,
		LastReviewedAt:  lastReviewed,
		ProbeMode:       input.ProbeMode,
		ProbePort:       input.ProbePort,
		ProbeStatus:     probeStatus,
		ProbeLatencyMs:  probeLatencyMs,
		ProbeCheckedAt:  probeCheckedAt,
		ProbeError:      probeError,
		SubscriptionID:  nullString(input.SubscriptionID),
		ServerID:        serverID,
		HostLabel:       input.HostLabel,
		ConsoleUrl:      input.ConsoleURL,
		Notes:           input.Notes,
		Archived:        archived,
		CreatedAt:       created,
		UpdatedAt:       now,
	})
	if err != nil {
		if isUniqueConstraint(err) {
			return IPRecord{}, ErrDuplicateIP
		}
		return IPRecord{}, err
	}

	if err := qtx.DeleteIPDomains(ctx, id); err != nil {
		return IPRecord{}, err
	}
	for _, domainID := range input.DomainIDs {
		if err := qtx.InsertIPDomain(ctx, queries.InsertIPDomainParams{
			IpID:      id,
			DomainID:  domainID,
			CreatedAt: now,
		}); err != nil {
			return IPRecord{}, err
		}
	}

	if err := qtx.DeleteIPAccounts(ctx, id); err != nil {
		return IPRecord{}, err
	}
	for _, accountID := range input.AccountIDs {
		if err := qtx.InsertIPAccount(ctx, queries.InsertIPAccountParams{
			IpID:      id,
			AccountID: accountID,
			CreatedAt: now,
		}); err != nil {
			return IPRecord{}, err
		}
	}

	if err := tx.Commit(); err != nil {
		return IPRecord{}, err
	}
	return IPRecord{
		Ip:         saved,
		DomainIDs:  input.DomainIDs,
		AccountIDs: input.AccountIDs,
	}, nil
}

func (s *Store) ReviewIP(ctx context.Context, id, expectedDate, reviewedOn string) (IPRecord, error) {
	rec, err := s.GetIP(ctx, id)
	if err != nil {
		return IPRecord{}, err
	}
	if rec.Archived != 0 || rec.NextReviewDate != expectedDate {
		return IPRecord{}, ErrExists
	}
	next, reviewed, err := ipaddr.AdvanceReview(rec.NextReviewDate, reviewedOn, rec.ReviewCycle, int(rec.ReviewDays))
	if err != nil {
		return IPRecord{}, err
	}
	updated, err := s.queries.ReviewIP(ctx, queries.ReviewIPParams{
		ID:               id,
		NextReviewDate:   next,
		LastReviewedAt:   reviewed,
		UpdatedAt:        time.Now().UTC().Format(time.RFC3339Nano),
		NextReviewDate_2: expectedDate,
	})
	if errors.Is(err, sql.ErrNoRows) {
		return IPRecord{}, ErrExists
	}
	if err != nil {
		return IPRecord{}, err
	}
	rec.Ip = updated
	return rec, nil
}

func (s *Store) ApplyIPLookup(ctx context.Context, id string, res ipaddr.LookupResult, lookupErr error) (IPRecord, error) {
	rec, err := s.GetIP(ctx, id)
	if err != nil {
		return IPRecord{}, err
	}
	var locks []string
	_ = json.Unmarshal([]byte(rec.ManualLocksJson), &locks)

	now := time.Now().UTC().Format(time.RFC3339Nano)
	checkedAt := res.CheckedAt
	if checkedAt == "" {
		checkedAt = time.Now().UTC().Format(time.RFC3339)
	}

	if lookupErr != nil {
		updated, err := s.queries.UpdateIPLookup(ctx, queries.UpdateIPLookupParams{
			ID:              id,
			Region:          rec.Region,
			City:            rec.City,
			Asn:             rec.Asn,
			AsnOrg:          rec.AsnOrg,
			PtrRecord:       rec.PtrRecord,
			LookupSource:    rec.LookupSource,
			LookupCheckedAt: checkedAt,
			LookupError:     lookupErr.Error(),
			UpdatedAt:       now,
		})
		if err != nil {
			return IPRecord{}, err
		}
		rec.Ip = updated
		return rec, nil
	}

	region := rec.Region
	if !slices.Contains(locks, "region") && res.Region != "" {
		region = res.Region
	}
	city := rec.City
	if !slices.Contains(locks, "city") && res.City != "" {
		city = res.City
	}
	asn := rec.Asn
	if !slices.Contains(locks, "asn") && res.ASN > 0 {
		asn = res.ASN
	}
	asnOrg := rec.AsnOrg
	if !slices.Contains(locks, "asnOrg") && res.ASNOrg != "" {
		asnOrg = res.ASNOrg
	}
	ptrRecord := rec.PtrRecord
	if !slices.Contains(locks, "ptrRecord") && res.PTRRecord != "" {
		ptrRecord = res.PTRRecord
	}

	updated, err := s.queries.UpdateIPLookup(ctx, queries.UpdateIPLookupParams{
		ID:              id,
		Region:          region,
		City:            city,
		Asn:             asn,
		AsnOrg:          asnOrg,
		PtrRecord:       ptrRecord,
		LookupSource:    res.Source,
		LookupCheckedAt: checkedAt,
		LookupError:     "",
		UpdatedAt:       now,
	})
	if err != nil {
		return IPRecord{}, err
	}
	rec.Ip = updated
	return rec, nil
}

func (s *Store) ApplyIPProbe(ctx context.Context, id string, res ipaddr.ProbeResult) (IPRecord, error) {
	rec, err := s.GetIP(ctx, id)
	if err != nil {
		return IPRecord{}, err
	}
	updated, err := s.queries.UpdateIPProbe(ctx, queries.UpdateIPProbeParams{
		ID:             id,
		ProbeStatus:    res.Status,
		ProbeLatencyMs: res.LatencyMs,
		ProbeCheckedAt: res.CheckedAt,
		ProbeError:     res.Error,
		UpdatedAt:      time.Now().UTC().Format(time.RFC3339Nano),
	})
	if err != nil {
		return IPRecord{}, err
	}
	rec.Ip = updated
	return rec, nil
}

func (s *Store) DeleteIP(ctx context.Context, id string) error {
	n, err := s.queries.DeleteIP(ctx, id)
	if err != nil {
		return err
	}
	if n == 0 {
		return ErrNotFound
	}
	return nil
}
