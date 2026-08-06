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
cp ./terminal/.zshrc ~/.zshrc

# [starship]
brew install starship
mkdir -p ~/.config
cp ./terminal/starship.toml ~/.config/starship.toml

# [kitty]
brew install kitty
mkdir -p ~/.config/kitty
cp ./terminal/kitty/kitty.conf ~/.config/kitty/kitty.conf
cp ./terminal/kitty/current-theme.conf ~/.config/kitty/current-theme.conf

# [tmux]
brew install tmux
brew install tpm
cp ./terminal/tmux.conf ~/.tmux.conf

# [vim]
cp ./terminal/vimrc ~/.vimrc

# [vscode]
brew install --cask visual-studio-code
mkdir -p "$HOME/Library/Application Support/Code/User"
cp ./.vscode/settings.json "$HOME/Library/Application Support/Code/User/settings.json"
cp ./.vscode/keybindings.json "$HOME/Library/Application Support/Code/User/keybindings.json"

# [raycast]
brew install --cask raycast

# [docker]
brew install --cask docker

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
