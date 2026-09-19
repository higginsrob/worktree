IMAGE := higginsrob/worktree:latest

.PHONY: help
help:
	@echo "Targets:"
	@echo "  install       npm install"
	@echo "  build         compile TypeScript (tsc) -> dist/"
	@echo "  watch         tsc --watch"
	@echo "  lint          eslint ."
	@echo "  format        prettier --write ."
	@echo "  format-check  prettier --check ."
	@echo "  check         build + lint + format-check"
	@echo "  clean         remove dist/"
	@echo "  clean-all     clean + remove node_modules/"
	@echo "  build-image   docker build higginsrob/worktree:latest from docker/Dockerfile"
	@echo "  run           run the image standalone (--read-only, tmpfs, no-new-privileges)"
	@echo "  pack          npm pack (writes a .tgz tarball for local inspection)"
	@echo "  publish-dry   npm publish --dry-run"
	@echo "  publish       npm publish (real, public, needs npm login)"
	@echo "  docker-push   docker push higginsrob/worktree:latest (needs docker login)"

.PHONY: install
install:
	npm install

.PHONY: build
build:
	npm run build

.PHONY: watch
watch:
	npm run dev

.PHONY: lint
lint:
	npm run lint

.PHONY: format
format:
	npm run format

.PHONY: format-check
format-check:
	npx prettier --check .

.PHONY: check
check: build lint format-check

.PHONY: clean
clean:
	rm -rf dist

.PHONY: clean-all
clean-all: clean
	rm -rf node_modules

.PHONY: build-image
build-image:
	docker build -t $(IMAGE) -f docker/Dockerfile docker

.PHONY: run
run:
	docker run --rm -it \
		--read-only --tmpfs /tmp --tmpfs /var/tmp \
		--security-opt no-new-privileges \
		-e WKT_VIMRC=/etc/vim/vimrc.local \
		$(IMAGE) tmux new-session -A -s main

.PHONY: pack
pack:
	npm pack

.PHONY: publish-dry
publish-dry:
	npm publish --dry-run

.PHONY: publish
publish:
	npm publish

.PHONY: docker-push
docker-push:
	docker push $(IMAGE)
