# higginsrob/worktree:latest — locked-down devcontainer image.
# PID 1 is `sleep infinity`; all interaction happens via `docker exec -it <container> tmux ...`.

FROM ubuntu:24.04

# Lets `wkt clean` scope dangling-image pruning to layers this tool built,
# never unrelated images on the host (labels survive after a layer goes
# dangling/untagged, unlike the image's repo:tag).
LABEL dev.wkt.image="true"

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

# vim plugins, baked in at build time (vim8 native package loading — no
# plugin manager, no runtime network access needed inside the read-only
# container).
RUN mkdir -p /usr/share/vim/vimfiles/pack/plugins/start \
    && for repo in \
         tpope/vim-fugitive \
         tpope/vim-commentary \
         junegunn/fzf \
         junegunn/fzf.vim \
         pangloss/vim-javascript \
         HerringtonDarkholme/yats.vim \
         MaxMEllon/vim-jsx-pretty \
         preservim/vim-markdown \
         stephpy/vim-yaml \
         cespare/vim-toml \
         christoomey/vim-tmux-navigator \
         ghifarit53/tokyonight-vim \
       ; do \
         name=$(basename "$repo"); \
         git clone --depth 1 "https://github.com/${repo}" \
           "/usr/share/vim/vimfiles/pack/plugins/start/${name}"; \
       done

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

# OSC 52 clipboard passthrough + tmux statusline/keybinding helper scripts.
COPY bin/osc52-copy bin/wkt-git-badge bin/wkt-sandbox-badge bin/wkt-workspace-badge bin/wkt-status-click bin/wkt-doublec-check bin/wkt-detach-check bin/wkt-git-menu bin/wkt-git-run bin/wkt-workspace-menu /usr/local/bin/
RUN chmod +x /usr/local/bin/osc52-copy /usr/local/bin/wkt-git-badge /usr/local/bin/wkt-sandbox-badge /usr/local/bin/wkt-workspace-badge \
      /usr/local/bin/wkt-status-click /usr/local/bin/wkt-doublec-check /usr/local/bin/wkt-detach-check \
      /usr/local/bin/wkt-git-menu /usr/local/bin/wkt-git-run /usr/local/bin/wkt-workspace-menu

# System-wide config defaults — independent of the shared home volume's state.
COPY tmux.conf /etc/tmux.conf
COPY vimrc /etc/vim/vimrc.local
COPY zshrc /etc/zsh/zshrc.local
COPY aliases.sh /etc/wkt/aliases.sh
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
