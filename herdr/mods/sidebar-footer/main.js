import { View, div } from "gpui-kit";
import { h_flex, v_flex } from "gpui-base";
import { theme, exec, run } from "herdr";

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

const SPOTIFY = `
if application "Spotify" is running then
  tell application "Spotify"
    if player state is stopped then return "stopped"
    return (player state as string) & linefeed & (name of current track) & linefeed & (artist of current track)
  end tell
end if
return "off"`;

const STATS = `
pmset -g batt | grep -Eo '[0-9]+%; [a-zA-Z ]+' | head -1
vm_stat | awk -v total="$(sysctl -n hw.memsize)" '/page size of/ {ps=$8} /Pages active/ {a=$3} /Pages wired/ {w=$4} /occupied by compressor/ {c=$5} END {printf "%d\\n", (a+w+c)*ps*100/total}'`;

const spotify = (command) => exec("osascript", ["-e", `tell application "Spotify" to ${command}`]);

const pad = (n) => String(n).padStart(2, "0");

const hasTrack = (player) => player === "playing" || player === "paused";

export default class SidebarFooter extends View {
  init(_props, cx) {
    this.battery = "";
    this.ram = "";
    this.refreshSpotify(cx);
    this.refreshStats(cx);
    cx.timer.every(5000, (cx) => this.refreshSpotify(cx));
    cx.timer.every(10000, (cx) => this.refreshStats(cx));
    cx.timer.every(15000, (cx) => cx.notify());
  }

  refreshSpotify(cx) {
    cx.spawn(async (cx) => {
      const r = await exec("osascript", ["-e", SPOTIFY]).catch(() => null);
      const out = r?.code === 0 ? r.stdout.trim() : "";
      const [player, track, artist] = out.split("\n");
      this.player = player;
      this.track = track ?? "";
      this.artist = artist ?? "";
      const height = hasTrack(player) ? 101 : 40;
      if (height !== this.height) {
        this.height = height;
        run("layout.resize", { id: "sidebar-footer", px: height });
      }
      cx.notify();
    });
  }

  refreshStats(cx) {
    cx.spawn(async (cx) => {
      const r = await exec("sh", ["-c", STATS]).catch(() => null);
      const [battery = "", ram = ""] = (r?.stdout ?? "").trim().split("\n");
      this.battery = battery.split("%")[0];
      this.charging = /charg|AC/.test(battery) && !/discharging/.test(battery);
      this.ram = ram;
      cx.notify();
    });
  }

  control(id, glyph, command) {
    const t = theme();
    return div().id(id).w(23).h(23).flex().items_center().justify_center().rounded(5)
      .text_color(t.muted).cursor_pointer().hover((s) => s.bg(t.hover))
      .on_click((_e, cx) => cx.spawn(async (cx) => { await spotify(command).catch(() => null); this.refreshSpotify(cx); }))
      .child(glyph);
  }

  stat(glyph, value) {
    const t = theme();
    return h_flex().gap(3).items_center().child(div().text_color(t.dim).child(glyph)).child(div().text_color(t.muted).child(`${value}%`));
  }

  clockRow() {
    const t = theme();
    const now = new Date();
    return h_flex().gap(10).items_center()
      .child(div().text_color(t.foreground).child(`${pad(now.getHours())}:${pad(now.getMinutes())}`))
      .child(div().flex_1().truncate().text_color(t.muted).child(`${DAYS[now.getDay()]} ${now.getDate()} ${MONTHS[now.getMonth()]}`))
      .when(this.battery !== "", (el) => el.child(this.stat(this.charging ? "󰂄" : "󰁹", this.battery)))
      .when(this.ram !== "", (el) => el.child(this.stat("󰍛", this.ram)));
  }

  spotifyRows(root) {
    const t = theme();
    if (!hasTrack(this.player)) return root;
    const playing = this.player === "playing";
    return root
      .child(h_flex().gap(8).items_center()
        .child(div().text_color(playing ? t.done : t.dim).child("󰓇"))
        .child(div().flex_1().truncate().text_color(t.foreground).child(this.track)))
      .child(h_flex().gap(4).items_center()
        .child(div().flex_1().truncate().text_color(t.muted).child(this.artist))
        .child(this.control("prev", "󰒮", "previous track"))
        .child(this.control("toggle", playing ? "󰏤" : "󰐊", "playpause"))
        .child(this.control("next", "󰒭", "next track")));
  }

  render() {
    const t = theme();
    const root = v_flex().size_full().bg(t.chrome).border_t(1).border_color(t.border).px(16).py(10).gap(6).justify_center().text_size(13.125)
      .child(this.clockRow());
    return this.spotifyRows(root);
  }
}
