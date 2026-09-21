# wkt shell aliases (POSIX-ish; works in bash and zsh).
# Sourced system-wide in the sandbox image (from zshrc) and installed on a host
# by `wkt provision`.

# Navigation / listing
alias ..='cd ..'
alias ...='cd ../..'
alias ll='ls -lah'
alias la='ls -A'

# git
alias g='git'
alias gs='git status -sb'
alias gd='git diff'
alias gds='git diff --staged'
alias ga='git add'
alias gaa='git add -A'
alias gc='git commit'
alias gcm='git commit -m'
alias gco='git checkout'
alias gb='git branch'
alias gl='git log --oneline --graph --decorate -20'
alias gp='git push'
alias gpl='git pull --ff-only'

# wkt
alias w='wkt'
alias wl='wkt list'
alias wo='wkt open'

# tmux / vim
alias ta='tmux attach -t'
alias tl='tmux list-sessions'
alias v='vim'
