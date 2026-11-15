package protocol_test

import (
	"encoding/base64"
	"testing"

	"github.com/Yueyanc/internet-resource-manager/internal/protocol"
)

func TestCompactAndPlainBase64SnapshotRoundTrip(t *testing.T) {
	orig := protocol.Snapshot{
		ProtocolVersion:    1,
		Hostname:           "lax-dmit-01",
		OS:                 "linux",
		OSPretty:           "Debian GNU/Linux 12",
		Arch:               "amd64",
		CPUCores:           2,
		MemoryTotalBytes:   2147483648,
		RootDiskTotalBytes: 21474836480,
		PublicIPv4:         "154.17.22.88",
	}

	compact, err := protocol.EncodeCompactSnapshot(orig)
	if err != nil {
		t.Fatal(err)
	}
	decoded, err := protocol.DecodeSnapshotPayload("root@vps:~# ...\n" + compact + "\n")
	if err != nil {
		t.Fatalf("decode compact: %v", err)
	}
	if decoded.Hostname != orig.Hostname || decoded.CPUCores != 2 || decoded.PublicIPv4 != orig.PublicIPv4 {
		t.Fatalf("unexpected decoded snapshot: %+v", decoded)
	}

	// Plain non-gzipped base64 (emitted by minimal POSIX shell fallback without gzip)
	plainJSON := `{"protocolVersion":1,"hostname":"pve-home","os":"linux","osPretty":"Proxmox VE 8.2","arch":"amd64","cpuCores":4,"memoryTotalBytes":17179869184,"privateIp":"192.168.1.10"}`
	plainToken := "IRM1:" + base64.StdEncoding.EncodeToString([]byte(plainJSON))
	decodedPlain, err := protocol.DecodeSnapshotPayload(plainToken)
	if err != nil {
		t.Fatalf("decode plain base64: %v", err)
	}
	if decodedPlain.Hostname != "pve-home" || decodedPlain.PrivateIP != "192.168.1.10" {
		t.Fatalf("unexpected plain decoded: %+v", decodedPlain)
	}

	if _, err := protocol.DecodeSnapshotPayload("not-a-snapshot"); err == nil {
		t.Fatal("expected invalid payload to fail")
	}
}
