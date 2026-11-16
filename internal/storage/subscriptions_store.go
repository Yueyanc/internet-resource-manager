package storage

import (
	"context"
	"crypto/rand"
	"database/sql"
	"errors"
	"time"

	"github.com/Yueyanc/internet-resource-manager/internal/account"
	"github.com/Yueyanc/internet-resource-manager/internal/storage/queries"
	"github.com/Yueyanc/internet-resource-manager/internal/subscription"
)

func (s *Store) ListSubscriptions(ctx context.Context) ([]queries.Subscription, error) {
	return s.queries.ListSubscriptions(ctx)
}
func (s *Store) GetSubscription(ctx context.Context, id string) (queries.Subscription, error) {
	v, err := s.queries.GetSubscription(ctx, id)
	if errors.Is(err, sql.ErrNoRows) {
		return v, ErrNotFound
	}
	return v, err
}

func resolveOrCreateAccountTx(ctx context.Context, qtx *queries.Queries, accountID string, create *account.Input, now string) (string, error) {
	if accountID != "" {
		if _, err := qtx.GetAccount(ctx, accountID); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return "", ErrInvalidLink
			}
			return "", err
		}
		return accountID, nil
	}
	if create == nil {
		return "", nil
	}
	if create.RecoveryAccountID != "" {
		if _, err := qtx.GetAccount(ctx, create.RecoveryAccountID); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return "", ErrInvalidLink
			}
			return "", err
		}
	}
	if create.SSOAccountID != "" {
		if _, err := qtx.GetAccount(ctx, create.SSOAccountID); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return "", ErrInvalidLink
			}
			return "", err
		}
	}
	var archived int64
	if create.Archived {
		archived = 1
	}
	saved, err := qtx.SaveAccount(ctx, queries.SaveAccountParams{
		ID:                rand.Text(),
		PresetKey:         create.PresetKey,
		Platform:          create.Platform,
		Label:             create.Label,
		Identifier:        create.Identifier,
		Uid:               create.UID,
		Category:          create.Category,
		Ecosystem:         create.Ecosystem,
		Region:            create.Region,
		Role:              create.Role,
		Status:            create.Status,
		AuthMethod:        create.AuthMethod,
		RecoveryAccountID: nullString(create.RecoveryAccountID),
		RecoveryEmail:     create.RecoveryEmail,
		SsoAccountID:      nullString(create.SSOAccountID),
		PhoneHint:         create.PhoneHint,
		TwoFactor:         create.TwoFactor,
		RecoveryCodes:     create.RecoveryCodes,
		KycStatus:         create.KycStatus,
		KycNote:           create.KycNote,
		KeepaliveCycle:    create.KeepaliveCycle,
		KeepaliveDays:     create.KeepaliveDays,
		NextCheckinDate:   create.NextCheckinDate,
		LastCheckedAt:     create.LastCheckedAt,
		VaultReference:    create.VaultReference,
		SecurityUrl:       create.SecurityURL,
		Notes:             create.Notes,
		Archived:          archived,
		CreatedAt:         now,
		UpdatedAt:         now,
	})
	if err != nil {
		return "", err
	}
	return saved.ID, nil
}

func (s *Store) SaveSubscription(ctx context.Context, id string, input subscription.Input) (queries.Subscription, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return queries.Subscription{}, err
	}
	defer func() { _ = tx.Rollback() }()
	qtx := s.queries.WithTx(tx)

	now := time.Now().UTC().Format(time.RFC3339Nano)
	created := now
	if id == "" {
		id = rand.Text()
	} else {
		old, err := qtx.GetSubscription(ctx, id)
		if errors.Is(err, sql.ErrNoRows) {
			return queries.Subscription{}, ErrNotFound
		}
		if err != nil {
			return queries.Subscription{}, err
		}
		created = old.CreatedAt
	}

	accountID, err := resolveOrCreateAccountTx(ctx, qtx, input.AccountID, input.CreateAccount, now)
	if err != nil {
		return queries.Subscription{}, err
	}
	billingAccountID, err := resolveOrCreateAccountTx(ctx, qtx, input.BillingAccountID, input.CreateBillingAccount, now)
	if err != nil {
		return queries.Subscription{}, err
	}
	if billingAccountID != "" && billingAccountID == accountID {
		billingAccountID = ""
	}

	var archived int64
	if input.Archived {
		archived = 1
	}
	saved, err := qtx.SaveSubscription(ctx, queries.SaveSubscriptionParams{
		ID:                 id,
		PresetKey:          input.PresetKey,
		Name:               input.Name,
		AmountMinor:        input.AmountMinor,
		Currency:           input.Currency,
		Cycle:              input.Cycle,
		IntervalDays:       input.IntervalDays,
		DueDate:            input.DueDate,
		Category:           input.Category,
		RenewalMode:        input.RenewalMode,
		Intention:          input.Intention,
		RenewalAmountMinor: input.RenewalAmountMinor,
		AccountID:          nullString(accountID),
		BillingAccountID:   nullString(billingAccountID),
		Account:            input.Account,
		PaymentMethod:      input.PaymentMethod,
		ManagementUrl:      input.ManagementURL,
		Notes:              input.Notes,
		Archived:           archived,
		CreatedAt:          created,
		UpdatedAt:          now,
	})
	if err != nil {
		return queries.Subscription{}, err
	}
	if err := tx.Commit(); err != nil {
		return queries.Subscription{}, err
	}
	return saved, nil
}

func (s *Store) RenewSubscription(ctx context.Context, id, expectedDate string) (queries.Subscription, error) {
	v, err := s.GetSubscription(ctx, id)
	if err != nil {
		return v, err
	}
	if v.Archived != 0 || v.DueDate != expectedDate {
		return v, ErrExists
	}
	next, err := subscription.NextDate(v.DueDate, v.Cycle, int(v.IntervalDays))
	if err != nil {
		return v, err
	}
	result, err := s.queries.RenewSubscription(ctx, queries.RenewSubscriptionParams{ID: id, DueDate: next, DueDate_2: expectedDate, UpdatedAt: time.Now().UTC().Format(time.RFC3339Nano)})
	if errors.Is(err, sql.ErrNoRows) {
		return result, ErrExists
	}
	return result, err
}

func (s *Store) DeleteSubscription(ctx context.Context, id string) error {
	n, err := s.queries.DeleteSubscription(ctx, id)
	if err != nil {
		return err
	}
	if n == 0 {
		return ErrNotFound
	}
	return nil
}

func (s *Store) Preferences(ctx context.Context) (queries.GetPreferencesRow, error) {
	return s.queries.GetPreferences(ctx)
}

func (s *Store) SavePreferences(ctx context.Context, currency, rates string) (string, error) {
	updatedAt := time.Now().UTC().Format(time.RFC3339)
	if err := s.queries.SavePreferences(ctx, queries.SavePreferencesParams{
		BaseCurrency:   currency,
		RatesJson:      rates,
		RatesUpdatedAt: updatedAt,
	}); err != nil {
		return "", err
	}
	return updatedAt, nil
}

// AutoAdvanceSubscriptions advances overdue active auto-renewing subscriptions (excluding intention=="cancel" and cycle=="once")
// forward cycle-by-cycle until their dueDate is >= today (YYYY-MM-DD).
func (s *Store) AutoAdvanceSubscriptions(ctx context.Context, today string) ([]queries.Subscription, error) {
	rows, err := s.queries.ListSubscriptions(ctx)
	if err != nil {
		return nil, err
	}
	var advanced []queries.Subscription
	now := time.Now().UTC().Format(time.RFC3339Nano)
	for _, sub := range rows {
		if sub.Archived != 0 || sub.RenewalMode != "auto" || sub.Intention == "cancel" || sub.Cycle == "once" {
			continue
		}
		if sub.DueDate == "" || sub.DueDate >= today {
			continue
		}
		target := sub.DueDate
		for steps := 0; target < today && steps < 240; steps++ {
			next, nextErr := subscription.NextDate(target, sub.Cycle, int(sub.IntervalDays))
			if nextErr != nil || next <= target {
				break
			}
			target = next
		}
		if target <= sub.DueDate {
			continue
		}
		updated, uerr := s.queries.RenewSubscription(ctx, queries.RenewSubscriptionParams{
			DueDate:   target,
			UpdatedAt: now,
			ID:        sub.ID,
			DueDate_2: sub.DueDate,
		})
		if uerr == nil {
			advanced = append(advanced, updated)
		}
	}
	return advanced, nil
}

func (s *Store) Counts(ctx context.Context) (queries.GetCountsRow, error) {
	return s.queries.GetCounts(ctx)
}
