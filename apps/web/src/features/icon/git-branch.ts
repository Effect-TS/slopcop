import { type Html, inertHtml as ih } from "foldkit/html"

export const gitBranch = (className: string = "size-4"): Html =>
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
      ih.path([ih.D("M15 6a9 9 0 0 0-9 9V3")]),
      ih.circle([ih.Cx("18"), ih.Cy("6"), ih.R("3")]),
      ih.circle([ih.Cx("6"), ih.Cy("18"), ih.R("3")]),
    ],
  )
