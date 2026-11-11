import { View, div, svg } from "gpui-kit";
import { v_flex, h_flex, Scrollbar, v_virtual_list } from "gpui-base";
import { spaces, panes, focused, exec, theme, settings, run, layout, shared, setShared } from "herdr";

const READ = ["--no-optional-locks", "-c", "core.fsmonitor=false"];
const SEP = "\x1f";
const LIMIT = 100;

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

function location() {
  const space = spaces().find((s) => s.active), f = focused();
  const pane = f?.pane ? panes().find((p) => p.pane === f.pane) : null;
  const on = f?.pane === null ? (f.terminal?.includes("/") ? f.terminal.split("/")[0] : null) : space?.machine ?? null;
  return { cwd: pane?.cwd || f?.cwd || space?.folder, on };
}
const key = () => JSON.stringify(location());

function diffRows(lines) {
  let old = 0, next = 0, header = false;
  const rows = [];
  for (const line of lines) {
    if (line.startsWith("diff --git ")) {
      header = true;
      rows.push({ kind: "file", text: line.split(" b/").pop() });
      continue;
    }
    const match = /^@@ -(\d+)(?:,\d+)? \+(\d+)/.exec(line);
    if (match) { header = false; old = +match[1]; next = +match[2]; rows.push({ kind: "@", text: line }); continue; }
    if (header) continue;
    const kind = line[0];
    if (kind === "-") rows.push({ kind, number: old++, text: line.slice(1) || " " });
    else if (kind === "+") rows.push({ kind, number: next++, text: line.slice(1) || " " });
    else if (kind === " ") { old++; rows.push({ kind, number: next++, text: line.slice(1) || " " }); }
  }
  return rows;
}

export default class Commits extends View {
  init(_props, cx) {
    this.commits = []; this.rows = []; this.diffWidth = 0; this.branch = "";
    this.refresh(cx);
    cx.timer.every(10000, (cx) => this.refresh(cx));
  }

  refresh(cx) {
    if (this.loading) return;
    const { cwd, on } = location(), context = key();
    if (context !== this.context) {
      this.context = context; this.root = null; this.commits = []; this.open = null; this.closed = false; this.rows = []; this.branch = ""; this.error = null;
    }
    if (!cwd) return;
    this.loading = true;
    cx.spawn(async (cx) => {
      try {
        const top = await exec("git", ["rev-parse", "--show-toplevel"], { cwd, on });
        if (key() !== context) return;
        if (top.code !== 0) { this.root = null; this.commits = []; this.rows = []; this.open = null; this.error = "Not a git repository"; return; }
        const root = top.stdout.trim(), git = (args) => exec("git", [...READ, ...args], { cwd: root, on });
        const branch = await git(["branch", "--show-current"]);
        const log = await git(["log", `-${LIMIT}`, `--format=%h${SEP}%s${SEP}%an${SEP}%cr`]);
        if (key() !== context) return;
        this.root = root; this.on = on; this.branch = branch.stdout.trim(); this.error = null;
        this.commits = log.code === 0 ? log.stdout.split("\n").filter(Boolean).map((line) => {
          const [hash, subject, author, when] = line.split(SEP);
          return { hash, subject, author, when };
        }) : [];
        if (!this.open && !this.closed && this.commits.length) await this.load(this.commits[0].hash, context);
      } catch (e) { if (key() === context) this.error = String(e); }
      finally { this.loading = false; cx.notify(); }
    });
  }

  async load(hash, context) {
    this.open = hash;
    const r = await exec("git", [...READ, "show", "--format=", "--no-ext-diff", "--no-textconv", "--no-color", hash], { cwd: this.root, on: this.on });
    if (key() !== context || this.open !== hash) return;
    const lines = r.code === 0 ? r.stdout.replace(/\n$/, "").split("\n").slice(0, 3000).map((line) => line.length > 4000 ? line.slice(0, 4000) + "…" : line) : [];
    this.rows = diffRows(lines);
    this.diffWidth = Math.max(300, ...lines.map((line) => line.length * 7 + 50));
  }

  pick(hash, cx) {
    this.rows = [];
    if (this.open === hash) { this.open = null; this.closed = true; cx.notify(); return; }
    this.closed = false;
    const context = this.context;
    cx.spawn(async (cx) => {
      await this.load(hash, context).catch(() => { this.rows = []; });
      cx.notify();
    });
    cx.notify();
  }

  toggleExpanded() {
    if (find(layout(), "main")?.hidden) {
      run("layout.show", { id: "main" });
      run("layout.resize", { id: "panel", px: shared("panel.width") ?? 360 });
      return;
    }
    setShared("panel.width", find(layout(), "panel")?.size?.px ?? 360);
    run("layout.hide", { id: "main" });
    run("layout.resize", { id: "panel", weight: 1 });
  }

  diffRow({ kind, number, text }, t) {
    if (kind === "file") return div().w_full().px(12).h(24).flex_none().flex().items_center().truncate().bg(t.raised).text_color(t.foreground).child(text);
    if (kind === "@") return div().w_full().px(12).h(20).flex_none().truncate().text_color(t.dim).child(text);
    return h_flex().w_full().h(20).flex_none().gap(10).when(kind === "+", (e) => e.bg(t.ansi2 + "59")).when(kind === "-", (e) => e.bg(t.ansi1 + "59"))
      .child(div().w(30).flex_none().text_right().text_color(t.dim).child(String(number)))
      .child(div().flex_1().min_w(0).truncate().child(text));
  }

  render(cx) {
    if (key() !== this.context) this.refresh(cx);
    const t = theme();
    return v_flex().id("commits").size_full().min_h(0).rounded(6).overflow_hidden().bg(t.background).border(1.5).border_color(t.border).text_color(t.foreground).text_size(13)
      .child(h_flex().h(42).flex_none().px(14).gap(8).items_center().border_b(1).border_color(t.border)
        .child(div().flex_none().font_semibold().child("Commits"))
        .when(Boolean(this.branch), (e) => e.child(div().min_w(0).px(5).py(1).rounded(4).border_1().border_color("#3b4261").text_size(10).text_color(t.muted).truncate().child(this.branch)))
        .child(div().flex_1())
        .child(div().id("commits-expand").size(26).flex_none().flex().items_center().justify_center().rounded(6).cursor_pointer().hover((s) => s.bg(t.hover)).on_click(() => this.toggleExpanded()).child(svg("mods/commits/maximize.svg").size(14).text_color(t.muted))))
      .child(v_flex().id("commits-list").flex_none().h(280).overflow_y_scrollbar().p(6).border_b(1).border_color(t.border)
        .children(this.commits.map((c) => v_flex().id(`commit-${c.hash}`).h(44).flex_none().px(8).justify_center().rounded(7).cursor_pointer()
          .when(this.open === c.hash, (e) => e.bg(t.selected)).when(this.open !== c.hash, (e) => e.hover((s) => s.bg(t.hover))).on_click((_e, cx) => this.pick(c.hash, cx))
          .child(div().truncate().child(c.subject))
          .child(h_flex().gap(6).text_size(11).text_color(t.dim)
            .child(div().min_w(0).truncate().child(c.author))
            .child(div().flex_none().child("·"))
            .child(div().flex_none().child(c.when)))))
        .when(!this.commits.length, (e) => e.child(div().p(8).text_color(t.dim).child(this.error || (this.loading ? "Loading commits…" : this.root ? "No commits yet" : "No folder")))))
      .child(div().flex_1().min_h(0).mt(12).relative().font_family(settings().font_family ?? "JetBrains Mono").text_size(11)
        .child(div().id("commits-diff-x").size_full().overflow_x_scrollbar()
          .child(div().w_full().min_w(this.diffWidth).h_full().child(v_virtual_list("commits-diff", this.rows.length, 20, (i) => String(i),
            (range) => this.rows.slice(range.start, range.end).map((row) => this.diffRow(row, t))).size_full())))
        .child(Scrollbar.vertical("commits-diff").viewport_from_layout().absolute().inset_0())
        .when(!this.open && this.commits.length > 0, (e) => e.child(div().absolute().top(6).px(12).text_color(t.dim).child("Select a commit to view its changes"))));
  }
}
