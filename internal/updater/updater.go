package updater

import (
	"archive/tar"
	"bufio"
	"compress/gzip"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strconv"
	"strings"
	"sync"
	"sync/atomic"
	"time"

	"github.com/Yueyanc/internet-resource-manager/internal/storage"
)

var (
	ErrAlreadyUpToDate           = errors.New("already up to date")
	ErrUpdateNotSupported        = errors.New("in-place update is disabled in development mode")
	ErrOperationInProgress       = errors.New("another system update or rollback operation is in progress")
	ErrRollbackVersionNotAllowed = errors.New("target version is not in the allowed rollback list")
	ErrNoLocalBackup             = errors.New("no local backup binary available")
	ErrNoDatabaseBackup          = errors.New("no database backup snapshot found for target version")
)

const (
	defaultGitHubRepo     = "Yueyanc/internet-resource-manager"
	defaultGitHubAPIBase  = "https://api.github.com"
	defaultCacheTTL       = 20 * time.Minute
	maxDownloadSizeBytes  = 300 * 1024 * 1024
	maxExtractedFileBytes = 250 * 1024 * 1024
	maxRollbackVersions   = 3
	rollbackFetchPageSize = 15
	maxKeptDBBackups      = 5
)

type Config struct {
	Repo                 string
	CurrentVersion       string
	BuildType            string // "release" or "dev"
	ImageVersion         string // non-empty in official Docker container
	DataDir              string
	ExecutablePath       string
	AgentBinDir          string
	Store                *storage.Store
	APIBaseURL           string
	AllowedDownloadHosts []string
	AllowHTTPScheme      bool // test-only override for local httptest servers
	AllowDevUpdate       bool // test-only override
	SkipBinarySmokeCheck bool // test-only override when using synthetic binaries
	TargetGOOS           string
	TargetGOARCH         string
	CacheTTL             time.Duration
	HTTPClient           *http.Client
}

type ReleaseAsset struct {
	Name        string `json:"name"`
	DownloadURL string `json:"downloadUrl"`
	Size        int64  `json:"size"`
}

type ReleaseDetails struct {
	Version     string         `json:"version"`
	Name        string         `json:"name"`
	Body        string         `json:"body"`
	PublishedAt string         `json:"publishedAt"`
	HTMLURL     string         `json:"htmlUrl"`
	Assets      []ReleaseAsset `json:"-"`
}

type LocalBackupInfo struct {
	Available   bool   `json:"available"`
	Version     string `json:"version"`
	CreatedAt   string `json:"createdAt,omitempty"`
	HasDBBackup bool   `json:"hasDbBackup"`
}

type UpdateInfo struct {
	CurrentVersion string          `json:"currentVersion"`
	LatestVersion  string          `json:"latestVersion"`
	HasUpdate      bool            `json:"hasUpdate"`
	BuildType      string          `json:"buildType"`
	DeploymentMode string          `json:"deploymentMode"` // "docker", "binary", or "dev"
	CanSelfUpdate  bool            `json:"canSelfUpdate"`
	Cached         bool            `json:"cached"`
	CheckedAt      string          `json:"checkedAt"`
	Warning        string          `json:"warning,omitempty"`
	LocalBackup    LocalBackupInfo `json:"localBackup"`
	Release        *ReleaseDetails `json:"release,omitempty"`
}

type RollbackCandidate struct {
	Version           string `json:"version"`
	Name              string `json:"name"`
	PublishedAt       string `json:"publishedAt"`
	HTMLURL           string `json:"htmlUrl"`
	HasDBBackup       bool   `json:"hasDbBackup"`
	DBBackupSizeBytes int64  `json:"dbBackupSizeBytes,omitempty"`
	DBBackupCreatedAt string `json:"dbBackupCreatedAt,omitempty"`
}

type RollbackList struct {
	CurrentVersion string              `json:"currentVersion"`
	DeploymentMode string              `json:"deploymentMode"`
	CanSelfUpdate  bool                `json:"canSelfUpdate"`
	LocalBackup    LocalBackupInfo     `json:"localBackup"`
	Versions       []RollbackCandidate `json:"versions"`
}

type ApplyResult struct {
	TargetVersion    string `json:"targetVersion"`
	BackupDBPath     string `json:"-"`
	RestoredDatabase bool   `json:"restoredDatabase"`
	NeedRestart      bool   `json:"needRestart"`
}

type githubRelease struct {
	TagName     string        `json:"tag_name"`
	Name        string        `json:"name"`
	Body        string        `json:"body"`
	PublishedAt string        `json:"published_at"`
	HTMLURL     string        `json:"html_url"`
	Draft       bool          `json:"draft"`
	Prerelease  bool          `json:"prerelease"`
	Assets      []githubAsset `json:"assets"`
}

type githubAsset struct {
	Name               string `json:"name"`
	BrowserDownloadURL string `json:"browser_download_url"`
	Size               int64  `json:"size"`
}

type backupMeta struct {
	Version   string `json:"version"`
	CreatedAt string `json:"createdAt"`
}

type Service struct {
	cfg Config

	cacheMu   sync.Mutex
	cached    *UpdateInfo
	cachedExp time.Time

	busy atomic.Bool
}

func New(cfg Config) *Service {
	if strings.TrimSpace(cfg.Repo) == "" {
		cfg.Repo = defaultGitHubRepo
	}
	if strings.TrimSpace(cfg.CurrentVersion) == "" {
		cfg.CurrentVersion = "0.1.0-dev"
	}
	if strings.TrimSpace(cfg.BuildType) == "" {
		if strings.Contains(cfg.CurrentVersion, "-dev") {
			cfg.BuildType = "dev"
		} else {
			cfg.BuildType = "release"
		}
	}
	if strings.TrimSpace(cfg.APIBaseURL) == "" {
		cfg.APIBaseURL = defaultGitHubAPIBase
	}
	cfg.APIBaseURL = strings.TrimRight(strings.TrimSpace(cfg.APIBaseURL), "/")
	if len(cfg.AllowedDownloadHosts) == 0 {
		cfg.AllowedDownloadHosts = []string{
			"github.com",
			"objects.githubusercontent.com",
			"release-assets.githubusercontent.com",
		}
	}
	if cfg.TargetGOOS == "" {
		cfg.TargetGOOS = runtime.GOOS
	}
	if cfg.TargetGOARCH == "" {
		cfg.TargetGOARCH = runtime.GOARCH
	}
	if cfg.CacheTTL <= 0 {
		cfg.CacheTTL = defaultCacheTTL
	}
	if cfg.DataDir == "" && cfg.Store != nil && cfg.Store.DBPath() != "" {
		cfg.DataDir = filepath.Dir(cfg.Store.DBPath())
	}
	if cfg.HTTPClient == nil {
		cfg.HTTPClient = &http.Client{Timeout: 10 * time.Minute}
	}
	return &Service{cfg: cfg}
}

func (s *Service) CurrentVersion() string {
	return NormalizeTag(s.cfg.CurrentVersion)
}

func (s *Service) BuildType() string {
	return s.cfg.BuildType
}

func (s *Service) DeploymentMode() string {
	if s.cfg.BuildType != "release" && !s.cfg.AllowDevUpdate {
		return "dev"
	}
	if strings.TrimSpace(s.cfg.ImageVersion) != "" {
		return "docker"
	}
	return "binary"
}

func (s *Service) CanSelfUpdate() bool {
	if s.cfg.AllowDevUpdate {
		return true
	}
	if s.cfg.BuildType != "release" {
		return false
	}
	return s.cfg.TargetGOOS == "linux" || s.cfg.TargetGOOS == "darwin"
}

func (s *Service) TryBeginOperation() (func(), error) {
	if !s.busy.CompareAndSwap(false, true) {
		return nil, ErrOperationInProgress
	}
	return func() {
		s.busy.Store(false)
	}, nil
}

func (s *Service) CheckUpdate(ctx context.Context, force bool) (*UpdateInfo, error) {
	now := time.Now().UTC()
	if !force {
		s.cacheMu.Lock()
		if s.cached != nil && now.Before(s.cachedExp) {
			cp := *s.cached
			cp.Cached = true
			cp.LocalBackup = s.inspectLocalBackup()
			s.cacheMu.Unlock()
			return &cp, nil
		}
		s.cacheMu.Unlock()
	}

	rel, statusCode, err := s.fetchLatestRelease(ctx)
	if err != nil {
		// Graceful fallback if repository has no published GitHub releases yet (HTTP 404).
		if statusCode == http.StatusNotFound {
			info := &UpdateInfo{
				CurrentVersion: s.CurrentVersion(),
				LatestVersion:  s.CurrentVersion(),
				HasUpdate:      false,
				BuildType:      s.cfg.BuildType,
				DeploymentMode: s.DeploymentMode(),
				CanSelfUpdate:  s.CanSelfUpdate(),
				Cached:         false,
				CheckedAt:      now.Format(time.RFC3339),
				LocalBackup:    s.inspectLocalBackup(),
			}
			s.storeCache(info, now)
			return info, nil
		}

		s.cacheMu.Lock()
		if s.cached != nil {
			cp := *s.cached
			cp.Cached = true
			cp.Warning = err.Error()
			cp.LocalBackup = s.inspectLocalBackup()
			s.cacheMu.Unlock()
			return &cp, nil
		}
		s.cacheMu.Unlock()

		return &UpdateInfo{
			CurrentVersion: s.CurrentVersion(),
			LatestVersion:  s.CurrentVersion(),
			HasUpdate:      false,
			BuildType:      s.cfg.BuildType,
			DeploymentMode: s.DeploymentMode(),
			CanSelfUpdate:  s.CanSelfUpdate(),
			Cached:         false,
			CheckedAt:      now.Format(time.RFC3339),
			Warning:        err.Error(),
			LocalBackup:    s.inspectLocalBackup(),
		}, nil
	}

	latestTag := NormalizeTag(rel.TagName)
	hasUpdate := CompareVersions(s.cfg.CurrentVersion, latestTag) < 0
	assets := make([]ReleaseAsset, 0, len(rel.Assets))
	for _, a := range rel.Assets {
		assets = append(assets, ReleaseAsset{
			Name:        a.Name,
			DownloadURL: a.BrowserDownloadURL,
			Size:        a.Size,
		})
	}
	name := strings.TrimSpace(rel.Name)
	if name == "" {
		name = latestTag
	}
	info := &UpdateInfo{
		CurrentVersion: s.CurrentVersion(),
		LatestVersion:  latestTag,
		HasUpdate:      hasUpdate,
		BuildType:      s.cfg.BuildType,
		DeploymentMode: s.DeploymentMode(),
		CanSelfUpdate:  s.CanSelfUpdate(),
		Cached:         false,
		CheckedAt:      now.Format(time.RFC3339),
		LocalBackup:    s.inspectLocalBackup(),
		Release: &ReleaseDetails{
			Version:     latestTag,
			Name:        name,
			Body:        rel.Body,
			PublishedAt: rel.PublishedAt,
			HTMLURL:     rel.HTMLURL,
			Assets:      assets,
		},
	}
	s.storeCache(info, now)
	return info, nil
}

func (s *Service) storeCache(info *UpdateInfo, now time.Time) {
	s.cacheMu.Lock()
	defer s.cacheMu.Unlock()
	cp := *info
	s.cached = &cp
	s.cachedExp = now.Add(s.cfg.CacheTTL)
}

func (s *Service) invalidateCache() {
	s.cacheMu.Lock()
	defer s.cacheMu.Unlock()
	s.cached = nil
	s.cachedExp = time.Time{}
}

func (s *Service) ListRollbackVersions(ctx context.Context) (*RollbackList, error) {
	candidates, err := s.fetchRollbackCandidates(ctx)
	if err != nil {
		return nil, err
	}
	items := make([]RollbackCandidate, 0, len(candidates))
	for _, rel := range candidates {
		ver := NormalizeTag(rel.TagName)
		name := strings.TrimSpace(rel.Name)
		if name == "" {
			name = ver
		}
		cand := RollbackCandidate{
			Version:     ver,
			Name:        name,
			PublishedAt: rel.PublishedAt,
			HTMLURL:     rel.HTMLURL,
		}
		if dbBakPath := s.dbBackupPathForVersion(ver); dbBakPath != "" {
			if st, statErr := os.Stat(dbBakPath); statErr == nil && !st.IsDir() && st.Size() > 0 {
				cand.HasDBBackup = true
				cand.DBBackupSizeBytes = st.Size()
				cand.DBBackupCreatedAt = st.ModTime().UTC().Format(time.RFC3339)
			}
		}
		items = append(items, cand)
	}
	return &RollbackList{
		CurrentVersion: s.CurrentVersion(),
		DeploymentMode: s.DeploymentMode(),
		CanSelfUpdate:  s.CanSelfUpdate(),
		LocalBackup:    s.inspectLocalBackup(),
		Versions:       items,
	}, nil
}

func (s *Service) PerformUpdate(ctx context.Context) (*ApplyResult, error) {
	if !s.CanSelfUpdate() {
		return nil, ErrUpdateNotSupported
	}
	releaseOp, err := s.TryBeginOperation()
	if err != nil {
		return nil, err
	}
	defer releaseOp()

	info, err := s.CheckUpdate(ctx, true)
	if err != nil {
		return nil, err
	}
	if info.Warning != "" && info.Release == nil {
		return nil, fmt.Errorf("failed to query latest release: %s", info.Warning)
	}
	if !info.HasUpdate || info.Release == nil {
		return nil, ErrAlreadyUpToDate
	}

	var dbBackupPath string
	if s.cfg.Store != nil && s.cfg.DataDir != "" {
		dbBackupPath = s.dbBackupPathForVersion(s.CurrentVersion())
		if err := s.cfg.Store.BackupTo(ctx, dbBackupPath); err != nil {
			return nil, fmt.Errorf("create pre-upgrade SQLite snapshot: %w", err)
		}
		s.pruneOldDBBackups()
	}

	if err := s.downloadVerifyAndSwap(ctx, info.Release.Assets); err != nil {
		return nil, err
	}
	s.invalidateCache()

	return &ApplyResult{
		TargetVersion: info.LatestVersion,
		BackupDBPath:  dbBackupPath,
		NeedRestart:   true,
	}, nil
}

func (s *Service) Rollback(ctx context.Context, targetVersion string, restoreDatabase bool) (*ApplyResult, error) {
	if !s.CanSelfUpdate() {
		return nil, ErrUpdateNotSupported
	}
	releaseOp, err := s.TryBeginOperation()
	if err != nil {
		return nil, err
	}
	defer releaseOp()

	cleanTarget := strings.TrimSpace(targetVersion)
	if cleanTarget == "" {
		localBak := s.inspectLocalBackup()
		if !localBak.Available {
			return nil, ErrNoLocalBackup
		}
		restoredDB := false
		if restoreDatabase {
			if err := s.stageDatabaseRestore(ctx, localBak.Version); err != nil {
				return nil, err
			}
			restoredDB = true
		}
		if err := s.restoreLocalBackupBinary(); err != nil {
			if restoredDB && s.cfg.Store != nil {
				_ = os.Remove(s.cfg.Store.DBPath() + ".restore")
			}
			return nil, err
		}
		s.invalidateCache()
		return &ApplyResult{
			TargetVersion:    localBak.Version,
			RestoredDatabase: restoredDB,
			NeedRestart:      true,
		}, nil
	}

	normTarget := NormalizeTag(cleanTarget)
	candidates, err := s.fetchRollbackCandidates(ctx)
	if err != nil {
		return nil, err
	}
	var matched *githubRelease
	for _, rel := range candidates {
		if NormalizeTag(rel.TagName) == normTarget {
			matched = rel
			break
		}
	}
	if matched == nil {
		return nil, ErrRollbackVersionNotAllowed
	}

	restoredDB := false
	if restoreDatabase {
		if err := s.stageDatabaseRestore(ctx, normTarget); err != nil {
			return nil, err
		}
		restoredDB = true
	}

	assets := make([]ReleaseAsset, 0, len(matched.Assets))
	for _, a := range matched.Assets {
		assets = append(assets, ReleaseAsset{
			Name:        a.Name,
			DownloadURL: a.BrowserDownloadURL,
			Size:        a.Size,
		})
	}
	if err := s.downloadVerifyAndSwap(ctx, assets); err != nil {
		if restoredDB && s.cfg.Store != nil {
			_ = os.Remove(s.cfg.Store.DBPath() + ".restore")
		}
		return nil, err
	}
	s.invalidateCache()

	return &ApplyResult{
		TargetVersion:    normTarget,
		RestoredDatabase: restoredDB,
		NeedRestart:      true,
	}, nil
}

func (s *Service) stageDatabaseRestore(ctx context.Context, version string) error {
	if s.cfg.Store == nil || s.cfg.Store.DBPath() == "" {
		return ErrNoDatabaseBackup
	}
	bakPath := s.dbBackupPathForVersion(version)
	if bakPath == "" {
		return ErrNoDatabaseBackup
	}
	if _, err := os.Stat(bakPath); err != nil {
		if os.IsNotExist(err) {
			return ErrNoDatabaseBackup
		}
		return err
	}
	if err := storage.VerifySQLiteFile(ctx, bakPath); err != nil {
		return fmt.Errorf("backup snapshot failed integrity verification: %w", err)
	}
	destRestore := s.cfg.Store.DBPath() + ".restore"
	if err := copyFileAtomic(bakPath, destRestore, 0600); err != nil {
		return fmt.Errorf("stage database restore file: %w", err)
	}
	return nil
}

func (s *Service) downloadVerifyAndSwap(ctx context.Context, assets []ReleaseAsset) error {
	expectedArchive := fmt.Sprintf("irm-release-%s-%s.tar.gz", s.cfg.TargetGOOS, s.cfg.TargetGOARCH)
	var archiveURL, checksumURL string
	for _, a := range assets {
		if a.Name == expectedArchive {
			archiveURL = a.DownloadURL
		} else if a.Name == "checksums.txt" {
			checksumURL = a.DownloadURL
		}
	}
	if archiveURL == "" {
		return fmt.Errorf("release does not contain asset %s", expectedArchive)
	}
	if checksumURL == "" {
		return errors.New("release is missing mandatory checksums.txt")
	}
	if err := s.validateDownloadURL(archiveURL); err != nil {
		return fmt.Errorf("untrusted archive URL: %w", err)
	}
	if err := s.validateDownloadURL(checksumURL); err != nil {
		return fmt.Errorf("untrusted checksum URL: %w", err)
	}

	targetServerPath, targetDistDir, metaPath, baseImgMarker, err := s.resolveInstallPaths()
	if err != nil {
		return err
	}
	parentDir := filepath.Dir(targetServerPath)
	if err := os.MkdirAll(parentDir, 0755); err != nil {
		return fmt.Errorf("prepare target directory: %w", err)
	}

	tempDir, err := os.MkdirTemp(parentDir, ".irm-update-*")
	if err != nil {
		return fmt.Errorf("create staging directory: %w", err)
	}
	defer func() { _ = os.RemoveAll(tempDir) }()

	archivePath := filepath.Join(tempDir, expectedArchive)
	if err := s.downloadToFile(ctx, archiveURL, archivePath, maxDownloadSizeBytes); err != nil {
		return fmt.Errorf("download release archive: %w", err)
	}
	checksumBytes, err := s.fetchBytes(ctx, checksumURL, 1024*1024)
	if err != nil {
		return fmt.Errorf("download checksums.txt: %w", err)
	}
	if err := verifyFileSHA256(archivePath, expectedArchive, string(checksumBytes)); err != nil {
		return err
	}

	extractDir := filepath.Join(tempDir, "extracted")
	if err := extractReleaseArchive(archivePath, extractDir); err != nil {
		return fmt.Errorf("extract release archive: %w", err)
	}

	stagedServer := filepath.Join(extractDir, "server")
	if _, err := os.Stat(stagedServer); err != nil {
		return errors.New("extracted archive does not contain server binary")
	}
	if err := os.Chmod(stagedServer, 0755); err != nil {
		return err
	}
	if !s.cfg.SkipBinarySmokeCheck && s.cfg.TargetGOOS == runtime.GOOS && s.cfg.TargetGOARCH == runtime.GOARCH {
		smokeCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
		out, smokeErr := exec.CommandContext(smokeCtx, stagedServer, "-version").CombinedOutput()
		cancel()
		if smokeErr != nil {
			return fmt.Errorf("new binary failed pre-flight check (%v): %s", smokeErr, strings.TrimSpace(string(out)))
		}
	}

	// Preserve currently running binary into `<targetServerPath>.backup` for instant network-free rollback.
	currentExe, exeErr := s.resolveCurrentExecutable()
	backupPath := targetServerPath + ".backup"
	hadTargetServer := false
	if _, statErr := os.Stat(targetServerPath); statErr == nil {
		hadTargetServer = true
	}

	if hadTargetServer {
		_ = os.Remove(backupPath)
		if err := os.Rename(targetServerPath, backupPath); err != nil {
			return fmt.Errorf("backup active binary: %w", err)
		}
	} else if exeErr == nil && currentExe != "" {
		if copyErr := copyFileAtomic(currentExe, backupPath, 0755); copyErr != nil {
			return fmt.Errorf("seed initial backup binary: %w", copyErr)
		}
	}

	if err := os.Rename(stagedServer, targetServerPath); err != nil {
		if hadTargetServer {
			_ = os.Rename(backupPath, targetServerPath)
		}
		return fmt.Errorf("activate new binary: %w", err)
	}

	// Record local backup metadata.
	metaRaw, _ := json.Marshal(backupMeta{
		Version:   s.CurrentVersion(),
		CreatedAt: time.Now().UTC().Format(time.RFC3339),
	})
	_ = os.WriteFile(metaPath, metaRaw, 0600)

	// Update bundled irm-agent binaries if present in the archive.
	stagedDist := filepath.Join(extractDir, "dist")
	if entries, readErr := os.ReadDir(stagedDist); readErr == nil && len(entries) > 0 && targetDistDir != "" {
		if mkErr := os.MkdirAll(targetDistDir, 0755); mkErr == nil {
			for _, ent := range entries {
				if ent.IsDir() || !strings.HasPrefix(ent.Name(), "irm-agent-") {
					continue
				}
				src := filepath.Join(stagedDist, ent.Name())
				dst := filepath.Join(targetDistDir, ent.Name())
				_ = copyFileAtomic(src, dst, 0755)
			}
		}
	}

	// In Docker persistent overlay mode, stamp the base image version so entrypoint.sh
	// executes `/data/bin/server` until a newer container image is explicitly deployed.
	if baseImgMarker != "" && strings.TrimSpace(s.cfg.ImageVersion) != "" {
		_ = os.WriteFile(baseImgMarker, []byte(strings.TrimSpace(s.cfg.ImageVersion)+"\n"), 0644)
	}

	return nil
}

func (s *Service) restoreLocalBackupBinary() error {
	targetServerPath, _, metaPath, baseImgMarker, err := s.resolveInstallPaths()
	if err != nil {
		return err
	}
	backupPath := targetServerPath + ".backup"
	if _, err := os.Stat(backupPath); err != nil {
		if os.IsNotExist(err) {
			return ErrNoLocalBackup
		}
		return err
	}
	if err := os.Rename(backupPath, targetServerPath); err != nil {
		return fmt.Errorf("restore backup binary: %w", err)
	}
	_ = os.Remove(metaPath)
	if baseImgMarker != "" && strings.TrimSpace(s.cfg.ImageVersion) != "" {
		_ = os.WriteFile(baseImgMarker, []byte(strings.TrimSpace(s.cfg.ImageVersion)+"\n"), 0644)
	}
	return nil
}

func (s *Service) resolveCurrentExecutable() (string, error) {
	if strings.TrimSpace(s.cfg.ExecutablePath) != "" {
		return filepath.Abs(s.cfg.ExecutablePath)
	}
	exe, err := os.Executable()
	if err != nil {
		return "", err
	}
	return filepath.EvalSymlinks(exe)
}

func (s *Service) resolveInstallPaths() (serverPath, distDir, metaPath, baseImgMarker string, err error) {
	if strings.TrimSpace(s.cfg.ImageVersion) != "" {
		if strings.TrimSpace(s.cfg.DataDir) == "" {
			return "", "", "", "", errors.New("data directory is required for Docker overlay updates")
		}
		binDir := filepath.Join(s.cfg.DataDir, "bin")
		return filepath.Join(binDir, "server"),
			filepath.Join(binDir, "dist"),
			filepath.Join(binDir, "backup-meta.json"),
			filepath.Join(binDir, "base_image_version"),
			nil
	}

	exePath, err := s.resolveCurrentExecutable()
	if err != nil {
		return "", "", "", "", fmt.Errorf("resolve executable path: %w", err)
	}
	exeDir := filepath.Dir(exePath)
	dist := strings.TrimSpace(s.cfg.AgentBinDir)
	if dist == "" {
		dist = filepath.Join(exeDir, "dist")
	}
	return exePath, dist, filepath.Join(exeDir, ".irm-backup-meta.json"), "", nil
}

func (s *Service) inspectLocalBackup() LocalBackupInfo {
	targetServerPath, _, metaPath, _, err := s.resolveInstallPaths()
	if err != nil {
		return LocalBackupInfo{}
	}
	backupPath := targetServerPath + ".backup"
	st, statErr := os.Stat(backupPath)
	if statErr != nil || st.IsDir() || st.Size() == 0 {
		return LocalBackupInfo{}
	}
	var meta backupMeta
	if raw, readErr := os.ReadFile(metaPath); readErr == nil {
		_ = json.Unmarshal(raw, &meta)
	}
	ver := NormalizeTag(meta.Version)
	createdAt := meta.CreatedAt
	if createdAt == "" {
		createdAt = st.ModTime().UTC().Format(time.RFC3339)
	}
	hasDB := false
	if ver != "" {
		if dbBak := s.dbBackupPathForVersion(ver); dbBak != "" {
			if dbSt, dbErr := os.Stat(dbBak); dbErr == nil && !dbSt.IsDir() && dbSt.Size() > 0 {
				hasDB = true
			}
		}
	}
	return LocalBackupInfo{
		Available:   true,
		Version:     ver,
		CreatedAt:   createdAt,
		HasDBBackup: hasDB,
	}
}

func (s *Service) dbBackupPathForVersion(version string) string {
	if strings.TrimSpace(s.cfg.DataDir) == "" {
		return ""
	}
	norm := sanitizeVersionFilename(NormalizeTag(version))
	if norm == "" {
		return ""
	}
	return filepath.Join(s.cfg.DataDir, "backups", "irm-"+norm+".db")
}

func (s *Service) pruneOldDBBackups() {
	if strings.TrimSpace(s.cfg.DataDir) == "" {
		return
	}
	dir := filepath.Join(s.cfg.DataDir, "backups")
	entries, err := os.ReadDir(dir)
	if err != nil {
		return
	}
	type fileEntry struct {
		path    string
		modTime time.Time
	}
	var files []fileEntry
	for _, ent := range entries {
		if ent.IsDir() || !strings.HasPrefix(ent.Name(), "irm-") || !strings.HasSuffix(ent.Name(), ".db") {
			continue
		}
		if info, infoErr := ent.Info(); infoErr == nil {
			files = append(files, fileEntry{
				path:    filepath.Join(dir, ent.Name()),
				modTime: info.ModTime(),
			})
		}
	}
	if len(files) <= maxKeptDBBackups {
		return
	}
	sort.Slice(files, func(i, j int) bool {
		return files[i].modTime.After(files[j].modTime)
	})
	for _, old := range files[maxKeptDBBackups:] {
		_ = os.Remove(old.path)
	}
}

func (s *Service) fetchLatestRelease(ctx context.Context) (*githubRelease, int, error) {
	endpoint := fmt.Sprintf("%s/repos/%s/releases/latest", s.cfg.APIBaseURL, s.cfg.Repo)
	raw, status, err := s.fetchGitHubJSON(ctx, endpoint)
	if err != nil {
		return nil, status, err
	}
	var rel githubRelease
	if err := json.Unmarshal(raw, &rel); err != nil {
		return nil, status, err
	}
	return &rel, status, nil
}

func (s *Service) fetchRollbackCandidates(ctx context.Context) ([]*githubRelease, error) {
	endpoint := fmt.Sprintf("%s/repos/%s/releases?per_page=%d", s.cfg.APIBaseURL, s.cfg.Repo, rollbackFetchPageSize)
	raw, status, err := s.fetchGitHubJSON(ctx, endpoint)
	if err != nil {
		if status == http.StatusNotFound {
			return nil, nil
		}
		return nil, err
	}
	var releases []*githubRelease
	if err := json.Unmarshal(raw, &releases); err != nil {
		return nil, err
	}

	seen := make(map[string]bool, len(releases))
	var candidates []*githubRelease
	for _, r := range releases {
		if r == nil || r.Draft || r.Prerelease {
			continue
		}
		norm := NormalizeTag(r.TagName)
		if norm == "" || seen[norm] {
			continue
		}
		if CompareVersions(norm, s.cfg.CurrentVersion) >= 0 {
			continue
		}
		seen[norm] = true
		candidates = append(candidates, r)
	}

	sort.SliceStable(candidates, func(i, j int) bool {
		return CompareVersions(candidates[i].TagName, candidates[j].TagName) > 0
	})
	if len(candidates) > maxRollbackVersions {
		candidates = candidates[:maxRollbackVersions]
	}
	return candidates, nil
}

func (s *Service) fetchGitHubJSON(ctx context.Context, endpoint string) ([]byte, int, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, 0, err
	}
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("User-Agent", "internet-resource-manager-updater")
	if tok := strings.TrimSpace(os.Getenv("IRM_GITHUB_TOKEN")); tok != "" {
		req.Header.Set("Authorization", "Bearer "+tok)
	}

	resp, err := s.cfg.HTTPClient.Do(req)
	if err != nil {
		return nil, 0, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, 4*1024*1024))
	if err != nil {
		return nil, resp.StatusCode, err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, resp.StatusCode, fmt.Errorf("GitHub API returned HTTP %d", resp.StatusCode)
	}
	return body, resp.StatusCode, nil
}

func (s *Service) fetchBytes(ctx context.Context, rawURL string, maxBytes int64) ([]byte, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "internet-resource-manager-updater")
	resp, err := s.downloadClient().Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("download returned HTTP %d", resp.StatusCode)
	}
	return io.ReadAll(io.LimitReader(resp.Body, maxBytes))
}

func (s *Service) downloadToFile(ctx context.Context, rawURL, dest string, maxBytes int64) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return err
	}
	req.Header.Set("User-Agent", "internet-resource-manager-updater")
	resp, err := s.downloadClient().Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("download returned HTTP %d", resp.StatusCode)
	}
	if resp.ContentLength > maxBytes {
		return fmt.Errorf("asset size %d exceeds limit %d", resp.ContentLength, maxBytes)
	}
	f, err := os.OpenFile(dest, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0600)
	if err != nil {
		return err
	}
	written, copyErr := io.Copy(f, io.LimitReader(resp.Body, maxBytes+1))
	closeErr := f.Close()
	if copyErr != nil {
		return copyErr
	}
	if closeErr != nil {
		return closeErr
	}
	if written > maxBytes {
		return fmt.Errorf("asset exceeded maximum size of %d bytes", maxBytes)
	}
	return nil
}

func (s *Service) downloadClient() *http.Client {
	base := s.cfg.HTTPClient
	cp := *base
	cp.CheckRedirect = func(req *http.Request, via []*http.Request) error {
		if len(via) >= 5 {
			return errors.New("too many redirects")
		}
		return s.validateDownloadURL(req.URL.String())
	}
	return &cp
}

func (s *Service) validateDownloadURL(rawURL string) error {
	u, err := url.Parse(rawURL)
	if err != nil {
		return err
	}
	if u.Scheme != "https" && !(s.cfg.AllowHTTPScheme && u.Scheme == "http") {
		return fmt.Errorf("HTTPS scheme required, got %q", u.Scheme)
	}
	host := strings.ToLower(u.Hostname())
	for _, allowed := range s.cfg.AllowedDownloadHosts {
		allowed = strings.ToLower(strings.TrimSpace(allowed))
		if allowed == "" {
			continue
		}
		if host == allowed || strings.HasSuffix(host, "."+allowed) {
			return nil
		}
	}
	return fmt.Errorf("host %q is not in allowed release hosts", host)
}

func verifyFileSHA256(filePath, expectedName, checksumContent string) error {
	f, err := os.Open(filePath)
	if err != nil {
		return err
	}
	defer f.Close()

	h := sha256.New()
	if _, err := io.Copy(h, f); err != nil {
		return err
	}
	actual := hex.EncodeToString(h.Sum(nil))

	scanner := bufio.NewScanner(strings.NewReader(checksumContent))
	for scanner.Scan() {
		fields := strings.Fields(scanner.Text())
		if len(fields) < 2 {
			continue
		}
		name := strings.TrimPrefix(fields[1], "*")
		if filepath.Base(name) == expectedName {
			expected := strings.ToLower(strings.TrimSpace(fields[0]))
			if actual != expected {
				return fmt.Errorf("SHA-256 checksum mismatch for %s: expected %s, got %s", expectedName, expected, actual)
			}
			return nil
		}
	}
	return fmt.Errorf("checksum entry for %s not found in checksums.txt", expectedName)
}

func extractReleaseArchive(archivePath, destDir string) error {
	if err := os.MkdirAll(destDir, 0700); err != nil {
		return err
	}
	f, err := os.Open(archivePath)
	if err != nil {
		return err
	}
	defer f.Close()

	gzr, err := gzip.NewReader(f)
	if err != nil {
		return err
	}
	defer gzr.Close()

	tr := tar.NewReader(gzr)
	for {
		hdr, err := tr.Next()
		if errors.Is(err, io.EOF) {
			break
		}
		if err != nil {
			return err
		}
		if hdr.Typeflag != tar.TypeReg {
			continue
		}
		cleanRel := filepath.Clean(strings.TrimPrefix(hdr.Name, "./"))
		if cleanRel == "." || cleanRel == "" || strings.HasPrefix(cleanRel, "..") || filepath.IsAbs(cleanRel) {
			return fmt.Errorf("unsafe archive entry path %q", hdr.Name)
		}
		// Only extract expected server and agent binaries.
		allowed := cleanRel == "server" ||
			(filepath.Dir(cleanRel) == "dist" && strings.HasPrefix(filepath.Base(cleanRel), "irm-agent-"))
		if !allowed {
			continue
		}
		if hdr.Size > maxExtractedFileBytes {
			return fmt.Errorf("archive entry %q exceeds size limit", cleanRel)
		}

		outPath := filepath.Join(destDir, cleanRel)
		if err := os.MkdirAll(filepath.Dir(outPath), 0755); err != nil {
			return err
		}
		outFile, err := os.OpenFile(outPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0755)
		if err != nil {
			return err
		}
		written, copyErr := io.Copy(outFile, io.LimitReader(tr, maxExtractedFileBytes+1))
		closeErr := outFile.Close()
		if copyErr != nil {
			return copyErr
		}
		if closeErr != nil {
			return closeErr
		}
		if written > maxExtractedFileBytes {
			return fmt.Errorf("archive entry %q exceeded extracted size limit", cleanRel)
		}
	}
	return nil
}

func copyFileAtomic(src, dst string, mode os.FileMode) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()

	if err := os.MkdirAll(filepath.Dir(dst), 0755); err != nil {
		return err
	}
	tmp := dst + ".tmp"
	_ = os.Remove(tmp)
	out, err := os.OpenFile(tmp, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, mode)
	if err != nil {
		return err
	}
	if _, copyErr := io.Copy(out, in); copyErr != nil {
		_ = out.Close()
		_ = os.Remove(tmp)
		return copyErr
	}
	if err := out.Close(); err != nil {
		_ = os.Remove(tmp)
		return err
	}
	if err := os.Chmod(tmp, mode); err != nil {
		_ = os.Remove(tmp)
		return err
	}
	return os.Rename(tmp, dst)
}

func NormalizeTag(v string) string {
	trimmed := strings.TrimSpace(v)
	if trimmed == "" {
		return ""
	}
	if strings.HasPrefix(trimmed, "v") || strings.HasPrefix(trimmed, "V") {
		return "v" + trimmed[1:]
	}
	return "v" + trimmed
}

func sanitizeVersionFilename(v string) string {
	var b strings.Builder
	for _, r := range v {
		if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '.' || r == '-' || r == '_' {
			b.WriteRune(r)
		}
	}
	return b.String()
}

// CompareVersions compares two semantic versions (ignoring leading "v" and any "-..." suffix for numeric core,
// while treating "-dev" or prerelease of the exact same x.y.z as older than the final release x.y.z).
func CompareVersions(a, b string) int {
	pa, preA := parseSemver(a)
	pb, preB := parseSemver(b)
	for i := 0; i < 3; i++ {
		if pa[i] < pb[i] {
			return -1
		}
		if pa[i] > pb[i] {
			return 1
		}
	}
	if preA && !preB {
		return -1
	}
	if !preA && preB {
		return 1
	}
	return 0
}

func parseSemver(v string) ([3]int, bool) {
	clean := strings.TrimSpace(v)
	clean = strings.TrimPrefix(clean, "v")
	clean = strings.TrimPrefix(clean, "V")
	hasPrerelease := false
	if idx := strings.IndexByte(clean, '-'); idx != -1 {
		hasPrerelease = true
		clean = clean[:idx]
	}
	parts := strings.Split(clean, ".")
	var out [3]int
	for i := 0; i < len(parts) && i < 3; i++ {
		if n, err := strconv.Atoi(parts[i]); err == nil {
			out[i] = n
		}
	}
	return out, hasPrerelease
}
