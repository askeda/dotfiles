#!/bin/bash
set -uo pipefail

disable_hotkey() {
  defaults write com.apple.symbolichotkeys AppleSymbolicHotKeys -dict-add "$1" \
    "<dict><key>enabled</key><false/><key>value</key><dict><key>parameters</key><array><integer>$2</integer><integer>$3</integer><integer>$4</integer></array><key>type</key><string>standard</string></dict></dict>"
}

# [appearance]
defaults write -g AppleInterfaceStyle -string "Dark"
defaults write -g _HIHideMenuBar -bool true
defaults write com.apple.universalaccess reduceMotion -bool true

# [dock]
defaults write com.apple.dock autohide -bool true
defaults write com.apple.dock autohide-delay -float 0
defaults write com.apple.dock show-recents -bool false
defaults write com.apple.dock tilesize -int 36
defaults write com.apple.dock workspaces-swoosh-animation-off -bool true

# [clock]
defaults write com.apple.menuextra.clock ShowDate -int 0
defaults write com.apple.menuextra.clock ShowDayOfWeek -bool true
defaults write com.apple.menuextra.clock ShowAMPM -bool true

# [menu bar items]
defaults write com.apple.controlcenter "NSStatusItem Visible Battery" -bool false
defaults write com.apple.controlcenter "NSStatusItem Visible FocusModes" -bool false
defaults write com.apple.controlcenter "NSStatusItem Visible NowPlaying" -bool false
defaults write com.apple.controlcenter "NSStatusItem Visible Shortcuts" -bool false

# [keyboard]
defaults write -g ApplePressAndHoldEnabled -bool false
defaults write -g KeyRepeat -int 2
defaults write -g InitialKeyRepeat -int 15
defaults write com.microsoft.VSCode ApplePressAndHoldEnabled -bool false
defaults write com.microsoft.VSCodeInsiders ApplePressAndHoldEnabled -bool false

# [hotkeys: spotlight]
disable_hotkey 64 32 49 1048576
disable_hotkey 65 32 49 1572864

# [hotkeys: screenshots]
disable_hotkey 28 51 20 1179648
disable_hotkey 29 51 20 1441792
disable_hotkey 30 52 21 1179648
disable_hotkey 31 52 21 1441792

# [apply]
/System/Library/PrivateFrameworks/SystemAdministration.framework/Resources/activateSettings -u
killall Dock SystemUIServer ControlCenter 2>/dev/null || true
