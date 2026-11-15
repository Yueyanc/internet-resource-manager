package server

import (
	"crypto/rand"
	"errors"
	"net"
	"net/http"
	"net/netip"
	"regexp"
	"strings"
	"sync"
	"time"
	"unicode/utf8"

	"github.com/Yueyanc/internet-resource-manager/internal/auth"
	"github.com/Yueyanc/internet-resource-manager/internal/ipaddr"
	"github.com/Yueyanc/internet-resource-manager/internal/storage"
	"github.com/go-chi/chi/v5"
)

const cookieName = "irm_session"
const sessionAge = 7 * 24 * time.Hour

var usernamePattern = regexp.MustCompile(`^[a-zA-Z0-9_.-]{3,32}$`)

var ErrInvalidCredentials = errors.New("用户名须为 3–32 位字母、数字或 ._-，密码须为 8–256 位")

func ValidateCredentials(username, password string) error {
	if !usernamePattern.MatchString(username) || utf8.RuneCountInString(password) < 8 || len(password) > 256 {
		return ErrInvalidCredentials
	}
	return nil
}

type authHandler struct {
	store      *storage.Store
	trustProxy bool
	mu         sync.Mutex
	failures   int
	resetAt    time.Time
}

func isTrustedProxyPeer(remoteAddr string) bool {
	host := strings.TrimSpace(remoteAddr)
	if h, _, err := net.SplitHostPort(host); err == nil {
		host = h
	}
	addr, err := netip.ParseAddr(strings.Trim(host, "[]"))
	if err != nil {
		return false
	}
	return !ipaddr.IsPublicRoutable(addr.Unmap())
}

func (a *authHandler) isSecureRequest(r *http.Request) bool {
	if r.TLS != nil {
		return true
	}
	if a.trustProxy && isTrustedProxyPeer(r.RemoteAddr) {
		return strings.EqualFold(strings.TrimSpace(r.Header.Get("X-Forwarded-Proto")), "https")
	}
	return false
}

func (a *authHandler) validSession(r *http.Request) (bool, error) {
	c, err := r.Cookie(cookieName)
	if err != nil || len(c.Value) > 128 {
		return false, nil
	}
	return a.store.SessionValid(r.Context(), auth.TokenHash(c.Value))
}

func (a *authHandler) require(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		valid, err := a.validSession(r)
		if err != nil {
			internalError(w, err)
			return
		}
		if !valid {
			writeError(w, 401, "unauthorized", "登录已失效，请重新登录")
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (a *authHandler) setSessionCookie(w http.ResponseWriter, r *http.Request, token string) {
	http.SetCookie(w, &http.Cookie{
		Name:     cookieName,
		Value:    token,
		Path:     "/",
		HttpOnly: true,
		Secure:   a.isSecureRequest(r),
		SameSite: http.SameSiteStrictMode,
		MaxAge:   int(sessionAge.Seconds()),
	})
}

func (a *authHandler) routes(r chi.Router) {
	r.Get("/auth/status", func(w http.ResponseWriter, r *http.Request) {
		admin, err := a.store.Administrator(r.Context())
		if errors.Is(err, storage.ErrNotFound) {
			writeJSON(w, 200, map[string]any{"initialized": false, "user": nil})
			return
		}
		if err != nil {
			internalError(w, err)
			return
		}
		valid, err := a.validSession(r)
		if err != nil {
			internalError(w, err)
			return
		}
		var user any
		if valid {
			user = map[string]string{"username": admin.Username}
		}
		writeJSON(w, 200, map[string]any{"initialized": true, "user": user})
	})
	r.Post("/auth/setup", func(w http.ResponseWriter, r *http.Request) { a.signIn(w, r, true) })
	r.Post("/auth/login", func(w http.ResponseWriter, r *http.Request) { a.signIn(w, r, false) })
	r.Post("/auth/logout", func(w http.ResponseWriter, r *http.Request) {
		if c, err := r.Cookie(cookieName); err == nil {
			if err := a.store.DeleteSession(r.Context(), auth.TokenHash(c.Value)); err != nil {
				internalError(w, err)
				return
			}
		}
		http.SetCookie(w, &http.Cookie{
			Name:     cookieName,
			Path:     "/",
			HttpOnly: true,
			Secure:   a.isSecureRequest(r),
			SameSite: http.SameSiteStrictMode,
			MaxAge:   -1,
		})
		writeJSON(w, 200, map[string]bool{"ok": true})
	})
}

func (a *authHandler) signIn(w http.ResponseWriter, r *http.Request, setup bool) {
	var input struct {
		Username string `json:"username"`
		Password string `json:"password"`
	}
	if !decodeJSON(w, r, &input) {
		return
	}
	// Single-admin global cooldown also bounds concurrent Argon2 memory use.
	a.mu.Lock()
	defer a.mu.Unlock()
	if time.Now().Before(a.resetAt) && a.failures >= 5 {
		w.Header().Set("Retry-After", "60")
		writeError(w, 429, "rate_limited", "尝试次数过多，请在 60 秒后重试")
		return
	}
	if time.Now().After(a.resetAt) {
		a.failures = 0
	}
	admin, err := a.store.Administrator(r.Context())
	if err != nil && !errors.Is(err, storage.ErrNotFound) {
		internalError(w, err)
		return
	}
	if setup && err == nil {
		writeError(w, 409, "initialized", "平台已初始化，请登录")
		return
	}
	if setup {
		if err := ValidateCredentials(input.Username, input.Password); err != nil {
			writeError(w, 400, "invalid_credentials", err.Error())
			return
		}
	}
	if !setup {
		valid := false
		if err == nil && len(input.Password) <= 256 {
			valid = auth.VerifyPassword(input.Password, admin.PasswordHash)
		}
		if !valid || input.Username != admin.Username {
			a.failures++
			a.resetAt = time.Now().Add(time.Minute)
			writeError(w, 401, "invalid_credentials", "用户名或密码不正确")
			return
		}
	}
	token := rand.Text()
	expires := time.Now().Add(sessionAge).Unix()
	if setup {
		err = a.store.Setup(r.Context(), input.Username, auth.HashPassword(input.Password), auth.TokenHash(token), expires)
	} else {
		err = a.store.CreateSession(r.Context(), auth.TokenHash(token), expires)
	}
	if err != nil {
		internalError(w, err)
		return
	}
	a.failures = 0
	a.setSessionCookie(w, r, token)
	status := 200
	if setup {
		status = 201
	}
	writeJSON(w, status, map[string]any{"initialized": true, "user": map[string]string{"username": input.Username}})
}
