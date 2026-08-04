import { type Html, inertHtml as ih } from "foldkit/html"

export const sun = (className: string = "size-4"): Html =>
  ih.svg(
    [
      ih.Xmlns("http://www.w3.org/2000/svg"),
      ih.AriaHidden(true),
      ih.Class(className),
      ih.ViewBox("0 0 24 24"),
      ih.Width("15"),
      ih.Height("15"),
      ih.Fill("none"),
      ih.Stroke("currentColor"),
      ih.StrokeWidth("2"),
      ih.StrokeLinecap("round"),
      ih.StrokeLinejoin("round"),
    ],
    [
      ih.circle([ih.Cx("12"), ih.Cy("12"), ih.R("4")], []),
      ih.path([ih.D("M12 2v2")], []),
      ih.path([ih.D("M12 20v2")], []),
      ih.path([ih.D("m4.93 4.93 1.41 1.41")], []),
      ih.path([ih.D("m17.66 17.66 1.41 1.41")], []),
      ih.path([ih.D("M2 12h2")], []),
      ih.path([ih.D("M20 12h2")], []),
      ih.path([ih.D("m6.34 17.66-1.41 1.41")], []),
      ih.path([ih.D("m19.07 4.93-1.41 1.41")], []),
    ],
  )
