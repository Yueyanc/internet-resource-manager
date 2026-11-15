package storage

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/Yueyanc/internet-resource-manager/internal/ipaddr"
	"github.com/Yueyanc/internet-resource-manager/internal/protocol"
	"github.com/Yueyanc/internet-resource-manager/internal/serverhost"
	"github.com/Yueyanc/internet-resource-manager/internal/storage/queries"
)

var (
	ErrInvalidEnrollToken = errors.New("invalid or expired enroll token")
	ErrEnrollTokenUsed    = errors.New("enroll token already used")
	ErrInvalidAgentToken  = errors.New("invalid agent token")
)

const enrollTokenTTL = 15 * time.Minute

type CreateEnrollTokenInput struct {
	TargetServerID string `json:"targetServerId"`
	NameHint       string `json:"nameHint"`
	PresetKey      string `json:"presetKey"`
	DockerEnabled  bool   `json:"dockerEnabled"`
}

type EnrollTokenCreated struct {
	ID             string `json:"id"`
	Token          string `json:"token"`
	TargetServerID string `json:"targetServerId"`
	NameHint       string `json:"nameHint"`
	PresetKey      string `json:"presetKey"`
	DockerEnabled  bool   `json:"dockerEnabled"`
	ExpiresAt      string `json:"expiresAt"`
	CreatedAt      string `json:"createdAt"`
}

type EnrollTokenStatus struct {
	ID             string        `json:"id"`
	Status         string        `json:"status"` // "pending" | "used" | "expired"
	TargetServerID string        `json:"targetServerId"`
	DockerEnabled  bool          `json:"dockerEnabled"`
	ExpiresAt      string        `json:"expiresAt"`
	UsedAt         string        `json:"usedAt"`
	Server         *ServerRecord `json:"-"`
}

func hashToken(raw string) string {
	sum := sha256.Sum256([]byte(strings.TrimSpace(raw)))
	return hex.EncodeToString(sum[:])
}

func generatePrefixedToken(prefix string) (raw string, hash string, err error) {
	buf := make([]byte, 18)
	if _, err := rand.Read(buf); err != nil {
		return "", "", err
	}
	raw = prefix + hex.EncodeToString(buf)
	return raw, hashToken(raw), nil
}

func agentRowToTelemetry(ag queries.ServerAgent, now time.Time) serverhost.Telemetry {
	var containers []protocol.ContainerSummary
	if ag.ContainersJson != "" {
		_ = json.Unmarshal([]byte(ag.ContainersJson), &containers)
	}
	if containers == nil {
		containers = []protocol.ContainerSummary{}
	}
	return serverhost.Telemetry{
		AgentStatus:        serverhost.ComputeAgentStatus(ag.Mode, ag.IntervalSec, ag.LastReportedAt, now),
		Mode:               ag.Mode,
		AgentVersion:       ag.AgentVersion,
		IntervalSec:        ag.IntervalSec,
		EnrolledAt:         ag.EnrolledAt,
		LastReportedAt:     ag.LastReportedAt,
		CPUModel:           ag.CpuModel,
		KernelVersion:      ag.KernelVersion,
		UptimeSeconds:      ag.UptimeSeconds,
		CPUPercent:         ag.CpuPercent,
		Load1:              ag.Load1,
		Load5:              ag.Load5,
		Load15:             ag.Load15,
		MemoryUsedBytes:    ag.MemoryUsedBytes,
		MemoryTotalBytes:   ag.MemoryTotalBytes,
		SwapUsedBytes:      ag.SwapUsedBytes,
		SwapTotalBytes:     ag.SwapTotalBytes,
		RootDiskUsedBytes:  ag.RootDiskUsedBytes,
		RootDiskTotalBytes: ag.RootDiskTotalBytes,
		NetRxBps:           ag.NetRxBps,
		NetTxBps:           ag.NetTxBps,
		TrafficCycleKey:    ag.TrafficCycleKey,
		TrafficRxBytes:     ag.TrafficRxBytes,
		TrafficTxBytes:     ag.TrafficTxBytes,
		TCPConnections:     ag.TcpConnections,
		DockerEnabled:      ag.DockerEnabled != 0,
		DockerAvailable:    ag.DockerAvailable != 0,
		DockerError:        ag.DockerError,
		Containers:         containers,
	}
}

func serverRowToInput(v queries.Server, doms, ips []string) serverhost.Input {
	var subID, accID string
	if v.SubscriptionID.Valid {
		subID = v.SubscriptionID.String
	}
	if v.AccountID.Valid {
		accID = v.AccountID.String
	}
	var tags []string
	if v.TagsJson != "" {
		_ = json.Unmarshal([]byte(v.TagsJson), &tags)
	}
	if tags == nil {
		tags = []string{}
	}
	if doms == nil {
		doms = []string{}
	}
	if ips == nil {
		ips = []string{}
	}
	return serverhost.Input{
		PresetKey:       v.PresetKey,
		Name:            v.Name,
		Hostname:        v.Hostname,
		Provider:        v.Provider,
		Kind:            v.Kind,
		Status:          v.Status,
		Region:          v.Region,
		Datacenter:      v.Datacenter,
		OS:              v.Os,
		Arch:            v.Arch,
		CPUCores:        v.CpuCores,
		MemoryMB:        v.MemoryMb,
		DiskGB:          v.DiskGb,
		DiskType:        v.DiskType,
		BandwidthMbps:   v.BandwidthMbps,
		TrafficGB:       v.TrafficGb,
		TrafficRule:     v.TrafficRule,
		TrafficResetDay: v.TrafficResetDay,
		IPv4:            v.Ipv4,
		IPv6:            v.Ipv6,
		PrivateIP:       v.PrivateIp,
		PortNote:        v.PortNote,
		SSHPort:         v.SshPort,
		SSHUser:         v.SshUser,
		ConsoleURL:      v.ConsoleUrl,
		SubscriptionID:  subID,
		AccountID:       accID,
		ExpireDate:      v.ExpireDate,
		DomainIDs:       doms,
		IPIDs:           ips,
		Tags:            tags,
		Notes:           v.Notes,
		Archived:        v.Archived != 0,
	}
}

func (s *Store) CreateEnrollToken(ctx context.Context, in CreateEnrollTokenInput) (EnrollTokenCreated, error) {
	targetID := strings.TrimSpace(in.TargetServerID)
	if targetID != "" {
		if _, err := s.queries.GetServer(ctx, targetID); err != nil {
			if errors.Is(err, sql.ErrNoRows) {
				return EnrollTokenCreated{}, ErrNotFound
			}
			return EnrollTokenCreated{}, err
		}
	}

	now := time.Now().UTC()
	nowStr := now.Format(time.RFC3339Nano)
	expiresStr := now.Add(enrollTokenTTL).Format(time.RFC3339Nano)

	_ = s.queries.PruneExpiredAgentEnrollTokens(ctx, nowStr)

	rawToken, tokenHash, err := generatePrefixedToken("irm_enroll_")
	if err != nil {
		return EnrollTokenCreated{}, err
	}

	var dockerFlag int64
	if in.DockerEnabled {
		dockerFlag = 1
	}

	row, err := s.queries.CreateAgentEnrollToken(ctx, queries.CreateAgentEnrollTokenParams{
		ID:             rand.Text(),
		TokenHash:      tokenHash,
		TargetServerID: nullString(targetID),
		NameHint:       strings.TrimSpace(in.NameHint),
		PresetKey:      strings.TrimSpace(in.PresetKey),
		DockerEnabled:  dockerFlag,
		ExpiresAt:      expiresStr,
		CreatedAt:      nowStr,
	})
	if err != nil {
		return EnrollTokenCreated{}, err
	}

	return EnrollTokenCreated{
		ID:             row.ID,
		Token:          rawToken,
		TargetServerID: targetID,
		NameHint:       row.NameHint,
		PresetKey:      row.PresetKey,
		DockerEnabled:  row.DockerEnabled != 0,
		ExpiresAt:      row.ExpiresAt,
		CreatedAt:      row.CreatedAt,
	}, nil
}

func (s *Store) GetEnrollTokenStatus(ctx context.Context, id string) (EnrollTokenStatus, error) {
	row, err := s.queries.GetAgentEnrollTokenByID(ctx, strings.TrimSpace(id))
	if errors.Is(err, sql.ErrNoRows) {
		return EnrollTokenStatus{}, ErrNotFound
	}
	if err != nil {
		return EnrollTokenStatus{}, err
	}

	var targetID string
	if row.TargetServerID.Valid {
		targetID = row.TargetServerID.String
	}

	nowStr := time.Now().UTC().Format(time.RFC3339Nano)
	status := "pending"
	var serverRec *ServerRecord
	if row.UsedAt != "" {
		status = "used"
		if row.ResultServerID != "" {
			if rec, err := s.GetServer(ctx, row.ResultServerID); err == nil {
				serverRec = &rec
			}
		}
	} else if row.ExpiresAt <= nowStr {
		status = "expired"
	}

	return EnrollTokenStatus{
		ID:             row.ID,
		Status:         status,
		TargetServerID: targetID,
		DockerEnabled:  row.DockerEnabled != 0,
		ExpiresAt:      row.ExpiresAt,
		UsedAt:         row.UsedAt,
		Server:         serverRec,
	}, nil
}

// PeekEnrollToken checks that an enroll token exists, is unused, and has not expired
// before any optional network RDAP lookup is attempted.
func (s *Store) PeekEnrollToken(ctx context.Context, rawToken string) (queries.AgentEnrollToken, error) {
	raw := strings.TrimSpace(rawToken)
	if raw == "" {
		return queries.AgentEnrollToken{}, ErrInvalidEnrollToken
	}
	tok, err := s.queries.GetAgentEnrollTokenByHash(ctx, hashToken(raw))
	if errors.Is(err, sql.ErrNoRows) {
		return queries.AgentEnrollToken{}, ErrInvalidEnrollToken
	}
	if err != nil {
		return queries.AgentEnrollToken{}, err
	}
	if tok.UsedAt != "" {
		return queries.AgentEnrollToken{}, ErrEnrollTokenUsed
	}
	if tok.ExpiresAt <= time.Now().UTC().Format(time.RFC3339Nano) {
		return queries.AgentEnrollToken{}, ErrInvalidEnrollToken
	}
	return tok, nil
}

func clampIntervalSec(v int) int64 {
	if v <= 0 {
		return 5
	}
	if v < 2 {
		return 2
	}
	if v > 300 {
		return 300
	}
	return int64(v)
}

func marshalContainers(items []protocol.ContainerSummary) string {
	if len(items) == 0 {
		return "[]"
	}
	if len(items) > 200 {
		items = items[:200]
	}
	data, err := json.Marshal(items)
	if err != nil {
		return "[]"
	}
	return string(data)
}

func upsertAgentFromSnapshotTx(
	ctx context.Context,
	qtx *queries.Queries,
	srv queries.Server,
	mode string,
	tokenHash string,
	agentVersion string,
	intervalSec int64,
	dockerEnabled bool,
	snap protocol.Snapshot,
	now time.Time,
) (queries.ServerAgent, error) {
	nowStr := now.UTC().Format(time.RFC3339Nano)
	cycleKey := serverhost.ComputeTrafficCycleKey(now, srv.TrafficResetDay)

	var prevCycleKey string
	var prevRx, prevTx, prevBootRx, prevBootTx int64
	enrolledAt := nowStr
	if prev, err := qtx.GetServerAgent(ctx, srv.ID); err == nil {
		enrolledAt = prev.EnrolledAt
		if prev.TrafficCycleKey == cycleKey {
			// Preserve accumulated cycle traffic across re-enrollment while re-anchoring boot counters.
			prevCycleKey = prev.TrafficCycleKey
			prevRx = prev.TrafficRxBytes
			prevTx = prev.TrafficTxBytes
			prevBootRx = serverhost.ClampUint64ToInt64(snap.NetRxBytes)
			prevBootTx = serverhost.ClampUint64ToInt64(snap.NetTxBytes)
		}
	}

	rx, tx, bootRx, bootTx := serverhost.AccumulateTrafficDelta(
		prevCycleKey, prevRx, prevTx, prevBootRx, prevBootTx,
		cycleKey, snap.NetRxBytes, snap.NetTxBytes,
	)

	var dockerEnabledFlag, dockerAvailFlag int64
	if dockerEnabled {
		dockerEnabledFlag = 1
	}
	if snap.DockerAvailable {
		dockerAvailFlag = 1
	}

	return qtx.UpsertServerAgent(ctx, queries.UpsertServerAgentParams{
		ServerID:           srv.ID,
		Mode:               mode,
		TokenHash:          tokenHash,
		AgentVersion:       strings.TrimSpace(agentVersion),
		IntervalSec:        intervalSec,
		EnrolledAt:         enrolledAt,
		LastReportedAt:     nowStr,
		CpuModel:           strings.TrimSpace(snap.CPUModel),
		KernelVersion:      strings.TrimSpace(snap.KernelVersion),
		UptimeSeconds:      serverhost.ClampUint64ToInt64(snap.UptimeSeconds),
		CpuPercent:         snap.CPUPercent,
		Load1:              snap.Load1,
		Load5:              snap.Load5,
		Load15:             snap.Load15,
		MemoryUsedBytes:    serverhost.ClampUint64ToInt64(snap.MemoryUsedBytes),
		MemoryTotalBytes:   serverhost.ClampUint64ToInt64(snap.MemoryTotalBytes),
		SwapUsedBytes:      serverhost.ClampUint64ToInt64(snap.SwapUsedBytes),
		SwapTotalBytes:     serverhost.ClampUint64ToInt64(snap.SwapTotalBytes),
		RootDiskUsedBytes:  serverhost.ClampUint64ToInt64(snap.RootDiskUsedBytes),
		RootDiskTotalBytes: serverhost.ClampUint64ToInt64(snap.RootDiskTotalBytes),
		NetRxBps:           serverhost.ClampUint64ToInt64(snap.NetRxBps),
		NetTxBps:           serverhost.ClampUint64ToInt64(snap.NetTxBps),
		TrafficCycleKey:    cycleKey,
		TrafficRxBytes:     rx,
		TrafficTxBytes:     tx,
		LastBootRxBytes:    bootRx,
		LastBootTxBytes:    bootTx,
		TcpConnections:     int64(max(snap.TCPConnections, 0)),
		DockerEnabled:      dockerEnabledFlag,
		DockerAvailable:    dockerAvailFlag,
		DockerError:        strings.TrimSpace(snap.DockerError),
		ContainersJson:     marshalContainers(snap.Containers),
	})
}

func saveMergedServerTx(
	ctx context.Context,
	qtx *queries.Queries,
	targetID string,
	snap protocol.Snapshot,
	lookup *ipaddr.LookupResult,
	nameHint string,
	presetHint string,
	nowStr string,
) (queries.Server, []string, []string, error) {
	var existingInput *serverhost.Input
	var doms, ips []string
	createdAt := nowStr

	if targetID != "" {
		old, err := qtx.GetServer(ctx, targetID)
		if errors.Is(err, sql.ErrNoRows) {
			return queries.Server{}, nil, nil, ErrNotFound
		}
		if err != nil {
			return queries.Server{}, nil, nil, err
		}
		createdAt = old.CreatedAt
		doms, err = qtx.ListServerDomainsByServer(ctx, targetID)
		if err != nil {
			return queries.Server{}, nil, nil, err
		}
		ips, err = qtx.ListServerIPsByServer(ctx, nullString(targetID))
		if err != nil {
			return queries.Server{}, nil, nil, err
		}
		in := serverRowToInput(old, doms, ips)
		existingInput = &in
	} else {
		targetID = rand.Text()
		doms = []string{}
		ips = []string{}
	}

	merged := serverhost.BuildInputFromSnapshot(existingInput, snap, lookup, nameHint, presetHint)
	if err := merged.Validate(); err != nil {
		return queries.Server{}, nil, nil, err
	}

	tagsSlice := merged.Tags
	if tagsSlice == nil {
		tagsSlice = []string{}
	}
	tagsJSON, err := json.Marshal(tagsSlice)
	if err != nil {
		return queries.Server{}, nil, nil, err
	}
	var archived int64
	if merged.Archived {
		archived = 1
	}

	saved, err := qtx.SaveServer(ctx, queries.SaveServerParams{
		ID:              targetID,
		PresetKey:       merged.PresetKey,
		Name:            merged.Name,
		Hostname:        merged.Hostname,
		Provider:        merged.Provider,
		Kind:            merged.Kind,
		Status:          merged.Status,
		Region:          merged.Region,
		Datacenter:      merged.Datacenter,
		Os:              merged.OS,
		Arch:            merged.Arch,
		CpuCores:        merged.CPUCores,
		MemoryMb:        merged.MemoryMB,
		DiskGb:          merged.DiskGB,
		DiskType:        merged.DiskType,
		BandwidthMbps:   merged.BandwidthMbps,
		TrafficGb:       merged.TrafficGB,
		TrafficRule:     merged.TrafficRule,
		TrafficResetDay: merged.TrafficResetDay,
		Ipv4:            merged.IPv4,
		Ipv6:            merged.IPv6,
		PrivateIp:       merged.PrivateIP,
		PortNote:        merged.PortNote,
		SshPort:         merged.SSHPort,
		SshUser:         merged.SSHUser,
		ConsoleUrl:      merged.ConsoleURL,
		SubscriptionID:  nullString(merged.SubscriptionID),
		AccountID:       nullString(merged.AccountID),
		ExpireDate:      merged.ExpireDate,
		TagsJson:        string(tagsJSON),
		Notes:           merged.Notes,
		Archived:        archived,
		CreatedAt:       createdAt,
		UpdatedAt:       nowStr,
	})
	if err != nil {
		return queries.Server{}, nil, nil, err
	}
	if doms == nil {
		doms = []string{}
	}
	if ips == nil {
		ips = []string{}
	}
	return saved, doms, ips, nil
}

func (s *Store) EnrollAgent(
	ctx context.Context,
	rawEnrollToken string,
	req protocol.EnrollRequest,
	lookup *ipaddr.LookupResult,
) (protocol.EnrollResponse, ServerRecord, error) {
	raw := strings.TrimSpace(rawEnrollToken)
	if raw == "" {
		return protocol.EnrollResponse{}, ServerRecord{}, ErrInvalidEnrollToken
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return protocol.EnrollResponse{}, ServerRecord{}, err
	}
	defer func() { _ = tx.Rollback() }()
	qtx := s.queries.WithTx(tx)

	now := time.Now().UTC()
	nowStr := now.Format(time.RFC3339Nano)

	tok, err := qtx.GetAgentEnrollTokenByHash(ctx, hashToken(raw))
	if errors.Is(err, sql.ErrNoRows) {
		return protocol.EnrollResponse{}, ServerRecord{}, ErrInvalidEnrollToken
	}
	if err != nil {
		return protocol.EnrollResponse{}, ServerRecord{}, err
	}
	if tok.UsedAt != "" {
		return protocol.EnrollResponse{}, ServerRecord{}, ErrEnrollTokenUsed
	}
	if tok.ExpiresAt <= nowStr {
		return protocol.EnrollResponse{}, ServerRecord{}, ErrInvalidEnrollToken
	}

	var targetID string
	if tok.TargetServerID.Valid {
		targetID = tok.TargetServerID.String
	}

	saved, doms, ips, err := saveMergedServerTx(ctx, qtx, targetID, req.Snapshot, lookup, tok.NameHint, tok.PresetKey, nowStr)
	if err != nil {
		return protocol.EnrollResponse{}, ServerRecord{}, err
	}

	consumed, err := qtx.ConsumeAgentEnrollToken(ctx, queries.ConsumeAgentEnrollTokenParams{
		UsedAt:         nowStr,
		ResultServerID: saved.ID,
		ID:             tok.ID,
		ExpiresAt:      nowStr,
	})
	if err != nil {
		return protocol.EnrollResponse{}, ServerRecord{}, err
	}
	if consumed == 0 {
		return protocol.EnrollResponse{}, ServerRecord{}, ErrEnrollTokenUsed
	}

	dockerEnabled := tok.DockerEnabled != 0 || req.Snapshot.DockerEnabled || len(req.Snapshot.Containers) > 0
	var mode, agentToken, agentTokenHash string
	var intervalSec int64
	if req.Oneshot {
		mode = "snapshot"
		agentTokenHash = "snapshot:" + saved.ID
		intervalSec = 0
	} else {
		mode = "daemon"
		intervalSec = clampIntervalSec(req.IntervalSec)
		agentToken, agentTokenHash, err = generatePrefixedToken("irm_agent_")
		if err != nil {
			return protocol.EnrollResponse{}, ServerRecord{}, err
		}
	}

	ag, err := upsertAgentFromSnapshotTx(
		ctx, qtx, saved, mode, agentTokenHash, req.AgentVersion, intervalSec, dockerEnabled, req.Snapshot, now,
	)
	if err != nil {
		return protocol.EnrollResponse{}, ServerRecord{}, err
	}

	if err := tx.Commit(); err != nil {
		return protocol.EnrollResponse{}, ServerRecord{}, err
	}

	resp := protocol.EnrollResponse{
		ServerID:    saved.ID,
		ServerName:  saved.Name,
		AgentToken:  agentToken,
		IntervalSec: int(intervalSec),
		Mode:        mode,
	}
	rec := ServerRecord{
		Server:    saved,
		DomainIDs: doms,
		IPIDs:     ips,
		Telemetry: agentRowToTelemetry(ag, now),
	}
	return resp, rec, nil
}

func (s *Store) ImportServerSnapshot(
	ctx context.Context,
	targetServerID string,
	nameHint string,
	presetKey string,
	snap protocol.Snapshot,
	lookup *ipaddr.LookupResult,
) (ServerRecord, error) {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return ServerRecord{}, err
	}
	defer func() { _ = tx.Rollback() }()
	qtx := s.queries.WithTx(tx)

	now := time.Now().UTC()
	nowStr := now.Format(time.RFC3339Nano)

	saved, doms, ips, err := saveMergedServerTx(
		ctx, qtx, strings.TrimSpace(targetServerID), snap, lookup, nameHint, presetKey, nowStr,
	)
	if err != nil {
		return ServerRecord{}, err
	}

	dockerEnabled := snap.DockerAvailable || len(snap.Containers) > 0 || snap.DockerError != ""
	ag, err := upsertAgentFromSnapshotTx(
		ctx, qtx, saved, "snapshot", "snapshot:"+saved.ID, "snapshot", 0, dockerEnabled, snap, now,
	)
	if err != nil {
		return ServerRecord{}, err
	}

	if err := tx.Commit(); err != nil {
		return ServerRecord{}, err
	}

	return ServerRecord{
		Server:    saved,
		DomainIDs: doms,
		IPIDs:     ips,
		Telemetry: agentRowToTelemetry(ag, now),
	}, nil
}

func (s *Store) RecordAgentReport(ctx context.Context, rawAgentToken string, req protocol.ReportRequest) (protocol.ReportResponse, error) {
	raw := strings.TrimSpace(rawAgentToken)
	if raw == "" {
		return protocol.ReportResponse{}, ErrInvalidAgentToken
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return protocol.ReportResponse{}, err
	}
	defer func() { _ = tx.Rollback() }()
	qtx := s.queries.WithTx(tx)

	prevAgent, err := qtx.GetServerAgentByTokenHash(ctx, hashToken(raw))
	if errors.Is(err, sql.ErrNoRows) {
		return protocol.ReportResponse{}, ErrInvalidAgentToken
	}
	if err != nil {
		return protocol.ReportResponse{}, err
	}

	srv, err := qtx.GetServer(ctx, prevAgent.ServerID)
	if errors.Is(err, sql.ErrNoRows) {
		return protocol.ReportResponse{}, ErrInvalidAgentToken
	}
	if err != nil {
		return protocol.ReportResponse{}, err
	}

	now := time.Now().UTC()
	nowStr := now.Format(time.RFC3339Nano)

	// Refresh host hardware/OS/network fields if they changed since enrollment.
	doms, err := qtx.ListServerDomainsByServer(ctx, srv.ID)
	if err != nil {
		return protocol.ReportResponse{}, err
	}
	ips, err := qtx.ListServerIPsByServer(ctx, nullString(srv.ID))
	if err != nil {
		return protocol.ReportResponse{}, err
	}
	curInput := serverRowToInput(srv, doms, ips)
	refreshed := serverhost.BuildInputFromSnapshot(&curInput, req.Snapshot, nil, "", "")
	if refreshed.Hostname != curInput.Hostname ||
		refreshed.OS != curInput.OS ||
		refreshed.Arch != curInput.Arch ||
		refreshed.CPUCores != curInput.CPUCores ||
		refreshed.MemoryMB != curInput.MemoryMB ||
		refreshed.DiskGB != curInput.DiskGB ||
		refreshed.DiskType != curInput.DiskType ||
		refreshed.IPv4 != curInput.IPv4 ||
		refreshed.IPv6 != curInput.IPv6 ||
		refreshed.PrivateIP != curInput.PrivateIP {
		if refreshed.Validate() == nil {
			var archived int64
			if refreshed.Archived {
				archived = 1
			}
			if updatedSrv, err := qtx.SaveServer(ctx, queries.SaveServerParams{
				ID:              srv.ID,
				PresetKey:       refreshed.PresetKey,
				Name:            refreshed.Name,
				Hostname:        refreshed.Hostname,
				Provider:        refreshed.Provider,
				Kind:            refreshed.Kind,
				Status:          refreshed.Status,
				Region:          refreshed.Region,
				Datacenter:      refreshed.Datacenter,
				Os:              refreshed.OS,
				Arch:            refreshed.Arch,
				CpuCores:        refreshed.CPUCores,
				MemoryMb:        refreshed.MemoryMB,
				DiskGb:          refreshed.DiskGB,
				DiskType:        refreshed.DiskType,
				BandwidthMbps:   refreshed.BandwidthMbps,
				TrafficGb:       refreshed.TrafficGB,
				TrafficRule:     refreshed.TrafficRule,
				TrafficResetDay: refreshed.TrafficResetDay,
				Ipv4:            refreshed.IPv4,
				Ipv6:            refreshed.IPv6,
				PrivateIp:       refreshed.PrivateIP,
				PortNote:        refreshed.PortNote,
				SshPort:         refreshed.SSHPort,
				SshUser:         refreshed.SSHUser,
				ConsoleUrl:      refreshed.ConsoleURL,
				SubscriptionID:  srv.SubscriptionID,
				AccountID:       srv.AccountID,
				ExpireDate:      refreshed.ExpireDate,
				TagsJson:        srv.TagsJson,
				Notes:           refreshed.Notes,
				Archived:        archived,
				CreatedAt:       srv.CreatedAt,
				UpdatedAt:       nowStr,
			}); err == nil {
				srv = updatedSrv
			}
		}
	}

	cycleKey := serverhost.ComputeTrafficCycleKey(now, srv.TrafficResetDay)
	rx, txBytes, bootRx, bootTx := serverhost.AccumulateTrafficDelta(
		prevAgent.TrafficCycleKey,
		prevAgent.TrafficRxBytes,
		prevAgent.TrafficTxBytes,
		prevAgent.LastBootRxBytes,
		prevAgent.LastBootTxBytes,
		cycleKey,
		req.Snapshot.NetRxBytes,
		req.Snapshot.NetTxBytes,
	)

	version := strings.TrimSpace(req.AgentVersion)
	if version == "" {
		version = prevAgent.AgentVersion
	}
	var dockerAvailFlag int64
	if req.Snapshot.DockerAvailable {
		dockerAvailFlag = 1
	}

	_, err = qtx.UpsertServerAgent(ctx, queries.UpsertServerAgentParams{
		ServerID:           srv.ID,
		Mode:               "daemon",
		TokenHash:          prevAgent.TokenHash,
		AgentVersion:       version,
		IntervalSec:        prevAgent.IntervalSec,
		EnrolledAt:         prevAgent.EnrolledAt,
		LastReportedAt:     nowStr,
		CpuModel:           strings.TrimSpace(req.Snapshot.CPUModel),
		KernelVersion:      strings.TrimSpace(req.Snapshot.KernelVersion),
		UptimeSeconds:      serverhost.ClampUint64ToInt64(req.Snapshot.UptimeSeconds),
		CpuPercent:         req.Snapshot.CPUPercent,
		Load1:              req.Snapshot.Load1,
		Load5:              req.Snapshot.Load5,
		Load15:             req.Snapshot.Load15,
		MemoryUsedBytes:    serverhost.ClampUint64ToInt64(req.Snapshot.MemoryUsedBytes),
		MemoryTotalBytes:   serverhost.ClampUint64ToInt64(req.Snapshot.MemoryTotalBytes),
		SwapUsedBytes:      serverhost.ClampUint64ToInt64(req.Snapshot.SwapUsedBytes),
		SwapTotalBytes:     serverhost.ClampUint64ToInt64(req.Snapshot.SwapTotalBytes),
		RootDiskUsedBytes:  serverhost.ClampUint64ToInt64(req.Snapshot.RootDiskUsedBytes),
		RootDiskTotalBytes: serverhost.ClampUint64ToInt64(req.Snapshot.RootDiskTotalBytes),
		NetRxBps:           serverhost.ClampUint64ToInt64(req.Snapshot.NetRxBps),
		NetTxBps:           serverhost.ClampUint64ToInt64(req.Snapshot.NetTxBps),
		TrafficCycleKey:    cycleKey,
		TrafficRxBytes:     rx,
		TrafficTxBytes:     txBytes,
		LastBootRxBytes:    bootRx,
		LastBootTxBytes:    bootTx,
		TcpConnections:     int64(max(req.Snapshot.TCPConnections, 0)),
		DockerEnabled:      prevAgent.DockerEnabled,
		DockerAvailable:    dockerAvailFlag,
		DockerError:        strings.TrimSpace(req.Snapshot.DockerError),
		ContainersJson:     marshalContainers(req.Snapshot.Containers),
	})
	if err != nil {
		return protocol.ReportResponse{}, err
	}

	if err := tx.Commit(); err != nil {
		return protocol.ReportResponse{}, err
	}

	return protocol.ReportResponse{
		Accepted:    true,
		IntervalSec: int(prevAgent.IntervalSec),
	}, nil
}

func (s *Store) RevokeServerAgent(ctx context.Context, serverID string) error {
	id := strings.TrimSpace(serverID)
	if _, err := s.queries.GetServer(ctx, id); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return ErrNotFound
		}
		return err
	}
	_, err := s.queries.DeleteServerAgent(ctx, id)
	return err
}
