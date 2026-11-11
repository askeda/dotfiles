import { View, div, svg, image } from "gpui-kit";
import { h_flex } from "gpui-base";
import { spaces, panes, run, theme, window, layout, settings, exec, shared, setShared, nextCommand, home } from "herdr";

const githubUrl = (remote) => {
  const match = /github\.com[:/](.+?)(?:\.git)?\/?$/.exec(remote.trim());
  return match ? `https://github.com/${match[1]}` : null;
};

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

const pill = (id, active, t) => h_flex().id(id).cursor_pointer().h(29).px(10).flex_none().items_center().rounded(7)
  .border(1).border_color(active ? t.border : t.chrome).bg(active ? t.raised : t.chrome)
  .when(!active, el => el.hover(s => s.bg(t.hover).border_color(t.hover)));

export default class Tabs extends View {
  init(_props, cx) {
    this.pressed = null;
    cx.spawn(async () => {
      for (;;) {
        const command = await nextCommand();
        if (command === "new_space") run("space.new", { folder: `${home()}/Documents/projects` });
        else if (["files", "changes", "commits"].includes(command)) this.togglePanel(command);
        else if (command === "expand") this.toggleExpanded();
        else if (command === "close_right") this.closeSide(1);
        else if (command === "close_left") this.closeSide(-1);
      }
    });
  }

  togglePanel(id) {
    const root = layout(), panel = find(root, "panel"), body = find(root, "panel-body");
    if (panel && !panel.hidden && body?.active === id) run("layout.hide", { id: "panel" });
    else {
      run("layout.select", { stack: "panel-body", child: id });
      run("layout.show", { id: "panel" });
      if (id === "files") run("layout-files.focus");
    }
  }

  closeSide(direction) {
    const tabs = spaces().find(s => s.active)?.tabs ?? [];
    const current = tabs.findIndex(c => c.active);
    if (current < 0) return;
    for (const tab of direction > 0 ? tabs.slice(current + 1) : tabs.slice(0, current)) run("tab.close", { id: tab.id });
  }

  toggleExpanded() {
    const root = layout(), panel = find(root, "panel");
    if (!panel || panel.hidden) return;
    if (find(root, "main")?.hidden) return this.restorePanel();
    setShared("panel.width", panel.size?.px ?? 360);
    run("layout.hide", { id: "main" });
    run("layout.resize", { id: "panel", weight: 1 });
  }

  restorePanel() {
    run("layout.show", { id: "main" });
    run("layout.resize", { id: "panel", px: shared("panel.width") ?? 360 });
  }

  closePanelOnSpaceSwitch(space) {
    if (!space || space.id === this.space) return;
    if (this.space) run("layout.hide", { id: "panel" });
    this.space = space.id;
  }

  syncExpanded(root, panel, space) {
    if (!find(root, "main")?.hidden) { this.expandedSpace = null; return; }
    if (!space) return;
    if (!this.expandedSpace) this.expandedSpace = space.id;
    if (!panel.hidden && space.id === this.expandedSpace) return;
    this.expandedSpace = null;
    this.restorePanel();
  }

  syncGithub(space, cx) {
    const tabs = new Set(space?.tabs.map(c => c.id));
    const folder = panes().find(p => tabs.has(p.tab) && p.cwd)?.cwd || space?.folder || null;
    if (folder === this.githubFolder) return;
    this.githubFolder = folder; this.github = null;
    if (!folder) return;
    const on = space.machine ?? null;
    cx.spawn(async (cx) => {
      const r = await exec("git", ["remote", "get-url", "origin"], { cwd: folder, on }).catch(() => null);
      if (this.githubFolder !== folder) return;
      this.github = r?.code === 0 ? githubUrl(r.stdout) : null;
      cx.notify();
    });
  }

  render(cx) {
    const t = theme();
    const space = spaces().find(p => p.active);
    this.syncGithub(space, cx);
    const shown = space?.tabs ?? [];
    const stop = (_e, cx) => cx.stop_propagation();
    const item = (c, i) => {
      const program = panes().find(p => p.tab === c.id && p.program?.agent)?.program ?? panes().find(p => p.tab === c.id)?.program;
      return pill(`tab-${c.id}`, c.active, t).gap(7).text_size(12.8).text_color(c.active ? t.foreground : t.muted)
        .on_mouse_down("left", (e, cx) => { cx.stop_propagation(); this.pressed = i; if (e.click_count === 2) run("tab.rename", { id: c.id }); })
        .on_mouse_up("left", () => {
          const from = this.pressed; this.pressed = null;
          if (from !== null && from !== i) run("tab.move", { id: shown[from].id, index: i + 1 });
          else run("tab.select", { id: c.id });
        })
        .when(Boolean(program?.icon), el => el.child(program.tint ? svg(program.icon).size(14).text_color(t.muted) : image(program.icon).size(14)))
        .child(div().max_w(170).truncate().child(c.zoomed ? `${c.name} Z` : c.name))
        .when(c.status === "working", el => el.child(svg("mods/workspace-chrome/spinner.svg").size(12).flex_none().text_color(t.working).spin(900)))
        .when(c.status === "blocked" || c.status === "done", el => el.child(div().size(6).rounded(3).bg(t[c.status])));
    };
    const root = layout(), sidebar = find(root, "sidebar");
    const lightsPadding = window()?.fullscreen || !root ? 10 : Math.max(10, (root.traffic_lights[0] + 64) / settings().zoom - (sidebar?.hidden ? 0 : sidebar?.size?.px ?? 0));
    const panel = find(root, "panel"), body = find(root, "panel-body");
    this.closePanelOnSpaceSwitch(space);
    this.syncExpanded(root, panel, space);
    const panelButton = (id, icon) => {
      const on = panel && !panel.hidden && body?.active === id;
      return pill(`panel-${id}`, on, t)
        .on_mouse_down("left", stop)
        .on_click(() => this.togglePanel(id)).child(svg(icon).size(14).text_color(t.muted));
    };
    return h_flex().size_full().min_w(0).px(10).pl(lightsPadding).gap(4).items_center().bg(t.chrome).border_b(1).border_color(t.border)
      .on_mouse_up("left", () => { this.pressed = null; })
      .on_scroll_wheel(e => { if (Math.abs(e.delta.y) >= 1) run(e.delta.y > 0 ? "tab.prev" : "tab.next"); })
      .child(h_flex().id("tab-scroll").flex_1().min_w(0).h_full().items_center().gap(4).overflow_x_scrollbar().children(shown.map(item)))
      .child(panelButton("files", "mods/layout-tabs/folder.svg"))
      .child(panelButton("changes", "mods/layout-tabs/file-diff.svg"))
      .child(panelButton("commits", "mods/layout-tabs/git-branch.svg"))
      .when(Boolean(this.github), el => el.child(pill("github", false, t).on_mouse_down("left", stop)
        .on_click((_e, cx) => cx.spawn(async () => { await exec("open", [this.github]).catch(() => null); }))
        .child(svg("mods/layout-tabs/github.svg").size(14).text_color(t.muted))));
  }
}
