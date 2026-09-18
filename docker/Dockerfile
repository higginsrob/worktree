# higginsrob/worktree:latest — locked-down devcontainer image.
# PID 1 is `sleep infinity`; all interaction happens via `docker exec -it <container> tmux ...`.

FROM ubuntu:24.04

ARG NODE_MAJOR=22
ARG USERNAME=dev
ARG USER_UID=1000
ARG USER_GID=1000

ENV DEBIAN_FRONTEND=noninteractive \
    LANG=en_US.UTF-8 \
    LANGUAGE=en_US:en \
    LC_ALL=en_US.UTF-8 \
    NPM_CONFIG_DANGEROUSLY_ALLOW_ALL_SCRIPTS=true

# Base utilities + toolchain packages (see docs for the full list / rationale).
RUN apt-get update && apt-get install -y --no-install-recommends \
      build-essential \
      ca-certificates \
      curl \
      file \
      fzf \
      git \
      gnupg \
      jq \
      less \
      locales \
      python3 \
      python3-pip \
      python3-venv \
      ripgrep \
      rsync \
      tmux \
      unzip \
      vim-nox \
      zsh \
      zstd \
    && locale-gen en_US.UTF-8 \
    && update-locale LANG=en_US.UTF-8 \
    && rm -rf /var/lib/apt/lists/*

# Node.js (NodeSource) + npm.
RUN curl -fsSL https://deb.nodesource.com/setup_${NODE_MAJOR}.x | bash - \
    && apt-get install -y --no-install-recommends nodejs \
    && rm -rf /var/lib/apt/lists/*

# bun (system-wide, not under any user's $HOME).
ENV BUN_INSTALL=/usr/local
RUN curl -fsSL https://bun.sh/install | bash

# uv (astral, system-wide).
RUN curl -LsSf https://astral.sh/uv/install.sh | env UV_INSTALL_DIR=/usr/local/bin sh

# ollama — runtime binary only, no wrapper/integration (see project plan decision #2).
RUN curl -fsSL https://ollama.com/install.sh | sh

# vim-fugitive, baked in at build time (vim8 native package loading).
RUN mkdir -p /usr/share/vim/vimfiles/pack/plugins/start \
    && git clone --depth 1 https://github.com/tpope/vim-fugitive \
         /usr/share/vim/vimfiles/pack/plugins/start/vim-fugitive

# oh-my-zsh installed system-wide so it works regardless of the shared,
# possibly-empty wkt-home volume mounted at $HOME.
ENV ZSH=/opt/oh-my-zsh \
    ZSH_CACHE_DIR=/tmp/oh-my-zsh-cache
# The installer respects $ZSH (already set above), so it clones straight to
# /opt/oh-my-zsh instead of the default ~/.oh-my-zsh.
RUN sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)" "" \
      --unattended --keep-zshrc \
    && rm -f /root/.zshrc \
    && chmod -R go+rX ${ZSH}

# OSC 52 clipboard passthrough helper (wiring into tmux/vim comes in milestone 6).
COPY bin/osc52-copy /usr/local/bin/osc52-copy
RUN chmod +x /usr/local/bin/osc52-copy

# System-wide config defaults — independent of the shared home volume's state.
COPY tmux.conf /etc/tmux.conf
COPY vimrc /etc/vim/vimrc.local
COPY zshrc /etc/zsh/zshrc.local
RUN echo '[ -f /etc/zsh/zshrc.local ] && source /etc/zsh/zshrc.local' >> /etc/zsh/zshrc

# Unprivileged, non-root user. The wkt-home volume mounts at $HOME; the
# project volume mounts under /workspace at `docker run` time.
# Ubuntu's base image ships a preexisting "ubuntu" user/group at 1000:1000 —
# remove it so our uid/gid isn't already taken.
RUN userdel -r ubuntu 2>/dev/null || true \
    && groupdel ubuntu 2>/dev/null || true \
    && groupadd --gid ${USER_GID} ${USERNAME} \
    && useradd --uid ${USER_UID} --gid ${USER_GID} --create-home --shell /usr/bin/zsh ${USERNAME} \
    && mkdir -p /workspace \
    && chown ${USERNAME}:${USERNAME} /workspace \
    # An empty ~/.zshrc suppresses zsh's interactive "new user" setup wizard;
    # actual config lives in /etc/zsh/zshrc.local, sourced globally. This file
    # (like .bashrc/.profile) seeds onto the wkt-home volume on first mount.
    && touch /home/${USERNAME}/.zshrc \
    && chown ${USERNAME}:${USERNAME} /home/${USERNAME}/.zshrc

# npm globals land on the shared home volume, not the read-only image.
ENV NPM_CONFIG_PREFIX=/home/${USERNAME}/.npm-global \
    PATH=/home/${USERNAME}/.npm-global/bin:${PATH}

USER ${USERNAME}
WORKDIR /home/${USERNAME}

CMD ["sleep", "infinity"]
