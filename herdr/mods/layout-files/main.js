import { View, div, svg, image } from "gpui-kit";
import { v_flex, h_flex, Editor, EditorState, Input, InputState } from "gpui-base";
import { spaces, panes, focused, exec, readTextFile, watchFolder, theme, settings, run, nextCommand, notify, shared } from "herdr";
import { EXTENSIONS, NAMES, FOLDERS, FILE, FOLDER } from "./symbols.js";

const lookup = (map, key) => Object.prototype.hasOwnProperty.call(map, key) ? map[key] : null;

function symbol(entry) {
  const name = entry.name.toLowerCase();
  if (entry.dir) return lookup(FOLDERS, name) ?? FOLDER;
  const exact = lookup(NAMES, name);
  if (exact) return exact;
  const parts = name.split(".");
  for (let i = 1; i < parts.length; i++) {
    const found = lookup(EXTENSIONS, parts.slice(i).join("."));
    if (found) return found;
  }
  return FILE;
}

function location() {
  const space = spaces().find(s => s.active), f = focused();
  const pane = f?.pane ? panes().find(p => p.pane === f.pane) : null;
  const on = f?.pane === null ? (f.terminal?.includes("/") ? f.terminal.split("/")[0] : null) : space?.machine ?? null;
  return { cwd: pane?.cwd || f?.cwd || space?.folder, on, space: space?.id };
}
const key = () => JSON.stringify(location());
const LANG = { ts: "js", tsx: "js", mts: "js", cts: "js", jsx: "js", mjs: "js", toml: "yaml", jsonc: "json", svelte: "html", vue: "html" };
const PER_FOLDER = 500, TOTAL = 5000;
const parent = (path) => path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";
const base = (path) => path.slice(path.lastIndexOf("/") + 1);
const join = (folder, name) => folder ? `${folder}/${name}` : name;
const folderAt = (item) => item ? (item.dir ? item.path : parent(item.path)) : "";
const RENAME = '[ -e "$2" ] && { echo "${2##*/} already exists" >&2; exit 1; }; mv -- "$1" "$2"';
const MOVE = 'case "$2/" in "$1"/*) echo "Cannot paste a folder into itself" >&2; exit 1;; esac; dest="$2/${1##*/}"; [ "$1" = "$dest" ] && exit 0; [ -e "$dest" ] && { echo "${1##*/} already exists there" >&2; exit 1; }; mv -- "$1" "$dest"';
const CREATE = '[ -e "$1" ] && { echo "${1##*/} already exists" >&2; exit 1; }; case "$1" in */) mkdir -p -- "$1";; *) mkdir -p -- "$(dirname -- "$1")" && : > "$1";; esac';
const COPY = 'case "$2/" in "$1"/*) echo "Cannot paste a folder into itself" >&2; exit 1;; esac; name=${1##*/}; dest="$2/$name"; if [ -e "$dest" ]; then stem=${name%.*}; ext=${name#"$stem"}; [ -z "$stem" ] && { stem=$name; ext=; }; i=1; dest="$2/$stem copy$ext"; while [ -e "$dest" ]; do i=$((i+1)); dest="$2/$stem copy $i$ext"; done; fi; cp -R -- "$1" "$dest"';

async function directory(path, on) {
  const script = 'n=0; for p in "$1"/* "$1"/.[!.]* "$1"/..?*; do [ -e "$p" ] || [ -L "$p" ] || continue; name=${p##*/}; [ "$name" = .git ] && continue; if [ -d "$p" ]; then kind=d; else kind=f; fi; printf "%s\\0%s\\0" "$kind" "$name"; n=$((n+1)); [ "$n" -gt 500 ] && break; done; test -d "$1"';
  const r = await exec("sh", ["-c", script, "files", path], { on });
  if (r.code !== 0) throw new Error(r.stderr || "Cannot list this folder");
  const fields = r.stdout.split("\0"), out = [];
  for (let i = 0; i + 1 < fields.length; i += 2) out.push({ name: fields[i + 1], dir: fields[i] === "d" });
  return out;
}

export default class Files extends View {
  init(_props, cx) {
    this.saved = new Map();
    this.handle = cx.focus_handle();
    this.cursor = 0;
    this.items = [];
    this.refresh(cx);
    cx.timer.every(10000, cx => this.refresh(cx));
    cx.spawn(async cx => {
      for (;;) {
        const command = await nextCommand();
        if (command === "collapse_all") this.collapse(cx);
        else if (command === "focus") { this.handle.focus(); cx.notify(); }
        else if (command === "back" && this.file) this.closeFile(cx);
      }
    });
  }

  watch(root, cx) {
    if (this.on || this.watched === root) return;
    this.watched = root;
    const context = this.context;
    cx.spawn(async cx => {
      try { while (this.context === context) { await watchFolder(root); if (this.current(context)) this.refresh(cx); } }
      catch { if (this.context === context) this.watched = null; }
    });
  }

  current(context) {
    return this.context === context && key() === context.key;
  }

  async loadFolder(path, context) {
    const { on, cwd: root } = context;
    const entries = await directory(path ? `${root}/${path}` : root, on);
    if (!this.current(context) || (path && !this.folders.has(path))) return;
    const used = [...this.entries.entries()].filter(([p]) => p !== path).reduce((n, [, e]) => n + e.length, 0);
    this.entries.set(path, entries.slice(0, Math.max(0, Math.min(PER_FOLDER, TOTAL - used))).sort((a, b) => Number(b.dir) - Number(a.dir) || a.name.localeCompare(b.name)));
    if (entries.length > PER_FOLDER || used + entries.length > TOTAL) this.limited = true;
  }

  refresh(cx) {
    const { cwd, on } = location(), next = key();
    if (next !== this.context?.key) {
      if (this.context) this.saved.set(this.context.key, { folders: this.folders, file: this.file });
      const saved = this.saved.get(next);
      this.context = { key: next, cwd, on }; this.root = cwd; this.on = on; this.entries = new Map(); this.folders = new Set(saved?.folders);
      this.pending = new Set(); this.marks = {}; this.show(null); this.watched = null; this.error = null; this.limited = false;
      this.loading = false; this.editing = null; this.origin = null;
      if (saved?.file) this.show(saved.file, cx);
    }
    if (!cwd || this.loading) return;
    const context = this.context;
    this.loading = true;
    this.limited = false;
    cx.spawn(async cx => {
      try {
        for (const path of ["", ...this.folders]) {
          if (!this.current(context)) return;
          await this.loadFolder(path, context);
        }
        const top = await exec("git", ["rev-parse", "--show-toplevel"], { cwd, on }).catch(() => null);
        const marks = {};
        if (top?.code === 0) {
          const status = await exec("git", ["--no-optional-locks", "-c", "core.fsmonitor=false", "status", "--porcelain=v1", "-z", "--no-renames", "--untracked-files=all"], { cwd, on }).catch(() => null);
          if (status?.code === 0) for (const entry of status.stdout.split("\0").filter(Boolean).slice(0, TOTAL)) {
            const xy = entry.slice(0, 2);
            marks[`${top.stdout.trim()}/${entry.slice(3)}`] = xy === "??" || xy.includes("A") ? "A" : xy.includes("U") ? "U" : xy.includes("D") ? "D" : "M";
          }
        }
        if (!this.current(context)) return;
        this.marks = marks; this.error = null; this.watch(cwd, cx);
      } catch (e) { if (this.current(context)) this.error = String(e); }
      finally { if (this.context === context) this.loading = false; cx.notify(); }
    });
  }

  forget(path) {
    for (const folder of [...this.folders]) if (folder === path || folder.startsWith(path + "/")) {
      this.folders.delete(folder);
      this.entries.delete(folder);
    }
  }

  toggle(path, cx) {
    if (this.folders.has(path)) this.forget(path);
    else {
      this.folders.add(path);
      if (!this.entries.has(path) && !this.pending.has(path)) {
        const context = this.context;
        this.pending.add(path);
        cx.spawn(async cx => {
          try { await this.loadFolder(path, context); }
          catch (e) { if (this.current(context)) this.error = String(e); }
          finally { if (this.context === context) this.pending.delete(path); cx.notify(); }
        });
      }
    }
    cx.notify();
  }

  show(path, cx) {
    this.code?.release(); this.code = null; this.file = path; this.fileError = null;
    if (!path || !cx) return;
    const context = this.context, root = this.root, on = this.on;
    cx.spawn(async cx => {
      try {
        const text = await readTextFile(`${root}/${path}`, { on });
        if (this.file !== path || !this.current(context)) return;
        if (text === null) { this.fileError = "This file is no longer available"; return; }
        if (text.includes("\0")) { this.fileError = "Binary file · no text preview"; return; }
        const t = theme(), ext = path.includes(".") ? path.split(".").pop() : "txt";
        this.code = EditorState.new({ language: LANG[ext] ?? ext, readonly: true,
          value: text.length > 400000 ? text.slice(0, 400000) + "\n… (file truncated)" : text,
          font_family: settings().font_family, font_size: 12,
          syntax: { keyword: t.ansi5, string: t.ansi2, comment: t.dim, function: t.ansi4, type: t.ansi3, number: t.ansi1, constant: t.ansi6 } });
      } catch { if (this.file === path && this.current(context)) this.fileError = "Cannot preview this file (binary, too large, or unreadable)"; }
      finally { cx.notify(); }
    });
  }

  rows(prefix, depth, out, t) {
    if (out.length >= TOTAL || depth > 40) return out;
    if (this.editing?.kind === "create" && this.editing.folder === prefix)
      out.push(h_flex().id("file-new").h(28).flex_none().pl(8 + depth * 18).pr(8).gap(7).items_center()
        .child(div().w(12).flex_none())
        .when(this.editing.dir, el => el.child(image(`mods/layout-files/symbols/${FOLDER}`).size(16).flex_none()))
        .child(this.field(this.editing.input, t)));
    for (const entry of this.entries.get(prefix) ?? []) {
      if (out.length >= TOTAL) break;
      const path = join(prefix, entry.name), open = this.folders.has(path), mark = this.marks[this.abs(path)];
      const index = this.items.length, selected = index === this.cursor && this.handle.is_focused();
      this.items.push({ path, dir: entry.dir });
      out.push(h_flex().id(`file-${path}`).h(28).flex_none().pl(8 + depth * 18).pr(8).gap(7).items_center().rounded(7).cursor_pointer().hover(s => s.bg(t.hover))
        .when(selected, el => el.bg(t.selected))
        .on_click((_e, cx) => { this.cursor = index; this.open({ path, dir: entry.dir }, cx); })
        .child(entry.dir ? svg(`mods/layout-files/chevron-${open ? "down" : "right"}.svg`).size(12).flex_none().text_color(t.dim) : div().w(12).flex_none())
        .child(image(`mods/layout-files/symbols/${symbol(entry)}`).size(16).flex_none())
        .when(this.clip?.cut === true && this.clip.src === this.abs(path), el => el.opacity(0.5))
        .child(this.editing?.kind === "rename" && this.editing.path === path
          ? this.field(this.editing.input, t)
          : div().flex_1().min_w(0).truncate().child(entry.name))
        .when(Boolean(mark), el => el.child(div().text_size(11).text_color(mark === "A" ? t.ansi2 : mark === "D" || mark === "U" ? t.ansi1 : t.blocked).child(mark))));
      if (entry.dir && open) this.rows(path, depth + 1, out, t);
    }
    return out;
  }

  field(input, t) {
    return Input.new(input).flex_1().min_w(0).h(22).px(4).rounded(5).border_1().border_color(t.accent).bg(t.background).text_size(13).text_color(t.foreground);
  }

  open(item, cx) {
    this.origin = null;
    if (item.dir) this.toggle(item.path, cx);
    else this.show(item.path, cx);
  }

  closeFile(cx) {
    const origin = this.origin;
    this.origin = null;
    this.show(null);
    cx.notify();
    if (!origin) return this.handle.focus();
    if (!origin.expanded) {
      run("layout.show", { id: "main" });
      run("layout.resize", { id: "panel", px: shared("panel.width") ?? 360 });
    }
    if (!origin.panel) run("layout.hide", { id: "panel" });
    this.leave();
  }

  collapse(cx) {
    this.folders?.clear();
    for (const path of [...(this.entries?.keys() ?? [])]) if (path) this.entries.delete(path);
    cx.notify();
  }

  abs(path) {
    return path ? `${this.root}/${path}` : this.root;
  }

  leave() {
    const pane = focused()?.pane;
    if (pane) run("pane.focus", { pane });
  }

  onKey(e, cx) {
    if (this.editing) {
      if (e.key !== "escape") return;
      this.editing = null;
      this.handle.focus();
      cx.stop_propagation();
      cx.notify();
      return;
    }
    if (e.modifiers.platform || e.modifiers.control || e.modifiers.alt) return;
    const last = this.items.length - 1, item = this.items[this.cursor];
    if (e.key === "escape") this.leave();
    else if (this.file) return;
    else if (e.key === "j") this.cursor = Math.min(this.cursor + 1, last);
    else if (e.key === "k") this.cursor = Math.max(this.cursor - 1, 0);
    else if (e.key === "enter" && item) this.open(item, cx);
    else if (e.key === "d" && item) this.remove(item, cx);
    else if (e.key === "r" && item) this.startRename(item);
    else if (e.key.toLowerCase() === "a") this.startCreate(item, e.modifiers.shift, cx);
    else if ((e.key === "c" || e.key === "x") && item) this.clip = { src: this.abs(item.path), on: this.on, cut: e.key === "x" };
    else if (e.key === "p" && this.clip) this.paste(item, cx);
    else return;
    cx.stop_propagation();
    cx.notify();
  }

  operate(label, command, args, cx) {
    const context = this.context, on = this.on;
    cx.spawn(async cx => {
      const r = await exec(command, args, { on }).catch(e => ({ code: 1, stderr: String(e) }));
      if (!this.current(context)) return;
      if (r.code !== 0) notify({ title: `${label} failed`, body: r.stderr.trim(), level: "error" });
      this.refresh(cx);
      cx.notify();
    });
  }

  remove(item, cx) {
    if (this.on) { notify({ title: "Delete works only on this Mac", level: "warning" }); return; }
    this.forget(item.path);
    if (this.clip?.src === this.abs(item.path)) this.clip = null;
    this.operate("Delete", "trash", [this.abs(item.path)], cx);
  }

  edit(value) {
    const input = InputState.new({ value });
    input.on("submit", (_e, cx) => this.finishEdit(cx));
    input.on("blur", (_e, cx) => {
      if (this.editing?.input !== input) return;
      this.editing = null;
      cx.notify();
    });
    input.focus();
    return input;
  }

  startRename(item) {
    const name = base(item.path), dot = name.lastIndexOf("."), input = this.edit(name);
    input.set_selected_range({ start: 0, end: !item.dir && dot > 0 ? dot : name.length });
    this.editing = { kind: "rename", path: item.path, input };
  }

  startCreate(item, dir, cx) {
    const folder = folderAt(item);
    if (folder && !this.folders.has(folder)) this.toggle(folder, cx);
    this.editing = { kind: "create", folder, dir, input: this.edit("") };
  }

  finishEdit(cx) {
    const editing = this.editing, name = editing.input.value().trim();
    this.editing = null;
    this.handle.focus();
    if (editing.kind === "rename") this.rename(editing.path, name, cx);
    else this.create(editing.folder, editing.dir && name && !name.endsWith("/") ? `${name}/` : name, cx);
    cx.notify();
  }

  rename(path, name, cx) {
    if (!name || name.includes("/") || name === base(path)) return;
    this.forget(path);
    this.operate("Rename", "sh", ["-c", RENAME, "files", this.abs(path), this.abs(join(parent(path), name))], cx);
  }

  create(folder, name, cx) {
    if (!name || name.startsWith("/") || name.split("/").includes("..")) return;
    this.operate("Create", "sh", ["-c", CREATE, "files", this.abs(join(folder, name))], cx);
  }

  paste(item, cx) {
    const folder = folderAt(item), { src, on, cut } = this.clip;
    if (on !== this.on) { notify({ title: "Paste works only on the same machine", level: "warning" }); return; }
    if (cut) {
      this.clip = null;
      if (src.startsWith(`${this.root}/`)) this.forget(src.slice(this.root.length + 1));
    }
    if (folder) this.folders.add(folder);
    this.operate(cut ? "Move" : "Copy", "sh", ["-c", cut ? MOVE : COPY, "files", src, this.abs(folder)], cx);
  }

  action(id, icon, act) {
    return div().id(id).size(26).flex().items_center().justify_center().rounded(6).cursor_pointer().hover(s => s.bg(theme().hover))
      .on_click((_e, cx) => act(cx)).child(svg(icon).size(14).text_color(theme().muted));
  }

  launch(args, cx) {
    if (!this.root || this.on) return;
    cx.spawn(async () => { await exec("open", args).catch(() => null); });
  }

  openFinder(cx) {
    this.launch(this.file ? ["-R", this.abs(this.file)] : [this.root], cx);
  }

  openVSCode(cx) {
    this.launch(["-a", "Visual Studio Code", this.root], cx);
  }

  render(cx) {
    if (key() !== this.context?.key) this.refresh(cx);
    const request = shared("files.open");
    if (request?.at && request.at !== this.opened && Date.now() - request.at < 5000) {
      this.opened = request.at;
      this.origin = request;
      this.show(request.path, cx);
    }
    const t = theme();
    this.items = [];
    const rows = this.file ? [] : this.rows("", 0, [], t);
    this.cursor = Math.max(0, Math.min(this.cursor, this.items.length - 1));
    return v_flex().id("files").track_focus(this.handle).on_key_down((e, cx) => this.onKey(e, cx)).on_mouse_down("left", () => this.handle.focus()).size_full().min_h(0).rounded(6).overflow_hidden().bg(t.background).border(1.5).border_color(t.border).text_color(t.foreground).text_size(13)
      .child(h_flex().h(42).flex_none().px(14).gap(8).items_center().border_b(1).border_color(t.border)
        .when(Boolean(this.file), el => el.child(div().id("files-back").size(20).flex().items_center().justify_center().rounded(5).cursor_pointer().hover(s => s.bg(t.hover)).text_color(t.muted).on_click((_e, cx) => this.closeFile(cx)).child("←")))
        .child(div().flex_1().min_w(0).truncate().when(Boolean(this.file), el => el.text_size(12).text_color(t.dim)).when(!this.file, el => el.font_semibold()).child(this.file ?? "Files"))
        .child(h_flex().flex_none().gap(2).items_center()
          .when(Boolean(this.file), el => el.child(this.action("files-refresh", "mods/layout-files/refresh-cw.svg", (cx) => this.show(this.file, cx))))
          .when(!this.file, el => el.child(this.action("files-collapse", "mods/layout-files/copy-minus.svg", (cx) => this.collapse(cx))))
          .when(Boolean(this.root) && !this.on, el => el
            .child(this.action("files-finder", "mods/layout-files/finder.svg", (cx) => this.openFinder(cx)))
            .child(this.action("files-vscode", "mods/layout-files/vscode.svg", (cx) => this.openVSCode(cx))))
          .child(this.action("files-expand", "mods/layout-files/maximize.svg", () => run("layout-tabs.expand")))))
      .when(!this.file, el => el.child(v_flex().id("files-tree").flex_1().min_h(0).overflow_y_scrollbar().p(6).children(rows)
        .when(Boolean(this.error) || !this.entries.get("")?.length, el => el.child(div().p(8).text_size(12).text_color(t.dim).child(this.error || (this.loading ? "Loading files…" : this.root ? "No files" : "No folder"))))
        .when(this.limited, el => el.child(div().p(8).text_size(11).text_color(t.dim).child("File list limited to 500 entries per folder and 5,000 total")))))
      .when(Boolean(this.file), el => el.child(this.code ? Editor.new(this.code).flex_1().min_h(0) : div().p(12).text_color(t.dim).child(this.fileError || "Loading file…")));
  }
}
