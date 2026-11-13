package protocol

type Snapshot struct {
	ProtocolVersion    int     `json:"protocolVersion"`
	CollectedAt        string  `json:"collectedAt"`
	Hostname           string  `json:"hostname"`
	OS                 string  `json:"os"`
	Arch               string  `json:"arch"`
	UptimeSeconds      uint64  `json:"uptimeSeconds"`
	CPUPercent         float64 `json:"cpuPercent"`
	MemoryUsedBytes    uint64  `json:"memoryUsedBytes"`
	MemoryTotalBytes   uint64  `json:"memoryTotalBytes"`
	RootDiskUsedBytes  uint64  `json:"rootDiskUsedBytes"`
	RootDiskTotalBytes uint64  `json:"rootDiskTotalBytes"`
}
