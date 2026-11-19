package account

import "testing"

func TestValidateAndAdvanceCheckin(t *testing.T) {
	valid := Input{
		PresetKey:       "apple",
		Platform:        " Apple ID ",
		Label:           " 美区主力 ",
		Identifier:      " us@example.invalid ",
		Category:        "ecosystem",
		Ecosystem:       "overseas",
		Region:          "us",
		Role:            "hub",
		Status:          "active",
		AuthMethod:      "passkey",
		TwoFactor:       "passkey",
		RecoveryCodes:   "saved",
		KeepaliveCycle:  "quarterly",
		NextCheckinDate: "2026-11-30",
		SecurityURL:     "https://account.apple.com/",
	}
	if err := valid.Validate(); err != nil {
		t.Fatalf("expected valid input, got %v", err)
	}
	if valid.Platform != "Apple ID" || valid.Region != "US" || valid.Identifier != "us@example.invalid" {
		t.Fatalf("unexpected normalized fields: %+v", valid)
	}

	apiHub := valid
	apiHub.PresetKey = "tikhub"
	apiHub.Platform = "TikHub"
	apiHub.Category = "api_platform"
	apiHub.Region = "GLOBAL"
	apiHub.SecurityURL = "https://user.tikhub.io/"
	if err := apiHub.Validate(); err != nil {
		t.Fatalf("expected api_platform input to validate, got %v", err)
	}

	idLeak := valid
	idLeak.KycStatus = "verified"
	idLeak.KycNote = "110101199001011234"
	if err := idLeak.Validate(); err == nil {
		t.Fatal("expected ID card number in kycNote to be rejected")
	}

	credURL := valid
	credURL.SecurityURL = "https://user:secret@example.com/security"
	if err := credURL.Validate(); err == nil {
		t.Fatal("expected URL with embedded credentials to be rejected")
	}

	// Overdue check-in advances from actual check-in date rather than leaving deadline in the past.
	next, checked, err := AdvanceCheckin("2026-08-01", "2026-11-13", "quarterly", 0)
	if err != nil || next != "2027-02-13" || checked != "2026-11-13" {
		t.Fatalf("unexpected overdue advance: next=%s checked=%s err=%v", next, checked, err)
	}

	// End-of-month clamping on leap & non-leap years.
	clamped, err := NextCheckinDate("2026-01-31", "monthly", 0)
	if err != nil || clamped != "2026-02-28" {
		t.Fatalf("expected 2026-02-28, got %s (%v)", clamped, err)
	}
	leap, err := NextCheckinDate("2028-01-31", "monthly", 0)
	if err != nil || leap != "2028-02-29" {
		t.Fatalf("expected 2028-02-29, got %s (%v)", leap, err)
	}

	// Future deadline further than one cycle still progresses monotonically.
	ahead, _, err := AdvanceCheckin("2027-05-01", "2026-11-13", "monthly", 0)
	if err != nil || ahead != "2027-06-01" {
		t.Fatalf("expected monotonic advance to 2027-06-01, got %s (%v)", ahead, err)
	}
}
