package storage

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"time"

	"github.com/Yueyanc/internet-resource-manager/internal/storage/queries"
)

type SessionMeta struct {
	UserAgent string
	IPAddress string
}

type SessionInfo struct {
	ID         string `json:"id"`
	UserAgent  string `json:"userAgent"`
	IPAddress  string `json:"ipAddress"`
	CreatedAt  string `json:"createdAt"`
	LastSeenAt string `json:"lastSeenAt"`
	ExpiresAt  int64  `json:"expiresAt"`
	Current    bool   `json:"current"`
}

func truncateString(v string, maxLen int) string {
	v = strings.TrimSpace(v)
	if len(v) <= maxLen {
		return v
	}
	return v[:maxLen]
}

func sessionIDFromHash(tokenHash string) string {
	if len(tokenHash) <= 16 {
		return tokenHash
	}
	return tokenHash[:16]
}

func (s *Store) Administrator(ctx context.Context) (queries.GetAdministratorRow, error) {
	v, err := s.queries.GetAdministrator(ctx)
	if errors.Is(err, sql.ErrNoRows) {
		return v, ErrNotFound
	}
	return v, err
}

func (s *Store) UpdateAdministrator(ctx context.Context, username, passwordHash string) error {
	return s.queries.UpdateAdministrator(ctx, queries.UpdateAdministratorParams{
		Username:     username,
		PasswordHash: passwordHash,
	})
}

func (s *Store) Setup(ctx context.Context, username, passwordHash, tokenHash string, expires int64, meta SessionMeta) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	q := s.queries.WithTx(tx)
	if err := q.CreateAdministrator(ctx, queries.CreateAdministratorParams{Username: username, PasswordHash: passwordHash}); err != nil {
		return err
	}
	now := time.Now().UTC().Format(time.RFC3339)
	if err := q.CreateSession(ctx, queries.CreateSessionParams{
		TokenHash:  tokenHash,
		ExpiresAt:  expires,
		UserAgent:  truncateString(meta.UserAgent, 256),
		IpAddress:  truncateString(meta.IPAddress, 64),
		CreatedAt:  now,
		LastSeenAt: now,
	}); err != nil {
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
	return s.CreateSessionWithMeta(ctx, hash, expires, SessionMeta{})
}

func (s *Store) CreateSessionWithMeta(ctx context.Context, hash string, expires int64, meta SessionMeta) error {
	if err := s.queries.PruneSessions(ctx, time.Now().Unix()); err != nil {
		return err
	}
	now := time.Now().UTC().Format(time.RFC3339)
	return s.queries.CreateSession(ctx, queries.CreateSessionParams{
		TokenHash:  hash,
		ExpiresAt:  expires,
		UserAgent:  truncateString(meta.UserAgent, 256),
		IpAddress:  truncateString(meta.IPAddress, 64),
		CreatedAt:  now,
		LastSeenAt: now,
	})
}

func (s *Store) SessionValid(ctx context.Context, hash string) (bool, error) {
	row, err := s.queries.FindSession(ctx, queries.FindSessionParams{TokenHash: hash, ExpiresAt: time.Now().Unix()})
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, err
	}
	now := time.Now().UTC()
	shouldTouch := row.LastSeenAt == ""
	if !shouldTouch {
		if parsed, parseErr := time.Parse(time.RFC3339, row.LastSeenAt); parseErr != nil || now.Sub(parsed) > 2*time.Minute {
			shouldTouch = true
		}
	}
	if shouldTouch {
		_ = s.queries.TouchSession(ctx, queries.TouchSessionParams{
			LastSeenAt: now.Format(time.RFC3339),
			TokenHash:  hash,
		})
	}
	return true, nil
}

func (s *Store) ListActiveSessions(ctx context.Context, currentTokenHash string) ([]SessionInfo, error) {
	nowUnix := time.Now().Unix()
	_ = s.queries.PruneSessions(ctx, nowUnix)
	rows, err := s.queries.ListActiveSessions(ctx, nowUnix)
	if err != nil {
		return nil, err
	}
	out := make([]SessionInfo, 0, len(rows))
	for _, r := range rows {
		out = append(out, SessionInfo{
			ID:         sessionIDFromHash(r.TokenHash),
			UserAgent:  r.UserAgent,
			IPAddress:  r.IpAddress,
			CreatedAt:  r.CreatedAt,
			LastSeenAt: r.LastSeenAt,
			ExpiresAt:  r.ExpiresAt,
			Current:    r.TokenHash == currentTokenHash,
		})
	}
	return out, nil
}

func (s *Store) DeleteSession(ctx context.Context, hash string) error {
	return s.queries.DeleteSession(ctx, hash)
}

func (s *Store) DeleteOtherSessions(ctx context.Context, currentTokenHash string) (int64, error) {
	return s.queries.DeleteOtherSessions(ctx, currentTokenHash)
}

func (s *Store) DeleteSessionByID(ctx context.Context, id, currentTokenHash string) error {
	cleanID := strings.TrimSpace(id)
	if len(cleanID) != 16 {
		return ErrNotFound
	}
	n, err := s.queries.DeleteSessionByPrefix(ctx, queries.DeleteSessionByPrefixParams{
		TokenHash:   cleanID,
		TokenHash_2: currentTokenHash,
	})
	if err != nil {
		return err
	}
	if n == 0 {
		return ErrNotFound
	}
	return nil
}
