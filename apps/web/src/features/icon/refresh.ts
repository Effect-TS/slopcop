import { type Html, inertHtml as ih } from "foldkit/html"

export const refresh = (className: string = "size-4"): Html =>
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
      ih.path([ih.D("M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8")]),
      ih.path([ih.D("M21 3v5h-5")]),
      ih.path([ih.D("M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16")]),
      ih.path([ih.D("M8 16H3v5")]),
    ],
  )
