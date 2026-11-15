package storage

import (
	"context"
	"crypto/rand"
	"database/sql"
	"errors"
	"time"

	"github.com/Yueyanc/internet-resource-manager/internal/account"
	"github.com/Yueyanc/internet-resource-manager/internal/storage/queries"
)

var ErrInvalidLink = errors.New("invalid account relation")

func nullString(value string) sql.NullString {
	if value == "" {
		return sql.NullString{}
	}
	return sql.NullString{String: value, Valid: true}
}

func (s *Store) ListAccounts(ctx context.Context) ([]queries.Account, error) {
	return s.queries.ListAccounts(ctx)
}

func (s *Store) GetAccount(ctx context.Context, id string) (queries.Account, error) {
	v, err := s.queries.GetAccount(ctx, id)
	if errors.Is(err, sql.ErrNoRows) {
		return v, ErrNotFound
	}
	return v, err
}

func (s *Store) SaveAccount(ctx context.Context, id string, input account.Input) (queries.Account, error) {
	now := time.Now().UTC().Format(time.RFC3339Nano)
	created := now
	lastChecked := input.LastCheckedAt
	if id == "" {
		id = rand.Text()
	} else {
		if input.RecoveryAccountID == id || input.SSOAccountID == id {
			return queries.Account{}, ErrInvalidLink
		}
		old, err := s.GetAccount(ctx, id)
		if err != nil {
			return queries.Account{}, err
		}
		created = old.CreatedAt
		if lastChecked == "" && input.KeepaliveCycle != "none" {
			lastChecked = old.LastCheckedAt
		}
	}
	if input.RecoveryAccountID != "" {
		if _, err := s.GetAccount(ctx, input.RecoveryAccountID); err != nil {
			if errors.Is(err, ErrNotFound) {
				return queries.Account{}, ErrInvalidLink
			}
			return queries.Account{}, err
		}
	}
	if input.SSOAccountID != "" {
		if _, err := s.GetAccount(ctx, input.SSOAccountID); err != nil {
			if errors.Is(err, ErrNotFound) {
				return queries.Account{}, ErrInvalidLink
			}
			return queries.Account{}, err
		}
	}
	var archived int64
	if input.Archived {
		archived = 1
	}
	return s.queries.SaveAccount(ctx, queries.SaveAccountParams{
		ID:                id,
		PresetKey:         input.PresetKey,
		Platform:          input.Platform,
		Label:             input.Label,
		Identifier:        input.Identifier,
		Uid:               input.UID,
		Category:          input.Category,
		Ecosystem:         input.Ecosystem,
		Region:            input.Region,
		Role:              input.Role,
		Status:            input.Status,
		AuthMethod:        input.AuthMethod,
		RecoveryAccountID: nullString(input.RecoveryAccountID),
		RecoveryEmail:     input.RecoveryEmail,
		SsoAccountID:      nullString(input.SSOAccountID),
		PhoneHint:         input.PhoneHint,
		TwoFactor:         input.TwoFactor,
		RecoveryCodes:     input.RecoveryCodes,
		KycStatus:         input.KycStatus,
		KycNote:           input.KycNote,
		KeepaliveCycle:    input.KeepaliveCycle,
		KeepaliveDays:     input.KeepaliveDays,
		NextCheckinDate:   input.NextCheckinDate,
		LastCheckedAt:     lastChecked,
		VaultReference:    input.VaultReference,
		SecurityUrl:       input.SecurityURL,
		Notes:             input.Notes,
		Archived:          archived,
		CreatedAt:         created,
		UpdatedAt:         now,
	})
}

func (s *Store) CheckinAccount(ctx context.Context, id, expectedDate, checkedOn string) (queries.Account, error) {
	v, err := s.GetAccount(ctx, id)
	if err != nil {
		return v, err
	}
	if v.Archived != 0 || v.NextCheckinDate != expectedDate {
		return v, ErrExists
	}
	next, checked, err := account.AdvanceCheckin(v.NextCheckinDate, checkedOn, v.KeepaliveCycle, int(v.KeepaliveDays))
	if err != nil {
		return v, err
	}
	result, err := s.queries.CheckinAccount(ctx, queries.CheckinAccountParams{
		ID:                id,
		NextCheckinDate:   next,
		LastCheckedAt:     checked,
		UpdatedAt:         time.Now().UTC().Format(time.RFC3339Nano),
		NextCheckinDate_2: expectedDate,
	})
	if errors.Is(err, sql.ErrNoRows) {
		return result, ErrExists
	}
	return result, err
}

func (s *Store) DeleteAccount(ctx context.Context, id string) error {
	n, err := s.queries.DeleteAccount(ctx, id)
	if err != nil {
		return err
	}
	if n == 0 {
		return ErrNotFound
	}
	return nil
}
