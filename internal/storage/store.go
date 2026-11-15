package storage

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"

	projectdb "github.com/Yueyanc/internet-resource-manager/db"
	"github.com/Yueyanc/internet-resource-manager/internal/cloudsync"
	"github.com/Yueyanc/internet-resource-manager/internal/storage/queries"
	"github.com/pressly/goose/v3"
	_ "modernc.org/sqlite"
)

var ErrExists = errors.New("resource conflict")
var ErrNotFound = errors.New("resource not found")

type Store struct {
	db      *sql.DB
	queries *queries.Queries
	dbPath  string
	keyRing *cloudsync.KeyRing
}

// ApplyPendingRestore atomically swaps in `<dbPath>.restore` if staged by a system rollback
// before SQLite opens `<dbPath>` and its WAL/SHM files.
func ApplyPendingRestore(dbPath string) (bool, error) {
	cleanPath := strings.TrimSpace(dbPath)
	if cleanPath == "" || cleanPath == ":memory:" {
		return false, nil
	}
	restorePath := cleanPath + ".restore"
	info, err := os.Stat(restorePath)
	if err != nil {
		if os.IsNotExist(err) {
			return false, nil
		}
		return false, err
	}
	if info.IsDir() || info.Size() == 0 {
		_ = os.Remove(restorePath)
		return false, errors.New("staged database restore file is invalid")
	}
	if err := VerifySQLiteFile(context.Background(), restorePath); err != nil {
		_ = os.Remove(restorePath)
		return false, fmt.Errorf("staged database failed integrity check: %w", err)
	}

	if _, statErr := os.Stat(cleanPath); statErr == nil {
		safetyBak := cleanPath + ".pre-restore.bak"
		_ = os.Remove(safetyBak)
		if renErr := os.Rename(cleanPath, safetyBak); renErr != nil {
			return false, fmt.Errorf("backup existing database before restore: %w", renErr)
		}
	}
	_ = os.Remove(cleanPath + "-wal")
	_ = os.Remove(cleanPath + "-shm")

	if err := os.Rename(restorePath, cleanPath); err != nil {
		return false, fmt.Errorf("activate restored database: %w", err)
	}
	return true, nil
}

// VerifySQLiteFile opens a candidate SQLite database file and runs PRAGMA quick_check.
func VerifySQLiteFile(ctx context.Context, candidatePath string) error {
	f, err := os.Open(candidatePath)
	if err != nil {
		return err
	}
	header := make([]byte, 16)
	_, readErr := io.ReadFull(f, header)
	_ = f.Close()
	if readErr != nil || string(header) != "SQLite format 3\x00" {
		return errors.New("not a valid SQLite 3 file")
	}

	db, err := sql.Open("sqlite", candidatePath)
	if err != nil {
		return err
	}
	defer db.Close()
	var status string
	if err := db.QueryRowContext(ctx, "PRAGMA quick_check;").Scan(&status); err != nil {
		return err
	}
	if !strings.EqualFold(strings.TrimSpace(status), "ok") {
		return fmt.Errorf("sqlite quick_check returned %q", status)
	}
	return nil
}

func Open(ctx context.Context, path string) (*Store, error) {
	if err := os.MkdirAll(filepath.Dir(path), 0700); err != nil {
		return nil, fmt.Errorf("create data directory: %w", err)
	}
	absPath := path
	if resolved, err := filepath.Abs(path); err == nil {
		absPath = resolved
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
	keyDir := ":memory:"
	if strings.TrimSpace(path) != ":memory:" && !strings.HasPrefix(strings.TrimSpace(path), "file::memory:") {
		keyDir = filepath.Dir(absPath)
	}
	kr, err := cloudsync.LoadOrCreateKeyRing(keyDir)
	if err != nil {
		return closeWithError(fmt.Errorf("load integration keyring: %w", err))
	}
	return &Store{db: database, queries: queries.New(database), dbPath: absPath, keyRing: kr}, nil
}

func (s *Store) Close() error                   { return s.db.Close() }
func (s *Store) Ping(ctx context.Context) error { return s.db.PingContext(ctx) }
func (s *Store) DBPath() string                 { return s.dbPath }

// BackupTo creates a transactionally consistent hot snapshot of the live SQLite database using VACUUM INTO.
func (s *Store) BackupTo(ctx context.Context, destPath string) error {
	cleanDest := strings.TrimSpace(destPath)
	if cleanDest == "" {
		return errors.New("backup destination path is empty")
	}
	if err := os.MkdirAll(filepath.Dir(cleanDest), 0700); err != nil {
		return fmt.Errorf("create backup directory: %w", err)
	}
	tmpPath := cleanDest + ".tmp"
	_ = os.Remove(tmpPath)
	escaped := strings.ReplaceAll(tmpPath, "'", "''")
	if _, err := s.db.ExecContext(ctx, "VACUUM INTO '"+escaped+"';"); err != nil {
		_ = os.Remove(tmpPath)
		return fmt.Errorf("vacuum into backup: %w", err)
	}
	if err := os.Chmod(tmpPath, 0600); err != nil {
		_ = os.Remove(tmpPath)
		return err
	}
	_ = os.Remove(cleanDest)
	if err := os.Rename(tmpPath, cleanDest); err != nil {
		_ = os.Remove(tmpPath)
		return err
	}
	return nil
}
