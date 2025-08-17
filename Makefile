UUID = music-scales@zenlinux.com

BUILD_DIR ?= build
BUNDLE_PATH = "$(BUILD_DIR)/$(UUID).zip"

.PHONY: build package lint clean install uninstall

build: clean
	@mkdir -p $(BUILD_DIR)
	$(MAKE) package

package:
	@zip $(BUNDLE_PATH) metadata.json extension.js

lint:
	prettier --write extension.js

clean:
	@rm -rfv $(BUILD_DIR)

install:
	@if [[ ! -f $(BUNDLE_PATH) ]]; then \
		$(MAKE) build; \
	fi
	gnome-extensions install $(BUNDLE_PATH) --force

uninstall:
	gnome-extensions uninstall "$(UUID)"
