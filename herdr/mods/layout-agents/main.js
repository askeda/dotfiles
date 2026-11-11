import { View, div, image, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { agents, panes, spaces, run, theme, shared, setShared, setAgentOrder, openOverlay, closeOverlay, props, window, layout, readTextFile, appHome, nextCommand } from "herdr";

const find = (node, id) => node?.id === id ? node : (node?.children ?? []).reduce((hit, child) => hit ?? find(child, id), null);
const narrow = () => (find(layout(), "sidebar")?.size?.px ?? Infinity) < 160;

function toggleSidebar() {
  const width = find(layout(), "sidebar")?.size?.px;
  if (!narrow()) setShared("sidebar.width", width);
  setShared("sidebar.collapsed", !narrow());
  run("layout.resize", { id: "sidebar", px: narrow() ? (shared("sidebar.width") ?? 268) : window()?.platform === "macos" ? 76 : 44 });
}

const clean = (s) => (s ?? "").replace(/^[^\p{L}\p{N}]+/u, "").trim();

function leadPanes(all) {
  const leads = new Map();
  for (const p of all) {
    if (!p.terminal) continue;
    const current = leads.get(p.tab);
    if (!current || (!current.program?.agent && (p.program?.agent || (!current.focused && p.focused)))) leads.set(p.tab, p);
  }
  return leads;
}

function title(tab, lead) {
  const prog = lead?.program?.name;
  const live = clean(lead?.title);
  const telling = live && live !== prog && !/^[~/]|^[A-Za-z]:\\/.test(live) && !live.includes("@") && live.toLowerCase() !== lead?.program?.key;
  return (tab.name === prog || !tab.named) && telling ? live : tab.name;
}

const RANK = { blocked: 4, done: 3, working: 2, idle: 1 };
const SORTS = [
  { id: "priority", label: "Priority", icon: "clock" },
  { id: "grouped", label: "Grouped by space", icon: "layers" },
];
const sortOf = () => SORTS.find((s) => s.id === shared("agents.sort")) ?? SORTS[0];
const SECONDARY = "#7f849c";
const SECTION = { 4: "Needs you", 3: "Done", 2: "Working", 1: "Idle" };
const SECTION_STATUS = { 4: "blocked", 3: "done", 2: "working" };

function icon(p, size, color) {
  if (!p?.icon) return null;
  return p.tint ? svg(p.icon).size(size).flex_none().text_color(color) : image(p.icon).w(size).h(size).flex_none();
}

export default class Agents extends View {
  init(_props, cx) {
    if (props()?.sortMenu) return;
    this.folded = new Set();
    this.context = {};
    this.changed = JSON.parse(localStorage.getItem("changed") ?? "{}");
    this.refreshContext(cx);
    cx.timer.every(5000, (cx) => this.refreshContext(cx));
    cx.spawn(async () => {
      for (;;) if (await nextCommand() === "pin") this.togglePin();
    });
  }

  togglePin(a = agents().find((a) => a.focused)) {
    if (a) run("terminal.pin", { terminal: a.address, pinned: !a.pinned });
  }

  refreshContext(cx) {
    cx.spawn(async (cx) => {
      const next = {};
      for (const a of agents()) {
        if (a.address.includes("/")) continue;
        const text = await readTextFile(`${appHome()}/data/agent-context/${a.address}.json`).catch(() => null);
        if (text) next[a.address] = JSON.parse(text);
      }
      if (JSON.stringify(next) !== JSON.stringify(this.context)) {
        this.context = next;
        cx.notify();
      }
    });
  }

  track(list, now) {
    let dirty = false;
    for (const a of list) {
      const s = a.status === "done" ? "idle" : a.status;
      if (this.changed[a.address]?.s === s) continue;
      this.changed[a.address] = { s, at: now };
      dirty = true;
    }
    if (!dirty) return;
    const listed = new Set(list.map((a) => a.address));
    for (const [k, c] of Object.entries(this.changed)) if (!listed.has(k) && now - c.at > 30 * 86400000) delete this.changed[k];
    localStorage.setItem("changed", JSON.stringify(this.changed));
  }

  since(a) {
    return this.changed[a.address]?.at ?? 0;
  }

  hold(list) {
    const cur = list.find((a) => a.focused);
    const same = cur && cur.address === this.held?.address;
    if (!same || cur.status !== "idle") this.held = cur ? { address: cur.address, rank: RANK[cur.status] ?? 0 } : null;
  }

  rank(a) {
    const sawDone = a.address === this.held?.address && this.held.rank === RANK.done && a.status === "idle";
    return sawDone ? RANK.done : RANK[a.status] ?? 0;
  }

  sortMenu(t) {
    const on = sortOf().id;
    return v_flex().w_full().p(5).bg(t.popover).text_size(12.8)
      .child(div().px(8).pt(4).pb(6).text_size(11).text_color(t.dim).child("Sort agents"))
      .children(SORTS.map((s) => h_flex().id(`sort-${s.id}`).h(31).px(8).gap(9).rounded(7).items_center().cursor_pointer().text_color(t.foreground)
        .hover((el) => el.bg(t.hover))
        .on_click(() => {
          setShared("agents.sort", s.id);
          closeOverlay(props().overlay);
        })
        .child(svg(`mods/workspace-chrome/${s.icon}.svg`).size(14).flex_none().text_color(t.muted))
        .child(div().flex_1().child(s.label))
        .when(s.id === on, (el) => el.child(svg("mods/workspace-chrome/check.svg").size(14).flex_none().text_color(t.foreground)))));
  }

  status(t, a, compact = false) {
    if (a.status === "working") return svg("mods/workspace-chrome/spinner.svg").size(12).mx(1).flex_none().text_color(t.working).spin(900);
    if (a.status === "blocked" && compact) return div().size(14).flex_none().rounded(4).bg(t.blocked + "26").text_size(10.5).font_bold().text_color(t.blocked).flex().items_center().justify_center().child("!");
    if (a.status === "blocked") return div().flex_none().px(6).h(18).rounded(5).bg(t.blocked + "26").text_size(10.5).font_semibold().text_color(t.blocked).flex().items_center().child("Needs you");
    if (a.status === "idle") return div().size(7).mx(3).flex_none().rounded(4).border(1.5).border_color(t.idle ?? t.dim);
    return div().size(7).mx(3).flex_none().rounded(4).bg(a.status === "done" ? t.done : t.dim + "00");
  }

  meter(t, used) {
    const fill = used >= 80 ? t.blocked : used >= 60 ? t.working : t.accent;
    return h_flex().flex_none().gap(4).items_center().text_size(10.5).text_color(SECONDARY)
      .child(h_flex().gap(2).children([0, 1, 2, 3, 4].map(n => div().w(5).h(4).rounded(1).bg(n < Math.round(used / 20) ? fill : t.border))))
      .child(`${used}%`);
  }

  pin(t, a) {
    return div().id(`pin-${a.address}`).size(20).flex_none().flex().items_center().justify_center().rounded(5).text_color(t.muted).cursor_pointer()
      .hover((s) => s.bg("#3b4261"))
      .on_click((_e, cx) => {
        cx.stop_propagation();
        this.togglePin(a);
        this.hovered = null;
        cx.notify();
      })
      .child(svg(`mods/workspace-chrome/${a.pinned ? "pin-off" : "pin"}.svg`).size(14));
  }

  render() {
    const t = theme();
    if (props()?.sortMenu) return this.sortMenu(t);
    const collapsed = narrow();
    const sort = sortOf();
    const byPriority = sort.id === "priority";
    let list = agents();
    this.track(list, Date.now());
    this.hold(list);
    if (byPriority) list = [...list].sort((x, y) => this.rank(y) - this.rank(x) || this.since(y) - this.since(x) || y.seq - x.seq);
    const pinned = list.filter((a) => a.pinned);
    const rest = list.filter((a) => !a.pinned);
    list = [...pinned, ...rest];
    setAgentOrder(list.map((a) => a.address));

    const tabCounts = new Map();
    for (const a of list) tabCounts.set(a.tab, (tabCounts.get(a.tab) ?? 0) + 1);
    const leads = leadPanes(panes());
    const tabs = new Map(spaces().flatMap(s => s.tabs).map(tab => [tab.id, tab]));
    const labels = new Map(list.map(a => {
      const tab = tabs.get(a.tab);
      const many = tabCounts.get(a.tab) > 1;
      return [a.address, tab ? title(many ? { ...tab, named: false } : tab, many ? a : leads.get(a.tab)) : (a.title || a.program?.name || "")];
    }));
    const label = (a) => labels.get(a.address);
    const detail = new Map(list.map(a => [a.address, /^\d+$/.test(label(a)) ? null : label(a)]));
    const seen = {};
    for (const a of list) { const k = `${a.space_name}\u0000${detail.get(a.address) ?? ""}`; seen[k] = (seen[k] ?? 0) + 1; }
    for (const a of list) if (detail.get(a.address) == null && seen[`${a.space_name}\u0000`] > 1) detail.set(a.address, label(a));

    const row = (a, i) => {
      if (collapsed) {
        return h_flex().id(`ag-${a.address}`).h(26).px(8).flex_none().items_center().gap(4)
          .hover((s) => s.bg(t.hover))
          .on_click(() => run("pane.focus", { pane: a.pane }))
          .child(div().flex_1().min_w(0).whitespace_nowrap().text_right().text_color(t.muted).child(String(i + 1)))
          .child(h_flex().w(14).flex_none().items_center().justify_center().child(this.status(t, a, true)));
      }
      const more = detail.get(a.address);
      const full = byPriority || a.pinned;
      const name = full ? a.space_name || label(a) : more ?? (/^\d+$/.test(label(a)) ? a.program?.name || label(a) : label(a));
      const info = this.context[a.address] ?? {};
      const model = [info.model, info.effort].filter(Boolean).join(" · ");
      const hovered = this.hovered === a.address;
      const pic = icon(a.program, 18, t.foreground);
      return h_flex().id(`ag-${a.address}`).px(8).h(46).flex_none().rounded(8).items_center().gap(9).cursor_pointer()
        .when(a.focused, (el) => el.bg(t.selected))
        .hover((s) => s.bg(t.hover))
        .on_hover((on, cx) => {
          if (on) this.hovered = a.address;
          else if (this.hovered === a.address) this.hovered = null;
          cx.notify();
        })
        .on_click(() => run("pane.focus", { pane: a.pane }))
        .when(Boolean(pic), el => el.child(pic))
        .child(v_flex().flex_1().min_w(0).gap(1)
          .child(div().min_w(0).truncate().text_color(t.foreground).child(name))
          .when(full && Boolean(more), el => el.child(div().min_w(0).truncate().text_size(11.5).text_color(SECONDARY).child(more))))
        .child(v_flex().flex_none().items_end().justify_center().gap(3)
          .child(h_flex().gap(6).items_center()
            .when(hovered, el => el.child(this.pin(t, a)))
            .when(!hovered && Boolean(model), el => el.child(div().text_size(10.5).text_color(SECONDARY).child(model)))
            .child(this.status(t, a, byPriority && !a.pinned)))
          .when(typeof info.used_percentage === "number", el => el.child(this.meter(t, info.used_percentage))));
    };

    const groups = pinned.length ? [{ id: "pinned", label: "Pinned", status: null, members: pinned }] : [];
    for (const a of rest) {
      const r = this.rank(a) || RANK.idle;
      const id = byPriority ? `sec-${r}` : `sp-${a.space}`;
      if (groups.at(-1)?.id === id) groups.at(-1).members.push(a);
      else groups.push({ id, label: byPriority ? SECTION[r] : a.space_name || "", status: byPriority ? SECTION_STATUS[r] : null, members: [a] });
    }

    const header = (g) => {
      const open = !this.folded.has(g.id);
      const top = g.members.reduce((m, a) => ((RANK[a.status] ?? 0) > (RANK[m] ?? 0) ? a.status : m), null);
      return h_flex().id(g.id).px(8).pt(8).h(30).flex_none().gap(6).items_center().text_size(11).font_medium().cursor_pointer()
        .hover((s) => s.text_color(t.foreground))
        .on_click((_e, cx) => {
          open ? this.folded.add(g.id) : this.folded.delete(g.id);
          cx.notify();
        })
        .child(div().truncate().text_color(t[g.status] ?? t.dim).child(g.label))
        .when(byPriority || !open, (el) => el.child(div().text_color(t.dim).child(String(g.members.length))))
        .child(div().flex_1().h(1).bg(t.border))
        .when(!open, (el) => el
          .when(!byPriority && top && top !== "idle", (el) => el.child(this.status(t, { status: top }, true)))
          .child(svg("mods/workspace-chrome/chevron-right.svg").size(11).flex_none().text_color(t.dim)));
    };
    const rows = collapsed
      ? list.map(row)
      : groups.flatMap((g) => [header(g), ...(this.folded.has(g.id) ? [] : g.members.map(row))]);

    return v_flex().size_full().min_h(0).bg(t.chrome).border_t(1).border_color(t.border).text_size(13)
      .when(!collapsed, (el) => el.child(h_flex().pl(16).pr(10).h(41).pt(10).pb(5).flex_none().items_center().justify_between()
        .child(div().text_size(11.5).font_medium().text_color(t.dim).child("Agents"))
        .child(div().id("ag-sort").size(26).flex_none().flex().items_center().justify_center().rounded(6).text_color(t.dim).cursor_pointer()
          .hover((s) => s.bg(t.hover).text_color(t.foreground))
          .on_click(() => openOverlay({ mod: "layout-agents", kind: "popup", width: 200, height: 140, props: { sortMenu: true } }))
          .child(svg(`mods/workspace-chrome/${sort.icon}.svg`).size(14)))))
      .when(list.length === 0 && !collapsed, (el) =>
        el.child(div().px(12).text_size(12).text_color(t.dim).child("No agent status yet. Agents show up here when they report their status. Older versions and agents inside tmux may not.")))
      .child(v_flex().id("ag-list").flex_1().min_h(0).px(collapsed ? 0 : 8).gap(4).overflow_y_scrollbar().mode("always").children(rows))
      .when(collapsed, (el) => el.child(h_flex().h(28).items_center().justify_center()
        .child(div().id("collapse").text_size(13).text_color(t.dim).hover((s) => s.text_color(t.foreground)).on_click(toggleSidebar).child("»"))));
  }
}
