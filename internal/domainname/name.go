package domainname

import (
	"errors"
	"net"
	"strings"

	"golang.org/x/net/idna"
)

var ErrInvalidName = errors.New("invalid domain name")

func NormalizeName(input string) (string, error) {
	name, err := idna.Lookup.ToASCII(strings.TrimSuffix(strings.TrimSpace(input), "."))
	name = strings.ToLower(name)
	if err != nil || len(name) > 253 || net.ParseIP(name) != nil || !strings.Contains(name, ".") {
		return "", ErrInvalidName
	}
	for _, label := range strings.Split(name, ".") {
		if len(label) == 0 || len(label) > 63 || label[0] == '-' || label[len(label)-1] == '-' {
			return "", ErrInvalidName
		}
		for _, char := range label {
			if !(char >= 'a' && char <= 'z' || char >= '0' && char <= '9' || char == '-') {
				return "", ErrInvalidName
			}
		}
	}
	return name, nil
}
