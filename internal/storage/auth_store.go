package storage

import (
	"context"
	"database/sql"
	"errors"
	"time"

	"github.com/Yueyanc/internet-resource-manager/internal/storage/queries"
)

func (s *Store) Administrator(ctx context.Context) (queries.GetAdministratorRow, error) {
	v, err := s.queries.GetAdministrator(ctx)
	if errors.Is(err, sql.ErrNoRows) {
		return v, ErrNotFound
	}
	return v, err
}

func (s *Store) Setup(ctx context.Context, username, passwordHash, tokenHash string, expires int64) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	q := s.queries.WithTx(tx)
	if err := q.CreateAdministrator(ctx, queries.CreateAdministratorParams{Username: username, PasswordHash: passwordHash}); err != nil {
		return err
	}
	if err := q.CreateSession(ctx, queries.CreateSessionParams{TokenHash: tokenHash, ExpiresAt: expires}); err != nil {
		return err
	}
	return tx.Commit()
}

func (s *Store) BootstrapAdministrator(ctx context.Context, username, passwordHash string) (bool, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return false, err
	}
	defer func() { _ = tx.Rollback() }()
	q := s.queries.WithTx(tx)
	if _, err := q.GetAdministrator(ctx); err == nil {
		return false, nil
	} else if !errors.Is(err, sql.ErrNoRows) {
		return false, err
	}
	if err := q.CreateAdministrator(ctx, queries.CreateAdministratorParams{
		Username:     username,
		PasswordHash: passwordHash,
	}); err != nil {
		return false, err
	}
	if err := tx.Commit(); err != nil {
		return false, err
	}
	return true, nil
}

func (s *Store) CreateSession(ctx context.Context, hash string, expires int64) error {
	if err := s.queries.PruneSessions(ctx, time.Now().Unix()); err != nil {
		return err
	}
	return s.queries.CreateSession(ctx, queries.CreateSessionParams{TokenHash: hash, ExpiresAt: expires})
}

func (s *Store) SessionValid(ctx context.Context, hash string) (bool, error) {
	_, err := s.queries.FindSession(ctx, queries.FindSessionParams{TokenHash: hash, ExpiresAt: time.Now().Unix()})
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	return err == nil, err
}

func (s *Store) DeleteSession(ctx context.Context, hash string) error {
	return s.queries.DeleteSession(ctx, hash)
}
