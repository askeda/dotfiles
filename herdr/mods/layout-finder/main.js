import { View, div } from "gpui-kit";
import { v_flex, h_flex, Input, InputState } from "gpui-base";
import { spaces, panes, focused, exec, theme, run, layout, props, closeOverlay, setShared } from "herdr";

const SHOWN = 10, ROW_H = 30, LIMIT = 20000;
const LIST = 'if git -C "$1" rev-parse --is-inside-work-tree >/dev/null 2>&1; then git -C "$1" ls-files -co --exclude-standard; else cd "$1" && find . -type f -not -path "*/.git/*" -not -path "*/node_modules/*" | sed "s|^\\./||"; fi | head -n ' + LIMIT;

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

function location() {
  const space = spaces().find(s => s.active), f = focused();
  const pane = f?.pane ? panes().find(p => p.pane === f.pane) : null;
  const on = f?.pane === null ? (f.terminal?.includes("/") ? f.terminal.split("/")[0] : null) : space?.machine ?? null;
  return { cwd: pane?.cwd || f?.cwd || space?.folder, on };
}

function fuzzy(q, path) {
  const t = path.toLowerCase(), name = t.lastIndexOf("/") + 1;
  let score = 0, at = 0, run = 0;
  for (const ch of q) {
    const i = t.indexOf(ch, at);
    if (i < 0) return null;
    const start = i === 0 || /[\s.\-_/]/.test(t[i - 1]);
    run = i === at && at > 0 ? run + 1 : 0;
    score += 1 + (start ? 6 : 0) + (i >= name ? 4 : 0) + run * 3 - Math.min(i - at, 6) * 0.3;
    at = i + 1;
  }
  return score - path.length * 0.02;
}

export default class Finder extends View {
  init(_props, cx) {
    this.files = [];
    this.query = "";
    this.at = 0;
    this.top = 0;
    this.status = "Loading files…";
    this.input = InputState.new({ placeholder: "Find a file…" });
    this.input.on("change", (_e, cx) => { this.query = this.input.value(); this.at = 0; this.top = 0; cx.notify(); });
    this.input.on("submit", () => this.open(this.rows()[this.at]));
    this.input.focus();
    cx.timer.after(600, () => this.input.focus());
    const { cwd, on } = location();
    if (!cwd) { this.status = "No folder"; return; }
    cx.spawn(async cx => {
      const r = await exec("sh", ["-c", LIST, "finder", cwd], { on }).catch(e => ({ code: 1, stdout: "", stderr: String(e) }));
      this.files = r.stdout.split("\n").filter(Boolean);
      this.status = r.code === 0 || this.files.length ? "No files" : r.stderr.trim() || "Cannot list files";
      cx.notify();
    });
  }

  rows() {
    const q = this.query.trim().toLowerCase().replace(/\s+/g, "");
    if (!q) return this.files.slice(0, 500);
    return this.files.map(path => ({ path, score: fuzzy(q, path) })).filter(r => r.score !== null)
      .sort((a, b) => b.score - a.score).slice(0, 500).map(r => r.path);
  }

  open(path) {
    if (!path) return;
    closeOverlay(props().overlay);
    const root = layout(), node = find(root, "panel"), panel = !node?.hidden, expanded = Boolean(find(root, "main")?.hidden);
    setShared("files.open", { path, at: Date.now(), panel, expanded });
    run("layout.select", { stack: "panel-body", child: "files" });
    run("layout.show", { id: "panel" });
    if (!expanded) {
      setShared("panel.width", node?.size?.px ?? 360);
      run("layout.hide", { id: "main" });
      run("layout.resize", { id: "panel", weight: 1 });
    }
  }

  render() {
    const t = theme(), rows = this.rows();
    this.at = Math.max(0, Math.min(this.at, rows.length - 1));
    if (this.at < this.top) this.top = this.at;
    if (this.at >= this.top + SHOWN) this.top = this.at - SHOWN + 1;
    const shown = rows.slice(this.top, this.top + SHOWN);
    const card = v_flex().id("finder").w_full().flex_none().p(18).gap(10).rounded(12).border_1().border_color(t.border).bg(t.popover).text_color(t.foreground)
      .on_mouse_down("left", (_e, cx) => cx.stop_propagation())
      .on_key_down((e, cx) => {
        if (e.key === "escape") return closeOverlay(props().overlay);
        if (e.key === "down") this.at = Math.min(this.at + 1, rows.length - 1);
        else if (e.key === "up") this.at = Math.max(this.at - 1, 0);
        else return;
        cx.stop_propagation();
        cx.notify();
      })
      .child(h_flex().h(36).flex_none().px(10).gap(10).items_center().rounded(9).border_1().border_color(t.accent).bg(t.background)
        .child(Input.new(this.input).flex_1().h_full().text_size(12.8).text_color(t.foreground))
        .child(div().text_size(11).text_color(t.dim).child("Esc")))
      .child(rows.length
        ? v_flex().flex_none().h(SHOWN * ROW_H).children(shown.map((path, i) => {
            const index = this.top + i, slash = path.lastIndexOf("/");
            return h_flex().id(`finder-${index}`).h(ROW_H).flex_none().px(10).gap(10).items_center().rounded(7).cursor_pointer().text_size(12.8)
              .when(index === this.at, el => el.bg(t.selected))
              .hover(s => s.bg(t.hover))
              .on_click(() => this.open(path))
              .child(div().flex_none().child(path.slice(slash + 1)))
              .child(div().flex_1().min_w(0).truncate().text_size(11.5).text_color(t.dim).child(path.slice(0, Math.max(slash, 0))));
          }))
        : div().px(16).py(14).text_size(13).text_color(t.dim).child(this.files.length ? `Nothing matches "${this.query}"` : this.status));
    return v_flex().id("finder-backdrop").size_full().on_mouse_down("left", () => closeOverlay(props().overlay)).child(card);
  }
}
