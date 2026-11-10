package server

import (
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"slices"
	"strings"
)

// DefaultAllowedOrigins match the documented run command, which publishes the
// port on 127.0.0.1:8080 (ADR 0020).
const DefaultAllowedOrigins = "http://localhost:8080,http://127.0.0.1:8080"

// AllowedOrigins is a validated set of origins the server accepts requests
// for. Build it with ParseAllowedOrigins; the zero value allows nothing.
type AllowedOrigins struct {
	list    []string        // canonical origins, in the order given
	origins map[string]bool // canonical origins
	hosts   map[string]bool // accepted Host header values
}

// ParseAllowedOrigins parses YODO_ALLOWED_ORIGINS: a comma-separated list of
// origins such as "http://yodo.home:8080". An empty list means
// DefaultAllowedOrigins.
func ParseAllowedOrigins(s string) (AllowedOrigins, error) {
	if strings.TrimSpace(strings.ReplaceAll(s, ",", "")) == "" {
		s = DefaultAllowedOrigins
	}
	a := AllowedOrigins{origins: map[string]bool{}, hosts: map[string]bool{}}
	for raw := range strings.SplitSeq(s, ",") {
		raw = strings.TrimSpace(raw)
		if raw == "" {
			continue
		}
		u, err := parseOrigin(raw)
		if err != nil {
			return AllowedOrigins{}, fmt.Errorf("YODO_ALLOWED_ORIGINS: %q: %w", raw, err)
		}
		o := u.Scheme + "://" + u.Host
		a.list = append(a.list, o)
		a.origins[o] = true
		a.hosts[u.Host] = true
		// Clients may spell out the default port in Host ("yodo.home:80").
		if u.Port() == "" {
			a.hosts[u.Host+":"+defaultPort[u.Scheme]] = true
		}
	}
	return a, nil
}

// List returns the canonical origins, for logging.
func (a AllowedOrigins) List() []string { return slices.Clone(a.list) }

var defaultPort = map[string]string{"http": "80", "https": "443"}

// parseOrigin parses a plain http(s) origin and returns it in canonical form:
// lowercase, and without the port when it is the scheme's default.
func parseOrigin(raw string) (*url.URL, error) {
	u, err := url.Parse(raw)
	if err != nil {
		return nil, err
	}
	u.Scheme = strings.ToLower(u.Scheme)
	if defaultPort[u.Scheme] == "" {
		return nil, fmt.Errorf("scheme must be http or https")
	}
	if u.Hostname() == "" {
		return nil, fmt.Errorf("missing host")
	}
	// url.Parse accepts "host:" and Port() then returns "", so check the raw
	// host: no browser sends an empty port, so the origin could never match.
	if strings.HasSuffix(u.Host, ":") {
		return nil, fmt.Errorf("empty port")
	}
	if u.User != nil || u.Opaque != "" || (u.Path != "" && u.Path != "/") ||
		u.RawQuery != "" || u.ForceQuery || u.Fragment != "" {
		return nil, fmt.Errorf("must be scheme://host[:port] only")
	}
	u.Host = strings.ToLower(u.Host)
	if p := u.Port(); p == defaultPort[u.Scheme] {
		u.Host = strings.TrimSuffix(u.Host, ":"+p)
	}
	return u, nil
}

// maxLoggedLen bounds the client-controlled values a blocked request logs.
const maxLoggedLen = 100

// requireAllowedOrigin enforces ADR 0020 against CSRF, cross-site WebSocket
// hijacking and DNS rebinding:
//   - every request must be addressed (Host header) to an allowed origin's host;
//   - an Origin header, when present, must equal an allowed origin, whatever
//     the method;
//   - every method other than GET/HEAD must carry one. Browsers may omit Origin
//     on same-origin GETs, so only those may go without.
//
// A valid YODO_API_TOKEN bearer lifts only the last rule (ADR 0063). It is
// checked after Host and a present Origin, so a foreign page gets 403 before
// the token is looked at; a wrong bearer gets 401.
func requireAllowedOrigin(allowed AllowedOrigins, token APIToken, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		safe := r.Method == http.MethodGet || r.Method == http.MethodHead
		ok := allowed.hosts[strings.ToLower(r.Host)]
		if ok && origin != "" {
			u, err := parseOrigin(origin)
			ok = err == nil && allowed.origins[u.Scheme+"://"+u.Host]
		}
		if ok {
			switch token.check(r) {
			case tokenInvalid:
				w.Header().Set("WWW-Authenticate", "Bearer")
				http.Error(w, "unauthorized: invalid API token (see YODO_API_TOKEN)", http.StatusUnauthorized)
				return
			case tokenValid:
				r = withToken(r)
			case tokenNone:
				// Without a token, a state-changing request needs an Origin.
				ok = origin != "" || safe
			}
		}
		if !ok {
			slog.Warn("request blocked: host or origin not allowed",
				"method", truncate(r.Method), "host", truncate(r.Host), "origin", truncate(origin))
			http.Error(w, "forbidden: host or origin not allowed (see YODO_ALLOWED_ORIGINS)", http.StatusForbidden)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func truncate(s string) string {
	if len(s) <= maxLoggedLen {
		return s
	}
	return s[:maxLoggedLen] + "…"
}
