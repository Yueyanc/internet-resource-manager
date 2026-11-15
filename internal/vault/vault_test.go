package vault

import (
	"bytes"
	"encoding/base64"
	"testing"
)

func b64(n int) string {
	return base64.StdEncoding.EncodeToString(bytes.Repeat([]byte{0x42}, n))
}

func TestSetupAndRotateValidate(t *testing.T) {
	valid := SetupInput{
		KdfSalt:            b64(16),
		KdfIterations:      600_000,
		WrappedVaultKey:    b64(WrappedKeyBytes),
		RecoverySalt:       b64(16),
		WrappedRecoveryKey: b64(WrappedKeyBytes),
	}
	if err := valid.Validate(); err != nil {
		t.Fatalf("expected valid setup input, got %v", err)
	}

	lowIter := valid
	lowIter.KdfIterations = 10_000
	if err := lowIter.Validate(); err == nil {
		t.Fatal("expected low iteration count to fail")
	}

	badKey := valid
	badKey.WrappedVaultKey = b64(32)
	if err := badKey.Validate(); err == nil {
		t.Fatal("expected wrong wrapped key length to fail")
	}

	rot := RotateInput{
		KeyVersion:      1,
		KdfSalt:         b64(16),
		KdfIterations:   600_000,
		WrappedVaultKey: b64(WrappedKeyBytes),
	}
	if err := rot.Validate(); err != nil {
		t.Fatalf("expected valid rotate input without recovery rotation, got %v", err)
	}
}

func TestSecretValidate(t *testing.T) {
	valid := SecretInput{
		KeyVersion:  1,
		Ciphertext:  b64(64),
		HasPassword: true,
	}
	if err := valid.Validate(); err != nil {
		t.Fatalf("expected valid secret input, got %v", err)
	}

	emptyFlags := valid
	emptyFlags.HasPassword = false
	if err := emptyFlags.Validate(); err == nil {
		t.Fatal("expected empty flags to fail")
	}

	shortCipher := valid
	shortCipher.Ciphertext = b64(12)
	if err := shortCipher.Validate(); err == nil {
		t.Fatal("expected truncated ciphertext to fail")
	}
}
