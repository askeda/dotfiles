import { View, div, image } from "gpui-kit";
import { h_flex } from "gpui-base";
import { theme, window, layout } from "herdr";

function find(node, id) {
  if (node?.id === id) return node;
  for (const child of node?.children ?? []) {
    const found = find(child, id);
    if (found) return found;
  }
  return null;
}

const narrow = () => (find(layout(), "sidebar")?.size?.px ?? Infinity) < 160;

export default class LayoutChrome extends View {
  render() {
    const t = theme();
    const collapsed = narrow();
    return h_flex().size_full().bg(t.chrome).pl(collapsed ? 6 : 14).pr(10).gap(4).items_center().text_size(13.5)
      .when(window()?.platform === "macos" && !window()?.fullscreen && !collapsed, el => el.pl(76))
      .when(!collapsed, el => el.child(h_flex().flex_1().gap(8).items_center().child(image("mods/layout-chrome/logo.png").size(24).rounded(5)).child(div().font_semibold().text_color(t.foreground).child("Askeda"))));
  }
}
