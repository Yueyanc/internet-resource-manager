package cloudsync

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strings"
)

type KeyRing struct {
	key [32]byte
}

func LoadOrCreateKeyRing(dataDir string) (*KeyRing, error) {
	if rawEnv := strings.TrimSpace(os.Getenv("IRM_INTEGRATION_KEY")); rawEnv != "" {
		var k [32]byte
		if decoded, err := hex.DecodeString(rawEnv); err == nil && len(decoded) == 32 {
			copy(k[:], decoded)
			return &KeyRing{key: k}, nil
		}
		k = sha256.Sum256([]byte(rawEnv))
		return &KeyRing{key: k}, nil
	}

	cleanDir := strings.TrimSpace(dataDir)
	if cleanDir == "" || cleanDir == ":memory:" || cleanDir == "." {
		var k [32]byte
		if _, err := io.ReadFull(rand.Reader, k[:]); err != nil {
			return nil, err
		}
		return &KeyRing{key: k}, nil
	}

	if err := os.MkdirAll(cleanDir, 0700); err != nil {
		return nil, fmt.Errorf("prepare integration key dir: %w", err)
	}
	keyFile := filepath.Join(cleanDir, "integration.key")
	if existing, err := os.ReadFile(keyFile); err == nil {
		trimmed := strings.TrimSpace(string(existing))
		if decoded, decErr := hex.DecodeString(trimmed); decErr == nil && len(decoded) == 32 {
			var k [32]byte
			copy(k[:], decoded)
			return &KeyRing{key: k}, nil
		}
		if len(existing) == 32 {
			var k [32]byte
			copy(k[:], existing)
			return &KeyRing{key: k}, nil
		}
	}

	var fresh [32]byte
	if _, err := io.ReadFull(rand.Reader, fresh[:]); err != nil {
		return nil, err
	}
	encoded := hex.EncodeToString(fresh[:]) + "\n"
	tmpFile := keyFile + ".tmp"
	if err := os.WriteFile(tmpFile, []byte(encoded), 0600); err != nil {
		return nil, fmt.Errorf("write integration key: %w", err)
	}
	if err := os.Rename(tmpFile, keyFile); err != nil {
		_ = os.Remove(tmpFile)
		return nil, fmt.Errorf("activate integration key: %w", err)
	}
	return &KeyRing{key: fresh}, nil
}

func (kr *KeyRing) SealJSON(aad string, payload any) (ciphertext []byte, nonce []byte, err error) {
	if kr == nil {
		return nil, nil, errors.New("integration keyring is not initialized")
	}
	raw, err := json.Marshal(payload)
	if err != nil {
		return nil, nil, err
	}
	block, err := aes.NewCipher(kr.key[:])
	if err != nil {
		return nil, nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, nil, err
	}
	nonce = make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return nil, nil, err
	}
	ciphertext = gcm.Seal(nil, nonce, raw, []byte(aad))
	return ciphertext, nonce, nil
}

func (kr *KeyRing) OpenJSON(aad string, ciphertext, nonce []byte, out any) error {
	if kr == nil {
		return errors.New("integration keyring is not initialized")
	}
	block, err := aes.NewCipher(kr.key[:])
	if err != nil {
		return err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return err
	}
	if len(nonce) != gcm.NonceSize() {
		return errors.New("invalid integration secret nonce")
	}
	plain, err := gcm.Open(nil, nonce, ciphertext, []byte(aad))
	if err != nil {
		return errors.New("decrypt integration secret failed")
	}
	return json.Unmarshal(plain, out)
}

func MaskSecret(secret string) string {
	s := strings.TrimSpace(secret)
	if len(s) <= 6 {
		return "••••"
	}
	if len(s) <= 12 {
		return "••••" + s[len(s)-3:]
	}
	return s[:3] + "••••" + s[len(s)-4:]
}
