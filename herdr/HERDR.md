# Herdr

## Context

Its live config is in `~/.config/herdr-app`, and the settled parts are saved in `herdr/` in this repo. Agents, read `~/.config/herdr-app/AGENTS.md` first, because it documents mods, layouts and commands.

## Shortcuts

Saved in `herdr/keys.json`, plus the `Cmd+K` chords in `herdr/mods/layout-chord/main.js` and the Files panel keys in `herdr/mods/layout-files/main.js` (`onKey`). `Hyper` is `Cmd+Ctrl+Alt` from Karabiner.

## Usage popup

This mod isn't saved in dotfiles. On a new Mac, recreate it from this section as `~/.config/herdr-app/mods/usage/`, with `main.js`, `mod.json`, `scan.py` and `prices.json`. Until then, clicking the status bar meter opens nothing.

It opens and closes with `mod.open {name: "usage"}`, which the meter in `mods/layout-status` already runs.

### What it shows

Use theme colors, with `t.hover` and a pointer cursor on tabs and icon buttons.

- **Header, 54 high:** `Usage / Claude Code`, period tabs (`Past 24h`, `7 days`, `30 days`, `90 days`), metric tabs (`Cost`, `Tokens`), refresh and close. It opens on `30 days` and `Tokens`.
- **Overview:** on the left, the total in the selected metric at size 36, the session count, and a Claude Code row with the request count and the other metric. On the right, a smooth line chart 240 high with gridlines, drawn in the accent color with a faint fill.
- **`Totals`:** the selected metric, cached input, uncached input, output and cache savings.
- **`Breakdown`:** a table switchable between `Model` and `Day`, with rank, name with a thin accent bar sized against the top row, cost, share and tokens. Models sort by the selected metric. Days show newest first and skip empty ones.

Icons: `mods/layout-files/symbols/files/claude.svg`, `mods/layout-files/refresh-cw.svg` and Herdr's `mods/workspace-chrome/x.svg`.

### Where the data comes from

`main.js` runs `python3 -I <app home>/mods/usage/scan.py` on open, on refresh and every 60 seconds, and reads JSON keyed by period (`1`, `7`, `30`, `90`).

`scan.py` works like this:

- Read `~/.claude/projects/**/*.jsonl`. Keep only `assistant` rows with `message.usage`, a `timestamp` and a model other than `<synthetic>`. Never read or output message text.
- Remove duplicates by `message.id` plus `requestId`, keeping the row with the most output tokens.
- Tokens are input, `cache_read_input_tokens`, `cache_creation_input_tokens` and output added together.
- Cost is `costUSD` if the row has it. Otherwise, use `prices.json`, per million tokens, multiplied by the model's `fast` value when `usage.speed` is `fast`.
- Match prices with the model name, then with any `-YYYYMMDD` suffix removed. Group models under the name without the suffix.
- Cache savings are cache read tokens times the input price minus the cache read price.
- Count sessions by `sessionId`, and group by hour for `Past 24h` and by day otherwise.
- Cache parsed records per log file, by size and modified time, in `~/.cache/herdr-usage/usage-v1.json`, and keep entries for deleted logs.

`prices.json` holds one entry per model. Fill it from Anthropic's current API pricing:

## Status line

`bootstrap.sh` doesn't set it. On a new Mac, add this entry to `~/.claude/settings.json`. Without it, the status bar meter shows `--%` and `layout-agents` gets no context data.

```json
"statusLine": { "type": "command", "command": "sh ~/.config/herdr-app/mods/layout-status/session-limit.sh" }
```

Claude Code sends the session JSON to `session-limit.sh` on stdin. The script needs `jq`. It writes these files:

- `data/session-limit.json`: the 5-hour rate limit, read by `mods/layout-status`.
- `data/agent-context/<HC_TERMINAL_ID>.json`: context, model and effort, read by `mods/layout-agents`.
