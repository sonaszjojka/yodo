package server

import (
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
)

// defaultAllowedOrigins match the documented run command, which publishes the
// port on 127.0.0.1:8080 (ADR 0008).
var defaultAllowedOrigins = []string{"http://localhost:8080", "http://127.0.0.1:8080"}

// ParseAllowedOrigins parses YODO_ALLOWED_ORIGINS: a comma-separated list of
// origins such as "http://yodo.home:8080". It returns the origins in canonical
// form (lowercase, no default port, no trailing slash), or the defaults when
// the list is empty.
func ParseAllowedOrigins(s string) ([]string, error) {
	var origins []string
	for raw := range strings.SplitSeq(s, ",") {
		raw = strings.TrimSpace(raw)
		if raw == "" {
			continue
		}
		o, err := normalizeOrigin(raw)
		if err != nil {
			return nil, fmt.Errorf("YODO_ALLOWED_ORIGINS: %q: %w", raw, err)
		}
		origins = append(origins, o)
	}
	if len(origins) == 0 {
		return defaultAllowedOrigins, nil
	}
	return origins, nil
}

// normalizeOrigin returns the canonical "scheme://host[:port]" form of an
// origin, or an error if raw is not a plain http(s) origin.
func normalizeOrigin(raw string) (string, error) {
	u, err := url.Parse(raw)
	if err != nil {
		return "", err
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return "", fmt.Errorf("scheme must be http or https")
	}
	if u.Host == "" {
		return "", fmt.Errorf("missing host")
	}
	if u.User != nil || u.Opaque != "" || (u.Path != "" && u.Path != "/") ||
		u.RawQuery != "" || u.ForceQuery || u.Fragment != "" {
		return "", fmt.Errorf("must be scheme://host[:port] only")
	}
	return u.Scheme + "://" + normalizeHost(u.Host), nil
}

// normalizeHost lowercases a host[:port] and drops a default port, so that
// "Yodo.Home:80" and "yodo.home" compare equal.
func normalizeHost(h string) string {
	h = strings.ToLower(h)
	for _, p := range []string{":80", ":443"} {
		h = strings.TrimSuffix(h, p)
	}
	return h
}

// requireAllowedOrigin enforces ADR 0008 against CSRF and DNS rebinding:
//   - every request must be addressed (Host header) to an allowed origin's host;
//   - every request other than GET/HEAD must carry an Origin header equal to an
//     allowed origin. Browsers may omit Origin on same-origin GETs, so safe
//     methods don't need it. Non-safe methods are denied by default, which is
//     stricter than the ADR's POST/PUT/PATCH/DELETE list.
func requireAllowedOrigin(allowed []string, next http.Handler) http.Handler {
	origins := make(map[string]bool, len(allowed))
	hosts := make(map[string]bool, len(allowed))
	for _, o := range allowed {
		origins[o] = true
		hosts[normalizeHost(strings.SplitN(o, "://", 2)[1])] = true
	}

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		ok := hosts[normalizeHost(r.Host)]
		if ok && r.Method != http.MethodGet && r.Method != http.MethodHead {
			o, err := normalizeOrigin(origin)
			ok = err == nil && origins[o]
		}
		if !ok {
			slog.Warn("request blocked: host or origin not allowed",
				"method", r.Method, "host", r.Host, "origin", origin)
			http.Error(w, "forbidden: host or origin not allowed (see YODO_ALLOWED_ORIGINS)", http.StatusForbidden)
			return
		}
		next.ServeHTTP(w, r)
	})
}
