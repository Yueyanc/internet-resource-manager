package main

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/Yueyanc/internet-resource-manager/internal/collector"
)

func main() {
	if len(os.Args) != 2 || os.Args[1] != "inspect" {
		fmt.Fprintln(os.Stderr, "Usage: agent inspect\nCollect one real host snapshot as JSON. Enrollment and remote reporting are not implemented.")
		os.Exit(2)
	}
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()
	ctx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	snapshot, err := collector.Collect(ctx)
	if err == nil {
		err = json.NewEncoder(os.Stdout).Encode(snapshot)
	}
	if err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
