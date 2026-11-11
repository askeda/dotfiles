import { View, div, svg } from "gpui-kit";
import { h_flex } from "gpui-base";
import { spaces, theme, run, readTextFile, writeTextFile, appHome, nextCommand } from "herdr";

const DEFAULT_ZOOM = 1.15;

export default class WorkspaceStatus extends View {
  init(_props, cx) {
    this.used = null;
    this.refreshSession(cx);
    cx.timer.every(10000, (cx) => this.refreshSession(cx));
    cx.spawn(async () => {
      for (;;) if (await nextCommand() === "zoom_reset") await this.resetZoom();
    });
  }

  async resetZoom() {
    const path = `${appHome()}/settings.json`;
    const text = await readTextFile(path);
    if (text) await writeTextFile(path, text.replace(/("zoom":\s*)[\d.]+/, `$1${DEFAULT_ZOOM}`), text).catch(() => null);
  }

  refreshSession(cx) {
    cx.spawn(async (cx) => {
      const text = await readTextFile(`${appHome()}/data/session-limit.json`).catch(() => null);
      if (!text) return;
      const { used_percentage, resets_at } = JSON.parse(text);
      this.used = resets_at * 1000 < Date.now() ? 0 : Math.round(used_percentage);
      cx.notify();
    });
  }

  meter(t) {
    const filled = Math.round((this.used ?? 0) / 20);
    return h_flex().id("usage").h(20).px(6).gap(5).items_center().rounded(5).cursor_pointer().hover(s => s.bg(t.hover)).on_click(() => run("mod.open", { name: "usage" }))
      .child(h_flex().gap(2).children([0, 1, 2, 3, 4].map(i => div().w(7).h(5).rounded(1).bg(i < filled ? t.accent : "#3b4261"))))
      .child(this.used === null ? "--%" : `${this.used}%`);
  }

  render() {
    const t = theme();
    const space = spaces().find(s => s.active);
    const label = (icon, text) => h_flex().gap(6).items_center().child(svg(`mods/workspace-chrome/${icon}.svg`).size(13)).child(text);
    return h_flex().size_full().px(14).gap(16).items_center().bg(t.chrome).border_t(1).border_color(t.border).text_size(11.8).text_color(t.muted)
      .child(label(space?.machine ? "server" : "monitor", space?.machine ?? "This computer"))
      .when(Boolean(space?.branch), el => el.child(label("branch", space.branch)))
      .child(div().flex_1())
      .child(this.meter(t));
  }
}
