import { type Html, inertHtml as ih } from "foldkit/html"

export const circleGauge = (className: string = "size-4"): Html =>
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
      ih.path([ih.D("M15.6 2.7a10 10 0 1 0 5.7 5.7")]),
      ih.path([ih.D("M13.4 10.6 19 5")]),
      ih.circle([ih.Cx("12"), ih.Cy("12"), ih.R("2")]),
    ],
  )
