IMAGE := higginsrob/worktree:latest

.PHONY: build-image
build-image:
	docker build -t $(IMAGE) -f docker/Dockerfile docker

.PHONY: run
run:
	docker run --rm -it \
		--read-only --tmpfs /tmp --tmpfs /var/tmp \
		--security-opt no-new-privileges \
		$(IMAGE) tmux new-session -A -s main
