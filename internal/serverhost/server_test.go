package serverhost

import (
	"strings"
	"testing"

	"github.com/Yueyanc/internet-resource-manager/internal/subscription"
)

func TestValidateNormalizesAndAcceptsValidInput(t *testing.T) {
	input := Input{
		PresetKey:       "dmit",
		Name:            "  HKG-Pro-01  ",
		Hostname:        "HKG-Edge-01.Internal",
		Provider:        "DMIT",
		Kind:            "vps",
		Status:          "active",
		Region:          "hk",
		Datacenter:      "Equinix HK1",
		OS:              "Debian 13",
		Arch:            "amd64",
		CPUCores:        2,
		MemoryMB:        2048,
		DiskGB:          40,
		DiskType:        "nvme",
		BandwidthMbps:   1000,
		TrafficGB:       1000,
		TrafficRule:     "both",
		TrafficResetDay: 15,
		IPv4:            " 203.0.113.10 ",
		IPv6:            "[2001:0db8:0000:0000:0000:0000:0000:0001]",
		PrivateIP:       "100.64.0.12",
		PortNote:        "CN2 GIA",
		SSHPort:         2222,
		SSHUser:         "debian",
		ConsoleURL:      "https://www.dmit.io/clientarea.php",
		Tags:            []string{" 生产反代 ", "Docker", "docker"},
		DomainIDs:       []string{"d1", "d1", "d2"},
		IPIDs:           []string{"ip1"},
	}

	if err := input.Validate(); err != nil {
		t.Fatalf("expected valid input, got error: %v", err)
	}
	if input.Name != "HKG-Pro-01" {
		t.Fatalf("unexpected name: %q", input.Name)
	}
	if input.Hostname != "hkg-edge-01.internal" {
		t.Fatalf("unexpected hostname: %q", input.Hostname)
	}
	if input.Region != "HK" {
		t.Fatalf("unexpected region: %q", input.Region)
	}
	if input.IPv6 != "2001:db8::1" {
		t.Fatalf("expected canonical IPv6, got %q", input.IPv6)
	}
	if len(input.Tags) != 2 || len(input.DomainIDs) != 2 {
		t.Fatalf("expected deduplicated tags and domain IDs, got tags=%v domains=%v", input.Tags, input.DomainIDs)
	}
}

func TestValidateDefaultsForHomelab(t *testing.T) {
	input := Input{
		Name:        "Home-PVE",
		Kind:        "homelab",
		TrafficRule: "unlimited",
		TrafficGB:   500,
	}
	if err := input.Validate(); err != nil {
		t.Fatalf("expected valid homelab input, got %v", err)
	}
	if input.Region != "LOCAL" || input.Status != "active" || input.Arch != "amd64" {
		t.Fatalf("unexpected defaults: region=%s status=%s arch=%s", input.Region, input.Status, input.Arch)
	}
	if input.TrafficGB != 0 {
		t.Fatalf("expected unlimited traffic rule to zero trafficGb, got %d", input.TrafficGB)
	}
}

func TestValidateRejectsInvalidAndUnsafeFields(t *testing.T) {
	cases := []struct {
		name   string
		mutate func(*Input)
		substr string
	}{
		{
			name:   "empty name",
			mutate: func(v *Input) { v.Name = "   " },
			substr: "服务器名称",
		},
		{
			name:   "invalid ipv4 with port",
			mutate: func(v *Input) { v.IPv4 = "203.0.113.10:22" },
			substr: "IPv4",
		},
		{
			name:   "ipv4 in ipv6 field",
			mutate: func(v *Input) { v.IPv6 = "::ffff:203.0.113.10" },
			substr: "IPv6",
		},
		{
			name:   "shell injection in ssh user",
			mutate: func(v *Input) { v.SSHUser = "root; rm -rf /" },
			substr: "SSH 用户名",
		},
		{
			name: "private key in notes",
			mutate: func(v *Input) {
				v.Notes = "-----BEGIN OPENSSH PRIVATE KEY-----\nabc"
			},
			substr: "私钥",
		},
		{
			name:   "credentials in console url",
			mutate: func(v *Input) { v.ConsoleURL = "https://admin:secret@example.com" },
			substr: "控制台网址",
		},
		{
			name: "conflicting subscription link and inline create",
			mutate: func(v *Input) {
				v.SubscriptionID = "sub-1"
				v.CreateSubscription = &subscription.Input{
					Name: "VPS", Currency: "USD", Cycle: "yearly", DueDate: "2027-01-01",
					Category: "cloud", RenewalMode: "manual", Intention: "normal",
				}
			},
			substr: "不能同时",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			input := Input{Name: "Test-VPS"}
			tc.mutate(&input)
			err := input.Validate()
			if err == nil || !strings.Contains(err.Error(), tc.substr) {
				t.Fatalf("expected error containing %q, got %v", tc.substr, err)
			}
		})
	}
}
