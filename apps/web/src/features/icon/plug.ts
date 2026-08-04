import { type Html, inertHtml as ih } from "foldkit/html"

export const plug = (className: string = "size-4"): Html =>
  ih.svg(
    [
      ih.Xmlns("http://www.w3.org/2000/svg"),
      ih.AriaHidden(true),
      ih.Class(className),
      ih.ViewBox("0 0 24 24"),
      ih.Width("24"),
      ih.Height("24"),
      ih.Fill("none"),
      ih.Stroke("currentColor"),
      ih.StrokeWidth("2"),
      ih.StrokeLinecap("round"),
      ih.StrokeLinejoin("round"),
    ],
    [
      ih.path([ih.D("M12 22v-5")], []),
      ih.path([ih.D("M9 8V2")], []),
      ih.path([ih.D("M15 8V2")], []),
      ih.path([ih.D("M6 8h12v5a6 6 0 0 1-12 0Z")], []),
    ],
  )
