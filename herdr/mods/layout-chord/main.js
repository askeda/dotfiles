import { View, div } from "gpui-kit";
import { run, props, closeOverlay, spaces, panes, focused, exec } from "herdr";

const CHORDS = new Map([
  ["c", "layout-files.collapse_all"],
  ["h", "layout-tabs.close_left"],
  ["l", "layout-tabs.close_right"],
  ["p", "layout-agents.pin"],
  ["r", "tab.rename"],
]);

const OPEN = new Map([
  ["f", (folder) => [folder]],
  ["v", (folder) => ["-a", "Visual Studio Code", folder]],
]);

function folder() {
  const space = spaces().find(s => s.active), f = focused();
  if (!f?.pane || space?.machine) return null;
  return panes().find(p => p.pane === f.pane)?.cwd || f.cwd || space?.folder || null;
}

export default class Chord extends View {
  init(_props, cx) {
    this.handle = cx.focus_handle();
    this.handle.focus();
  }

  render() {
    return div().id("chord").track_focus(this.handle).size_full()
      .on_key_down((e, cx) => {
        closeOverlay(props().overlay);
        const command = CHORDS.get(e.key), args = OPEN.get(e.key), path = args && folder();
        if (command) run(command);
        else if (path) cx.spawn(async () => { await exec("open", args(path)).catch(() => null); });
      });
  }
}
