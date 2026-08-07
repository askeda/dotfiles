# [homebrew]
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
eval "$(/opt/homebrew/bin/brew shellenv)"

# [pnpm]
brew install pnpm

# [node]
brew install node

# [font]
brew install --cask font-dejavu-sans-mono-nerd-font

# [zsh]
brew install zsh-autosuggestions
cp ./terminal/.zshrc ~/.zshrc

# [starship]
brew install starship
mkdir -p ~/.config
cp ./terminal/starship.toml ~/.config/starship.toml

# [kitty]
brew install --cask kitty
mkdir -p ~/.config/kitty
cp ./terminal/kitty/kitty.conf ~/.config/kitty/kitty.conf
cp ./terminal/kitty/current-theme.conf ~/.config/kitty/current-theme.conf

# [tmux]
brew install tmux
[ -d ~/.tmux/plugins/tpm ] || git clone https://github.com/tmux-plugins/tpm ~/.tmux/plugins/tpm
cp ./terminal/tmux.conf ~/.tmux.conf
~/.tmux/plugins/tpm/bin/install_plugins

# [vim]
cp ./terminal/vimrc ~/.vimrc

# [vscode]
brew install --cask visual-studio-code
mkdir -p "$HOME/Library/Application Support/Code/User"
cp ./.vscode/settings.json "$HOME/Library/Application Support/Code/User/settings.json"
cp ./.vscode/keybindings.json "$HOME/Library/Application Support/Code/User/keybindings.json"
jq -r '.recommendations[]' ./.vscode/extensions.json | xargs -n1 code --install-extension

# [macos]
bash ./macos/defaults.sh

# [wallpaper]
brew install wallpaper
cp ./wallpapers/default.jpg ~/Pictures/default.jpg
wallpaper set ~/Pictures/default.jpg

# [raycast]
brew install --cask raycast

# [docker]
brew install --cask docker-desktop

# [karabiner-elements]
brew install --cask karabiner-elements

# [ai]
brew install --cask claude-code
mkdir -p ~/.claude
cp ./claude/CLAUDE.md ~/.claude/CLAUDE.md

# [apps]
brew install --cask figma
brew install --cask postman
brew install --cask spotify
brew install --cask brave-browser
brew install --cask obsidian
brew install --cask shottr

# [git & ssh]
brew install gh
read -rp "git user.name: " GIT_NAME
read -rp "git user.email: " GIT_EMAIL
git config --global user.name "$GIT_NAME"
git config --global user.email "$GIT_EMAIL"

mkdir -p ~/.ssh
chmod 700 ~/.ssh
ssh-keygen -t ed25519 -C "$GIT_EMAIL" -f ~/.ssh/id_ed25519
cat >> ~/.ssh/config <<'EOF'
Host github.com
  AddKeysToAgent yes
  UseKeychain yes
  IdentityFile ~/.ssh/id_ed25519
EOF
chmod 600 ~/.ssh/config
ssh-add --apple-use-keychain ~/.ssh/id_ed25519

gh auth login --git-protocol ssh --web

git config --global --list
ssh -T git@github.com || true
gh auth status
