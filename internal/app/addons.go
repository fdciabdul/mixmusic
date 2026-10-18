package app

import (
	"context"
	"sync"
	"time"

	"github.com/egoist/mygo"

	"github.com/fzn0x/mixmusic/internal/addons"
)

// registryTTL is how long a fetched registry is reused.
const registryTTL = 10 * time.Minute

var registryCache struct {
	sync.Mutex
	url     string
	at      time.Time
	content addons.Registry
}

// Addons lists, installs and removes themes and plugins, and keeps what
// plugins store.
type Addons struct{ a *App }

// List returns the themes and plugins available, and those that could not
// load.
func (s *Addons) List() addons.Inventory { return s.a.addons.List() }

// Reload finds the add-ons again, after the user changed the add-ons
// folder, and tells every window.
func (s *Addons) Reload() addons.Inventory {
	inv := s.a.addons.List()
	AddonsChanged.Broadcast(inv)
	return inv
}

// Registry returns the community registry of themes and plugins.
func (s *Addons) Registry(ctx context.Context, refresh bool) (addons.Registry, error) {
	url := s.a.settings.Get().Clean().RegistryURL
	registryCache.Lock()
	defer registryCache.Unlock()
	if !refresh && registryCache.url == url && time.Since(registryCache.at) < registryTTL {
		return registryCache.content, nil
	}
	r, err := s.a.addons.FetchRegistry(ctx, url)
	if err != nil {
		return addons.Registry{}, err
	}
	registryCache.url, registryCache.at, registryCache.content = url, time.Now(), r
	return r, nil
}

// Install installs, or updates, an add-on of the community registry.
func (s *Addons) Install(ctx context.Context, kind addons.Kind, id string) (addons.Inventory, error) {
	r, err := s.Registry(ctx, false)
	if err != nil {
		return addons.Inventory{}, err
	}
	if err := s.a.addons.Install(ctx, r, kind, id); err != nil {
		return addons.Inventory{}, err
	}
	return s.Reload(), nil
}

// Uninstall removes an add-on the user installed.
func (s *Addons) Uninstall(kind addons.Kind, id string) (addons.Inventory, error) {
	if err := s.a.addons.Uninstall(kind, id); err != nil {
		return addons.Inventory{}, err
	}
	return s.Reload(), nil
}

// OpenFolder opens the folder of the user's add-ons of a kind, where they
// can put add-ons they make.
func (s *Addons) OpenFolder(kind addons.Kind) error {
	dir, err := s.a.addons.FolderOf(kind)
	if err != nil {
		return err
	}
	return mygo.Shell.OpenPath(dir)
}

// Storage returns every value a plugin keeps.
func (s *Addons) Storage(plugin string) (map[string]string, error) { return s.a.storage.All(plugin) }

// StorageSet keeps a value of a plugin.
func (s *Addons) StorageSet(plugin, key, value string) error {
	return s.a.storage.Set(plugin, key, value)
}

// StorageDelete removes a value of a plugin.
func (s *Addons) StorageDelete(plugin, key string) error { return s.a.storage.Delete(plugin, key) }
