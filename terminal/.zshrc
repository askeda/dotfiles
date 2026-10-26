bindkey -v  # Enable vi mode

unset LAST_LOGIN

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

# kill process on given port
killport() {
  lsof -ti tcp:$1 | xargs kill -9
}

# list files after cd
chpwd() {
  ls
}

# save youtube audio to icloud podcasts
yt() {
  yt-dlp -f "bestaudio[ext=m4a]" -P "$HOME/Library/Mobile Documents/com~apple~CloudDocs/Podcasts" "${1%%&*}"
}

export PATH="$HOME/.t3/bin:$PATH"

eval "$(starship init zsh)"

source /opt/homebrew/share/zsh-autosuggestions/zsh-autosuggestions.zsh