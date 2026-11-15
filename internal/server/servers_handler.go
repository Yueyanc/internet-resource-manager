package server

import (
	"encoding/json"
	"errors"
	"net/http"

	"github.com/Yueyanc/internet-resource-manager/internal/cloudsync"
	"github.com/Yueyanc/internet-resource-manager/internal/ipaddr"
	"github.com/Yueyanc/internet-resource-manager/internal/protocol"
	"github.com/Yueyanc/internet-resource-manager/internal/serverhost"
	"github.com/Yueyanc/internet-resource-manager/internal/storage"
	"github.com/go-chi/chi/v5"
)

type serverResponse struct {
	ID                   string                        `json:"id"`
	PresetKey            string                        `json:"presetKey"`
	Name                 string                        `json:"name"`
	Hostname             string                        `json:"hostname"`
	Provider             string                        `json:"provider"`
	Kind                 string                        `json:"kind"`
	Status               string                        `json:"status"`
	Region               string                        `json:"region"`
	Datacenter           string                        `json:"datacenter"`
	OS                   string                        `json:"os"`
	Arch                 string                        `json:"arch"`
	CPUCores             int64                         `json:"cpuCores"`
	MemoryMB             int64                         `json:"memoryMb"`
	DiskGB               int64                         `json:"diskGb"`
	DiskType             string                        `json:"diskType"`
	BandwidthMbps        int64                         `json:"bandwidthMbps"`
	TrafficGB            int64                         `json:"trafficGb"`
	TrafficRule          string                        `json:"trafficRule"`
	TrafficResetDay      int64                         `json:"trafficResetDay"`
	IPv4                 string                        `json:"ipv4"`
	IPv6                 string                        `json:"ipv6"`
	PrivateIP            string                        `json:"privateIp"`
	PortNote             string                        `json:"portNote"`
	SSHPort              int64                         `json:"sshPort"`
	SSHUser              string                        `json:"sshUser"`
	ConsoleURL           string                        `json:"consoleUrl"`
	SubscriptionID       string                        `json:"subscriptionId"`
	AccountID            string                        `json:"accountId"`
	ExpireDate           string                        `json:"expireDate"`
	DomainIDs            []string                      `json:"domainIds"`
	IPIDs                []string                      `json:"ipIds"`
	Tags                 []string                      `json:"tags"`
	Notes                string                        `json:"notes"`
	Archived             bool                          `json:"archived"`
	ProviderConnectionID string                        `json:"providerConnectionId"`
	ProviderMeta         *cloudsync.ServerProviderMeta `json:"providerMeta,omitempty"`
	Telemetry            serverhost.Telemetry          `json:"telemetry"`
	CreatedAt            string                        `json:"createdAt"`
	UpdatedAt            string                        `json:"updatedAt"`
}

func serverDTO(rec storage.ServerRecord) serverResponse {
	v := rec.Server
	var subID, accID, connID string
	if v.SubscriptionID.Valid {
		subID = v.SubscriptionID.String
	}
	if v.AccountID.Valid {
		accID = v.AccountID.String
	}
	if v.ProviderConnectionID.Valid {
		connID = v.ProviderConnectionID.String
	}
	var providerMeta *cloudsync.ServerProviderMeta
	if v.ProviderMetaJson != "" && v.ProviderMetaJson != "{}" {
		var parsed cloudsync.ServerProviderMeta
		if err := json.Unmarshal([]byte(v.ProviderMetaJson), &parsed); err == nil && (parsed.Provider != "" || parsed.TrafficTotalBytes > 0 || parsed.LastSeenAt != "") {
			providerMeta = &parsed
		}
	}
	var tags []string
	if v.TagsJson != "" {
		_ = json.Unmarshal([]byte(v.TagsJson), &tags)
	}
	if tags == nil {
		tags = []string{}
	}
	doms := rec.DomainIDs
	if doms == nil {
		doms = []string{}
	}
	ips := rec.IPIDs
	if ips == nil {
		ips = []string{}
	}
	tel := rec.Telemetry
	if tel.AgentStatus == "" {
		tel = serverhost.DefaultTelemetry()
	} else if tel.Containers == nil {
		tel.Containers = []protocol.ContainerSummary{}
	}
	return serverResponse{
		ID:                   v.ID,
		PresetKey:            v.PresetKey,
		Name:                 v.Name,
		Hostname:             v.Hostname,
		Provider:             v.Provider,
		Kind:                 v.Kind,
		Status:               v.Status,
		Region:               v.Region,
		Datacenter:           v.Datacenter,
		OS:                   v.Os,
		Arch:                 v.Arch,
		CPUCores:             v.CpuCores,
		MemoryMB:             v.MemoryMb,
		DiskGB:               v.DiskGb,
		DiskType:             v.DiskType,
		BandwidthMbps:        v.BandwidthMbps,
		TrafficGB:            v.TrafficGb,
		TrafficRule:          v.TrafficRule,
		TrafficResetDay:      v.TrafficResetDay,
		IPv4:                 v.Ipv4,
		IPv6:                 v.Ipv6,
		PrivateIP:            v.PrivateIp,
		PortNote:             v.PortNote,
		SSHPort:              v.SshPort,
		SSHUser:              v.SshUser,
		ConsoleURL:           v.ConsoleUrl,
		SubscriptionID:       subID,
		AccountID:            accID,
		ExpireDate:           v.ExpireDate,
		DomainIDs:            doms,
		IPIDs:                ips,
		Tags:                 tags,
		Notes:                v.Notes,
		Archived:             v.Archived != 0,
		ProviderConnectionID: connID,
		ProviderMeta:         providerMeta,
		Telemetry:            tel,
		CreatedAt:            v.CreatedAt,
		UpdatedAt:            v.UpdatedAt,
	}
}

func serverRoutes(r chi.Router, store *storage.Store, lookuper ipaddr.Lookuper) {
	r.Get("/servers", func(w http.ResponseWriter, r *http.Request) {
		values, err := store.ListServers(r.Context())
		if err != nil {
			internalError(w, err)
			return
		}
		items := make([]serverResponse, 0, len(values))
		for _, v := range values {
			items = append(items, serverDTO(v))
		}
		writeJSON(w, http.StatusOK, map[string]any{"items": items})
	})

	r.Post("/servers/enroll-tokens", func(w http.ResponseWriter, r *http.Request) {
		var input storage.CreateEnrollTokenInput
		if !decodeJSON(w, r, &input) {
			return
		}
		created, err := store.CreateEnrollToken(r.Context(), input)
		if err != nil {
			resourceError(w, err)
			return
		}
		writeJSON(w, http.StatusCreated, created)
	})

	r.Get("/servers/enroll-tokens/{id}", func(w http.ResponseWriter, r *http.Request) {
		st, err := store.GetEnrollTokenStatus(r.Context(), chi.URLParam(r, "id"))
		if err != nil {
			resourceError(w, err)
			return
		}
		var srv *serverResponse
		if st.Server != nil {
			dto := serverDTO(*st.Server)
			srv = &dto
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"id":             st.ID,
			"status":         st.Status,
			"targetServerId": st.TargetServerID,
			"dockerEnabled":  st.DockerEnabled,
			"expiresAt":      st.ExpiresAt,
			"usedAt":         st.UsedAt,
			"server":         srv,
		})
	})

	r.Post("/servers/import-snapshot", func(w http.ResponseWriter, r *http.Request) {
		var input struct {
			Payload        string `json:"payload"`
			TargetServerID string `json:"targetServerId"`
			NameHint       string `json:"nameHint"`
			PresetKey      string `json:"presetKey"`
		}
		if !decodeJSONLimit(w, r, &input, 256<<10) {
			return
		}
		snap, err := protocol.DecodeSnapshotPayload(input.Payload)
		if err != nil {
			writeError(w, http.StatusBadRequest, "invalid_snapshot", "快照内容无法解析，请粘贴完整的 IRM1:... 文本或探针 JSON 输出")
			return
		}
		lookup := enrichSnapshotLookup(r.Context(), lookuper, snap)
		rec, err := store.ImportServerSnapshot(r.Context(), input.TargetServerID, input.NameHint, input.PresetKey, snap, lookup)
		if err != nil {
			resourceError(w, err)
			return
		}
		status := http.StatusCreated
		if input.TargetServerID != "" {
			status = http.StatusOK
		}
		writeJSON(w, status, serverDTO(rec))
	})

	r.Delete("/servers/{id}/agent", func(w http.ResponseWriter, r *http.Request) {
		id := chi.URLParam(r, "id")
		if err := store.RevokeServerAgent(r.Context(), id); err != nil {
			resourceError(w, err)
			return
		}
		rec, err := store.GetServer(r.Context(), id)
		if err != nil {
			resourceError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, serverDTO(rec))
	})

	save := func(w http.ResponseWriter, r *http.Request) {
		var input serverhost.Input
		if !decodeJSON(w, r, &input) {
			return
		}
		if err := input.Validate(); err != nil {
			writeError(w, http.StatusBadRequest, "invalid_server", err.Error())
			return
		}
		id := chi.URLParam(r, "id")
		rec, err := store.SaveServer(r.Context(), id, input)
		if err != nil {
			if errors.Is(err, storage.ErrInvalidLink) {
				writeError(w, http.StatusBadRequest, "invalid_server", "关联的订阅、账号、域名或 IP 节点不存在")
				return
			}
			resourceError(w, err)
			return
		}
		status := http.StatusOK
		if id == "" {
			status = http.StatusCreated
		}
		writeJSON(w, status, serverDTO(rec))
	}
	r.Post("/servers", save)
	r.Put("/servers/{id}", save)

	r.Delete("/servers/{id}", func(w http.ResponseWriter, r *http.Request) {
		if err := store.DeleteServer(r.Context(), chi.URLParam(r, "id")); err != nil {
			resourceError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]bool{"deleted": true})
	})
}
