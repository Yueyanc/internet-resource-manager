package domain_test

import (
	"strings"
	"testing"

	"github.com/Yueyanc/internet-resource-manager/internal/domain"
)

func TestNormalizeName(t *testing.T) {
	for input, want := range map[string]string{
		" EXAMPLE.com. ":    "example.com",
		"例子.中国":             "xn--fsqu00a.xn--fiqs8s",
		"sub.example.co.uk": "sub.example.co.uk",
	} {
		got, err := domain.NormalizeName(input)
		if err != nil || got != want {
			t.Errorf("NormalizeName(%q) = %q, %v; want %q", input, got, err, want)
		}
	}
	for _, input := range []string{"", "localhost", "https://example.com", "example.com/path", "example.com:443", "127.0.0.1", "a..com", "-a.com", "a_.com", "*.example.com", strings.Repeat("a", 64) + ".com"} {
		if value, err := domain.NormalizeName(input); err == nil {
			t.Errorf("accepted invalid domain %q as %q", input, value)
		}
	}
}
