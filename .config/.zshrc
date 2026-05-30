bindkey -v  # Enable vi mode

unset LAST_LOGIN

# NVM Configuration
export NVM_DIR="$HOME/.nvm"
[ -s "/opt/homebrew/opt/nvm/nvm.sh" ] && \. "/opt/homebrew/opt/nvm/nvm.sh"
[ -s "/opt/homebrew/opt/nvm/etc/bash_completion.d/nvm" ] && \. "/opt/homebrew/opt/nvm/etc/bash_completion.d/nvm"

# ─────────────────────────────────────────────────────
# ── aliases ──────────────────────────────────────────

# general
alias c="clear"
alias ll="ls -la"

# navigation
alias ..="cd .."
alias ...="cd ../.."
alias p="cd $HOME/Desktop/projects"
alias mindnest="cd $HOME/Desktop/projects/mindnest"

# pnpm
alias pi="pnpm install"
alias po="pnpm outdated"
alias dev="pnpm dev"

# git
alias gs="git status"
alias ga="git add ."
alias gc="git commit -m"
alias gl="git log --oneline --graph --decorate"

# ─────────────────────────────────────────────────────
# ── utils ──────────────────────────────────────────

killport() {
  lsof -ti tcp:$1 | xargs kill -9
}

chpwd() {
  ls
}

eval "$(starship init zsh)"
