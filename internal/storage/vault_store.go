package storage

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"time"

	"github.com/Yueyanc/internet-resource-manager/internal/storage/queries"
	"github.com/Yueyanc/internet-resource-manager/internal/vault"
)

var ErrVaultUninitialized = errors.New("vault is not initialized")

func boolInt(v bool) int64 {
	if v {
		return 1
	}
	return 0
}

func (s *Store) GetVaultConfig(ctx context.Context) (queries.VaultConfig, bool, error) {
	cfg, err := s.queries.GetVaultConfig(ctx)
	if errors.Is(err, sql.ErrNoRows) {
		return cfg, false, nil
	}
	if err != nil {
		return cfg, false, err
	}
	return cfg, true, nil
}

func (s *Store) SetupVault(ctx context.Context, input vault.SetupInput) (queries.VaultConfig, error) {
	_, ok, err := s.GetVaultConfig(ctx)
	if err != nil {
		return queries.VaultConfig{}, err
	}
	if ok {
		return queries.VaultConfig{}, ErrExists
	}
	now := time.Now().UTC().Format(time.RFC3339Nano)
	cfg, err := s.queries.CreateVaultConfig(ctx, queries.CreateVaultConfigParams{
		KdfSalt:            input.KdfSalt,
		KdfIterations:      input.KdfIterations,
		WrappedVaultKey:    input.WrappedVaultKey,
		RecoverySalt:       input.RecoverySalt,
		WrappedRecoveryKey: input.WrappedRecoveryKey,
		CreatedAt:          now,
		UpdatedAt:          now,
	})
	if err != nil {
		if strings.Contains(strings.ToLower(err.Error()), "unique") || strings.Contains(strings.ToLower(err.Error()), "constraint") {
			return queries.VaultConfig{}, ErrExists
		}
		return queries.VaultConfig{}, err
	}
	return cfg, nil
}

func (s *Store) RotateVaultKeys(ctx context.Context, input vault.RotateInput) (queries.VaultConfig, error) {
	current, ok, err := s.GetVaultConfig(ctx)
	if err != nil {
		return queries.VaultConfig{}, err
	}
	if !ok {
		return queries.VaultConfig{}, ErrVaultUninitialized
	}
	if current.KeyVersion != input.KeyVersion {
		return queries.VaultConfig{}, ErrExists
	}
	recSalt := current.RecoverySalt
	recKey := current.WrappedRecoveryKey
	if input.RecoverySalt != "" && input.WrappedRecoveryKey != "" {
		recSalt = input.RecoverySalt
		recKey = input.WrappedRecoveryKey
	}
	updated, err := s.queries.UpdateVaultConfigKeys(ctx, queries.UpdateVaultConfigKeysParams{
		KdfSalt:            input.KdfSalt,
		KdfIterations:      input.KdfIterations,
		WrappedVaultKey:    input.WrappedVaultKey,
		RecoverySalt:       recSalt,
		WrappedRecoveryKey: recKey,
		UpdatedAt:          time.Now().UTC().Format(time.RFC3339Nano),
		KeyVersion:         input.KeyVersion,
	})
	if errors.Is(err, sql.ErrNoRows) {
		return updated, ErrExists
	}
	return updated, err
}

func (s *Store) ListAccountSecretSummaries(ctx context.Context) ([]queries.ListAccountSecretSummariesRow, error) {
	return s.queries.ListAccountSecretSummaries(ctx)
}

func (s *Store) ListAccountSecrets(ctx context.Context) ([]queries.AccountSecret, error) {
	return s.queries.ListAccountSecrets(ctx)
}

func (s *Store) GetAccountSecret(ctx context.Context, accountID string) (queries.AccountSecret, error) {
	sec, err := s.queries.GetAccountSecret(ctx, accountID)
	if errors.Is(err, sql.ErrNoRows) {
		return sec, ErrNotFound
	}
	return sec, err
}

func (s *Store) SaveAccountSecret(ctx context.Context, accountID string, input vault.SecretInput) (queries.AccountSecret, error) {
	cfg, ok, err := s.GetVaultConfig(ctx)
	if err != nil {
		return queries.AccountSecret{}, err
	}
	if !ok {
		return queries.AccountSecret{}, ErrVaultUninitialized
	}
	if input.KeyVersion != cfg.KeyVersion {
		return queries.AccountSecret{}, ErrExists
	}
	if _, err := s.GetAccount(ctx, accountID); err != nil {
		return queries.AccountSecret{}, err
	}
	return s.queries.SaveAccountSecret(ctx, queries.SaveAccountSecretParams{
		AccountID:        accountID,
		KeyVersion:       input.KeyVersion,
		Ciphertext:       input.Ciphertext,
		HasPassword:      boolInt(input.HasPassword),
		HasTotp:          boolInt(input.HasTotp),
		HasRecoveryCodes: boolInt(input.HasRecoveryCodes),
		UpdatedAt:        time.Now().UTC().Format(time.RFC3339Nano),
	})
}

func (s *Store) DeleteAccountSecret(ctx context.Context, accountID string) error {
	_, err := s.queries.DeleteAccountSecret(ctx, accountID)
	return err
}
