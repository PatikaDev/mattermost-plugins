# Ensure that go is installed. Note that this is independent of whether or not a server is being
# built, since the build script itself uses go.
ifeq ($(GO),)
    $(error "go is not available: see https://golang.org/doc/install")
endif

# Gather build variables to inject into the manifest tool
BUILD_HASH_SHORT = $(shell git rev-parse --short HEAD)
# In the PatikaDev/mattermost-plugins monorepo each plugin's tags carry its folder name
# (e.g. quick-create/v1.2.0); match only ours and strip the prefix so versions stay plain.
TAG_PREFIX ?= $(notdir $(CURDIR))
BUILD_TAG_LATEST = $(patsubst $(TAG_PREFIX)/%,%,$(shell git describe --tags --match '$(TAG_PREFIX)/v*' --abbrev=0 2>/dev/null))
BUILD_TAG_CURRENT = $(patsubst $(TAG_PREFIX)/%,%,$(shell git tag --points-at HEAD --list '$(TAG_PREFIX)/v*'))
RELEASE_NOTES_BASE = https://github.com/PatikaDev/mattermost-plugins/releases/tag/$(TAG_PREFIX)

# Ensure that the build tools are compiled. Go's caching makes this quick.
$(shell mkdir -p build/bin && cd $(BUILD_ROOT)/manifest && $(GO) build -ldflags '-X "main.BuildHashShort=$(BUILD_HASH_SHORT)" -X "main.BuildTagLatest=$(BUILD_TAG_LATEST)" -X "main.BuildTagCurrent=$(BUILD_TAG_CURRENT)" -X "main.ReleaseNotesBase=$(RELEASE_NOTES_BASE)"' -o $(CURDIR)/build/bin/manifest)

# Ensure that the deployment tools are compiled. Go's caching makes this quick.
$(shell cd $(BUILD_ROOT)/pluginctl && $(GO) build -o $(CURDIR)/build/bin/pluginctl)

# Extract the plugin id from the manifest.
PLUGIN_ID ?= $(shell build/bin/manifest id)
ifeq ($(PLUGIN_ID),)
    $(error "Cannot parse id from $(MANIFEST_FILE)")
endif

# Extract the plugin version from the manifest.
PLUGIN_VERSION ?= $(shell build/bin/manifest version)
ifeq ($(PLUGIN_VERSION),)
    $(error "Cannot parse version from $(MANIFEST_FILE)")
endif

# Determine if a server is defined in the manifest.
HAS_SERVER ?= $(shell build/bin/manifest has_server)

# Determine if a webapp is defined in the manifest.
HAS_WEBAPP ?= $(shell build/bin/manifest has_webapp)

# Determine if a /public folder is in use
HAS_PUBLIC ?= $(wildcard public/.)

# Determine if the mattermost-utilities repo is present
HAS_MM_UTILITIES ?= $(wildcard $(MM_UTILITIES_DIR)/.)

# Store the current path for later use
PWD ?= $(shell pwd)

# Ensure that npm (and thus node) is installed.
ifneq ($(HAS_WEBAPP),)
ifeq ($(NPM),)
    $(error "npm is not available: see https://www.npmjs.com/get-npm")
endif
endif
