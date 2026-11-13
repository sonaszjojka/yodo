package server

import (
	"crypto/rand"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"net/http"
	"strings"
	"sync"
	"time"
)

const (
	sessionCookie = "yodo_session"
	// rememberFor is how long "Remember this browser" keeps a login, in the
	// cookie and on the server. Without it the cookie lasts until the browser
	// closes, and the server forgets the login after sessionFor at the latest.
	rememberFor = 30 * 24 * time.Hour
	sessionFor  = 12 * time.Hour
	// maxFailures wrong passwords within failureWindow lock logins for the
	// rest of the window (online guessing).
	maxFailures   = 10
	failureWindow = time.Minute
	maxLoginBody  = 4 << 10
)

// Auth is the optional password protection (ADR 0020). A nil Auth, or one
// built from an empty password, protects nothing. Sessions live in memory, so
// a restart asks everyone for the password again; that spares a migration for
// a single-user server.
type Auth struct {
	passwordHash [sha256.Size]byte
	enabled      bool
	now          func() time.Time

	mu       sync.Mutex
	sessions map[string]time.Time // token -> expiry
	failures []time.Time          // wrong passwords inside failureWindow
}

// NewAuth builds the protection for YODO_PASSWORD; an empty password turns it
// off. now is the clock (time.Now when nil).
func NewAuth(password string, now func() time.Time) *Auth {
	if now == nil {
		now = time.Now
	}
	return &Auth{
		passwordHash: sha256.Sum256([]byte(password)),
		enabled:      password != "",
		now:          now,
		sessions:     map[string]time.Time{},
	}
}

// Enabled reports whether a password is required.
func (a *Auth) Enabled() bool { return a != nil && a.enabled }

// passwordMatches compares digests, so the comparison time does not depend on
// how much of the password was right.
func (a *Auth) passwordMatches(password string) bool {
	got := sha256.Sum256([]byte(password))
	return subtle.ConstantTimeCompare(got[:], a.passwordHash[:]) == 1
}

// attempt checks a password. throttled means too many recent failures: the
// password is not even looked at, so guessing gains nothing while locked.
func (a *Auth) attempt(password string) (ok, throttled bool) {
	a.mu.Lock()
	defer a.mu.Unlock()
	now := a.now()
	recent := a.failures[:0]
	for _, t := range a.failures {
		if now.Sub(t) < failureWindow {
			recent = append(recent, t)
		}
	}
	a.failures = recent
	if len(a.failures) >= maxFailures {
		return false, true
	}
	if a.passwordMatches(password) {
		return true, false
	}
	a.failures = append(a.failures, now)
	return false, false
}

// startSession stores a new login and returns its token.
func (a *Auth) startSession(lifetime time.Duration) string {
	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		panic("server: no randomness: " + err.Error()) // crypto/rand does not fail on supported platforms
	}
	token := base64.RawURLEncoding.EncodeToString(buf)
	a.mu.Lock()
	defer a.mu.Unlock()
	now := a.now()
	for t, expires := range a.sessions {
		if !expires.After(now) {
			delete(a.sessions, t)
		}
	}
	a.sessions[token] = now.Add(lifetime)
	return token
}

func (a *Auth) validSession(r *http.Request) bool {
	c, err := r.Cookie(sessionCookie)
	if err != nil {
		return false
	}
	a.mu.Lock()
	defer a.mu.Unlock()
	expires, ok := a.sessions[c.Value]
	return ok && expires.After(a.now())
}

func (a *Auth) endSession(r *http.Request) {
	if c, err := r.Cookie(sessionCookie); err == nil {
		a.mu.Lock()
		delete(a.sessions, c.Value)
		a.mu.Unlock()
	}
}

// register adds the session routes. They stay public so the password screen
// can ask whether a password is needed and send it.
func (a *Auth) register(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/session", a.state)
	mux.HandleFunc("POST /api/session", a.login)
	mux.HandleFunc("DELETE /api/session", a.logout)
}

func (a *Auth) state(w http.ResponseWriter, r *http.Request) {
	enabled := a.Enabled()
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	_ = json.NewEncoder(w).Encode(struct {
		PasswordRequired bool `json:"passwordRequired"`
		Unlocked         bool `json:"unlocked"`
	}{enabled, !enabled || a.validSession(r)})
}

func (a *Auth) login(w http.ResponseWriter, r *http.Request) {
	if !a.Enabled() {
		w.WriteHeader(http.StatusNoContent)
		return
	}
	var body struct {
		Password string `json:"password"`
		Remember bool   `json:"remember"`
	}
	if err := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxLoginBody)).Decode(&body); err != nil {
		http.Error(w, "expected {\"password\": string, \"remember\": bool}", http.StatusBadRequest)
		return
	}
	ok, throttled := a.attempt(body.Password)
	switch {
	case throttled:
		w.Header().Set("Retry-After", "60")
		http.Error(w, "too many wrong passwords, wait a minute", http.StatusTooManyRequests)
		return
	case !ok:
		http.Error(w, "wrong password", http.StatusUnauthorized)
		return
	}
	lifetime := sessionFor
	cookie := &http.Cookie{
		Name:     sessionCookie,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteStrictMode,
		// The Origin is present and allowed on a POST (ADR 0020).
		Secure: strings.HasPrefix(r.Header.Get("Origin"), "https://"),
	}
	if body.Remember {
		lifetime = rememberFor
		cookie.MaxAge = int(rememberFor / time.Second)
	}
	cookie.Value = a.startSession(lifetime)
	http.SetCookie(w, cookie)
	w.WriteHeader(http.StatusNoContent)
}

func (a *Auth) logout(w http.ResponseWriter, r *http.Request) {
	if a.Enabled() {
		a.endSession(r)
		http.SetCookie(w, &http.Cookie{
			Name:     sessionCookie,
			Path:     "/",
			MaxAge:   -1,
			HttpOnly: true,
			SameSite: http.SameSiteStrictMode,
			// Same attributes as the login cookie, so the browser replaces it.
			Secure: strings.HasPrefix(r.Header.Get("Origin"), "https://"),
		})
	}
	w.WriteHeader(http.StatusNoContent)
}

// requireSession locks every /api route but health and the session routes
// behind a login. The static app stays open: it has to load to show the
// password screen.
func (a *Auth) requireSession(next http.Handler) http.Handler {
	if !a.Enabled() {
		return next
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		p := r.URL.Path
		open := p == "/api/health" || p == "/api/session" || !strings.HasPrefix(p, "/api/") ||
			authenticatedByToken(r) // ADR 0063
		if !open && !a.validSession(r) {
			http.Error(w, "unauthorized: password required", http.StatusUnauthorized)
			return
		}
		next.ServeHTTP(w, r)
	})
}
