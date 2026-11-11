#!/bin/sh
input=$(cat)
data="$HOME/.config/herdr-app/data"
case "$HC_TERMINAL_ID" in
  ''|*[!A-Za-z0-9_-]*) ;;
  *)
    context=$(printf '%s' "$input" | jq -c '{used_percentage: (.context_window.current_usage | if . then ((.input_tokens + .cache_creation_input_tokens + .cache_read_input_tokens) / 2000 | round) else null end), model: .model.display_name, effort: .effort.level}')
    if [ -n "$context" ]; then
      mkdir -p "$data/agent-context"
      printf '%s' "$context" > "$data/agent-context/$HC_TERMINAL_ID.json.tmp" && mv "$data/agent-context/$HC_TERMINAL_ID.json.tmp" "$data/agent-context/$HC_TERMINAL_ID.json"
    fi
    ;;
esac
limit=$(printf '%s' "$input" | jq -c '.rate_limits.five_hour // empty')
[ -n "$limit" ] || exit 0
printf '%s' "$limit" > "$data/session-limit.json.tmp" && mv "$data/session-limit.json.tmp" "$data/session-limit.json"
