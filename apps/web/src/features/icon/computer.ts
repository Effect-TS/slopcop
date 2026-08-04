import { type Html, inertHtml as ih } from "foldkit/html"

export const computer = (className: string = "size-4"): Html =>
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
      ih.rect(
        [ih.Width("20"), ih.Height("14"), ih.X("2"), ih.Y("3"), ih.Rx("2")],
        [],
      ),
      ih.line([ih.X1("8"), ih.X2("16"), ih.Y1("21"), ih.Y2("21")], []),
      ih.line([ih.X1("12"), ih.X2("12"), ih.Y1("17"), ih.Y2("21")], []),
    ],
  )
