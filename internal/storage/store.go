package storage

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"os"
	"path/filepath"

	projectdb "github.com/Yueyanc/internet-resource-manager/db"
	"github.com/Yueyanc/internet-resource-manager/internal/storage/queries"
	"github.com/pressly/goose/v3"
	_ "modernc.org/sqlite"
)

var ErrExists = errors.New("resource conflict")
var ErrNotFound = errors.New("resource not found")

type Store struct {
	db      *sql.DB
	queries *queries.Queries
}

func Open(ctx context.Context, path string) (*Store, error) {
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return nil, fmt.Errorf("create data directory: %w", err)
	}
	database, err := sql.Open("sqlite", path)
	if err != nil {
		return nil, err
	}
	// A single connection keeps SQLite writes and connection-scoped pragmas predictable.
	database.SetMaxOpenConns(1)
	closeWithError := func(err error) (*Store, error) {
		_ = database.Close()
		return nil, err
	}
	if _, err := database.ExecContext(ctx, "PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;"); err != nil {
		return closeWithError(err)
	}
	provider, err := goose.NewProvider(goose.DialectSQLite3, database, projectdb.Migrations())
	if err != nil {
		return closeWithError(err)
	}
	if _, err := provider.Up(ctx); err != nil {
		return closeWithError(fmt.Errorf("migrate database: %w", err))
	}
	return &Store{db: database, queries: queries.New(database)}, nil
}

func (s *Store) Close() error                   { return s.db.Close() }
func (s *Store) Ping(ctx context.Context) error { return s.db.PingContext(ctx) }
