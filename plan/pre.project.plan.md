#higginsrob/worktree

Today we are going to plan a new project from scratch called worktree.  We worked on a similar project at @~/Github/higginsrob/vim/.  Worktree will be a TUI that configures tmux and vim to work together as an IDE.  The main goal of worktree is the ability to quickly spawn a git worktree encapsulated inside a docker container for isolation, and use the tmux status bar to monitor and control the workspace.  Unlike the previous higginsrob/vim project, we will remove any of our local AI features (speak, ollama, omnivoice, our ai chat) and only concentrate on the git worktree/devcontainer isolation aspect.  Another difference is that tmux will be inside the docker dev container, not outside of it.  The tmux statusline will simplify down to just TMUX management features (remove ollama, omnivoice etc..).  The users git credentials stay out of the container, and instead we will have commands that we run from the host machine to sync the project volume back to the host machine using worktrees, so we can manintain multiple versions of the project simultainiously.  We will also need commands to monitor and manage our workpsaces, and clean up drive space.  

- We will use read-only docker containers with tmpfs, project volumes, and a home volume as our development/agent environment
- The user will be able to install global tools into their home folder docker volume (claude-code, open-code, pi, codex, copilot etc.., but they have no access to modify the container system files or any other docker project voluemes.  This devcontainer will NOT have priviliged docker execution rights and we must be careful to fully isolate this developmeent environment from it's host and from any other running projects.
- Our devcontainers will all contain:
  - node.js
  - bun
  - tmux
  - vim
  - python3
  - uv
  - ollama
  - build essential
  - zsh
  - oh-my-zsh
  - fzf
  - ripgrep
  - rsync
  - unzip
  - jq
  - 


  this will be distributed as an open source CLI, installed through npm.

  Ask me lots of questions, lock in decisions, then generate a ./plan/project.plan.md file that will function as the build plan
