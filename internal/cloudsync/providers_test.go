package cloudsync_test

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/Yueyanc/internet-resource-manager/internal/cloudsync"
)

func TestTailscaleOAuthAdapterFetch(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch r.URL.Path {
		case "/api/v2/oauth/token":
			if err := r.ParseForm(); err != nil {
				t.Fatal(err)
			}
			if r.FormValue("client_id") != "kClient12345" || r.FormValue("client_secret") != "tskey-client-secret-abcdef" {
				w.WriteHeader(http.StatusUnauthorized)
				return
			}
			_ = json.NewEncoder(w).Encode(map[string]any{"access_token": "ts-access-tok-1"})
		case "/api/v2/tailnet/-/devices":
			if r.Header.Get("Authorization") != "Bearer ts-access-tok-1" {
				w.WriteHeader(http.StatusUnauthorized)
				return
			}
			_ = json.NewEncoder(w).Encode(map[string]any{
				"devices": []map[string]any{
					{
						"nodeId":        "node-mac-1",
						"name":          "mac-mini.tail99.ts.net",
						"hostname":      "mac-mini",
						"os":            "macOS",
						"clientVersion": "1.76.1",
						"lastSeen":      "2026-11-15T12:00:00Z",
						"online":        true,
						"addresses":     []string{"100.88.1.12", "fd7a:115c:a1e0::12"},
						"tags":          []string{"tag:homelab"},
					},
				},
			})
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer srv.Close()

	adapter := &cloudsync.TailscaleAdapter{BaseURL: srv.URL, HTTPClient: srv.Client()}
	creds, hint, err := adapter.ValidateCredentials(cloudsync.Credentials{
		"clientId":     "kClient12345",
		"clientSecret": "tskey-client-secret-abcdef",
	})
	if err != nil {
		t.Fatalf("validate: %v", err)
	}
	if hint == "" {
		t.Fatal("expected masked hint")
	}

	snap, err := adapter.Fetch(t.Context(), creds)
	if err != nil {
		t.Fatalf("fetch: %v", err)
	}
	if len(snap.Servers) != 1 || snap.Servers[0].PrivateIP != "100.88.1.12" || snap.Servers[0].Kind != "homelab" {
		t.Fatalf("unexpected servers: %+v", snap.Servers)
	}
	if len(snap.IPs) != 1 || snap.IPs[0].NetworkScope != "overlay_private" || snap.IPs[0].Address != "100.88.1.12" {
		t.Fatalf("unexpected ips: %+v", snap.IPs)
	}
	if len(snap.AccountNames) != 1 || snap.AccountNames[0] != "tail99.ts.net" {
		t.Fatalf("unexpected tailnet account names: %+v", snap.AccountNames)
	}
}

func TestBandwagonAndHetznerAdaptersFetch(t *testing.T) {
	bwhSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/getLiveServiceInfo" {
			w.WriteHeader(http.StatusNotFound)
			return
		}
		if r.URL.Query().Get("veid") != "1889900" || r.URL.Query().Get("api_key") != "private_bwh_secret_key" {
			_ = json.NewEncoder(w).Encode(map[string]any{"error": 700005, "message": "Authentication failure"})
			return
		}
		_ = json.NewEncoder(w).Encode(map[string]any{
			"error":                   0,
			"vm_type":                 "kvm",
			"hostname":                "gia-lax-01",
			"node_location":           "US, California",
			"node_datacenter":         "US: Los Angeles, California (DC6 CT CN2GIA-E)",
			"plan":                    "BIGGERBOX-PRO",
			"plan_monthly_data":       int64(1000) * 1024 * 1024 * 1024,
			"data_counter":            int64(250) * 1024 * 1024 * 1024,
			"monthly_data_multiplier": 1,
			"data_next_reset":         int64(1796083200),
			"plan_disk":               int64(40) * 1024 * 1024 * 1024,
			"plan_ram":                int64(2048) * 1024 * 1024,
			"os":                      "debian-12-x86_64",
			"ip_addresses":            []string{"45.78.10.22"},
			"ip_nullroutes":           map[string]any{},
			"ssh_port":                28122,
			"ve_status":               "Running",
		})
	}))
	defer bwhSrv.Close()

	bwh := &cloudsync.BandwagonAdapter{BaseURL: bwhSrv.URL, HTTPClient: bwhSrv.Client()}
	creds, _, err := bwh.ValidateCredentials(cloudsync.Credentials{"veid": "1889900", "apiKey": "private_bwh_secret_key"})
	if err != nil {
		t.Fatal(err)
	}
	bwhSnap, err := bwh.Fetch(t.Context(), creds)
	if err != nil {
		t.Fatalf("bwh fetch: %v", err)
	}
	if len(bwhSnap.Servers) != 1 || bwhSnap.Servers[0].SSHPort != 28122 || bwhSnap.Servers[0].Meta.TrafficUsedBytes == 0 {
		t.Fatalf("unexpected bwh server: %+v", bwhSnap.Servers)
	}
	if len(bwhSnap.IPs) != 1 || bwhSnap.IPs[0].Address != "45.78.10.22" {
		t.Fatalf("unexpected bwh ip: %+v", bwhSnap.IPs)
	}

	hzSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "Bearer hz_readonly_token_123456" {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		switch r.URL.Path {
		case "/servers":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"servers": []map[string]any{
					{
						"id":               42,
						"name":             "de-edge-01",
						"status":           "running",
						"outgoing_traffic": int64(120) * 1000 * 1000 * 1000,
						"included_traffic": int64(20000) * 1000 * 1000 * 1000,
						"public_net": map[string]any{
							"ipv4": map[string]any{"ip": "95.216.10.20"},
							"ipv6": map[string]any{"ip": "2a01:4f9:c010::/64"},
						},
						"server_type": map[string]any{
							"name":         "cpx21",
							"cores":        3,
							"memory":       4.0,
							"disk":         80,
							"architecture": "x86",
						},
						"datacenter": map[string]any{
							"name":     "fsn1-dc14",
							"location": map[string]any{"country": "DE", "city": "Falkenstein"},
						},
						"image": map[string]any{"os_flavor": "ubuntu", "os_version": "24.04"},
					},
				},
				"meta": map[string]any{"pagination": map[string]any{"next_page": nil}},
			})
		case "/primary_ips":
			_ = json.NewEncoder(w).Encode(map[string]any{"primary_ips": []any{}})
		case "/floating_ips":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"floating_ips": []map[string]any{
					{
						"id":            77,
						"name":          "de-float-01",
						"ip":            "95.216.99.99",
						"type":          "ipv4",
						"server":        42,
						"home_location": map[string]any{"country": "DE", "city": "Falkenstein"},
					},
				},
			})
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer hzSrv.Close()

	hz := &cloudsync.HetznerAdapter{BaseURL: hzSrv.URL, HTTPClient: hzSrv.Client()}
	hzCreds, _, err := hz.ValidateCredentials(cloudsync.Credentials{"apiToken": "hz_readonly_token_123456"})
	if err != nil {
		t.Fatal(err)
	}
	hzSnap, err := hz.Fetch(t.Context(), hzCreds)
	if err != nil {
		t.Fatalf("hz fetch: %v", err)
	}
	if len(hzSnap.Servers) != 1 || hzSnap.Servers[0].Region != "DE" || hzSnap.Servers[0].CPUCores != 3 {
		t.Fatalf("unexpected hetzner server: %+v", hzSnap.Servers)
	}
	if len(hzSnap.IPs) != 2 {
		t.Fatalf("expected primary ipv4 + floating ipv4, got %+v", hzSnap.IPs)
	}
}

func TestPorkbunAliyunAndTencentAdaptersFetch(t *testing.T) {
	pbSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.URL.Path == "/ping":
			_ = json.NewEncoder(w).Encode(map[string]any{"status": "SUCCESS", "yourIp": "1.2.3.4"})
		case r.URL.Path == "/domain/listAll":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"status": "SUCCESS",
				"domains": []map[string]any{
					{
						"domain":       "indie.dev",
						"status":       "ACTIVE",
						"expireDate":   "2028-09-10 12:00:00",
						"autoRenew":    1,
						"whoisPrivacy": 1,
					},
				},
			})
		case strings.HasPrefix(r.URL.Path, "/domain/getNs/"):
			// External Cloudflare NS -> RegistrarOnly should be true!
			_ = json.NewEncoder(w).Encode(map[string]any{
				"status": "SUCCESS",
				"ns":     []string{"ada.ns.cloudflare.com", "bob.ns.cloudflare.com"},
			})
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}))
	defer pbSrv.Close()

	pb := &cloudsync.PorkbunAdapter{BaseURL: pbSrv.URL, HTTPClient: pbSrv.Client()}
	pbCreds, _, err := pb.ValidateCredentials(cloudsync.Credentials{"apiKey": "pk1_key_12345", "secretApiKey": "sk1_sec_67890"})
	if err != nil {
		t.Fatal(err)
	}
	pbSnap, err := pb.Fetch(t.Context(), pbCreds)
	if err != nil {
		t.Fatalf("porkbun fetch: %v", err)
	}
	if len(pbSnap.Zones) != 1 || !pbSnap.Zones[0].RegistrarOnly || pbSnap.Registrar["indie.dev"].ExpiresAt != "2028-09-10" {
		t.Fatalf("expected Porkbun domain without Porkbun DNS records to be RegistrarOnly: %+v / %+v", pbSnap.Zones, pbSnap.Registrar)
	}

	aliSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		action := r.URL.Query().Get("Action")
		if r.URL.Query().Get("Signature") == "" {
			w.WriteHeader(http.StatusBadRequest)
			return
		}
		switch action {
		case "QueryDomainList":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"TotalItemNum": 1,
				"TotalPageNum": 1,
				"Data": map[string]any{
					"Domain": []map[string]any{
						{
							"DomainName":     "aliyun-demo.cn",
							"ExpirationDate": "2027-12-31 00:00:00",
							"DomainStatus":   "3",
						},
					},
				},
			})
		case "DescribeDomains":
			_ = json.NewEncoder(w).Encode(map[string]any{"TotalCount": 0, "Domains": map[string]any{"Domain": []any{}}})
		case "ListRegions":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"Regions": []map[string]any{{"RegionId": "cn-hongkong"}},
			})
		case "ListInstances":
			region := r.URL.Query().Get("RegionId")
			if region == "cn-hongkong" {
				_ = json.NewEncoder(w).Encode(map[string]any{
					"TotalCount": 1,
					"Instances": []map[string]any{
						{
							"InstanceId":      "swas-hk-1",
							"InstanceName":    "hk-light-01",
							"PublicIpAddress": "47.242.10.88",
							"InnerIpAddress":  "172.16.0.5",
							"Status":          "Running",
							"ExpiredTime":     "2027-06-01T16:00:00Z",
							"RegionId":        "cn-hongkong",
							"ResourceSpec": map[string]any{
								"Cpu":       2,
								"Memory":    2.0,
								"DiskSize":  60,
								"Bandwidth": 30,
								"Flow":      1024.0,
							},
						},
					},
				})
				return
			}
			_ = json.NewEncoder(w).Encode(map[string]any{"TotalCount": 0, "Instances": []any{}})
		case "ListPlans":
			_ = json.NewEncoder(w).Encode(map[string]any{"Plans": []any{}})
		case "DescribeInstances":
			_ = json.NewEncoder(w).Encode(map[string]any{"TotalCount": 0, "Instances": map[string]any{"Instance": []any{}}})
		default:
			_ = json.NewEncoder(w).Encode(map[string]any{})
		}
	}))
	defer aliSrv.Close()

	ali := &cloudsync.AliyunAdapter{EndpointOverride: aliSrv.URL, HTTPClient: aliSrv.Client()}
	aliCreds, _, err := ali.ValidateCredentials(cloudsync.Credentials{"accessKeyId": "LTAI5tDemoKey12345", "accessKeySecret": "DemoSecretKey1234567890"})
	if err != nil {
		t.Fatal(err)
	}
	aliSnap, err := ali.Fetch(t.Context(), aliCreds)
	if err != nil {
		t.Fatalf("aliyun fetch: %v", err)
	}
	if len(aliSnap.Zones) != 1 || aliSnap.Zones[0].Name != "aliyun-demo.cn" {
		t.Fatalf("unexpected aliyun zones: %+v", aliSnap.Zones)
	}
	if len(aliSnap.Servers) != 1 || aliSnap.Servers[0].Region != "HK" || aliSnap.Servers[0].IPv4 != "47.242.10.88" {
		t.Fatalf("unexpected aliyun servers: %+v", aliSnap.Servers)
	}

	tcSrv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if !strings.HasPrefix(r.Header.Get("Authorization"), "TC3-HMAC-SHA256 ") {
			w.WriteHeader(http.StatusUnauthorized)
			return
		}
		switch r.Header.Get("X-TC-Action") {
		case "DescribeDomainNameList":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"Response": map[string]any{
					"TotalCount": 1,
					"DomainSet": []map[string]any{
						{
							"DomainName":     "qcloud-demo.com",
							"ExpirationDate": "2028-05-20",
							"AutoRenew":      1,
						},
					},
				},
			})
		case "DescribeDomainList":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"Response": map[string]any{
					"DomainList": []map[string]any{
						{
							"DomainId":     99,
							"Name":         "qcloud-demo.com",
							"Status":       "ENABLE",
							"EffectiveDNS": []string{"f1g1ns1.dnspod.net", "f1g1ns2.dnspod.net"},
						},
					},
				},
			})
		case "DescribeRecordList":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"Response": map[string]any{
					"RecordList": []map[string]any{
						{
							"RecordId": 1001,
							"Name":     "@",
							"Type":     "A",
							"Value":    "43.132.10.20",
							"TTL":      600,
							"Status":   "ENABLE",
						},
					},
				},
			})
		case "DescribeRegions":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"Response": map[string]any{
					"RegionSet": []map[string]any{{"Region": "ap-singapore"}},
				},
			})
		case "DescribeInstances":
			if r.Header.Get("X-TC-Region") == "ap-singapore" && r.Header.Get("X-TC-Version") == "2020-03-24" {
				_ = json.NewEncoder(w).Encode(map[string]any{
					"Response": map[string]any{
						"TotalCount": 1,
						"InstanceSet": []map[string]any{
							{
								"InstanceId":         "lhins-sg-01",
								"InstanceName":       "sg-lighthouse-01",
								"CPU":                2,
								"Memory":             4,
								"SystemDisk":         map[string]any{"DiskSize": 80, "DiskType": "CLOUD_SSD"},
								"InternetAccessible": map[string]any{"InternetMaxBandwidthOut": 30},
								"PublicAddresses":    []string{"43.132.10.20"},
								"PrivateAddresses":   []string{"10.0.4.8"},
								"OsName":             "Ubuntu 24.04 LTS",
								"InstanceState":      "RUNNING",
								"ExpiredTime":        "2027-10-01T00:00:00Z",
							},
						},
					},
				})
				return
			}
			_ = json.NewEncoder(w).Encode(map[string]any{"Response": map[string]any{"TotalCount": 0, "InstanceSet": []any{}}})
		case "DescribeInstancesTrafficPackages":
			_ = json.NewEncoder(w).Encode(map[string]any{
				"Response": map[string]any{
					"InstanceTrafficPackageSet": []map[string]any{
						{
							"InstanceId": "lhins-sg-01",
							"TrafficPackageSet": []map[string]any{
								{
									"TrafficUsed":         int64(180) * 1024 * 1024 * 1024,
									"TrafficPackageTotal": int64(2048) * 1024 * 1024 * 1024,
								},
							},
						},
					},
				},
			})
		default:
			_ = json.NewEncoder(w).Encode(map[string]any{"Response": map[string]any{}})
		}
	}))
	defer tcSrv.Close()

	tc := &cloudsync.TencentAdapter{EndpointOverride: tcSrv.URL, HTTPClient: tcSrv.Client()}
	tcCreds, _, err := tc.ValidateCredentials(cloudsync.Credentials{"secretId": "AKIDDemoTencent12345", "secretKey": "SecretDemoTencent12345678"})
	if err != nil {
		t.Fatal(err)
	}
	tcSnap, err := tc.Fetch(t.Context(), tcCreds)
	if err != nil {
		t.Fatalf("tencent fetch: %v", err)
	}
	if len(tcSnap.Zones) != 1 || len(tcSnap.Zones[0].Records) != 1 || tcSnap.Registrar["qcloud-demo.com"].ExpiresAt != "2028-05-20" {
		t.Fatalf("unexpected tencent zones/registrar: %+v / %+v", tcSnap.Zones, tcSnap.Registrar)
	}
	if len(tcSnap.Servers) != 1 || tcSnap.Servers[0].Region != "SG" || tcSnap.Servers[0].Meta.TrafficTotalBytes == 0 {
		t.Fatalf("unexpected tencent servers: %+v", tcSnap.Servers)
	}
}
