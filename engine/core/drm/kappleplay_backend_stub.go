//go:build (!kappleplay_backend && !adamplay_backend) || !(linux || windows)

package drm

// KappleplayBackend returns nil when the kappleplay_backend build tag is absent
// (i.e. the binary was built without CGO DRM support). This stub prevents
// apiserver.go from failing to compile when the tag is not set.
func KappleplayBackend(drmDir string) DRMBackend {
	return nil
}

// AdamplayBackend is an alias for backwards compatibility.
func AdamplayBackend(drmDir string) DRMBackend {
	return KappleplayBackend(drmDir)
}
