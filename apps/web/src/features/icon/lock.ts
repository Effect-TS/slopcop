import { type Html, inertHtml as ih } from "foldkit/html"

export const lock = (className: string = "size-4"): Html =>
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
      ih.rect([
        ih.Width("18"),
        ih.Height("11"),
        ih.X("3"),
        ih.Y("11"),
        ih.Rx("2"),
        ih.Ry("2"),
      ]),
      ih.path([ih.D("M7 11V7a5 5 0 0 1 10 0v4")]),
    ],
  )
