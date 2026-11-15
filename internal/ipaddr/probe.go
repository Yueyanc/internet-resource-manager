package ipaddr

import (
	"context"
	"crypto/tls"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/netip"
	"strings"
	"time"
)

type ProbeResult struct {
	Status    string `json:"status"`
	LatencyMs int64  `json:"latencyMs"`
	CheckedAt string `json:"checkedAt"`
	Error     string `json:"error"`
}

type Prober interface {
	Probe(ctx context.Context, parsed ParsedAddress, mode string, port int) (ProbeResult, error)
}

type DefaultProber struct {
	Timeout time.Duration
}

func NewDefaultProber() *DefaultProber {
	return &DefaultProber{Timeout: 4 * time.Second}
}

func classifyProbeError(err error) string {
	if err == nil {
		return ""
	}
	var netErr net.Error
	if errors.Is(err, context.DeadlineExceeded) || (errors.As(err, &netErr) && netErr.Timeout()) {
		return "连接超时"
	}
	msg := strings.ToLower(err.Error())
	switch {
	case strings.Contains(msg, "connection refused"):
		return "目标端口拒绝连接"
	case strings.Contains(msg, "network is unreachable"), strings.Contains(msg, "no route to host"):
		return "网络路由不可达"
	case strings.Contains(msg, "tls:"), strings.Contains(msg, "x509:"):
		return "TLS 握手校验未通过"
	default:
		return "探测连接失败"
	}
}

func (p *DefaultProber) Probe(ctx context.Context, parsed ParsedAddress, mode string, port int) (ProbeResult, error) {
	if !parsed.ProbingAllowed || !IsPublicRoutable(parsed.Addr) || parsed.IsPrefix {
		return ProbeResult{}, ErrProbeNotAllowed
	}
	if mode == "none" || port < 1 || port > 65535 {
		return ProbeResult{}, ErrProbeDisabled
	}

	timeout := p.Timeout
	if timeout <= 0 {
		timeout = 4 * time.Second
	}
	ctx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	target := netip.AddrPortFrom(parsed.Addr.Unmap(), uint16(port))
	checkedAt := time.Now().UTC().Format(time.RFC3339)
	dialer := &net.Dialer{Timeout: timeout}

	if mode == "tcp" {
		start := time.Now()
		conn, err := dialer.DialContext(ctx, "tcp", target.String())
		if err != nil {
			return ProbeResult{
				Status:    "unreachable",
				LatencyMs: 0,
				CheckedAt: checkedAt,
				Error:     classifyProbeError(err),
			}, nil
		}
		_ = conn.Close()
		ms := max(int64(1), time.Since(start).Milliseconds())
		return ProbeResult{
			Status:    "reachable",
			LatencyMs: ms,
			CheckedAt: checkedAt,
			Error:     "",
		}, nil
	}

	if mode != "http" && mode != "https" {
		return ProbeResult{}, ErrProbeDisabled
	}

	transport := &http.Transport{
		Proxy:             nil,
		DisableKeepAlives: true,
		TLSClientConfig: &tls.Config{
			MinVersion: tls.VersionTLS12,
			// Probing raw IPv4/IPv6 HTTPS stacks often encounters domain-bound certs; verify TLS stack responsiveness
			// only on HTTPS when certificate matches IP, otherwise classify as TLS error unless reachable over TCP.
			// Keep strict certificate verification so invalid/self-signed certs are never falsely claimed valid TLS.
		},
		DialContext: func(dialCtx context.Context, network, _ string) (net.Conn, error) {
			// Bind strictly to the pre-validated public netip.AddrPort; never perform DNS resolution or follow another host.
			return dialer.DialContext(dialCtx, network, target.String())
		},
	}
	defer transport.CloseIdleConnections()

	client := &http.Client{
		Timeout:   timeout,
		Transport: transport,
		CheckRedirect: func(*http.Request, []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}

	reqURL := fmt.Sprintf("%s://%s/", mode, target.String())
	req, err := http.NewRequestWithContext(ctx, http.MethodHead, reqURL, nil)
	if err != nil {
		return ProbeResult{}, err
	}
	req.Header.Set("User-Agent", "IRM-Reachability-Probe/0.1")

	start := time.Now()
	resp, err := client.Do(req)
	if err != nil {
		return ProbeResult{
			Status:    "unreachable",
			LatencyMs: 0,
			CheckedAt: checkedAt,
			Error:     classifyProbeError(err),
		}, nil
	}
	_, _ = io.Copy(io.Discard, io.LimitReader(resp.Body, 1024))
	_ = resp.Body.Close()
	ms := max(int64(1), time.Since(start).Milliseconds())

	if resp.StatusCode >= 500 {
		return ProbeResult{
			Status:    "unreachable",
			LatencyMs: ms,
			CheckedAt: checkedAt,
			Error:     fmt.Sprintf("HTTP %d", resp.StatusCode),
		}, nil
	}

	return ProbeResult{
		Status:    "reachable",
		LatencyMs: ms,
		CheckedAt: checkedAt,
		Error:     "",
	}, nil
}
