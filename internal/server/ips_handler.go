package server

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/Yueyanc/internet-resource-manager/internal/ipaddr"
	"github.com/Yueyanc/internet-resource-manager/internal/storage"
	"github.com/go-chi/chi/v5"
)

type ipResponse struct {
	ID              string                        `json:"id"`
	PresetKey       string                        `json:"presetKey"`
	Address         string                        `json:"address"`
	Version         int64                         `json:"version"`
	PrefixLen       int64                         `json:"prefixLen"`
	NetworkScope    string                        `json:"networkScope"`
	Category        string                        `json:"category"`
	Provider        string                        `json:"provider"`
	Label           string                        `json:"label"`
	Region          string                        `json:"region"`
	City            string                        `json:"city"`
	ASN             int64                         `json:"asn"`
	ASNOrg          string                        `json:"asnOrg"`
	PTRRecord       string                        `json:"ptrRecord"`
	ASNType         string                        `json:"asnType"`
	OriginType      string                        `json:"originType"`
	RiskLevel       string                        `json:"riskLevel"`
	PurityNote      string                        `json:"purityNote"`
	Unlocks         map[string]ipaddr.UnlockEntry `json:"unlocks"`
	Tags            []string                      `json:"tags"`
	ManualLocks     []string                      `json:"manualLocks"`
	LookupSource    string                        `json:"lookupSource"`
	LookupCheckedAt string                        `json:"lookupCheckedAt"`
	LookupError     string                        `json:"lookupError"`
	Role            string                        `json:"role"`
	Status          string                        `json:"status"`
	ReviewCycle     string                        `json:"reviewCycle"`
	ReviewDays      int64                         `json:"reviewDays"`
	NextReviewDate  string                        `json:"nextReviewDate"`
	LastReviewedAt  string                        `json:"lastReviewedAt"`
	ProbeMode       string                        `json:"probeMode"`
	ProbePort       int64                         `json:"probePort"`
	ProbeStatus     string                        `json:"probeStatus"`
	ProbeLatencyMs  int64                         `json:"probeLatencyMs"`
	ProbeCheckedAt  string                        `json:"probeCheckedAt"`
	ProbeError      string                        `json:"probeError"`
	SubscriptionID  string                        `json:"subscriptionId"`
	ServerID        string                        `json:"serverId"`
	HostLabel       string                        `json:"hostLabel"`
	DomainIDs       []string                      `json:"domainIds"`
	AccountIDs      []string                      `json:"accountIds"`
	ConsoleURL      string                        `json:"consoleUrl"`
	Notes           string                        `json:"notes"`
	Archived        bool                          `json:"archived"`
	CreatedAt       string                        `json:"createdAt"`
	UpdatedAt       string                        `json:"updatedAt"`
}

func ipDTO(rec storage.IPRecord) ipResponse {
	v := rec.Ip
	var subID, srvID string
	if v.SubscriptionID.Valid {
		subID = v.SubscriptionID.String
	}
	if v.ServerID.Valid {
		srvID = v.ServerID.String
	}
	unlocks := make(map[string]ipaddr.UnlockEntry)
	if v.UnlocksJson != "" {
		_ = json.Unmarshal([]byte(v.UnlocksJson), &unlocks)
	}
	var tags []string
	if v.TagsJson != "" {
		_ = json.Unmarshal([]byte(v.TagsJson), &tags)
	}
	if tags == nil {
		tags = []string{}
	}
	var locks []string
	if v.ManualLocksJson != "" {
		_ = json.Unmarshal([]byte(v.ManualLocksJson), &locks)
	}
	if locks == nil {
		locks = []string{}
	}
	doms := rec.DomainIDs
	if doms == nil {
		doms = []string{}
	}
	accs := rec.AccountIDs
	if accs == nil {
		accs = []string{}
	}
	return ipResponse{
		ID:              v.ID,
		PresetKey:       v.PresetKey,
		Address:         v.Address,
		Version:         v.Version,
		PrefixLen:       v.PrefixLen,
		NetworkScope:    v.NetworkScope,
		Category:        v.Category,
		Provider:        v.Provider,
		Label:           v.Label,
		Region:          v.Region,
		City:            v.City,
		ASN:             v.Asn,
		ASNOrg:          v.AsnOrg,
		PTRRecord:       v.PtrRecord,
		ASNType:         v.AsnType,
		OriginType:      v.OriginType,
		RiskLevel:       v.RiskLevel,
		PurityNote:      v.PurityNote,
		Unlocks:         unlocks,
		Tags:            tags,
		ManualLocks:     locks,
		LookupSource:    v.LookupSource,
		LookupCheckedAt: v.LookupCheckedAt,
		LookupError:     v.LookupError,
		Role:            v.Role,
		Status:          v.Status,
		ReviewCycle:     v.ReviewCycle,
		ReviewDays:      v.ReviewDays,
		NextReviewDate:  v.NextReviewDate,
		LastReviewedAt:  v.LastReviewedAt,
		ProbeMode:       v.ProbeMode,
		ProbePort:       v.ProbePort,
		ProbeStatus:     v.ProbeStatus,
		ProbeLatencyMs:  v.ProbeLatencyMs,
		ProbeCheckedAt:  v.ProbeCheckedAt,
		ProbeError:      v.ProbeError,
		SubscriptionID:  subID,
		ServerID:        srvID,
		HostLabel:       v.HostLabel,
		DomainIDs:       doms,
		AccountIDs:      accs,
		ConsoleURL:      v.ConsoleUrl,
		Notes:           v.Notes,
		Archived:        v.Archived != 0,
		CreatedAt:       v.CreatedAt,
		UpdatedAt:       v.UpdatedAt,
	}
}

func ipRoutes(r chi.Router, store *storage.Store, lookuper ipaddr.Lookuper, prober ipaddr.Prober) {
	r.Get("/ips", func(w http.ResponseWriter, r *http.Request) {
		values, err := store.ListIPs(r.Context())
		if err != nil {
			internalError(w, err)
			return
		}
		items := make([]ipResponse, 0, len(values))
		for _, v := range values {
			items = append(items, ipDTO(v))
		}
		writeJSON(w, http.StatusOK, map[string]any{"items": items})
	})

	save := func(w http.ResponseWriter, r *http.Request) {
		var input ipaddr.Input
		if !decodeJSON(w, r, &input) {
			return
		}
		parsed, err := input.Validate()
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid_ip", err.Error())
			return
		}
		id := chi.URLParam(r, "id")
		rec, err := store.SaveIP(r.Context(), id, input, parsed)
		if err != nil {
			if errors.Is(err, storage.ErrDuplicateIP) {
				writeError(w, http.StatusConflict, "already_exists", "该 IP 或地址段已存在")
				return
			}
			if errors.Is(err, storage.ErrInvalidLink) {
				writeError(w, http.StatusBadRequest, "invalid_ip", "关联的订阅、域名或账号不存在")
				return
			}
			resourceError(w, err)
			return
		}
		status := http.StatusOK
		if id == "" {
			status = http.StatusCreated
		}
		writeJSON(w, status, ipDTO(rec))
	}
	r.Post("/ips", save)
	r.Put("/ips/{id}", save)

	r.Post("/ips/lookup-preview", func(w http.ResponseWriter, r *http.Request) {
		var input struct {
			Address string `json:"address"`
		}
		if !decodeJSON(w, r, &input) {
			return
		}
		parsed, err := ipaddr.ParseAddress(input.Address)
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid_ip", err.Error())
			return
		}
		if !parsed.PublicRoutable {
			writeError(w, http.StatusBadRequest, "non_public_ip", ipaddr.ErrNonPublicAddress.Error())
			return
		}
		res, err := lookuper.Lookup(r.Context(), parsed)
		if err != nil {
			if errors.Is(err, ipaddr.ErrNonPublicAddress) {
				writeError(w, http.StatusBadRequest, "non_public_ip", err.Error())
				return
			}
			writeError(w, http.StatusBadGateway, "lookup_failed", ipaddr.ErrLookupFailed.Error())
			return
		}
		writeJSON(w, http.StatusOK, res)
	})

	r.Post("/ips/{id}/lookup", func(w http.ResponseWriter, r *http.Request) {
		rec, err := store.GetIP(r.Context(), chi.URLParam(r, "id"))
		if err != nil {
			resourceError(w, err)
			return
		}
		parsed, err := ipaddr.ParseAddress(rec.Address)
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid_ip", err.Error())
			return
		}
		if !parsed.PublicRoutable {
			writeError(w, http.StatusBadRequest, "non_public_ip", ipaddr.ErrNonPublicAddress.Error())
			return
		}
		res, lookupErr := lookuper.Lookup(r.Context(), parsed)
		if lookupErr != nil {
			_, _ = store.ApplyIPLookup(r.Context(), rec.ID, res, ipaddr.ErrLookupFailed)
			writeError(w, http.StatusBadGateway, "lookup_failed", ipaddr.ErrLookupFailed.Error())
			return
		}
		updated, err := store.ApplyIPLookup(r.Context(), rec.ID, res, nil)
		if err != nil {
			resourceError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, ipDTO(updated))
	})

	r.Post("/ips/{id}/probe", func(w http.ResponseWriter, r *http.Request) {
		rec, err := store.GetIP(r.Context(), chi.URLParam(r, "id"))
		if err != nil {
			resourceError(w, err)
			return
		}
		if rec.Archived != 0 {
			writeError(w, http.StatusConflict, "conflict", "已归档节点不支持主动连通探测")
			return
		}
		parsed, err := ipaddr.ParseAddress(rec.Address)
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid_ip", err.Error())
			return
		}
		if !parsed.ProbingAllowed {
			writeError(w, http.StatusBadRequest, "probe_not_allowed", ipaddr.ErrProbeNotAllowed.Error())
			return
		}
		if rec.ProbeMode == "none" || rec.ProbePort <= 0 {
			writeError(w, http.StatusBadRequest, "probe_disabled", ipaddr.ErrProbeDisabled.Error())
			return
		}
		res, err := prober.Probe(r.Context(), parsed, rec.ProbeMode, int(rec.ProbePort))
		if err != nil {
			if errors.Is(err, ipaddr.ErrProbeNotAllowed) {
				writeError(w, http.StatusBadRequest, "probe_not_allowed", err.Error())
				return
			}
			if errors.Is(err, ipaddr.ErrProbeDisabled) {
				writeError(w, http.StatusBadRequest, "probe_disabled", err.Error())
				return
			}
			internalError(w, err)
			return
		}
		updated, err := store.ApplyIPProbe(r.Context(), rec.ID, res)
		if err != nil {
			resourceError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, ipDTO(updated))
	})

	r.Post("/ips/{id}/review", func(w http.ResponseWriter, r *http.Request) {
		var input struct {
			NextReviewDate string `json:"nextReviewDate"`
			ReviewedOn     string `json:"reviewedOn"`
		}
		if !decodeJSON(w, r, &input) {
			return
		}
		rec, err := store.GetIP(r.Context(), chi.URLParam(r, "id"))
		if err != nil {
			resourceError(w, err)
			return
		}
		if rec.ReviewCycle == "none" {
			writeError(w, http.StatusBadRequest, "not_reviewable", "该节点未开启周期复检提醒")
			return
		}
		updated, err := store.ReviewIP(r.Context(), rec.ID, input.NextReviewDate, input.ReviewedOn)
		if err != nil {
			if errors.Is(err, storage.ErrNotFound) || errors.Is(err, storage.ErrExists) {
				resourceError(w, err)
				return
			}
			writeError(w, http.StatusBadRequest, "invalid_ip", err.Error())
			return
		}
		writeJSON(w, http.StatusOK, ipDTO(updated))
	})

	r.Delete("/ips/{id}", func(w http.ResponseWriter, r *http.Request) {
		if err := store.DeleteIP(r.Context(), chi.URLParam(r, "id")); err != nil {
			resourceError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]bool{"deleted": true})
	})
}
