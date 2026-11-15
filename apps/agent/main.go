package main

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"math/rand/v2"
	"net/http"
	"os"
	"os/signal"
	"path/filepath"
	"strings"
	"syscall"
	"time"

	"github.com/Yueyanc/internet-resource-manager/internal/collector"
	"github.com/Yueyanc/internet-resource-manager/internal/protocol"
)

const agentVersion = "0.2.0"

type agentState struct {
	URL          string `json:"url"`
	ServerID     string `json:"serverId"`
	AgentToken   string `json:"agentToken"`
	IntervalSec  int    `json:"intervalSec"`
	Docker       bool   `json:"docker"`
	DockerSocket string `json:"dockerSocket,omitempty"`
}

func main() {
	if len(os.Args) < 2 {
		usage()
		os.Exit(2)
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	var err error
	switch os.Args[1] {
	case "inspect":
		err = cmdInspect(ctx, os.Args[2:])
	case "enroll":
		err = cmdEnroll(ctx, os.Args[2:])
	case "report":
		err = cmdReportOnce(ctx, os.Args[2:])
	case "run":
		err = cmdRunDaemon(ctx, os.Args[2:])
	default:
		usage()
		os.Exit(2)
	}
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func usage() {
	fmt.Fprintln(os.Stderr, `Usage:
  agent inspect [-docker] [-compact]
  agent enroll -url <https://irm-host> -token <irm_enroll_...> [-state /var/lib/irm-agent/state.json] [-interval 20] [-docker] [-oneshot]
  agent report -state /var/lib/irm-agent/state.json
  agent run    -state /var/lib/irm-agent/state.json`)
}

func cmdInspect(ctx context.Context, args []string) error {
	fs := flag.NewFlagSet("inspect", flag.ContinueOnError)
	withDocker := fs.Bool("docker", false, "collect read-only Docker container list")
	dockerSocket := fs.String("docker-socket", collector.DefaultDockerSocket, "Docker unix socket path")
	compact := fs.Bool("compact", false, "output compact IRM1:<base64> token for pasting")
	if err := fs.Parse(args); err != nil {
		return err
	}

	cctx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	snap, err := collector.CollectWithOptions(cctx, collector.Options{
		SampleDuration: 400 * time.Millisecond,
		CollectDocker:  *withDocker,
		DockerSocket:   *dockerSocket,
	})
	if err != nil {
		return err
	}
	if *compact {
		encoded, encErr := protocol.EncodeCompactSnapshot(snap)
		if encErr != nil {
			return encErr
		}
		fmt.Println(encoded)
		return nil
	}
	return json.NewEncoder(os.Stdout).Encode(snap)
}

func cmdEnroll(ctx context.Context, args []string) error {
	fs := flag.NewFlagSet("enroll", flag.ContinueOnError)
	baseURL := fs.String("url", "", "IRM server base URL")
	token := fs.String("token", "", "one-time enrollment token")
	statePath := fs.String("state", "/var/lib/irm-agent/state.json", "path to persist machine credential")
	interval := fs.Int("interval", 20, "reporting interval in seconds")
	withDocker := fs.Bool("docker", false, "enable read-only Docker container discovery")
	dockerSocket := fs.String("docker-socket", collector.DefaultDockerSocket, "Docker unix socket path")
	oneshot := fs.Bool("oneshot", false, "collect and register hardware snapshot without daemon credentials")
	if err := fs.Parse(args); err != nil {
		return err
	}
	cleanURL := strings.TrimRight(strings.TrimSpace(*baseURL), "/")
	cleanToken := strings.TrimSpace(*token)
	if cleanURL == "" || cleanToken == "" {
		return errors.New("both -url and -token are required")
	}
	if *interval < 5 {
		*interval = 5
	}

	cctx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	snap, err := collector.CollectWithOptions(cctx, collector.Options{
		SampleDuration: 500 * time.Millisecond,
		CollectDocker:  *withDocker,
		DockerSocket:   *dockerSocket,
	})
	if err != nil {
		return err
	}

	reqBody := protocol.EnrollRequest{
		AgentVersion: agentVersion,
		IntervalSec:  *interval,
		Oneshot:      *oneshot,
		Snapshot:     snap,
	}
	var resp protocol.EnrollResponse
	if err := postJSON(cctx, cleanURL+"/agent/v1/enroll", cleanToken, reqBody, &resp); err != nil {
		return err
	}

	if *oneshot {
		fmt.Printf("Snapshot registered for server %s (%s)\n", resp.ServerName, resp.ServerID)
		return nil
	}
	if resp.AgentToken == "" {
		return errors.New("enrollment response missing machine token")
	}

	st := agentState{
		URL:          cleanURL,
		ServerID:     resp.ServerID,
		AgentToken:   resp.AgentToken,
		IntervalSec:  resp.IntervalSec,
		Docker:       *withDocker,
		DockerSocket: *dockerSocket,
	}
	if st.IntervalSec < 5 {
		st.IntervalSec = *interval
	}
	if err := saveState(*statePath, st); err != nil {
		return err
	}
	fmt.Printf("Enrolled server %s (%s) -> state saved to %s\n", resp.ServerName, resp.ServerID, *statePath)
	return nil
}

func cmdReportOnce(ctx context.Context, args []string) error {
	fs := flag.NewFlagSet("report", flag.ContinueOnError)
	statePath := fs.String("state", "/var/lib/irm-agent/state.json", "path to machine credential state")
	if err := fs.Parse(args); err != nil {
		return err
	}
	st, err := loadState(*statePath)
	if err != nil {
		return err
	}
	cctx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	snap, err := collector.CollectWithOptions(cctx, collector.Options{
		SampleDuration: 500 * time.Millisecond,
		CollectDocker:  st.Docker,
		DockerSocket:   st.DockerSocket,
	})
	if err != nil {
		return err
	}
	var resp protocol.ReportResponse
	return postJSON(cctx, st.URL+"/agent/v1/report", st.AgentToken, protocol.ReportRequest{
		AgentVersion: agentVersion,
		IntervalSec:  st.IntervalSec,
		Snapshot:     snap,
	}, &resp)
}

func cmdRunDaemon(ctx context.Context, args []string) error {
	fs := flag.NewFlagSet("run", flag.ContinueOnError)
	statePath := fs.String("state", "/var/lib/irm-agent/state.json", "path to machine credential state")
	if err := fs.Parse(args); err != nil {
		return err
	}
	st, err := loadState(*statePath)
	if err != nil {
		return err
	}
	interval := time.Duration(max(st.IntervalSec, 5)) * time.Second

	var prevRx, prevTx uint64
	var prevAt time.Time

	reportTick := func() error {
		tctx, cancel := context.WithTimeout(ctx, 15*time.Second)
		defer cancel()
		snap, collectErr := collector.CollectWithOptions(tctx, collector.Options{
			SampleDuration: 400 * time.Millisecond,
			CollectDocker:  st.Docker,
			DockerSocket:   st.DockerSocket,
		})
		if collectErr != nil {
			return collectErr
		}
		now := time.Now()
		if !prevAt.IsZero() {
			elapsed := now.Sub(prevAt).Seconds()
			if elapsed >= 0.5 {
				if snap.NetRxBytes >= prevRx {
					snap.NetRxBps = uint64(float64(snap.NetRxBytes-prevRx) / elapsed)
				}
				if snap.NetTxBytes >= prevTx {
					snap.NetTxBps = uint64(float64(snap.NetTxBytes-prevTx) / elapsed)
				}
			}
		}
		prevRx = snap.NetRxBytes
		prevTx = snap.NetTxBytes
		prevAt = now

		var resp protocol.ReportResponse
		if postErr := postJSON(tctx, st.URL+"/agent/v1/report", st.AgentToken, protocol.ReportRequest{
			AgentVersion: agentVersion,
			IntervalSec:  int(interval.Seconds()),
			Snapshot:     snap,
		}, &resp); postErr != nil {
			return postErr
		}
		if resp.IntervalSec >= 5 {
			interval = time.Duration(resp.IntervalSec) * time.Second
		}
		return nil
	}

	_ = reportTick()
	for {
		jitter := time.Duration(rand.IntN(1000)) * time.Millisecond
		timer := time.NewTimer(interval + jitter)
		select {
		case <-ctx.Done():
			timer.Stop()
			return nil
		case <-timer.C:
			if tickErr := reportTick(); tickErr != nil {
				fmt.Fprintf(os.Stderr, "report error: %v\n", tickErr)
			}
		}
	}
}

func postJSON(ctx context.Context, endpoint, bearerToken string, payload any, out any) error {
	raw, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(raw))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+bearerToken)

	client := &http.Client{
		Timeout: 15 * time.Second,
		CheckRedirect: func(*http.Request, []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(io.LimitReader(resp.Body, 64<<10))
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("server returned HTTP %d: %s", resp.StatusCode, strings.TrimSpace(string(body)))
	}
	if out != nil && len(body) > 0 {
		if err := json.Unmarshal(body, out); err != nil {
			return err
		}
	}
	return nil
}

func saveState(path string, st agentState) error {
	dir := filepath.Dir(path)
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return err
	}
	raw, err := json.MarshalIndent(st, "", "  ")
	if err != nil {
		return err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, raw, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

func loadState(path string) (agentState, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return agentState{}, err
	}
	var st agentState
	if err := json.Unmarshal(raw, &st); err != nil {
		return agentState{}, err
	}
	if st.URL == "" || st.AgentToken == "" {
		return agentState{}, errors.New("invalid agent state file")
	}
	return st, nil
}
