package subscription_test

import (
	"github.com/Yueyanc/internet-resource-manager/internal/subscription"
	"testing"
)

func TestRenewalClampsCalendarDates(t *testing.T) {
	for _, tc := range []struct {
		date, cycle, want string
		days              int
	}{
		{"2026-01-31", "monthly", "2026-02-28", 0},
		{"2028-02-29", "yearly", "2029-02-28", 0},
		{"2026-11-30", "quarterly", "2027-02-28", 0},
		{"2026-11-13", "custom", "2027-05-12", 180},
	} {
		got, err := subscription.NextDate(tc.date, tc.cycle, tc.days)
		if err != nil || got != tc.want {
			t.Errorf("%s %s: got %s, %v; want %s", tc.date, tc.cycle, got, err, tc.want)
		}
	}
}
