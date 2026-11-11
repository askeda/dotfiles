import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex } from "gpui-base";
import { spaces, run, openOverlay, theme, shared, setShared, layout, home } from "herdr";

const MARK = { ansi6: "#cba6f7", ansi3: "#fab387", ansi4: "#89b4fa", ansi5: "#f5c2e7", ansi2: "#b4befe", ansi1: "#74c7ec" };
const PALETTE = ["ansi6", "ansi3", "ansi4", "ansi5", "ansi2", "ansi1"];
const RAIL_CELL = 32;

const find = (node, id) => node?.id === id ? node : (node?.children ?? []).reduce((hit, child) => hit ?? find(child, id), null);
const narrow = () => (find(layout(), "sidebar")?.size?.px ?? Infinity) < 160;
const glyph = (status) => status === "blocked" || status === "done" ? "●" : "·";

function assignColors(sp) {
  const stored = shared("space.colors") ?? {};
  const ids = new Set(sp.map(p => p.id));
  const kept = Object.fromEntries(Object.entries(stored).filter(([id]) => ids.has(id)));
  let changed = Object.keys(kept).length !== Object.keys(stored).length;
  for (const p of sp) {
    if (kept[p.id] || p.name === "~") continue;
    const uses = c => Object.values(kept).filter(v => v === c).length;
    kept[p.id] = PALETTE.reduce((best, c) => uses(c) < uses(best) ? c : best);
    changed = true;
  }
  if (changed) setShared("space.colors", kept);
  return kept;
}

export default class Spaces extends View {
  init() {
    this.pressed = null;
    this.over = null;
  }

  row(w, i, colors, t) {
    const color = colors[w.id] ?? "ansi6";
    const fill = color.startsWith("#") ? color : (MARK[color] ?? t[color]);
    const from = this.pressed === null ? -1 : spaces().findIndex(s => s.id === this.pressed);
    const target = this.pressed !== null && this.over === w.id && this.pressed !== w.id;
    return h_flex().id(`space-${w.id}`).relative().h(30).flex_none().px(8).gap(9).items_center().rounded(7).cursor_pointer()
      .when(w.active, el => el.bg(t.selected))
      .when(!w.active, el => el.hover(s => s.bg(t.hover)))
      .when(this.pressed === w.id && this.over !== w.id, el => el.opacity(0.5))
      .when(target, el => el.child(div().absolute().left(0).right(0).h(2).bg(t.accent)
        .when(from < i, line => line.bottom(0))
        .when(from > i, line => line.top(0))))
      .on_mouse_down("left", () => { this.pressed = w.id; this.over = w.id; })
      .on_mouse_move((_e, cx) => {
        const source = spaces().find(s => s.id === this.pressed);
        const over = source && (source.machine ?? null) === (w.machine ?? null) ? w.id : null;
        if (this.pressed !== null && this.over !== over) { this.over = over; cx.notify(); }
      })
      .on_mouse_up("left", (_e, cx) => {
        const { pressed, over } = this;
        this.pressed = null;
        this.over = null;
        if (pressed !== null && over === w.id && pressed !== w.id) run("space.move", { id: pressed, index: i + 1 });
        else if (pressed === w.id) run("space.select", { id: w.id });
        cx.notify();
      })
      .on_mouse_down("right", () => openOverlay({ mod: "layout-menu", kind: "popup", width: 200, height: 260, props: { tab: "space", target: { id: w.id } } }))
      .child(h_flex().size(20).flex_none().rounded(4).bg(fill).items_center().justify_center().text_size(10.5).font_bold().text_color(t.background).child([...w.name][0]?.toUpperCase() ?? "?"))
      .child(div().min_w(0).truncate().text_color(t.foreground).child(w.name));
  }

  compact(w, i, t) {
    return h_flex().flex_none().justify_center().child(h_flex().id(`space-${w.id}`).relative().w(RAIL_CELL).h(26).rounded(6).justify_center().items_center().cursor_pointer()
      .when(w.active, el => el.bg(t.selected))
      .when(!w.active, el => el.hover(s => s.bg(t.hover)))
      .on_click(() => run("space.select", { id: w.id }))
      .child(div().text_color(w.active ? t.foreground : t.muted).child(String(i + 1)))
      .child(div().absolute().right(5).text_color(t[w.status] ?? t.unknown).child(glyph(w.status))));
  }

  render() {
    const t = theme();
    const collapsed = narrow();
    const sp = spaces();
    const colors = assignColors(sp);
    return v_flex().size_full().min_h(0).bg(t.chrome).text_size(13)
      .child(h_flex().h(31).pl(16).pr(10).items_center().justify_between().text_size(11.5).text_color(t.dim)
        .when(collapsed, el => el.pl(0).pr(0).justify_center())
        .when(!collapsed, el => el.child("Spaces"))
        .child(div().id("space-new").size(26).flex_none().flex().items_center().justify_center().rounded(6).cursor_pointer().hover(s => s.bg(t.hover).text_color(t.foreground))
          .on_click(() => run("space.new", { folder: `${home()}/Documents/projects` })).child(svg("mods/workspace-chrome/plus.svg").size(14))))
      .child(v_flex().flex_1().min_h(0).px(collapsed ? 0 : 8).pb(14).gap(4).overflow_y_scrollbar().mode("always")
        .on_mouse_up("left", (_e, cx) => { this.pressed = null; cx.notify(); })
        .children(sp.map((w, i) => collapsed ? this.compact(w, i, t) : this.row(w, i, colors, t))));
  }
}
