package cloudsync

import (
	"context"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha1"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
)

type AliyunAdapter struct {
	EndpointOverride string
	HTTPClient       *http.Client
}

func (a *AliyunAdapter) ProviderKey() string { return "aliyun" }

func (a *AliyunAdapter) client() *http.Client {
	if a.HTTPClient != nil {
		return a.HTTPClient
	}
	return http.DefaultClient
}

func (a *AliyunAdapter) ValidateCredentials(creds Credentials) (Credentials, string, error) {
	ak := creds.Get("accessKeyId")
	sk := creds.Get("accessKeySecret")
	if len(ak) < 8 || len(sk) < 8 || strings.ContainsAny(ak+sk, " \t\r\n") {
		return nil, "", ErrInvalidCredentials
	}
	return Credentials{"accessKeyId": ak, "accessKeySecret": sk}, MaskSecret(ak), nil
}

func aliyunPercentEncode(s string) string {
	esc := url.QueryEscape(s)
	esc = strings.ReplaceAll(esc, "+", "%20")
	esc = strings.ReplaceAll(esc, "*", "%2A")
	esc = strings.ReplaceAll(esc, "%7E", "~")
	return esc
}

func signAliyunRPCQuery(ak, sk, version, action string, params map[string]string, now time.Time, nonce string) string {
	all := map[string]string{
		"Format":           "JSON",
		"Version":          version,
		"AccessKeyId":      ak,
		"SignatureMethod":  "HMAC-SHA1",
		"Timestamp":        now.UTC().Format("2006-01-02T15:04:05Z"),
		"SignatureVersion": "1.0",
		"SignatureNonce":   nonce,
		"Action":           action,
	}
	for k, v := range params {
		all[k] = v
	}
	keys := make([]string, 0, len(all))
	for k := range all {
		keys = append(keys, k)
	}
	sort.Strings(keys)

	parts := make([]string, 0, len(keys))
	for _, k := range keys {
		parts = append(parts, aliyunPercentEncode(k)+"="+aliyunPercentEncode(all[k]))
	}
	canonical := strings.Join(parts, "&")
	stringToSign := "GET&%2F&" + aliyunPercentEncode(canonical)

	mac := hmac.New(sha1.New, []byte(sk+"&"))
	_, _ = mac.Write([]byte(stringToSign))
	sig := base64.StdEncoding.EncodeToString(mac.Sum(nil))
	return canonical + "&Signature=" + aliyunPercentEncode(sig)
}

type aliyunAPIError struct {
	Code    string `json:"Code"`
	Message string `json:"Message"`
}

func isAliyunInvalidKeyCode(code string) bool {
	c := strings.ToLower(code)
	return strings.Contains(c, "invalidaccesskeyid") ||
		strings.Contains(c, "signaturedoesnotmatch") ||
		strings.Contains(c, "incompleteSignature")
}

func isAliyunForbiddenCode(code string) bool {
	c := strings.ToLower(code)
	return strings.Contains(c, "forbidden") || strings.Contains(c, "noPermission") || strings.Contains(c, "unauthorized")
}

func (a *AliyunAdapter) rpcGet(ctx context.Context, host, ak, sk, version, action string, params map[string]string, out any) (string, error) {
	base := "https://" + host
	if strings.TrimSpace(a.EndpointOverride) != "" {
		base = strings.TrimRight(strings.TrimSpace(a.EndpointOverride), "/")
	}
	qs := signAliyunRPCQuery(ak, sk, version, action, params, time.Now().UTC(), rand.Text())
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, base+"/?"+qs, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("Accept", "application/json")
	req.Header.Set("X-IRM-Aliyun-Service", host)

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
		var apiErr aliyunAPIError
		_ = json.Unmarshal(body, &apiErr)
		if isAliyunInvalidKeyCode(apiErr.Code) {
			return apiErr.Code, ErrInvalidCredentials
		}
		return apiErr.Code, fmt.Errorf("阿里云 API (%s) 错误 [%s]: %s", action, apiErr.Code, apiErr.Message)
	}
	return "", json.Unmarshal(body, out)
}

func (a *AliyunAdapter) Fetch(ctx context.Context, creds Credentials) (UnifiedSnapshot, error) {
	clean, _, err := a.ValidateCredentials(creds)
	if err != nil {
		return UnifiedSnapshot{}, err
	}
	ak := clean.Get("accessKeyId")
	sk := clean.Get("accessKeySecret")

	snap := UnifiedSnapshot{
		Provider:  "aliyun",
		Registrar: make(map[string]RegistrarDomainInfo),
	}
	zonesByName := make(map[string]ZoneSnapshot)
	var zoneOrder []string
	anySuccess := false

	// 1. Aliyun Domain Registration (domain.aliyuncs.com)
	var domListResp struct {
		Data struct {
			Domain []struct {
				DomainName     string `json:"DomainName"`
				ExpirationDate string `json:"ExpirationDate"`
				DomainStatus   string `json:"DomainStatus"`
			} `json:"Domain"`
		} `json:"Data"`
	}
	if code, derr := a.rpcGet(ctx, "domain.aliyuncs.com", ak, sk, "2018-01-29", "QueryDomainList", map[string]string{
		"PageNum":  "1",
		"PageSize": "100",
	}, &domListResp); derr == nil {
		anySuccess = true
		snap.Scopes = append(snap.Scopes, "domain:read")
		for _, d := range domListResp.Data.Domain {
			name := strings.ToLower(strings.TrimSpace(d.DomainName))
			if name == "" {
				continue
			}
			exp := parseFlexibleDate(d.ExpirationDate)
			snap.Registrar[name] = RegistrarDomainInfo{
				Name:      name,
				ExpiresAt: exp,
				AutoRenew: false,
				Privacy:   true,
			}
			zonesByName[name] = ZoneSnapshot{
				ZoneID:           "aliyun-dom:" + name,
				Name:             name,
				Status:           "active",
				ConsoleURL:       "https://dc.console.aliyun.com/",
				DefaultPresetKey: "aliyun_wanwang",
				RegistrarOnly:    true,
			}
			zoneOrder = append(zoneOrder, name)
		}
	} else if errorsIsCredInvalid(derr, code) {
		return UnifiedSnapshot{}, ErrInvalidCredentials
	}

	// 2. Aliyun Cloud DNS (alidns.aliyuncs.com)
	var dnsZonesResp struct {
		Domains struct {
			Domain []struct {
				DomainID   string `json:"DomainId"`
				DomainName string `json:"DomainName"`
				DnsServers struct {
					DnsServer []string `json:"DnsServer"`
				} `json:"DnsServers"`
			} `json:"Domain"`
		} `json:"Domains"`
	}
	if code, zerr := a.rpcGet(ctx, "alidns.aliyuncs.com", ak, sk, "2015-01-09", "DescribeDomains", map[string]string{
		"PageNumber": "1",
		"PageSize":   "100",
	}, &dnsZonesResp); zerr == nil {
		anySuccess = true
		snap.Scopes = append(snap.Scopes, "alidns:read")
		for idx, z := range dnsZonesResp.Domains.Domain {
			name := strings.ToLower(strings.TrimSpace(z.DomainName))
			if name == "" {
				continue
			}
			var recs []SyncedDNSRecord
			if idx < 40 {
				var recResp struct {
					DomainRecords struct {
						Record []struct {
							RecordID string `json:"RecordId"`
							RR       string `json:"RR"`
							Type     string `json:"Type"`
							Value    string `json:"Value"`
							TTL      int    `json:"TTL"`
							Status   string `json:"Status"`
						} `json:"Record"`
					} `json:"DomainRecords"`
				}
				if _, rerr := a.rpcGet(ctx, "alidns.aliyuncs.com", ak, sk, "2015-01-09", "DescribeDomainRecords", map[string]string{
					"DomainName": name,
					"PageNumber": "1",
					"PageSize":   "200",
				}, &recResp); rerr == nil {
					for _, r := range recResp.DomainRecords.Record {
						if strings.EqualFold(r.Status, "DISABLE") || r.Type == "NS" {
							continue
						}
						fqdn := name
						if r.RR != "" && r.RR != "@" {
							fqdn = r.RR + "." + name
						}
						recs = append(recs, SyncedDNSRecord{
							ID:      r.RecordID,
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
				ZoneID:           "alidns:" + firstNonEmpty(z.DomainID, name),
				Name:             name,
				Status:           "active",
				NameServers:      z.DnsServers.DnsServer,
				DNSProviderName:  "阿里云 DNS",
				ConsoleURL:       "https://dns.console.aliyun.com/",
				DefaultPresetKey: "aliyun_wanwang",
				Records:          recs,
				RegistrarOnly:    false,
			}
		}
	} else if errorsIsCredInvalid(zerr, code) {
		return UnifiedSnapshot{}, ErrInvalidCredentials
	}

	for _, name := range zoneOrder {
		snap.Zones = append(snap.Zones, zonesByName[name])
	}

	// 3. Aliyun Simple Application Server (SWAS) across common regions
	var swasRegionsResp struct {
		Regions []struct {
			RegionID string `json:"RegionId"`
		} `json:"Regions"`
	}
	if code, serr := a.rpcGet(ctx, "swas.cn-hangzhou.aliyuncs.com", ak, sk, "2020-06-01", "ListRegions", nil, &swasRegionsResp); serr == nil {
		anySuccess = true
		snap.Scopes = append(snap.Scopes, "swas:read")

		var mu sync.Mutex
		var wg sync.WaitGroup
		sem := make(chan struct{}, 4)

		for _, reg := range swasRegionsResp.Regions {
			rid := strings.TrimSpace(reg.RegionID)
			if rid == "" {
				continue
			}
			wg.Add(1)
			go func(regionID string) {
				defer wg.Done()
				sem <- struct{}{}
				defer func() { <-sem }()

				host := "swas." + regionID + ".aliyuncs.com"
				var instResp struct {
					Instances []struct {
						InstanceID      string `json:"InstanceId"`
						InstanceName    string `json:"InstanceName"`
						Status          string `json:"Status"`
						RegionID        string `json:"RegionId"`
						PublicIPAddress string `json:"PublicIpAddress"`
						InnerIPAddress  string `json:"InnerIpAddress"`
						ExpiredTime     string `json:"ExpiredTime"`
						PlanID          string `json:"PlanId"`
						ResourceSpec    struct {
							CPU       int64   `json:"Cpu"`
							Memory    float64 `json:"Memory"`
							DiskSize  int64   `json:"DiskSize"`
							Bandwidth int64   `json:"Bandwidth"`
							Flow      float64 `json:"Flow"`
						} `json:"ResourceSpec"`
						Image struct {
							ImageName string `json:"ImageName"`
							OsType    string `json:"OsType"`
						} `json:"Image"`
					} `json:"Instances"`
				}
				if _, ierr := a.rpcGet(ctx, host, ak, sk, "2020-06-01", "ListInstances", map[string]string{
					"RegionId":   regionID,
					"PageNumber": "1",
					"PageSize":   "100",
				}, &instResp); ierr != nil || len(instResp.Instances) == 0 {
					return
				}

				ids := make([]string, 0, len(instResp.Instances))
				for _, inst := range instResp.Instances {
					ids = append(ids, inst.InstanceID)
				}
				idsJSON, _ := json.Marshal(ids)
				trafficMap := make(map[string]struct{ Used, Total int64 })
				var pkgResp struct {
					InstanceTrafficPackageUsages []struct {
						InstanceID          string `json:"InstanceId"`
						TrafficUsed         int64  `json:"TrafficUsed"`
						TrafficPackageTotal int64  `json:"TrafficPackageTotal"`
					} `json:"InstanceTrafficPackageUsages"`
				}
				if _, perr := a.rpcGet(ctx, host, ak, sk, "2020-06-01", "ListInstancesTrafficPackages", map[string]string{
					"RegionId":    regionID,
					"InstanceIds": string(idsJSON),
				}, &pkgResp); perr == nil {
					for _, u := range pkgResp.InstanceTrafficPackageUsages {
						trafficMap[u.InstanceID] = struct{ Used, Total int64 }{Used: u.TrafficUsed, Total: u.TrafficPackageTotal}
					}
				}

				mu.Lock()
				defer mu.Unlock()
				for _, inst := range instResp.Instances {
					extID := "aliyun-swas:" + inst.InstanceID
					regCode := normalizeRegionCode(regionID)
					status := "active"
					if strings.EqualFold(inst.Status, "Stopped") || strings.EqualFold(inst.Status, "Disabled") {
						status = "standby"
					}
					memMB := int64(inst.ResourceSpec.Memory * 1024)
					if inst.ResourceSpec.Memory > 256 {
						memMB = int64(inst.ResourceSpec.Memory)
					}
					tf := trafficMap[inst.InstanceID]
					trafficGB := int64(inst.ResourceSpec.Flow)
					if trafficGB <= 0 && tf.Total > 0 {
						trafficGB = tf.Total / (1024 * 1024 * 1024)
					}
					name := firstNonEmpty(inst.InstanceName, inst.InstanceID)
					snap.Servers = append(snap.Servers, SyncedServer{
						ExternalID:      extID,
						PresetKey:       "aliyun",
						Name:            name,
						Hostname:        name,
						ProviderName:    "阿里云轻量",
						Kind:            "vps",
						Status:          status,
						Region:          regCode,
						Datacenter:      regionID,
						OS:              firstNonEmpty(inst.Image.ImageName, inst.Image.OsType),
						Arch:            "amd64",
						CPUCores:        inst.ResourceSpec.CPU,
						MemoryMB:        memMB,
						DiskGB:          inst.ResourceSpec.DiskSize,
						DiskType:        "essd",
						BandwidthMbps:   inst.ResourceSpec.Bandwidth,
						TrafficGB:       trafficGB,
						TrafficRule:     "out",
						TrafficResetDay: 1,
						IPv4:            inst.PublicIPAddress,
						PrivateIP:       inst.InnerIPAddress,
						SSHPort:         22,
						ConsoleURL:      "https://swasnext.console.aliyun.com/",
						ExpireDate:      parseFlexibleDate(inst.ExpiredTime),
						Tags:            []string{"阿里云", "轻量SWAS"},
						Meta: ServerProviderMeta{
							Provider:          "aliyun",
							ExternalID:        inst.InstanceID,
							Plan:              inst.PlanID,
							TrafficUsedBytes:  tf.Used,
							TrafficTotalBytes: tf.Total,
						},
					})
					if inst.PublicIPAddress != "" {
						scope := "overseas_exit"
						if regCode == "CN" {
							scope = "domestic_entry"
						}
						snap.IPs = append(snap.IPs, SyncedIP{
							ExternalID:     "aliyun-swas-ip:" + inst.InstanceID,
							PresetKey:      "aliyun_eip",
							Address:        inst.PublicIPAddress,
							NetworkScope:   scope,
							Category:       "cloud_vps",
							ProviderName:   "阿里云",
							Label:          name,
							Region:         regCode,
							ASNType:        "hosting",
							OriginType:     "native",
							Role:           "primary",
							Status:         "active",
							RiskLevel:      "unassessed",
							HostExternalID: extID,
							HostLabel:      name,
							ConsoleURL:     "https://swasnext.console.aliyun.com/",
							Tags:           []string{"阿里云", "轻量SWAS"},
						})
					}
				}
			}(rid)
		}
		wg.Wait()
	} else if errorsIsCredInvalid(serr, code) {
		return UnifiedSnapshot{}, ErrInvalidCredentials
	}

	// 4. Aliyun ECS (ecs.aliyuncs.com)
	var ecsRegionsResp struct {
		Regions struct {
			Region []struct {
				RegionID string `json:"RegionId"`
			} `json:"Region"`
		} `json:"Regions"`
	}
	if code, eerr := a.rpcGet(ctx, "ecs.aliyuncs.com", ak, sk, "2014-05-26", "DescribeRegions", nil, &ecsRegionsResp); eerr == nil {
		anySuccess = true
		snap.Scopes = append(snap.Scopes, "ecs:read")

		var mu sync.Mutex
		var wg sync.WaitGroup
		sem := make(chan struct{}, 4)

		for _, reg := range ecsRegionsResp.Regions.Region {
			rid := strings.TrimSpace(reg.RegionID)
			if rid == "" {
				continue
			}
			wg.Add(1)
			go func(regionID string) {
				defer wg.Done()
				sem <- struct{}{}
				defer func() { <-sem }()

				var ecsResp struct {
					Instances struct {
						Instance []struct {
							InstanceID         string `json:"InstanceId"`
							InstanceName       string `json:"InstanceName"`
							HostName           string `json:"HostName"`
							Status             string `json:"Status"`
							OSName             string `json:"OSName"`
							CPU                int64  `json:"Cpu"`
							Memory             int64  `json:"Memory"`
							InternetMaxBandOut int64  `json:"InternetMaxBandwidthOut"`
							ExpiredTime        string `json:"ExpiredTime"`
							InstanceType       string `json:"InstanceType"`
							PublicIPAddress    struct {
								IPAddress []string `json:"IpAddress"`
							} `json:"PublicIpAddress"`
							EipAddress struct {
								IPAddress string `json:"IpAddress"`
							} `json:"EipAddress"`
							VpcAttributes struct {
								PrivateIPAddress struct {
									IPAddress []string `json:"IpAddress"`
								} `json:"PrivateIpAddress"`
							} `json:"VpcAttributes"`
						} `json:"Instance"`
					} `json:"Instances"`
				}
				if _, derr := a.rpcGet(ctx, "ecs.aliyuncs.com", ak, sk, "2014-05-26", "DescribeInstances", map[string]string{
					"RegionId":   regionID,
					"PageNumber": "1",
					"PageSize":   "100",
				}, &ecsResp); derr != nil || len(ecsResp.Instances.Instance) == 0 {
					return
				}

				mu.Lock()
				defer mu.Unlock()
				for _, inst := range ecsResp.Instances.Instance {
					extID := "aliyun-ecs:" + inst.InstanceID
					regCode := normalizeRegionCode(regionID)
					pubIP := strings.TrimSpace(inst.EipAddress.IPAddress)
					if pubIP == "" && len(inst.PublicIPAddress.IPAddress) > 0 {
						pubIP = strings.TrimSpace(inst.PublicIPAddress.IPAddress[0])
					}
					var privIP string
					if len(inst.VpcAttributes.PrivateIPAddress.IPAddress) > 0 {
						privIP = strings.TrimSpace(inst.VpcAttributes.PrivateIPAddress.IPAddress[0])
					}
					status := "active"
					if strings.EqualFold(inst.Status, "Stopped") {
						status = "standby"
					}
					name := firstNonEmpty(inst.InstanceName, inst.HostName, inst.InstanceID)
					snap.Servers = append(snap.Servers, SyncedServer{
						ExternalID:    extID,
						PresetKey:     "aliyun",
						Name:          name,
						Hostname:      firstNonEmpty(inst.HostName, name),
						ProviderName:  "阿里云 ECS",
						Kind:          "vps",
						Status:        status,
						Region:        regCode,
						Datacenter:    regionID,
						OS:            inst.OSName,
						Arch:          "amd64",
						CPUCores:      inst.CPU,
						MemoryMB:      inst.Memory,
						BandwidthMbps: inst.InternetMaxBandOut,
						TrafficRule:   "out",
						IPv4:          pubIP,
						PrivateIP:     privIP,
						SSHPort:       22,
						ConsoleURL:    "https://ecs.console.aliyun.com/",
						ExpireDate:    parseFlexibleDate(inst.ExpiredTime),
						Tags:          []string{"阿里云", "ECS"},
						Meta: ServerProviderMeta{
							Provider:   "aliyun",
							ExternalID: inst.InstanceID,
							Plan:       inst.InstanceType,
						},
					})
					if pubIP != "" {
						scope := "overseas_exit"
						if regCode == "CN" {
							scope = "domestic_entry"
						}
						snap.IPs = append(snap.IPs, SyncedIP{
							ExternalID:     "aliyun-ecs-ip:" + inst.InstanceID,
							PresetKey:      "aliyun_eip",
							Address:        pubIP,
							NetworkScope:   scope,
							Category:       "cloud_vps",
							ProviderName:   "阿里云",
							Label:          name,
							Region:         regCode,
							ASNType:        "hosting",
							OriginType:     "native",
							Role:           "primary",
							Status:         "active",
							RiskLevel:      "unassessed",
							HostExternalID: extID,
							HostLabel:      name,
							ConsoleURL:     "https://ecs.console.aliyun.com/",
							Tags:           []string{"阿里云", "ECS"},
						})
					}
				}
			}(rid)
		}
		wg.Wait()
	} else if errorsIsCredInvalid(eerr, code) {
		return UnifiedSnapshot{}, ErrInvalidCredentials
	}

	if !anySuccess {
		return UnifiedSnapshot{}, fmt.Errorf("%w: RAM 子账号未授予任何可读权限或凭据无效", ErrInvalidCredentials)
	}
	return snap, nil
}

func errorsIsCredInvalid(err error, code string) bool {
	if IsAuthError(err) || isAliyunInvalidKeyCode(code) {
		return true
	}
	return !isAliyunForbiddenCode(code) && err == nil && false
}

var _ = strconv.Itoa
