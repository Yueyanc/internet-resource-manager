package vault

import (
	"encoding/base64"
	"errors"
	"strings"
)

const (
	MinIterations   = 100_000
	MaxIterations   = 2_000_000
	MinSaltBytes    = 16
	MaxSaltBytes    = 64
	WrappedKeyBytes = 12 + 32 + 16 // 96-bit IV + 256-bit key + 128-bit GCM tag
	MinCipherBytes  = 12 + 1 + 16  // 96-bit IV + >=1 byte payload + 128-bit GCM tag
	MaxCipherBytes  = 16 * 1024
)

type SetupInput struct {
	KdfSalt            string `json:"kdfSalt"`
	KdfIterations      int64  `json:"kdfIterations"`
	WrappedVaultKey    string `json:"wrappedVaultKey"`
	RecoverySalt       string `json:"recoverySalt"`
	WrappedRecoveryKey string `json:"wrappedRecoveryKey"`
}

type RotateInput struct {
	KeyVersion         int64  `json:"keyVersion"`
	KdfSalt            string `json:"kdfSalt"`
	KdfIterations      int64  `json:"kdfIterations"`
	WrappedVaultKey    string `json:"wrappedVaultKey"`
	RecoverySalt       string `json:"recoverySalt"`
	WrappedRecoveryKey string `json:"wrappedRecoveryKey"`
}

type SecretInput struct {
	KeyVersion       int64  `json:"keyVersion"`
	Ciphertext       string `json:"ciphertext"`
	HasPassword      bool   `json:"hasPassword"`
	HasTotp          bool   `json:"hasTotp"`
	HasRecoveryCodes bool   `json:"hasRecoveryCodes"`
}

func checkBase64Range(raw string, minBytes, maxBytes int, label string) (string, error) {
	clean := strings.TrimSpace(raw)
	if clean == "" {
		return "", errors.New(label + "不能为空")
	}
	decoded, err := base64.StdEncoding.DecodeString(clean)
	if err != nil {
		return "", errors.New(label + "编码格式无效")
	}
	if len(decoded) < minBytes || len(decoded) > maxBytes {
		return "", errors.New(label + "长度无效")
	}
	return clean, nil
}

func (in *SetupInput) Validate() error {
	var err error
	if in.KdfSalt, err = checkBase64Range(in.KdfSalt, MinSaltBytes, MaxSaltBytes, "密钥盐值"); err != nil {
		return err
	}
	if in.KdfIterations < MinIterations || in.KdfIterations > MaxIterations {
		return errors.New("密钥派生迭代次数超出允许范围")
	}
	if in.WrappedVaultKey, err = checkBase64Range(in.WrappedVaultKey, WrappedKeyBytes, WrappedKeyBytes, "加密主密钥"); err != nil {
		return err
	}
	if in.RecoverySalt, err = checkBase64Range(in.RecoverySalt, MinSaltBytes, MaxSaltBytes, "恢复密钥盐值"); err != nil {
		return err
	}
	if in.WrappedRecoveryKey, err = checkBase64Range(in.WrappedRecoveryKey, WrappedKeyBytes, WrappedKeyBytes, "加密恢复密钥"); err != nil {
		return err
	}
	return nil
}

func (in *RotateInput) Validate() error {
	if in.KeyVersion < 1 {
		return errors.New("密钥版本无效")
	}
	var err error
	if in.KdfSalt, err = checkBase64Range(in.KdfSalt, MinSaltBytes, MaxSaltBytes, "密钥盐值"); err != nil {
		return err
	}
	if in.KdfIterations < MinIterations || in.KdfIterations > MaxIterations {
		return errors.New("密钥派生迭代次数超出允许范围")
	}
	if in.WrappedVaultKey, err = checkBase64Range(in.WrappedVaultKey, WrappedKeyBytes, WrappedKeyBytes, "加密主密钥"); err != nil {
		return err
	}
	in.RecoverySalt = strings.TrimSpace(in.RecoverySalt)
	in.WrappedRecoveryKey = strings.TrimSpace(in.WrappedRecoveryKey)
	if in.RecoverySalt != "" || in.WrappedRecoveryKey != "" {
		if in.RecoverySalt, err = checkBase64Range(in.RecoverySalt, MinSaltBytes, MaxSaltBytes, "恢复密钥盐值"); err != nil {
			return err
		}
		if in.WrappedRecoveryKey, err = checkBase64Range(in.WrappedRecoveryKey, WrappedKeyBytes, WrappedKeyBytes, "加密恢复密钥"); err != nil {
			return err
		}
	}
	return nil
}

func (in *SecretInput) Validate() error {
	if in.KeyVersion < 1 {
		return errors.New("密钥版本无效")
	}
	var err error
	if in.Ciphertext, err = checkBase64Range(in.Ciphertext, MinCipherBytes, MaxCipherBytes, "加密载荷"); err != nil {
		return err
	}
	if !in.HasPassword && !in.HasTotp && !in.HasRecoveryCodes {
		return errors.New("请至少包含一项需要加密保存的凭据")
	}
	return nil
}
