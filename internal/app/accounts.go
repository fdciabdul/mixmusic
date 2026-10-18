package app

import (
	"context"
	"encoding/json"
	"errors"
	"os"
	"time"

	"github.com/egoist/mygo"

	"github.com/fzn0x/mixmusic/internal/spotify"
	"github.com/fzn0x/mixmusic/internal/store"
)

// loginTimeout is how long signing in waits for the user in the browser.
const loginTimeout = 5 * time.Minute

// tokenSecret is the key of the Spotify token in the system's credential
// store.
const tokenSecret = "spotify-token"

// tokenStore keeps the Spotify token in the system's credential store, or
// in a file readable by the user alone where there is none.
type tokenStore struct{ file string }

func (s tokenStore) Load() (spotify.Token, error) {
	data, err := mygo.Secrets.Get(tokenSecret)
	if errors.Is(err, errors.ErrUnsupported) || errors.Is(err, mygo.ErrSecretNotFound) {
		data, err = os.ReadFile(s.file)
	}
	if err != nil {
		return spotify.Token{}, err
	}
	var t spotify.Token
	return t, json.Unmarshal(data, &t)
}

func (s tokenStore) Save(t spotify.Token) error {
	data, err := json.Marshal(t)
	if err != nil {
		return err
	}
	if err := mygo.Secrets.Set(tokenSecret, data); !errors.Is(err, errors.ErrUnsupported) {
		return err
	}
	if err := store.WriteFile(s.file, data); err != nil {
		return err
	}
	return os.Chmod(s.file, 0o600)
}

func (s tokenStore) Clear() error {
	err := mygo.Secrets.Delete(tokenSecret)
	if errors.Is(err, errors.ErrUnsupported) {
		err = nil
	}
	if rmErr := os.Remove(s.file); rmErr != nil && !errors.Is(rmErr, os.ErrNotExist) {
		err = errors.Join(err, rmErr)
	}
	return err
}

// SpotifyAccount is the state of the Spotify account.
type SpotifyAccount struct {
	// Configured is set once the user entered a Client ID.
	Configured bool             `json:"configured"`
	SignedIn   bool             `json:"signedIn"`
	Profile    *spotify.Profile `json:"profile"`
	// RedirectURI is what the user registers in the developer dashboard.
	RedirectURI string `json:"redirectUri"`
	// Error tells why the profile could not be read, if it could not.
	Error string `json:"error,omitempty"`
}

// AccountsStatus is the state of the user's accounts.
type AccountsStatus struct {
	Spotify SpotifyAccount `json:"spotify"`
}

// Accounts signs the user in and out of their music services.
type Accounts struct{ a *App }

// Status returns the state of the user's accounts.
func (s *Accounts) Status(ctx context.Context) AccountsStatus {
	return s.a.accountsStatus(ctx)
}

func (a *App) accountsStatus(ctx context.Context) AccountsStatus {
	sp := SpotifyAccount{
		Configured:  a.auth.ClientID() != "",
		SignedIn:    a.spotify.SignedIn(),
		RedirectURI: spotify.RedirectURI,
	}
	if sp.SignedIn {
		me, err := a.spotifyProfile(ctx)
		if err != nil {
			sp.Error = err.Error()
		} else {
			sp.Profile = &me
		}
	}
	return AccountsStatus{Spotify: sp}
}

// spotifyProfile returns the signed-in Spotify user, asking Spotify once.
func (a *App) spotifyProfile(ctx context.Context) (spotify.Profile, error) {
	a.mu.Lock()
	me := a.spotifyMe
	a.mu.Unlock()
	if me != nil {
		return *me, nil
	}
	p, err := a.spotify.Me(ctx)
	if err != nil {
		if errors.Is(err, spotify.ErrSignInExpired) {
			a.signOutSpotify()
		}
		return spotify.Profile{}, err
	}
	a.mu.Lock()
	a.spotifyMe = &p
	a.mu.Unlock()
	return p, nil
}

// spotifyUserID returns the ID of the signed-in Spotify user, or "".
func (a *App) spotifyUserID(ctx context.Context) string {
	if !a.spotify.SignedIn() {
		return ""
	}
	me, err := a.spotifyProfile(ctx)
	if err != nil {
		return ""
	}
	return me.ID
}

// SpotifyLogin signs the user in to Spotify in their browser, with the
// Client ID of Settings › Accounts.
func (s *Accounts) SpotifyLogin(ctx context.Context) (AccountsStatus, error) {
	ctx, cancel := context.WithTimeout(ctx, loginTimeout)
	defer cancel()
	t, err := s.a.auth.Login(ctx, mygo.Shell.OpenExternal)
	if err != nil {
		return AccountsStatus{}, err
	}
	s.a.spotify.SetToken(t)
	s.a.mu.Lock()
	s.a.spotifyMe = nil
	s.a.mu.Unlock()
	if err := s.a.tokens.Save(t); err != nil {
		return AccountsStatus{}, err
	}
	if w := mygo.CallerWindow(ctx); w != nil {
		w.Show() // back from the browser
	}
	status := s.a.accountsStatus(ctx)
	AccountsChanged.Broadcast(status)
	return status, nil
}

// SpotifyLogout signs the user out of Spotify.
func (s *Accounts) SpotifyLogout() error {
	return s.a.signOutSpotify()
}

func (a *App) signOutSpotify() error {
	a.spotify.SetToken(spotify.Token{})
	a.mu.Lock()
	a.spotifyMe = nil
	a.mu.Unlock()
	err := a.tokens.Clear()
	AccountsChanged.Broadcast(AccountsStatus{Spotify: SpotifyAccount{
		Configured:  a.auth.ClientID() != "",
		RedirectURI: spotify.RedirectURI,
	}})
	return err
}
