package server

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/Yueyanc/internet-resource-manager/internal/cloudsync"
	"github.com/Yueyanc/internet-resource-manager/internal/domainname"
	"github.com/Yueyanc/internet-resource-manager/internal/storage"
	"github.com/go-chi/chi/v5"
)

type domainResponse struct {
	ID                   string                      `json:"id"`
	PresetKey            string                      `json:"presetKey"`
	Name                 string                      `json:"name"`
	Registrar            string                      `json:"registrar"`
	DNSProvider          string                      `json:"dnsProvider"`
	Purpose              string                      `json:"purpose"`
	Status               string                      `json:"status"`
	ExpireDate           string                      `json:"expireDate"`
	AutoRenew            bool                        `json:"autoRenew"`
	WhoisPrivacy         bool                        `json:"whoisPrivacy"`
	ICPStatus            string                      `json:"icpStatus"`
	ICPNumber            string                      `json:"icpNumber"`
	ManagementURL        string                      `json:"managementUrl"`
	SubscriptionID       string                      `json:"subscriptionId"`
	RegistrarAccountID   string                      `json:"registrarAccountId"`
	ServerIDs            []string                    `json:"serverIds"`
	IPIDs                []string                    `json:"ipIds"`
	Tags                 []string                    `json:"tags"`
	Notes                string                      `json:"notes"`
	Archived             bool                        `json:"archived"`
	ProviderConnectionID string                      `json:"providerConnectionId"`
	ExternalZoneID       string                      `json:"externalZoneId"`
	DNSRecords           []cloudsync.SyncedDNSRecord `json:"dnsRecords"`
	EdgeMeta             *cloudsync.DomainEdgeMeta   `json:"edgeMeta,omitempty"`
	LookupSource         string                      `json:"lookupSource"`
	LookupCheckedAt      string                      `json:"lookupCheckedAt"`
	LookupError          string                      `json:"lookupError"`
	CreatedAt            string                      `json:"createdAt"`
	UpdatedAt            string                      `json:"updatedAt"`
}

func domainDTO(rec storage.DomainRecord) domainResponse {
	v := rec.Domain
	var subID, accID, connID string
	if v.SubscriptionID.Valid {
		subID = v.SubscriptionID.String
	}
	if v.RegistrarAccountID.Valid {
		accID = v.RegistrarAccountID.String
	}
	if v.ProviderConnectionID.Valid {
		connID = v.ProviderConnectionID.String
	}
	var tags []string
	if v.TagsJson != "" {
		_ = json.Unmarshal([]byte(v.TagsJson), &tags)
	}
	if tags == nil {
		tags = []string{}
	}

	var dnsRecords []cloudsync.SyncedDNSRecord
	if v.DnsRecordsJson != "" {
		_ = json.Unmarshal([]byte(v.DnsRecordsJson), &dnsRecords)
	}
	if dnsRecords == nil {
		dnsRecords = []cloudsync.SyncedDNSRecord{}
	}

	var edgeMeta *cloudsync.DomainEdgeMeta
	if v.EdgeMetaJson != "" && v.EdgeMetaJson != "{}" {
		var parsed cloudsync.DomainEdgeMeta
		if err := json.Unmarshal([]byte(v.EdgeMetaJson), &parsed); err == nil && (parsed.Provider != "" || parsed.Plan != "" || len(parsed.NameServers) > 0 || len(parsed.Tunnels) > 0) {
			edgeMeta = &parsed
		}
	}

	srvs := rec.ServerIDs
	if srvs == nil {
		srvs = []string{}
	}
	ips := rec.IPIDs
	if ips == nil {
		ips = []string{}
	}
	updatedAt := v.UpdatedAt
	if updatedAt == "" {
		updatedAt = v.CreatedAt
	}
	return domainResponse{
		ID:                   v.ID,
		PresetKey:            v.PresetKey,
		Name:                 v.Name,
		Registrar:            v.Registrar,
		DNSProvider:          v.DnsProvider,
		Purpose:              v.Purpose,
		Status:               v.Status,
		ExpireDate:           v.ExpireDate,
		AutoRenew:            v.AutoRenew != 0,
		WhoisPrivacy:         v.WhoisPrivacy != 0,
		ICPStatus:            v.IcpStatus,
		ICPNumber:            v.IcpNumber,
		ManagementURL:        v.ManagementUrl,
		SubscriptionID:       subID,
		RegistrarAccountID:   accID,
		ServerIDs:            srvs,
		IPIDs:                ips,
		Tags:                 tags,
		Notes:                v.Notes,
		Archived:             v.Archived != 0,
		ProviderConnectionID: connID,
		ExternalZoneID:       v.ExternalZoneID,
		DNSRecords:           dnsRecords,
		EdgeMeta:             edgeMeta,
		LookupSource:         v.LookupSource,
		LookupCheckedAt:      v.LookupCheckedAt,
		LookupError:          v.LookupError,
		CreatedAt:            v.CreatedAt,
		UpdatedAt:            updatedAt,
	}
}

func saveDomainHandler(store *storage.Store, status int) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		var input domainname.Input
		if !decodeJSON(w, r, &input) {
			return
		}
		if err := input.Normalize(); err != nil {
			var vErr *domainname.ValidationError
			if errors.As(err, &vErr) {
				writeError(w, 400, vErr.Code, vErr.Message)
				return
			}
			writeError(w, 400, "invalid_domain", err.Error())
			return
		}
		id := chi.URLParam(r, "id")
		value, err := store.SaveDomain(r.Context(), id, input)
		if errors.Is(err, storage.ErrExists) {
			writeError(w, 409, "already_exists", "该域名已存在")
			return
		}
		if errors.Is(err, storage.ErrInvalidLink) {
			writeError(w, 400, "invalid_link", "所选关联资源不存在")
			return
		}
		if err != nil {
			resourceError(w, err)
			return
		}
		writeJSON(w, status, domainDTO(value))
	}
}

func domainRoutes(api chi.Router, store *storage.Store, lookuper domainname.Lookuper) {
	api.Get("/domains", func(w http.ResponseWriter, r *http.Request) {
		values, err := store.ListDomains(r.Context())
		if err != nil {
			internalError(w, err)
			return
		}
		items := make([]domainResponse, 0, len(values))
		for _, v := range values {
			items = append(items, domainDTO(v))
		}
		writeJSON(w, 200, map[string]any{"items": items})
	})
	api.Post("/domains", saveDomainHandler(store, 201))
	api.Post("/domains/lookup-preview", func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			Name string `json:"name"`
		}
		if !decodeJSON(w, r, &req) {
			return
		}
		if lookuper == nil {
			writeError(w, 503, "domain_lookup_failed", "域名查询服务不可用")
			return
		}
		res, err := lookuper.Lookup(r.Context(), req.Name)
		if err != nil {
			var vErr *domainname.ValidationError
			if errors.As(err, &vErr) {
				writeError(w, 400, vErr.Code, vErr.Message)
				return
			}
			writeError(w, 502, "domain_lookup_failed", "未能通过 RDAP / WHOIS 获取该域名的注册与到期信息，可手动填写")
			return
		}
		writeJSON(w, 200, res)
	})
	api.Post("/domains/{id}/lookup", func(w http.ResponseWriter, r *http.Request) {
		id := chi.URLParam(r, "id")
		var req struct {
			Overwrite bool `json:"overwrite"`
		}
		if r.ContentLength > 0 {
			if !decodeJSON(w, r, &req) {
				return
			}
		}
		rec, err := store.GetDomain(r.Context(), id)
		if err != nil {
			resourceError(w, err)
			return
		}
		if lookuper == nil {
			writeError(w, 503, "domain_lookup_failed", "域名查询服务不可用")
			return
		}
		res, lerr := lookuper.Lookup(r.Context(), rec.Name)
		if lerr != nil {
			_, _ = store.ApplyDomainLookup(r.Context(), id, nil, lerr, false)
			writeError(w, 502, "domain_lookup_failed", "未能通过 RDAP / WHOIS 获取该域名的注册与到期信息")
			return
		}
		updated, uerr := store.ApplyDomainLookup(r.Context(), id, &res, nil, req.Overwrite)
		if uerr != nil {
			resourceError(w, uerr)
			return
		}
		writeJSON(w, 200, domainDTO(updated))
	})
	api.Put("/domains/{id}", saveDomainHandler(store, 200))
	api.Delete("/domains/{id}", func(w http.ResponseWriter, r *http.Request) {
		if err := store.DeleteDomain(r.Context(), chi.URLParam(r, "id")); err != nil {
			resourceError(w, err)
			return
		}
		writeJSON(w, 200, map[string]bool{"deleted": true})
	})
}
