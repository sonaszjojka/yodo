package server

import (
	"context"
	"crypto/sha256"
	"crypto/subtle"
	"errors"
	"net/http"
	"regexp"
	"strings"
)

// minTokenLen keeps YODO_API_TOKEN out of online-guessing range, so bad
// tokens need no throttle (ADR 0063).
const minTokenLen = 32

// token68 is the RFC 6750 bearer token syntax.
var token68 = regexp.MustCompile(`^[A-Za-z0-9\-._~+/]+=*$`)

// APIToken is the optional YODO_API_TOKEN for non-browser clients (ADR 0063).
// Build it with ParseAPIToken; the zero value is disabled.
type APIToken struct {
	hash    [32]byte
	enabled bool
}

// ParseAPIToken validates YODO_API_TOKEN; an empty value disables it. The
// error never contains the value, so it can't leak into logs.
func ParseAPIToken(s string) (APIToken, error) {
	if s == "" {
		return APIToken{}, nil
	}
	if len(s) < minTokenLen || !token68.MatchString(s) {
		return APIToken{}, errors.New("YODO_API_TOKEN must be at least 32 characters of A-Z a-z 0-9 - . _ ~ + / (optionally ending in =); try `openssl rand -hex 32`")
	}
	return APIToken{hash: sha256.Sum256([]byte(s)), enabled: true}, nil
}

// Enabled reports whether a token is configured.
func (t APIToken) Enabled() bool { return t.enabled }

type tokenResult int

const (
	tokenNone    tokenResult = iota // no token configured, or no Bearer credentials
	tokenValid                      // Bearer credentials match the token
	tokenInvalid                    // Bearer credentials that don't match
)

// check reads the request's Bearer credentials. Other schemes (such as Basic
// from a reverse proxy) are not ours, so they count as none.
func (t APIToken) check(r *http.Request) tokenResult {
	if !t.enabled {
		return tokenNone
	}
	scheme, value, _ := strings.Cut(r.Header.Get("Authorization"), " ")
	if !strings.EqualFold(scheme, "Bearer") {
		return tokenNone
	}
	// Hashing first makes the compare constant-time in the length too.
	got := sha256.Sum256([]byte(strings.TrimSpace(value)))
	if subtle.ConstantTimeCompare(got[:], t.hash[:]) == 1 {
		return tokenValid
	}
	return tokenInvalid
}

type tokenKey struct{}

// withToken marks a request authenticated by the API token, for the checks
// further down the chain.
func withToken(r *http.Request) *http.Request {
	return r.WithContext(context.WithValue(r.Context(), tokenKey{}, true))
}

// authenticatedByToken reports whether requireAllowedOrigin accepted the
// request's API token.
func authenticatedByToken(r *http.Request) bool {
	ok, _ := r.Context().Value(tokenKey{}).(bool)
	return ok
}
