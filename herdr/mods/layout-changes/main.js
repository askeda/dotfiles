import { View, div, svg, image } from "gpui-kit";
import { v_flex, h_flex, InputState, Input } from "gpui-base";
import { spaces, panes, focused, exec, readTextFile, watchFolder, theme, settings, run, layout, shared, setShared, nextCommand, openOverlay, home } from "herdr";

function tree(files) {
  const root = { dirs: new Map(), files: [] };
  for (const f of files) {
    let node = root;
    for (const part of f.path.split("/").slice(0, -1)) {
      if (!node.dirs.has(part)) node.dirs.set(part, { dirs: new Map(), files: [] });
      node = node.dirs.get(part);
    }
    node.files.push(f);
  }
  return root;
}

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
  const pane = f?.pane ? panes().find(p => p.pane === f.pane) : null;
  const on = f?.pane === null ? (f.terminal?.includes("/") ? f.terminal.split("/")[0] : null) : space?.machine ?? null;
  return { cwd: pane?.cwd || f?.cwd || space?.folder, on };
}
const key = () => JSON.stringify(location());
const READ = ["--no-optional-locks", "-c", "core.fsmonitor=false", "-c", "diff.autoRefreshIndex=false"];
const countLines = (text) => text ? text.split("\n").length - Number(text.endsWith("\n")) : 0;

function diffRows(lines) {
  let old = 0, next = 0;
  return lines.map((line) => {
    const match = /^@@ -(\d+)(?:,\d+)? \+(\d+)/.exec(line);
    if (match) { old = +match[1]; next = +match[2]; return { kind: "@", text: line }; }
    const kind = line[0];
    if (kind === "-") return { kind, number: old++, text: line.slice(1) || " " };
    if (kind === "+") return { kind, number: next++, text: line.slice(1) || " " };
    if (kind === " ") { old++; return { kind, number: next++, text: line.slice(1) || " " }; }
    return { kind: "", text: line };
  });
}

export default class Changes extends View {
  init(_props, cx) {
    this.files = []; this.rows = []; this.folded = new Set(); this.diffWidth = 0; this.message = ""; this.handle = cx.focus_handle();
    this.input = InputState.new({ placeholder: "Commit message" });
    this.input.on("change", (_e, cx) => {
      const hadMessage = Boolean(this.message.trim());
      this.message = this.input.value();
      if (hadMessage !== Boolean(this.message.trim())) cx.notify();
    });
    this.input.on("submit", (_e, cx) => this.commit(cx));
    this.input.on("focus", (_e, cx) => { this.typing = true; cx.notify(); });
    this.input.on("blur", (_e, cx) => { this.typing = false; cx.notify(); });
    this.refresh(cx);
    cx.timer.every(10000, (cx) => this.refresh(cx));
    cx.spawn(async (cx) => {
      for (;;) {
        if (await nextCommand() === "discard") this.discard(cx);
      }
    });
  }

  watch(root, cx) {
    if (this.on || this.watched === root) return;
    this.watched = root;
    cx.spawn(async (cx) => {
      try {
        while (this.watched === root) {
          await watchFolder(root);
          if (this.watched === root) this.refresh(cx);
        }
      } catch { this.watched = null; }
    });
  }

  refresh(cx) {
    if (this.loading || this.busy) return;
    const { cwd, on } = location(), context = key();
    if (context !== this.context) {
      this.context = context; this.root = null; this.files = []; this.open = null;
      this.setLines([]); this.message = ""; this.input.set_value(""); this.error = null; this.note = null; this.watched = null; this.limited = false; this.ahead = 0;
    }
    if (!cwd) return;
    this.loading = true;
    cx.spawn(async (cx) => {
      try {
        const top = await exec("git", ["rev-parse", "--show-toplevel"], { cwd, on });
        if (key() !== context) return;
        if (top.code !== 0) { this.root = null; this.files = []; this.setLines([]); this.open = null; this.error = "Not a git repository"; return; }
        const root = top.stdout.trim(), git = (args) => exec("git", [...READ, ...args], { cwd: root, on });
        const status = await git(["status", "--porcelain=v1", "-z", "--no-renames", "--untracked-files=all"]);
        if (status.code !== 0) throw new Error(status.stderr);
        const head = await git(["rev-parse", "--verify", "HEAD"]);
        const remotes = (await git(["remote"])).stdout.split("\n").filter(Boolean), remote = remotes.includes("origin") ? "origin" : remotes[0];
        const ahead = remote && head.code === 0 ? Number((await git(["rev-list", "--count", "HEAD", "--not", "--remotes"])).stdout.trim()) || 0 : 0;
        const numstat = async (args) => {
          const result = await git(["diff", ...args, "--numstat", "-z", "--no-renames"]), stats = {};
          if (result.code !== 0) throw new Error(result.stderr);
          for (const entry of result.stdout.split("\0")) {
            const [a, d, ...parts] = entry.split("\t");
            if (parts.length) stats[parts.join("\t")] = { add: Number(a) || 0, del: Number(d) || 0, binary: a === "-" };
          }
          return stats;
        };
        const stagedStats = await numstat(["--cached"]), changedStats = await numstat([]);
        const staged = [], changed = [];
        const letter = (code) => code === "D" ? "D" : code === "A" ? "A" : "M";
        const stagedFile = (path, status) => staged.push({ id: `staged:${path}`, path, status, staged: true, fresh: false, ...(stagedStats[path] ?? { add: 0, del: 0 }) });
        const changedFile = (path, status, fresh) => changed.push({ id: `changed:${path}`, path, status, staged: false, fresh, ...(changedStats[path] ?? { add: 0, del: 0 }) });
        const entries = status.stdout.split("\0").filter(Boolean);
        for (const entry of entries.slice(0, 1000)) {
          const x = entry[0], y = entry[1], path = entry.slice(3);
          if (x === "?") changedFile(path, "A", true);
          else if (x === "U" || y === "U" || (x === y && (x === "A" || x === "D"))) changedFile(path, "U", false);
          else {
            if (x !== " ") stagedFile(path, letter(x));
            if (y !== " ") changedFile(path, letter(y), false);
          }
        }
        const files = [...staged, ...changed];
        if (key() !== context) return;
        this.root = root; this.on = on; this.hasHead = head.code === 0; this.files = files; this.limited = entries.length > 1000; this.error = null;
        this.ahead = ahead; this.remote = remote;
        this.watch(root, cx);
        if (this.open && !files.some((f) => f.id === this.open)) { this.open = null; this.setLines([]); }
        if (this.open) {
          try { await this.load(this.open, context); }
          catch { if (key() === context) this.setLines(["Cannot preview this diff (too large or unreadable)"]); }
        }
      } catch (e) { if (key() === context) this.error = String(e); }
      finally { this.loading = false; cx.notify(); }
    });
  }

  async load(id, context) {
    const file = this.files.find((f) => f.id === id), root = this.root, on = this.on;
    if (!file) return;
    const path = file.path;
    let lines;
    if (file.fresh) {
      const text = await readTextFile(`${root}/${path}`, { on }).catch(() => null);
      if (text === null) lines = ["Cannot preview this file (binary, too large, or unreadable)"];
      else if (text.includes("\0")) lines = ["Binary file · no text diff"];
      else {
        file.add = countLines(text);
        lines = [`@@ -0,0 +1,${file.add} @@`, ...text.slice(0, 400000).replace(/\n$/, "").split("\n").slice(0, 1500).map(l => `+${l}`)];
      }
    } else {
      const base = file.staged ? ["--cached"] : file.status === "U" && this.hasHead ? ["HEAD"] : [];
      const r = await exec("git", [...READ, "diff", ...base, "--no-ext-diff", "--no-textconv", "--no-color", "--", path], { cwd: root, on });
      if (r.code !== 0) throw new Error(r.stderr);
      const all = r.stdout.replace(/\n$/, "").split("\n"), first = all.findIndex((l) => l.startsWith("@@"));
      lines = first < 0 ? [file.binary ? "Binary file changed" : "No text diff available"] : all.slice(first);
    }
    if (key() === context && this.open === id) this.setLines(lines.slice(0, 1500).map(line => line.length > 4000 ? line.slice(0, 4000) + "… (line truncated)" : line));
  }

  setLines(lines) {
    this.rows = diffRows(lines);
    this.diffWidth = Math.max(300, ...lines.map(line => line.length * 7 + 50));
  }

  pick(id, cx) {
    this.open = this.open === id ? null : id; this.setLines([]); this.note = null;
    const context = this.context;
    if (this.open) cx.spawn(async (cx) => {
      try { await this.load(id, context); }
      catch (e) { if (key() === context && this.open === id) this.note = `Cannot preview this diff (too large or unreadable): ${e}`; }
      cx.notify();
    });
    cx.notify();
  }

  commit(cx) {
    if (!this.message.trim() || !this.files.some((f) => f.staged) || this.generating) return;
    const context = this.context, message = this.message.trim();
    this.act("Commit", [["git", ["commit", "-m", message]]], cx, () => {
      if (key() === context) { this.message = ""; this.input.set_value(""); }
    });
  }

  push(cx) {
    if (!this.ahead || this.generating) return;
    this.act("Push", [["git", ["push", "-u", this.remote, "HEAD"]]], cx);
  }

  generate(cx) {
    if (this.generating || this.busy || !this.root || !this.files.some((f) => f.staged)) return;
    const root = this.root, on = this.on, context = this.context;
    this.generating = true; this.note = null;
    cx.spawn(async (cx) => {
      try {
        const rules = await readTextFile(`${home()}/.claude/commands/commit.md`);
        const diff = await exec("git", [...READ, "diff", "--cached", "--no-ext-diff", "--no-textconv", "--no-color"], { cwd: root, on });
        if (diff.code !== 0) throw new Error(diff.stderr.trim());
        const prompt = `Write a git commit subject for the staged diff below, following the style rules. Reply with only the subject line, with no quotes, no explanation and no markdown. Don't run any commands.\n\n${rules}\n\nStaged diff:\n${diff.stdout.slice(0, 20000)}`;
        const r = await exec("claude", ["-p", prompt, "--model", "haiku", "--tools", "", "--no-session-persistence"]);
        if (r.code !== 0) throw new Error((r.stderr || r.stdout).trim());
        const subject = r.stdout.trim().split("\n")[0];
        if (key() === context && subject) { this.message = subject; this.input.set_value(subject); }
      } catch (e) { if (key() === context) this.note = `Generate failed: ${e}`; }
      finally { this.generating = false; cx.notify(); }
    });
    cx.notify();
  }

  act(label, steps, cx, done) {
    if (!this.root || this.busy || this.loading || this.context !== key()) return;
    const root = this.root, on = this.on, context = this.context;
    this.busy = true; this.note = null;
    cx.spawn(async (cx) => {
      try {
        for (const [program, args] of steps) {
          const r = await exec(program, args, { cwd: root, on });
          if (r.code !== 0) throw new Error((r.stderr || r.stdout).trim());
        }
        done?.();
      } catch (e) { if (key() === context) this.note = `${label} failed: ${e}`; }
      finally { this.busy = false; this.refresh(cx); cx.notify(); }
    });
    cx.notify();
  }

  stage(files, cx) {
    this.act("Stage", [["git", ["--literal-pathspecs", "add", "-A", "--", ...files.map((f) => f.path)]]], cx);
  }

  unstage(files, cx) {
    const paths = files.map((f) => f.path);
    this.act("Unstage", [["git", ["--literal-pathspecs", ...(this.hasHead ? ["restore", "--staged"] : ["rm", "--cached", "-r", "-q", "-f"]), "--", ...paths]]], cx);
  }

  askDiscard(title, files) {
    if (this.busy) return;
    this.discarding = { context: this.context, files };
    const count = files.length === 1 ? "1 file" : `${files.length} files`;
    openOverlay({ mod: "confirm", kind: "dialog", modal: true, width: 420, height: 170, props: {
      title,
      detail: `Are you sure to revert ${count}?`,
      command: { name: "layout-changes.discard" },
    } });
  }

  discard(cx) {
    const pending = this.discarding;
    this.discarding = null;
    if (!pending || pending.context !== this.context) return;
    const tracked = pending.files.filter((f) => !f.fresh).map((f) => f.path), fresh = pending.files.filter((f) => f.fresh).map((f) => `${this.root}/${f.path}`);
    this.act("Discard", [
      ...(tracked.length ? [["git", ["--literal-pathspecs", "restore", "--", ...tracked]]] : []),
      ...(fresh.length ? [["trash", fresh]] : []),
    ], cx);
  }

  fold(id, cx) {
    if (this.folded.has(id)) this.folded.delete(id); else this.folded.add(id);
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
    if (kind === "@") return div().w_full().px(12).h(20).flex_none().truncate().bg("#283457").text_color(t.muted).child(text);
    return h_flex().w_full().h(20).flex_none().gap(10).when(kind === "+", (e) => e.bg(t.ansi2 + "59")).when(kind === "-", (e) => e.bg(t.ansi1 + "59"))
      .child(div().w(30).flex_none().text_right().text_color(t.dim).child(number === undefined ? "" : String(number)))
      .child(div().flex_1().min_w(0).truncate().child(text));
  }

  render(cx) {
    if (key() !== this.context) this.refresh(cx);
    const t = theme(), add = this.files.reduce((n, f) => n + f.add, 0), del = this.files.reduce((n, f) => n + f.del, 0);
    const staged = this.files.filter((f) => f.staged), changed = this.files.filter((f) => !f.staged);
    const enabled = Boolean(this.message.trim() && staged.length && this.root && !this.busy && !this.loading && !this.generating);
    const canGenerate = Boolean(staged.length && this.root && !this.busy && !this.generating);
    const pushMode = Boolean(!staged.length && this.ahead && this.root), ready = pushMode ? !this.busy && !this.loading && !this.generating : enabled;
    const commits = `${this.ahead} ${this.ahead === 1 ? "commit" : "commits"} to push`;
    const icon = (id, path, action) => div().id(id).size(20).flex_none().flex().items_center().justify_center().rounded(5).cursor_pointer().on_click(action).child(svg(path).size(14).text_color(t.muted));
    const chevron = (open) => svg(`mods/layout-files/chevron-${open ? "down" : "right"}.svg`).size(12).flex_none().text_color(t.dim);
    const actions = (key, files, header) => {
      const live = files.filter((f) => f.status !== "U"), list = header ? "list-" : "";
      const button = (id, path, handler) => icon(`${id}-${key}`, `mods/layout-changes/${path}.svg`, (_e, cx) => { cx.stop_propagation(); handler(cx); }).hover((s) => s.bg(header ? t.hover : "#3b4261"));
      if (files[0]?.staged) return [button("unstage", `${list}minus`, (cx) => this.unstage(files, cx))];
      return live.length ? [button("discard", "undo-2", () => this.askDiscard(live.length === 1 ? "Discard changes?" : "Discard all changes?", live)), button("stage", `${list}plus`, (cx) => this.stage(live, cx))] : [];
    };
    const item = (key, depth, files, content) => {
      const shown = this.hovered === key ? actions(key, files) : [];
      return h_flex().id(key).h(28).flex_none().pl(8 + depth * 14).pr(shown.length ? 5 : 8).gap(7).items_center().rounded(7).cursor_pointer()
        .on_hover((on, cx) => { if (on) this.hovered = key; else if (this.hovered === key) this.hovered = null; cx.notify(); })
        .children(content).when(shown.length > 0, (e) => e.child(h_flex().flex_none().gap(4).items_center().children(shown)));
    };
    const row = (f, depth) => item(`change-${f.id}`, depth, [f], [
      div().w(12).flex_none(),
      div().w(16).flex_none().text_center().text_size(11).text_color(f.status === "A" ? t.ansi2 : f.status === "D" || f.status === "U" ? t.ansi1 : t.ansi4).child(f.status),
      div().flex_1().min_w(0).truncate().child(f.path.split("/").pop()),
    ]).when(this.open === f.id, (e) => e.bg(t.selected)).when(this.open !== f.id, (e) => e.hover((s) => s.bg(t.hover))).on_click((_e, cx) => this.pick(f.id, cx));
    const folder = (id, label, depth, open, files) => item(`dir-${id}`, depth, files, [
      chevron(open),
      image("mods/layout-files/symbols/folders/folder.svg").size(16).flex_none(),
      div().flex_1().min_w(0).truncate().text_color(t.muted).child(label),
    ]).hover((s) => s.bg(t.hover)).on_click((_e, cx) => this.fold(id, cx));
    const collect = (node) => [...node.files, ...[...node.dirs.values()].flatMap(collect)];
    const rows = (group, node, prefix, depth) => [
      ...[...node.dirs].sort(([a], [b]) => a.localeCompare(b)).flatMap(([name, child]) => {
        let label = name, path = prefix + name;
        while (child.dirs.size === 1 && !child.files.length) {
          const [[next, only]] = child.dirs;
          label += ` / ${next}`; path += `/${next}`; child = only;
        }
        const id = `${group}:${path}`, open = !this.folded.has(id);
        return [folder(id, label, depth, open, collect(child)), ...(open ? rows(group, child, path + "/", depth + 1) : [])];
      }),
      ...node.files.sort((a, b) => a.path.localeCompare(b.path)).flatMap((f) => this.open === f.id ? [row(f, depth), diff()] : [row(f, depth)]),
    ];
    const diff = () => {
      const head = this.rows[0]?.kind === "@", lines = head ? this.rows.slice(1) : this.rows;
      return v_flex().w_full().flex_none().my(4).font_family(settings().font_family ?? "JetBrains Mono").text_size(11)
        .when(head, (e) => e.child(this.diffRow(this.rows[0], t).rounded_t(7)))
        .child(div().id("changes-diff-x").w_full().h(lines.length * 20).overflow_x_scrollbar()
          .child(v_flex().w_full().min_w(this.diffWidth).children(lines.map((r, i) => i === lines.length - 1 ? this.diffRow(r, t).rounded_b(7) : this.diffRow(r, t)))));
    };
    const group = (label, files, gap) => {
      if (!files.length) return [];
      const open = !this.folded.has(label);
      return [h_flex().id(`group-${label}`).h(24).mt(gap).mb(2).flex_none().pl(8).pr(5).gap(7).items_center().border_b(1).border_color(t.selected).text_size(11).font_semibold().text_color(t.dim).cursor_pointer().on_click((_e, cx) => this.fold(label, cx))
        .child(chevron(open)).child(div().flex_1().child(label)).child(h_flex().gap(4).children(actions(label, files, true))), ...(open ? rows(label, tree(files), "", 0) : [])];
    };
    return v_flex().id("changes").size_full().min_h(0).rounded(6).overflow_hidden().bg(t.background).border(1.5).border_color(t.border).text_color(t.foreground).text_size(13).track_focus(this.handle)
      .on_key_down((e, cx) => {
        if (e.key === "escape" && this.typing) { this.typing = false; this.handle.focus(); cx.stop_propagation(); cx.notify(); }
      })
      .child(h_flex().h(42).flex_none().px(14).gap(8).items_center().border_b(1).border_color(t.border)
        .child(div().font_semibold().child("Changes"))
        .child(div().px(5).py(1).rounded(4).border_1().border_color("#3b4261").text_size(10).text_color(t.muted).child(`${new Set(this.files.map((f) => f.path)).size} files`))
        .child(div().flex_1()).child(div().text_size(11).text_color(t.ansi2).child(`+${add}`)).child(div().text_size(11).text_color(t.ansi1).child(`−${del}`))
        .child(div().id("changes-expand").size(26).flex().items_center().justify_center().rounded(6).cursor_pointer().hover((s) => s.bg(t.hover)).on_click(() => this.toggleExpanded()).child(svg("mods/layout-changes/maximize.svg").size(14).text_color(t.muted))))
      .child(v_flex().id("changes-list").flex_1().min_h(0).overflow_y_scrollbar().p(6).children([...group("Staged", staged, 0), ...group("Changes", changed, staged.length ? 12 : 0)]).when(!this.files.length, (e) => e.child(div().p(8).text_color(t.dim).child(this.error || (this.loading ? "Loading changes…" : this.root ? (this.ahead ? commits : "No uncommitted changes") : "No folder")))))
      .when(this.limited, el => el.child(div().px(12).py(4).text_size(11).text_color(t.dim).child("Showing the first 1,000 changed files")))
      .when(Boolean(this.note), (e) => e.child(div().px(10).pb(8).text_size(11).text_color(t.ansi1).child(this.note)))
      .child(v_flex().flex_none().p(10).gap(8).border_t(1).border_color(t.border)
        .child(h_flex().gap(8)
        .child(div().id("commit-message").flex_1().min_w(0).h(32).px(10).flex().items_center().rounded(8).border_1().border_color(this.typing ? t.accent : t.border).cursor_text().on_mouse_down("left", (_e, cx) => cx.stop_propagation()).child(Input.new(this.input).h_full().text_size(12).text_color(t.foreground)))
        .child(div().id("generate-message").size(32).flex_none().flex().items_center().justify_center().rounded(8).border_1().border_color(t.border).when(canGenerate, (e) => e.cursor_pointer().hover((s) => s.bg(t.hover))).on_click((_e, cx) => this.generate(cx))
          .child(this.generating ? svg("mods/workspace-chrome/spinner.svg").size(14).text_color(t.muted).spin(900) : svg("mods/layout-changes/wand-sparkles.svg").size(14).text_color(canGenerate ? t.muted : t.dim))))
        .child(div().id("commit").w_full().h(32).px(14).flex().items_center().justify_center().rounded(8).bg(ready ? t.accent : t.raised).text_color(ready ? "#11111b" : t.dim).text_size(12).when(ready, (e) => e.cursor_pointer().hover((s) => s.bg(t.accent + "e6"))).on_click((_e, cx) => pushMode ? this.push(cx) : this.commit(cx)).child(pushMode ? (this.busy ? "Pushing…" : `Push [${this.ahead}]`) : this.busy ? "Committing…" : "Commit")));
  }
}
