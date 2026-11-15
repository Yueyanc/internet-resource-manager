package collector

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/Yueyanc/internet-resource-manager/internal/protocol"
)

const DefaultDockerSocket = "/var/run/docker.sock"

type dockerAPIContainer struct {
	ID     string            `json:"Id"`
	Names  []string          `json:"Names"`
	Image  string            `json:"Image"`
	State  string            `json:"State"`
	Status string            `json:"Status"`
	Labels map[string]string `json:"Labels"`
}

// CollectDockerContainers performs a strictly read-only GET /containers/json?all=1
// over the local Docker Unix domain socket when explicitly opted in by the user.
// Never inspects container environment variables or mounts.
func CollectDockerContainers(ctx context.Context, socketPath string) ([]protocol.ContainerSummary, error) {
	if socketPath == "" {
		socketPath = DefaultDockerSocket
	}
	if _, err := os.Stat(socketPath); err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return nil, errors.New("docker_socket_missing")
		}
		if errors.Is(err, os.ErrPermission) {
			return nil, errors.New("docker_socket_permission_denied")
		}
		return nil, errors.New("docker_socket_unavailable")
	}

	reqCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()

	transport := &http.Transport{
		DisableKeepAlives: true,
		DialContext: func(dialCtx context.Context, _, _ string) (net.Conn, error) {
			var d net.Dialer
			return d.DialContext(dialCtx, "unix", socketPath)
		},
	}
	client := &http.Client{
		Transport: transport,
		Timeout:   3 * time.Second,
	}

	req, err := http.NewRequestWithContext(reqCtx, http.MethodGet, "http://docker/containers/json?all=1", nil)
	if err != nil {
		return nil, fmt.Errorf("docker_request_invalid")
	}
	resp, err := client.Do(req)
	if err != nil {
		if os.IsPermission(err) || strings.Contains(strings.ToLower(err.Error()), "permission denied") {
			return nil, errors.New("docker_socket_permission_denied")
		}
		return nil, errors.New("docker_daemon_unreachable")
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("docker_http_%d", resp.StatusCode)
	}

	var raw []dockerAPIContainer
	if err := json.NewDecoder(io.LimitReader(resp.Body, 2<<20)).Decode(&raw); err != nil {
		return nil, errors.New("docker_response_invalid")
	}

	const maxContainers = 100
	if len(raw) > maxContainers {
		raw = raw[:maxContainers]
	}

	out := make([]protocol.ContainerSummary, 0, len(raw))
	for _, c := range raw {
		shortID := c.ID
		if len(shortID) > 12 {
			shortID = shortID[:12]
		}
		var name string
		if len(c.Names) > 0 {
			name = strings.TrimPrefix(c.Names[0], "/")
		}
		if name == "" {
			name = shortID
		}
		out = append(out, protocol.ContainerSummary{
			ID:             shortID,
			Name:           truncateRunes(name, 80),
			Image:          truncateRunes(c.Image, 120),
			State:          truncateRunes(strings.ToLower(strings.TrimSpace(c.State)), 24),
			Status:         truncateRunes(strings.TrimSpace(c.Status), 80),
			ComposeProject: truncateRunes(c.Labels["com.docker.compose.project"], 64),
			ComposeService: truncateRunes(c.Labels["com.docker.compose.service"], 64),
		})
	}
	return out, nil
}

func truncateRunes(s string, limit int) string {
	r := []rune(s)
	if len(r) <= limit {
		return s
	}
	return string(r[:limit])
}
