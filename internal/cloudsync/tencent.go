package cloudsync

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"
)

type TencentAdapter struct {
	EndpointOverride string
	HTTPClient       *http.Client
}

func (a *TencentAdapter) ProviderKey() string { return "tencent" }

func (a *TencentAdapter) client() *http.Client {
	if a.HTTPClient != nil {
		return a.HTTPClient
	}
	return http.DefaultClient
}

func (a *TencentAdapter) ValidateCredentials(creds Credentials) (Credentials, string, error) {
	sid := creds.Get("secretId")
	skey := creds.Get("secretKey")
	if len(sid) < 8 || len(skey) < 8 || strings.ContainsAny(sid+skey, " \t\r\n") {
		return nil, "", ErrInvalidCredentials
	}
	return Credentials{"secretId": sid, "secretKey": skey}, MaskSecret(sid), nil
}

func tc3HmacSHA256(key []byte, data string) []byte {
	mac := hmac.New(sha256.New, key)
	_, _ = mac.Write([]byte(data))
	return mac.Sum(nil)
}

func signTC3Request(secretID, secretKey, service, host, action string, body []byte, ts int64) string {
	date := time.Unix(ts, 0).UTC().Format("2006-01-02")
	canonicalHeaders := fmt.Sprintf("content-type:application/json; charset=utf-8\nhost:%s\nx-tc-action:%s\n", host, strings.ToLower(action))
	signedHeaders := "content-type;host;x-tc-action"
	payloadHash := sha256.Sum256(body)
	canonicalRequest := fmt.Sprintf("POST\n/\n\n%s\n%s\n%s", canonicalHeaders, signedHeaders, hex.EncodeToString(payloadHash[:]))

	credScope := fmt.Sprintf("%s/%s/tc3_request", date, service)
	reqHash := sha256.Sum256([]byte(canonicalRequest))
	stringToSign := fmt.Sprintf("TC3-HMAC-SHA256\n%d\n%s\n%s", ts, credScope, hex.EncodeToString(reqHash[:]))

	secretDate := tc3HmacSHA256([]byte("TC3"+secretKey), date)
	secretService := tc3HmacSHA256(secretDate, service)
	secretSigning := tc3HmacSHA256(secretService, "tc3_request")
	signature := hex.EncodeToString(tc3HmacSHA256(secretSigning, stringToSign))

	return fmt.Sprintf("TC3-HMAC-SHA256 Credential=%s/%s, SignedHeaders=%s, Signature=%s", secretID, credScope, signedHeaders, signature)
}

func isTencentInvalidCredCode(code string) bool {
	return strings.HasPrefix(code, "AuthFailure.SecretIdNotFound") ||
		strings.HasPrefix(code, "AuthFailure.SignatureFailure") ||
		strings.HasPrefix(code, "AuthFailure.InvalidSecretId") ||
		strings.HasPrefix(code, "AuthFailure.TokenFailure")
}

func (a *TencentAdapter) callTC3(ctx context.Context, sid, skey, service, version, action, region string, reqBody map[string]any, out any) (string, error) {
	if reqBody == nil {
		reqBody = map[string]any{}
	}
	rawBody, _ := json.Marshal(reqBody)
	host := service + ".tencentcloudapi.com"
	endpoint := "https://" + host + "/"
	if strings.TrimSpace(a.EndpointOverride) != "" {
		endpoint = strings.TrimRight(strings.TrimSpace(a.EndpointOverride), "/") + "/"
	}

	ts := time.Now().UTC().Unix()
	authHeader := signTC3Request(sid, skey, service, host, action, rawBody, ts)

	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(rawBody))
	if err != nil {
		return "", err
	}
	req.Host = host
	req.Header.Set("Content-Type", "application/json; charset=utf-8")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("Authorization", authHeader)
	req.Header.Set("X-TC-Action", action)
	req.Header.Set("X-TC-Version", version)
	req.Header.Set("X-TC-Timestamp", strconv.FormatInt(ts, 10))
	if region != "" {
		req.Header.Set("X-TC-Region", region)
	}

	resp, err := a.client().Do(req)
	if err != nil {
		return "", fmt.Errorf("%w: %v", ErrUpstreamUnavail, err)
	}
	defer resp.Body.Close()

	body, err := readBoundedBody(resp.Body, 8<<20)
	if err != nil {
		return "", err
	}
	if resp.StatusCode >= 400 {
		return "", fmt.Errorf("腾讯云 API (%s) HTTP %d", action, resp.StatusCode)
	}

	var envelope struct {
		Response json.RawMessage `json:"Response"`
	}
	if err := json.Unmarshal(body, &envelope); err != nil || len(envelope.Response) == 0 {
		return "", fmt.Errorf("解析腾讯云响应失败 (%s)", action)
	}

	var errCheck struct {
		Error *struct {
			Code    string `json:"Code"`
			Message string `json:"Message"`
		} `json:"Error"`
	}
	if err := json.Unmarshal(envelope.Response, &errCheck); err == nil && errCheck.Error != nil && errCheck.Error.Code != "" {
		code := errCheck.Error.Code
		if isTencentInvalidCredCode(code) {
			return code, ErrInvalidCredentials
		}
		return code, fmt.Errorf("腾讯云 API (%s) [%s]: %s", action, code, errCheck.Error.Message)
	}

	return "", json.Unmarshal(envelope.Response, out)
}

func (a *TencentAdapter) Fetch(ctx context.Context, creds Credentials) (UnifiedSnapshot, error) {
	clean, _, err := a.ValidateCredentials(creds)
	if err != nil {
		return UnifiedSnapshot{}, err
	}
	sid := clean.Get("secretId")
	skey := clean.Get("secretKey")

	snap := UnifiedSnapshot{
		Provider:  "tencent",
		Registrar: make(map[string]RegistrarDomainInfo),
	}
	zonesByName := make(map[string]ZoneSnapshot)
	var zoneOrder []string
	anySuccess := false

	// 1. Tencent Cloud Registered Domains (domain.tencentcloudapi.com)
	var domResp struct {
		DomainSet []struct {
			DomainID       string `json:"DomainId"`
			DomainName     string `json:"DomainName"`
			ExpirationDate string `json:"ExpirationDate"`
			AutoRenew      int    `json:"AutoRenew"`
			BuyStatus      string `json:"BuyStatus"`
		} `json:"DomainSet"`
	}
	if code, derr := a.callTC3(ctx, sid, skey, "domain", "2018-08-08", "DescribeDomainNameList", "", map[string]any{
		"Offset": 0,
		"Limit":  100,
	}, &domResp); derr == nil {
		anySuccess = true
		snap.Scopes = append(snap.Scopes, "domain:read")
		for _, d := range domResp.DomainSet {
			name := strings.ToLower(strings.TrimSpace(d.DomainName))
			if name == "" {
				continue
			}
			snap.Registrar[name] = RegistrarDomainInfo{
				Name:      name,
				ExpiresAt: parseFlexibleDate(d.ExpirationDate),
				AutoRenew: d.AutoRenew == 1,
				Privacy:   true,
			}
			zonesByName[name] = ZoneSnapshot{
				ZoneID:           "qcloud-dom:" + firstNonEmpty(d.DomainID, name),
				Name:             name,
				Status:           "active",
				ConsoleURL:       "https://console.cloud.tencent.com/domain",
				DefaultPresetKey: "tencent_dnspod",
				RegistrarOnly:    true,
			}
			zoneOrder = append(zoneOrder, name)
		}
	} else if IsAuthError(derr) || isTencentInvalidCredCode(code) {
		return UnifiedSnapshot{}, ErrInvalidCredentials
	}

	// 2. DNSPod Zones & DNS Records (dnspod.tencentcloudapi.com)
	var podResp struct {
		DomainList []struct {
			DomainID     int64    `json:"DomainId"`
			Name         string   `json:"Name"`
			Status       string   `json:"Status"`
			EffectiveDNS []string `json:"EffectiveDNS"`
		} `json:"DomainList"`
	}
	if code, perr := a.callTC3(ctx, sid, skey, "dnspod", "2021-03-23", "DescribeDomainList", "", map[string]any{
		"Offset": 0,
		"Limit":  200,
	}, &podResp); perr == nil {
		anySuccess = true
		snap.Scopes = append(snap.Scopes, "dnspod:read")
		for idx, z := range podResp.DomainList {
			name := strings.ToLower(strings.TrimSpace(z.Name))
			if name == "" {
				continue
			}
			var recs []SyncedDNSRecord
			if idx < 40 {
				var recResp struct {
					RecordList []struct {
						RecordID int64  `json:"RecordId"`
						Name     string `json:"Name"`
						Type     string `json:"Type"`
						Value    string `json:"Value"`
						TTL      int    `json:"TTL"`
						Status   string `json:"Status"`
					} `json:"RecordList"`
				}
				if _, rerr := a.callTC3(ctx, sid, skey, "dnspod", "2021-03-23", "DescribeRecordList", "", map[string]any{
					"Domain": name,
					"Offset": 0,
					"Limit":  200,
				}, &recResp); rerr == nil {
					for _, r := range recResp.RecordList {
						if strings.EqualFold(r.Status, "DISABLE") || r.Type == "NS" {
							continue
						}
						fqdn := name
						if r.Name != "" && r.Name != "@" {
							fqdn = r.Name + "." + name
						}
						recs = append(recs, SyncedDNSRecord{
							ID:      strconv.FormatInt(r.RecordID, 10),
							Type:    r.Type,
							Name:    fqdn,
							Content: strings.Trim(r.Value, "."),
							TTL:     r.TTL,
						})
					}
				}
			}

			if _, exists := zonesByName[name]; !exists {
				zoneOrder = append(zoneOrder, name)
			}
			zonesByName[name] = ZoneSnapshot{
				ZoneID:           fmt.Sprintf("dnspod:%d", z.DomainID),
				Name:             name,
				Status:           "active",
				Paused:           strings.EqualFold(z.Status, "PAUSE"),
				NameServers:      z.EffectiveDNS,
				DNSProviderName:  "DNSPod",
				ConsoleURL:       "https://console.dnspod.cn/dns/" + name + "/record",
				DefaultPresetKey: "tencent_dnspod",
				Records:          recs,
				RegistrarOnly:    false,
			}
		}
	} else if IsAuthError(perr) || isTencentInvalidCredCode(code) {
		return UnifiedSnapshot{}, ErrInvalidCredentials
	}

	for _, name := range zoneOrder {
		snap.Zones = append(snap.Zones, zonesByName[name])
	}

	// 3. Tencent Cloud Lighthouse (lighthouse.tencentcloudapi.com)
	var lhRegionsResp struct {
		RegionSet []struct {
			Region string `json:"Region"`
		} `json:"RegionSet"`
	}
	if code, lerr := a.callTC3(ctx, sid, skey, "lighthouse", "2020-03-24", "DescribeRegions", "", nil, &lhRegionsResp); lerr == nil {
		anySuccess = true
		snap.Scopes = append(snap.Scopes, "lighthouse:read")

		var mu sync.Mutex
		var wg sync.WaitGroup
		sem := make(chan struct{}, 4)

		for _, reg := range lhRegionsResp.RegionSet {
			rid := strings.TrimSpace(reg.Region)
			if rid == "" {
				continue
			}
			wg.Add(1)
			go func(regionID string) {
				defer wg.Done()
				sem <- struct{}{}
				defer func() { <-sem }()

				var instResp struct {
					InstanceSet []struct {
						InstanceID       string   `json:"InstanceId"`
						InstanceName     string   `json:"InstanceName"`
						Zone             string   `json:"Zone"`
						CPU              int64    `json:"CPU"`
						Memory           int64    `json:"Memory"`
						OsName           string   `json:"OsName"`
						InstanceState    string   `json:"InstanceState"`
						PublicAddresses  []string `json:"PublicAddresses"`
						PrivateAddresses []string `json:"PrivateAddresses"`
						IPv6Addresses    []string `json:"IPv6Addresses"`
						ExpiredTime      string   `json:"ExpiredTime"`
						BundleID         string   `json:"BundleId"`
						SystemDisk       struct {
							DiskSize int64  `json:"DiskSize"`
							DiskType string `json:"DiskType"`
						} `json:"SystemDisk"`
						InternetAccessible struct {
							InternetMaxBandwidthOut int64 `json:"InternetMaxBandwidthOut"`
						} `json:"InternetAccessible"`
					} `json:"InstanceSet"`
				}
				if _, ierr := a.callTC3(ctx, sid, skey, "lighthouse", "2020-03-24", "DescribeInstances", regionID, map[string]any{
					"Offset": 0,
					"Limit":  100,
				}, &instResp); ierr != nil || len(instResp.InstanceSet) == 0 {
					return
				}

				ids := make([]string, 0, len(instResp.InstanceSet))
				for _, inst := range instResp.InstanceSet {
					ids = append(ids, inst.InstanceID)
				}
				trafficByID := make(map[string]struct {
					Used  int64
					Total int64
					EndAt string
				})
				var tfResp struct {
					InstanceTrafficPackageSet []struct {
						InstanceID        string `json:"InstanceId"`
						TrafficPackageSet []struct {
							TrafficUsed         int64  `json:"TrafficUsed"`
							TrafficPackageTotal int64  `json:"TrafficPackageTotal"`
							EndTime             string `json:"EndTime"`
						} `json:"TrafficPackageSet"`
					} `json:"InstanceTrafficPackageSet"`
				}
				if _, terr := a.callTC3(ctx, sid, skey, "lighthouse", "2020-03-24", "DescribeInstancesTrafficPackages", regionID, map[string]any{
					"InstanceIds": ids,
				}, &tfResp); terr == nil {
					for _, item := range tfResp.InstanceTrafficPackageSet {
						if len(item.TrafficPackageSet) > 0 {
							p := item.TrafficPackageSet[0]
							trafficByID[item.InstanceID] = struct {
								Used  int64
								Total int64
								EndAt string
							}{Used: p.TrafficUsed, Total: p.TrafficPackageTotal, EndAt: p.EndTime}
						}
					}
				}

				mu.Lock()
				defer mu.Unlock()
				for _, inst := range instResp.InstanceSet {
					extID := "qcloud-lh:" + inst.InstanceID
					regCode := normalizeRegionCode(regionID)
					var pubV4, privV4, pubV6 string
					if len(inst.PublicAddresses) > 0 {
						pubV4 = inst.PublicAddresses[0]
					}
					if len(inst.PrivateAddresses) > 0 {
						privV4 = inst.PrivateAddresses[0]
					}
					if len(inst.IPv6Addresses) > 0 {
						pubV6 = inst.IPv6Addresses[0]
					}
					status := "active"
					if strings.EqualFold(inst.InstanceState, "STOPPED") || strings.EqualFold(inst.InstanceState, "SHUTDOWN") {
						status = "standby"
					}
					tf := trafficByID[inst.InstanceID]
					var trafficGB int64
					if tf.Total > 0 {
						trafficGB = tf.Total / (1024 * 1024 * 1024)
					}
					name := firstNonEmpty(inst.InstanceName, inst.InstanceID)
					snap.Servers = append(snap.Servers, SyncedServer{
						ExternalID:      extID,
						PresetKey:       "tencent_cloud",
						Name:            name,
						Hostname:        name,
						ProviderName:    "腾讯云轻量",
						Kind:            "vps",
						Status:          status,
						Region:          regCode,
						Datacenter:      firstNonEmpty(inst.Zone, regionID),
						OS:              inst.OsName,
						Arch:            "amd64",
						CPUCores:        inst.CPU,
						MemoryMB:        inst.Memory * 1024,
						DiskGB:          inst.SystemDisk.DiskSize,
						DiskType:        "ssd",
						BandwidthMbps:   inst.InternetAccessible.InternetMaxBandwidthOut,
						TrafficGB:       trafficGB,
						TrafficRule:     "out",
						TrafficResetDay: 1,
						IPv4:            pubV4,
						IPv6:            pubV6,
						PrivateIP:       privV4,
						SSHPort:         22,
						ConsoleURL:      "https://console.cloud.tencent.com/lighthouse/instance/index",
						ExpireDate:      parseFlexibleDate(inst.ExpiredTime),
						Tags:            []string{"腾讯云", "Lighthouse"},
						Meta: ServerProviderMeta{
							Provider:          "tencent",
							ExternalID:        inst.InstanceID,
							Plan:              inst.BundleID,
							TrafficUsedBytes:  tf.Used,
							TrafficTotalBytes: tf.Total,
							TrafficResetAt:    tf.EndAt,
						},
					})
					if pubV4 != "" {
						scope := "overseas_exit"
						if regCode == "CN" {
							scope = "domestic_entry"
						}
						snap.IPs = append(snap.IPs, SyncedIP{
							ExternalID:     "qcloud-lh-ip:" + inst.InstanceID,
							PresetKey:      "tencent_cloud",
							Address:        pubV4,
							NetworkScope:   scope,
							Category:       "cloud_vps",
							ProviderName:   "腾讯云",
							Label:          name,
							Region:         regCode,
							ASNType:        "hosting",
							OriginType:     "native",
							Role:           "primary",
							Status:         "active",
							RiskLevel:      "unassessed",
							HostExternalID: extID,
							HostLabel:      name,
							ConsoleURL:     "https://console.cloud.tencent.com/lighthouse/instance/index",
							Tags:           []string{"腾讯云", "Lighthouse"},
						})
					}
				}
			}(rid)
		}
		wg.Wait()
	} else if IsAuthError(lerr) || isTencentInvalidCredCode(code) {
		return UnifiedSnapshot{}, ErrInvalidCredentials
	}

	// 4. Tencent Cloud CVM (cvm.tencentcloudapi.com)
	var cvmRegionsResp struct {
		RegionSet []struct {
			Region string `json:"Region"`
		} `json:"RegionSet"`
	}
	if code, cerr := a.callTC3(ctx, sid, skey, "cvm", "2017-03-12", "DescribeRegions", "", nil, &cvmRegionsResp); cerr == nil {
		anySuccess = true
		snap.Scopes = append(snap.Scopes, "cvm:read")

		var mu sync.Mutex
		var wg sync.WaitGroup
		sem := make(chan struct{}, 4)

		for _, reg := range cvmRegionsResp.RegionSet {
			rid := strings.TrimSpace(reg.Region)
			if rid == "" {
				continue
			}
			wg.Add(1)
			go func(regionID string) {
				defer wg.Done()
				sem <- struct{}{}
				defer func() { <-sem }()

				var instResp struct {
					InstanceSet []struct {
						InstanceID         string   `json:"InstanceId"`
						InstanceName       string   `json:"InstanceName"`
						InstanceType       string   `json:"InstanceType"`
						CPU                int64    `json:"CPU"`
						Memory             int64    `json:"Memory"`
						OsName             string   `json:"OsName"`
						InstanceState      string   `json:"InstanceState"`
						PublicIPAddresses  []string `json:"PublicIpAddresses"`
						PrivateIPAddresses []string `json:"PrivateIpAddresses"`
						ExpiredTime        string   `json:"ExpiredTime"`
						Placement          struct {
							Zone string `json:"Zone"`
						} `json:"Placement"`
						SystemDisk struct {
							DiskSize int64 `json:"DiskSize"`
						} `json:"SystemDisk"`
					} `json:"InstanceSet"`
				}
				if _, ierr := a.callTC3(ctx, sid, skey, "cvm", "2017-03-12", "DescribeInstances", regionID, map[string]any{
					"Offset": 0,
					"Limit":  100,
				}, &instResp); ierr != nil || len(instResp.InstanceSet) == 0 {
					return
				}

				mu.Lock()
				defer mu.Unlock()
				for _, inst := range instResp.InstanceSet {
					extID := "qcloud-cvm:" + inst.InstanceID
					regCode := normalizeRegionCode(regionID)
					var pubV4, privV4 string
					if len(inst.PublicIPAddresses) > 0 {
						pubV4 = inst.PublicIPAddresses[0]
					}
					if len(inst.PrivateIPAddresses) > 0 {
						privV4 = inst.PrivateIPAddresses[0]
					}
					status := "active"
					if strings.EqualFold(inst.InstanceState, "STOPPED") {
						status = "standby"
					}
					name := firstNonEmpty(inst.InstanceName, inst.InstanceID)
					snap.Servers = append(snap.Servers, SyncedServer{
						ExternalID:   extID,
						PresetKey:    "tencent_cloud",
						Name:         name,
						Hostname:     name,
						ProviderName: "腾讯云 CVM",
						Kind:         "vps",
						Status:       status,
						Region:       regCode,
						Datacenter:   firstNonEmpty(inst.Placement.Zone, regionID),
						OS:           inst.OsName,
						Arch:         "amd64",
						CPUCores:     inst.CPU,
						MemoryMB:     inst.Memory * 1024,
						DiskGB:       inst.SystemDisk.DiskSize,
						DiskType:     "ssd",
						TrafficRule:  "out",
						IPv4:         pubV4,
						PrivateIP:    privV4,
						SSHPort:      22,
						ConsoleURL:   "https://console.cloud.tencent.com/cvm",
						ExpireDate:   parseFlexibleDate(inst.ExpiredTime),
						Tags:         []string{"腾讯云", "CVM"},
						Meta: ServerProviderMeta{
							Provider:   "tencent",
							ExternalID: inst.InstanceID,
							Plan:       inst.InstanceType,
						},
					})
					if pubV4 != "" {
						scope := "overseas_exit"
						if regCode == "CN" {
							scope = "domestic_entry"
						}
						snap.IPs = append(snap.IPs, SyncedIP{
							ExternalID:     "qcloud-cvm-ip:" + inst.InstanceID,
							PresetKey:      "tencent_cloud",
							Address:        pubV4,
							NetworkScope:   scope,
							Category:       "cloud_vps",
							ProviderName:   "腾讯云",
							Label:          name,
							Region:         regCode,
							ASNType:        "hosting",
							OriginType:     "native",
							Role:           "primary",
							Status:         "active",
							RiskLevel:      "unassessed",
							HostExternalID: extID,
							HostLabel:      name,
							ConsoleURL:     "https://console.cloud.tencent.com/cvm",
							Tags:           []string{"腾讯云", "CVM"},
						})
					}
				}
			}(rid)
		}
		wg.Wait()
	} else if IsAuthError(cerr) || isTencentInvalidCredCode(code) {
		return UnifiedSnapshot{}, ErrInvalidCredentials
	}

	if !anySuccess {
		return UnifiedSnapshot{}, fmt.Errorf("%w: CAM 子账号未授予可读权限或密钥无效", ErrInvalidCredentials)
	}
	return snap, nil
}
