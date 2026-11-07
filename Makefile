.DEFAULT_GOAL := help

.PHONY: help fairplay build dev clean

help:
	@echo "Usage: make [target]"
	@echo "  fairplay : Download & verify Apple FairPlay libraries (for ALAC lossless)"
	@echo "  build    : Build complete Linux package (DRM + Go Engine + Electron AppImage)"
	@echo "  dev      : Launch local development instance"
	@echo "  clean    : Remove build artifacts"

fairplay:
	$(MAKE) -C drm android-stubs
	bash scripts/fetch-fairplay-libs.sh --dest drm/rootfs/system/lib64 --lock drm/fairplay-libs.lock --stubs drm/stubs/out

build: fairplay
	cd electron && npm install && npm run dist

dev:
	cd electron && bash build.sh

clean:
	bash scripts/clean.sh

