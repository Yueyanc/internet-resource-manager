package server

import (
	"errors"
	"net/http"

	"github.com/Yueyanc/internet-resource-manager/internal/storage"
	"github.com/Yueyanc/internet-resource-manager/internal/storage/queries"
	"github.com/Yueyanc/internet-resource-manager/internal/vault"
	"github.com/go-chi/chi/v5"
)

type vaultConfigResponse struct {
	KdfSalt            string `json:"kdfSalt"`
	KdfIterations      int64  `json:"kdfIterations"`
	WrappedVaultKey    string `json:"wrappedVaultKey"`
	RecoverySalt       string `json:"recoverySalt"`
	WrappedRecoveryKey string `json:"wrappedRecoveryKey"`
	KeyVersion         int64  `json:"keyVersion"`
	CreatedAt          string `json:"createdAt"`
	UpdatedAt          string `json:"updatedAt"`
}

type accountSecretSummaryResponse struct {
	AccountID        string `json:"accountId"`
	KeyVersion       int64  `json:"keyVersion"`
	HasPassword      bool   `json:"hasPassword"`
	HasTotp          bool   `json:"hasTotp"`
	HasRecoveryCodes bool   `json:"hasRecoveryCodes"`
	UpdatedAt        string `json:"updatedAt"`
}

type accountSecretResponse struct {
	AccountID        string `json:"accountId"`
	KeyVersion       int64  `json:"keyVersion"`
	Ciphertext       string `json:"ciphertext"`
	HasPassword      bool   `json:"hasPassword"`
	HasTotp          bool   `json:"hasTotp"`
	HasRecoveryCodes bool   `json:"hasRecoveryCodes"`
	UpdatedAt        string `json:"updatedAt"`
}

func vaultConfigDTO(v queries.VaultConfig) vaultConfigResponse {
	return vaultConfigResponse{
		KdfSalt:            v.KdfSalt,
		KdfIterations:      v.KdfIterations,
		WrappedVaultKey:    v.WrappedVaultKey,
		RecoverySalt:       v.RecoverySalt,
		WrappedRecoveryKey: v.WrappedRecoveryKey,
		KeyVersion:         v.KeyVersion,
		CreatedAt:          v.CreatedAt,
		UpdatedAt:          v.UpdatedAt,
	}
}

func secretSummaryDTO(v queries.ListAccountSecretSummariesRow) accountSecretSummaryResponse {
	return accountSecretSummaryResponse{
		AccountID:        v.AccountID,
		KeyVersion:       v.KeyVersion,
		HasPassword:      v.HasPassword != 0,
		HasTotp:          v.HasTotp != 0,
		HasRecoveryCodes: v.HasRecoveryCodes != 0,
		UpdatedAt:        v.UpdatedAt,
	}
}

func secretDTO(v queries.AccountSecret) accountSecretResponse {
	return accountSecretResponse{
		AccountID:        v.AccountID,
		KeyVersion:       v.KeyVersion,
		Ciphertext:       v.Ciphertext,
		HasPassword:      v.HasPassword != 0,
		HasTotp:          v.HasTotp != 0,
		HasRecoveryCodes: v.HasRecoveryCodes != 0,
		UpdatedAt:        v.UpdatedAt,
	}
}

func vaultRoutes(r chi.Router, store *storage.Store) {
	r.Get("/vault", func(w http.ResponseWriter, r *http.Request) {
		cfg, ok, err := store.GetVaultConfig(r.Context())
		if err != nil {
			internalError(w, err)
			return
		}
		rows, err := store.ListAccountSecretSummaries(r.Context())
		if err != nil {
			internalError(w, err)
			return
		}
		summaries := make([]accountSecretSummaryResponse, 0, len(rows))
		for _, row := range rows {
			summaries = append(summaries, secretSummaryDTO(row))
		}
		var cfgPtr *vaultConfigResponse
		if ok {
			dto := vaultConfigDTO(cfg)
			cfgPtr = &dto
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"initialized": ok,
			"config":      cfgPtr,
			"summaries":   summaries,
		})
	})

	r.Post("/vault/setup", func(w http.ResponseWriter, r *http.Request) {
		var input vault.SetupInput
		if !decodeJSON(w, r, &input) {
			return
		}
		if err := input.Validate(); err != nil {
			writeError(w, http.StatusBadRequest, "invalid_vault", err.Error())
			return
		}
		cfg, err := store.SetupVault(r.Context(), input)
		if err != nil {
			if errors.Is(err, storage.ErrExists) {
				writeError(w, http.StatusConflict, "vault_initialized", "加密保险箱已完成初始化")
				return
			}
			internalError(w, err)
			return
		}
		writeJSON(w, http.StatusCreated, vaultConfigDTO(cfg))
	})

	r.Put("/vault/master-key", func(w http.ResponseWriter, r *http.Request) {
		var input vault.RotateInput
		if !decodeJSON(w, r, &input) {
			return
		}
		if err := input.Validate(); err != nil {
			writeError(w, http.StatusBadRequest, "invalid_vault", err.Error())
			return
		}
		cfg, err := store.RotateVaultKeys(r.Context(), input)
		if err != nil {
			if errors.Is(err, storage.ErrVaultUninitialized) {
				writeError(w, http.StatusBadRequest, "vault_uninitialized", "加密保险箱尚未初始化")
				return
			}
			resourceError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, vaultConfigDTO(cfg))
	})

	r.Get("/vault/secrets", func(w http.ResponseWriter, r *http.Request) {
		rows, err := store.ListAccountSecrets(r.Context())
		if err != nil {
			internalError(w, err)
			return
		}
		items := make([]accountSecretResponse, 0, len(rows))
		for _, row := range rows {
			items = append(items, secretDTO(row))
		}
		writeJSON(w, http.StatusOK, map[string]any{"items": items})
	})

	r.Get("/accounts/{id}/secret", func(w http.ResponseWriter, r *http.Request) {
		sec, err := store.GetAccountSecret(r.Context(), chi.URLParam(r, "id"))
		if err != nil {
			resourceError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, secretDTO(sec))
	})

	r.Put("/accounts/{id}/secret", func(w http.ResponseWriter, r *http.Request) {
		var input vault.SecretInput
		if !decodeJSON(w, r, &input) {
			return
		}
		if err := input.Validate(); err != nil {
			writeError(w, http.StatusBadRequest, "invalid_vault", err.Error())
			return
		}
		sec, err := store.SaveAccountSecret(r.Context(), chi.URLParam(r, "id"), input)
		if err != nil {
			if errors.Is(err, storage.ErrVaultUninitialized) {
				writeError(w, http.StatusBadRequest, "vault_uninitialized", "请先初始化加密保险箱")
				return
			}
			resourceError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, secretDTO(sec))
	})

	r.Delete("/accounts/{id}/secret", func(w http.ResponseWriter, r *http.Request) {
		if err := store.DeleteAccountSecret(r.Context(), chi.URLParam(r, "id")); err != nil {
			internalError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]bool{"deleted": true})
	})
}
