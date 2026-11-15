package server_test

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"

	"github.com/Yueyanc/internet-resource-manager/internal/server"
	"github.com/Yueyanc/internet-resource-manager/internal/storage"
	"github.com/Yueyanc/internet-resource-manager/internal/vault"
)

func b64Bytes(b byte, n int) string {
	return base64.StdEncoding.EncodeToString(bytes.Repeat([]byte{b}, n))
}

func TestVaultLifecycleAndCascadeDelete(t *testing.T) {
	path := filepath.Join(t.TempDir(), "vault.db")
	store, err := storage.Open(t.Context(), path)
	if err != nil {
		t.Fatal(err)
	}
	defer func() { _ = store.Close() }()
	handler := server.NewHandler(store, nil)
	var cookie *http.Cookie
	call := func(method, target string, body any) *httptest.ResponseRecorder {
		data, _ := json.Marshal(body)
		r := httptest.NewRequest(method, "http://127.0.0.1/api/v1"+target, strings.NewReader(string(data)))
		r.Header.Set("Content-Type", "application/json")
		if cookie != nil {
			r.AddCookie(cookie)
		}
		w := httptest.NewRecorder()
		handler.ServeHTTP(w, r)
		return w
	}

	// Unauthenticated vault access must fail with 401
	if unauth := call("GET", "/vault", nil); unauth.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 before login, got %d", unauth.Code)
	}

	setup := call("POST", "/auth/setup", map[string]string{"username": "admin", "password": "test-only-password"})
	if setup.Code != http.StatusCreated {
		t.Fatal(setup.Body)
	}
	cookie = setup.Result().Cookies()[0]

	// Create an account
	accResp := call("POST", "/accounts", map[string]any{
		"presetKey": "github", "platform": "GitHub", "label": "", "identifier": "dev@example.invalid",
		"uid": "", "category": "dev_cloud", "ecosystem": "overseas", "region": "GLOBAL",
		"role": "primary", "status": "active", "authMethod": "password",
		"recoveryAccountId": "", "recoveryEmail": "", "ssoAccountId": "", "phoneHint": "",
		"twoFactor": "totp", "recoveryCodes": "saved", "kycStatus": "none", "kycNote": "",
		"keepaliveCycle": "none", "keepaliveDays": 0, "nextCheckinDate": "", "lastCheckedAt": "",
		"vaultReference": "", "securityUrl": "", "notes": "", "archived": false,
	})
	if accResp.Code != http.StatusCreated {
		t.Fatalf("expected 201 creating account, got %d: %s", accResp.Code, accResp.Body.String())
	}
	var acc struct {
		ID string `json:"id"`
	}
	_ = json.Unmarshal(accResp.Body.Bytes(), &acc)

	// Saving secret before vault setup must fail
	preSave := call("PUT", "/accounts/"+acc.ID+"/secret", map[string]any{
		"keyVersion": 1, "ciphertext": b64Bytes(0x11, 80), "hasPassword": true, "hasTotp": true, "hasRecoveryCodes": false,
	})
	if preSave.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 when vault uninitialized, got %d", preSave.Code)
	}

	// Initialize vault
	vaultSetup := call("POST", "/vault/setup", map[string]any{
		"kdfSalt":            b64Bytes(0x01, 16),
		"kdfIterations":      600_000,
		"wrappedVaultKey":    b64Bytes(0x02, vault.WrappedKeyBytes),
		"recoverySalt":       b64Bytes(0x03, 16),
		"wrappedRecoveryKey": b64Bytes(0x04, vault.WrappedKeyBytes),
	})
	if vaultSetup.Code != http.StatusCreated {
		t.Fatalf("expected 201 on vault setup, got %d: %s", vaultSetup.Code, vaultSetup.Body.String())
	}

	// Duplicate setup must return 409
	if dup := call("POST", "/vault/setup", map[string]any{
		"kdfSalt": b64Bytes(0x01, 16), "kdfIterations": 600_000,
		"wrappedVaultKey": b64Bytes(0x02, vault.WrappedKeyBytes),
		"recoverySalt":    b64Bytes(0x03, 16), "wrappedRecoveryKey": b64Bytes(0x04, vault.WrappedKeyBytes),
	}); dup.Code != http.StatusConflict {
		t.Fatalf("expected 409 on duplicate setup, got %d", dup.Code)
	}

	// Save encrypted secret for account
	saveSec := call("PUT", "/accounts/"+acc.ID+"/secret", map[string]any{
		"keyVersion": 1, "ciphertext": b64Bytes(0x55, 96),
		"hasPassword": true, "hasTotp": true, "hasRecoveryCodes": true,
	})
	if saveSec.Code != http.StatusOK {
		t.Fatalf("expected 200 saving secret, got %d: %s", saveSec.Code, saveSec.Body.String())
	}

	// Status endpoint exposes summary flags without ciphertext
	statusResp := call("GET", "/vault", nil)
	if statusResp.Code != http.StatusOK {
		t.Fatal(statusResp.Body)
	}
	if strings.Contains(statusResp.Body.String(), b64Bytes(0x55, 96)) {
		t.Fatal("expected /vault summary response not to leak account ciphertexts")
	}

	// Rotate master key wrapper
	rotResp := call("PUT", "/vault/master-key", map[string]any{
		"keyVersion":      1,
		"kdfSalt":         b64Bytes(0x09, 16),
		"kdfIterations":   600_000,
		"wrappedVaultKey": b64Bytes(0x0a, vault.WrappedKeyBytes),
	})
	if rotResp.Code != http.StatusOK {
		t.Fatalf("expected 200 rotating master key, got %d: %s", rotResp.Code, rotResp.Body.String())
	}

	// Deleting the account must cascade-delete its secret
	if del := call("DELETE", "/accounts/"+acc.ID, nil); del.Code != http.StatusOK {
		t.Fatal(del.Body)
	}
	if getSec := call("GET", "/accounts/"+acc.ID+"/secret", nil); getSec.Code != http.StatusNotFound {
		t.Fatalf("expected 404 after cascade delete, got %d", getSec.Code)
	}
}
