package server

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"math"
	"net/http"
	"time"

	"github.com/Yueyanc/internet-resource-manager/internal/subscription"
)

type FXFetcher interface {
	FetchCNYReferenceRates(ctx context.Context) (rates map[string]float64, source string, err error)
}

type httpFXFetcher struct {
	client    *http.Client
	endpoints []fxEndpoint
}

type fxEndpoint struct {
	name string
	url  string
}

func newDefaultFXFetcher() FXFetcher {
	return &httpFXFetcher{
		client: &http.Client{Timeout: 8 * time.Second},
		endpoints: []fxEndpoint{
			{name: "open.er-api.com", url: "https://open.er-api.com/v6/latest/CNY"},
			{name: "frankfurter.dev", url: "https://api.frankfurter.dev/v1/latest?base=CNY"},
		},
	}
}

func (f *httpFXFetcher) FetchCNYReferenceRates(ctx context.Context) (map[string]float64, string, error) {
	var lastErr error
	for _, ep := range f.endpoints {
		rates, err := f.fetchFromEndpoint(ctx, ep.url)
		if err == nil {
			return rates, ep.name, nil
		}
		lastErr = err
	}
	if lastErr == nil {
		lastErr = errors.New("未配置汇率数据源")
	}
	return nil, "", lastErr
}

func (f *httpFXFetcher) fetchFromEndpoint(ctx context.Context, rawURL string) (map[string]float64, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, rawURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("User-Agent", "internet-resource-manager/1.0")

	resp, err := f.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return nil, fmt.Errorf("upstream status %d", resp.StatusCode)
	}

	var payload struct {
		Rates map[string]float64 `json:"rates"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(nil, resp.Body, 1<<20)).Decode(&payload); err != nil {
		return nil, err
	}
	return convertPerCNYToCNYPerUnit(payload.Rates)
}

// convertPerCNYToCNYPerUnit converts upstream rates quoted as `1 CNY = X <CUR>` into
// IRM's internal representation `1 <CUR> = Y CNY` (with CNY fixed to 1).
func convertPerCNYToCNYPerUnit(perCNY map[string]float64) (map[string]float64, error) {
	if len(perCNY) == 0 {
		return nil, errors.New("上游返回汇率为空")
	}
	out := make(map[string]float64, len(subscription.Currencies))
	out["CNY"] = 1
	for _, cur := range subscription.Currencies {
		if cur == "CNY" {
			continue
		}
		raw, ok := perCNY[cur]
		if !ok || raw <= 0 || math.IsNaN(raw) || math.IsInf(raw, 0) {
			return nil, fmt.Errorf("缺少有效币种汇率: %s", cur)
		}
		val := 1.0 / raw
		// Round to 4 decimals (e.g. USD=7.2415, JPY=0.0478) for clean UI display and accurate conversion.
		rounded := math.Round(val*10000) / 10000
		if rounded <= 0 {
			rounded = math.Round(val*1000000) / 1000000
		}
		out[cur] = rounded
	}
	return out, nil
}
