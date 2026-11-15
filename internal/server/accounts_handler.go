package server

import (
	"errors"
	"net/http"

	"github.com/Yueyanc/internet-resource-manager/internal/account"
	"github.com/Yueyanc/internet-resource-manager/internal/storage"
	"github.com/Yueyanc/internet-resource-manager/internal/storage/queries"
	"github.com/go-chi/chi/v5"
)

type accountResponse struct {
	ID string `json:"id"`
	account.Input
	CreatedAt string `json:"createdAt"`
	UpdatedAt string `json:"updatedAt"`
}

func accountDTO(v queries.Account) accountResponse {
	var recoveryID, ssoID string
	if v.RecoveryAccountID.Valid {
		recoveryID = v.RecoveryAccountID.String
	}
	if v.SsoAccountID.Valid {
		ssoID = v.SsoAccountID.String
	}
	return accountResponse{
		ID:        v.ID,
		CreatedAt: v.CreatedAt,
		UpdatedAt: v.UpdatedAt,
		Input: account.Input{
			PresetKey:         v.PresetKey,
			Platform:          v.Platform,
			Label:             v.Label,
			Identifier:        v.Identifier,
			UID:               v.Uid,
			Category:          v.Category,
			Ecosystem:         v.Ecosystem,
			Region:            v.Region,
			Role:              v.Role,
			Status:            v.Status,
			AuthMethod:        v.AuthMethod,
			RecoveryAccountID: recoveryID,
			RecoveryEmail:     v.RecoveryEmail,
			SSOAccountID:      ssoID,
			PhoneHint:         v.PhoneHint,
			TwoFactor:         v.TwoFactor,
			RecoveryCodes:     v.RecoveryCodes,
			KycStatus:         v.KycStatus,
			KycNote:           v.KycNote,
			KeepaliveCycle:    v.KeepaliveCycle,
			KeepaliveDays:     v.KeepaliveDays,
			NextCheckinDate:   v.NextCheckinDate,
			LastCheckedAt:     v.LastCheckedAt,
			VaultReference:    v.VaultReference,
			SecurityURL:       v.SecurityUrl,
			Notes:             v.Notes,
			Archived:          v.Archived != 0,
		},
	}
}

func accountRoutes(r chi.Router, store *storage.Store) {
	r.Get("/accounts", func(w http.ResponseWriter, r *http.Request) {
		values, err := store.ListAccounts(r.Context())
		if err != nil {
			internalError(w, err)
			return
		}
		items := make([]accountResponse, 0, len(values))
		for _, v := range values {
			items = append(items, accountDTO(v))
		}
		writeJSON(w, http.StatusOK, map[string]any{"items": items})
	})

	save := func(w http.ResponseWriter, r *http.Request) {
		var input account.Input
		if !decodeJSON(w, r, &input) {
			return
		}
		if err := input.Validate(); err != nil {
			writeError(w, http.StatusBadRequest, "invalid_account", err.Error())
			return
		}
		id := chi.URLParam(r, "id")
		v, err := store.SaveAccount(r.Context(), id, input)
		if err != nil {
			if errors.Is(err, storage.ErrInvalidLink) {
				writeError(w, http.StatusBadRequest, "invalid_account", "关联的救援邮箱或上游登录账号无效")
				return
			}
			resourceError(w, err)
			return
		}
		status := http.StatusOK
		if id == "" {
			status = http.StatusCreated
		}
		writeJSON(w, status, accountDTO(v))
	}
	r.Post("/accounts", save)
	r.Put("/accounts/{id}", save)

	r.Post("/accounts/{id}/checkin", func(w http.ResponseWriter, r *http.Request) {
		var input struct {
			NextCheckinDate string `json:"nextCheckinDate"`
			CheckedOn       string `json:"checkedOn"`
		}
		if !decodeJSON(w, r, &input) {
			return
		}
		v, err := store.GetAccount(r.Context(), chi.URLParam(r, "id"))
		if err != nil {
			resourceError(w, err)
			return
		}
		if v.KeepaliveCycle == "none" {
			writeError(w, http.StatusBadRequest, "not_keepalive", "该账号未开启防回收保活")
			return
		}
		updated, err := store.CheckinAccount(r.Context(), v.ID, input.NextCheckinDate, input.CheckedOn)
		if err != nil {
			if errors.Is(err, storage.ErrNotFound) || errors.Is(err, storage.ErrExists) {
				resourceError(w, err)
				return
			}
			writeError(w, http.StatusBadRequest, "invalid_account", err.Error())
			return
		}
		writeJSON(w, http.StatusOK, accountDTO(updated))
	})

	r.Delete("/accounts/{id}", func(w http.ResponseWriter, r *http.Request) {
		if err := store.DeleteAccount(r.Context(), chi.URLParam(r, "id")); err != nil {
			resourceError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]bool{"deleted": true})
	})
}
