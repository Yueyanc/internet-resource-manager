package server

import (
	"encoding/json"
	"errors"
	"math"
	"net/http"
	"slices"

	"github.com/Yueyanc/internet-resource-manager/internal/storage"
	"github.com/Yueyanc/internet-resource-manager/internal/storage/queries"
	"github.com/Yueyanc/internet-resource-manager/internal/subscription"
	"github.com/go-chi/chi/v5"
)

type subscriptionResponse struct {
	ID string `json:"id"`
	subscription.Input
	CreatedAt string `json:"createdAt"`
	UpdatedAt string `json:"updatedAt"`
}

func subscriptionDTO(v queries.Subscription) subscriptionResponse {
	var accountID, billingAccountID string
	if v.AccountID.Valid {
		accountID = v.AccountID.String
	}
	if v.BillingAccountID.Valid {
		billingAccountID = v.BillingAccountID.String
	}
	return subscriptionResponse{ID: v.ID, CreatedAt: v.CreatedAt, UpdatedAt: v.UpdatedAt, Input: subscription.Input{
		PresetKey: v.PresetKey, Name: v.Name, AmountMinor: v.AmountMinor, Currency: v.Currency, Cycle: v.Cycle, IntervalDays: v.IntervalDays,
		DueDate: v.DueDate, Category: v.Category, RenewalMode: v.RenewalMode, Intention: v.Intention,
		RenewalAmountMinor: v.RenewalAmountMinor, AccountID: accountID, BillingAccountID: billingAccountID,
		Account: v.Account, PaymentMethod: v.PaymentMethod,
		ManagementURL: v.ManagementUrl, Notes: v.Notes, Archived: v.Archived != 0,
	}}
}

func resourceError(w http.ResponseWriter, err error) {
	if errors.Is(err, storage.ErrNotFound) {
		writeError(w, 404, "not_found", "资源不存在")
		return
	}
	if errors.Is(err, storage.ErrExists) {
		writeError(w, 409, "conflict", "数据已变更或订阅已归档，请刷新后重试")
		return
	}
	internalError(w, err)
}

func subscriptionRoutes(r chi.Router, store *storage.Store, fxFetcher FXFetcher) {
	r.Get("/subscriptions", func(w http.ResponseWriter, r *http.Request) {
		values, err := store.ListSubscriptions(r.Context())
		if err != nil {
			internalError(w, err)
			return
		}
		items := make([]subscriptionResponse, 0, len(values))
		for _, v := range values {
			items = append(items, subscriptionDTO(v))
		}
		writeJSON(w, 200, map[string]any{"items": items})
	})
	save := func(w http.ResponseWriter, r *http.Request) {
		var input subscription.Input
		if !decodeJSON(w, r, &input) {
			return
		}
		if err := input.Validate(); err != nil {
			writeError(w, 400, "invalid_subscription", err.Error())
			return
		}
		id := chi.URLParam(r, "id")
		v, err := store.SaveSubscription(r.Context(), id, input)
		if err != nil {
			if errors.Is(err, storage.ErrInvalidLink) {
				writeError(w, 400, "invalid_subscription", "关联的上游账号不存在")
				return
			}
			resourceError(w, err)
			return
		}
		status := 200
		if id == "" {
			status = 201
		}
		writeJSON(w, status, subscriptionDTO(v))
	}
	r.Post("/subscriptions", save)
	r.Put("/subscriptions/{id}", save)
	r.Post("/subscriptions/{id}/renew", func(w http.ResponseWriter, r *http.Request) {
		var input struct {
			DueDate string `json:"dueDate"`
		}
		if !decodeJSON(w, r, &input) {
			return
		}
		v, err := store.GetSubscription(r.Context(), chi.URLParam(r, "id"))
		if err != nil {
			resourceError(w, err)
			return
		}
		if v.Cycle == "once" {
			writeError(w, 400, "not_recurring", "一次性买断不能顺延")
			return
		}
		v, err = store.RenewSubscription(r.Context(), v.ID, input.DueDate)
		if err != nil {
			resourceError(w, err)
			return
		}
		writeJSON(w, 200, subscriptionDTO(v))
	})
	r.Delete("/subscriptions/{id}", func(w http.ResponseWriter, r *http.Request) {
		if err := store.DeleteSubscription(r.Context(), chi.URLParam(r, "id")); err != nil {
			resourceError(w, err)
			return
		}
		writeJSON(w, 200, map[string]bool{"deleted": true})
	})
	r.Get("/nav-counts", func(w http.ResponseWriter, r *http.Request) {
		v, err := store.Counts(r.Context())
		if err != nil {
			internalError(w, err)
			return
		}
		writeJSON(w, 200, v)
	})
	r.Get("/preferences", func(w http.ResponseWriter, r *http.Request) {
		v, err := store.Preferences(r.Context())
		if err != nil {
			internalError(w, err)
			return
		}
		var rates map[string]float64
		if err := json.Unmarshal([]byte(v.RatesJson), &rates); err != nil {
			internalError(w, err)
			return
		}
		writeJSON(w, 200, map[string]any{
			"baseCurrency":   v.BaseCurrency,
			"rates":          rates,
			"ratesUpdatedAt": v.RatesUpdatedAt,
		})
	})
	r.Put("/preferences", func(w http.ResponseWriter, r *http.Request) {
		var input struct {
			BaseCurrency string             `json:"baseCurrency"`
			Rates        map[string]float64 `json:"rates"`
		}
		if !decodeJSON(w, r, &input) {
			return
		}
		valid := slices.Contains(subscription.Currencies, input.BaseCurrency) && len(input.Rates) == len(subscription.Currencies) && input.Rates["CNY"] == 1
		for _, c := range subscription.Currencies {
			rate := input.Rates[c]
			valid = valid && rate > 0 && rate <= 1000000 && !math.IsInf(rate, 0) && !math.IsNaN(rate)
		}
		if !valid {
			writeError(w, 400, "invalid_rates", "请填写全部币种的正数汇率，CNY 固定为 1")
			return
		}
		data, err := json.Marshal(input.Rates)
		if err != nil {
			internalError(w, err)
			return
		}
		updatedAt, err := store.SavePreferences(r.Context(), input.BaseCurrency, string(data))
		if err != nil {
			internalError(w, err)
			return
		}
		writeJSON(w, 200, map[string]any{
			"baseCurrency":   input.BaseCurrency,
			"rates":          input.Rates,
			"ratesUpdatedAt": updatedAt,
		})
	})
	r.Post("/preferences/fetch-rates", func(w http.ResponseWriter, r *http.Request) {
		var req struct {
			BaseCurrency string `json:"baseCurrency"`
			Persist      *bool  `json:"persist"`
		}
		if r.ContentLength > 0 {
			if !decodeJSON(w, r, &req) {
				return
			}
		}
		if fxFetcher == nil {
			writeError(w, http.StatusServiceUnavailable, "fx_unavailable", "汇率服务未就绪")
			return
		}
		rates, source, err := fxFetcher.FetchCNYReferenceRates(r.Context())
		if err != nil {
			writeError(w, http.StatusBadGateway, "fx_fetch_failed", "获取实时参考汇率失败："+err.Error())
			return
		}
		curPrefs, err := store.Preferences(r.Context())
		if err != nil {
			internalError(w, err)
			return
		}
		baseCurrency := curPrefs.BaseCurrency
		if slices.Contains(subscription.Currencies, req.BaseCurrency) {
			baseCurrency = req.BaseCurrency
		}
		persist := true
		if req.Persist != nil {
			persist = *req.Persist
		}
		updatedAt := curPrefs.RatesUpdatedAt
		if persist {
			data, err := json.Marshal(rates)
			if err != nil {
				internalError(w, err)
				return
			}
			savedAt, err := store.SavePreferences(r.Context(), baseCurrency, string(data))
			if err != nil {
				internalError(w, err)
				return
			}
			updatedAt = savedAt
		}
		writeJSON(w, http.StatusOK, map[string]any{
			"baseCurrency":   baseCurrency,
			"rates":          rates,
			"ratesUpdatedAt": updatedAt,
			"source":         source,
		})
	})
}
