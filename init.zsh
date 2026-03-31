# [homebrew]
/bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
source ~/.zshrc

# [pnpm]
brew install pnpm

# [node]
brew install node

# [font]
brew install --cask font-dejavu-sans-mono-nerd-font

# [starship]
brew install starship
mkdir -p ~/.config
cp ./.config/starship.toml ~/.config/starship.toml

# [kitty]
brew install kitty
mkdir -p ~/.config/kitty
cp ./.config/kitty/kitty.conf ~/.config/kitty/kitty.conf
cp ./.config/kitty/current-theme.conf ~/.config/kitty/current-theme.conf

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

# --- Desktop Applications ---
brew install --cask figma
brew install --cask postman
brew install --cask spotify
brew install --cask brave-browser
brew install --cask obsidian
