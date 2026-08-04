import { type Html, inertHtml as ih } from "foldkit/html"

export const slopCopLogo = (className: string = "size-5"): Html =>
  ih.svg(
    [
      ih.ViewBox("0 0 24 24"),
      ih.AriaHidden(true),
      ih.Class(className),
      ih.Fill("none"),
    ],
    [
      ih.path(
        [
          ih.D(
            "M12 2.2 5 4.6v6.1c0 4.4 2.8 8.3 7 9.6 4.2-1.3 7-5.2 7-9.6V4.6L12 2.2Z",
          ),
          ih.Fill("currentColor"),
          ih.FillOpacity("0.16"),
          ih.Stroke("currentColor"),
          ih.StrokeWidth("1.5"),
          ih.StrokeLinejoin("round"),
        ],
        [],
      ),
      ih.path(
        [
          ih.D("M9.3 11.9l1.9 1.9 3.6-3.9"),
          ih.Stroke("currentColor"),
          ih.StrokeWidth("1.7"),
          ih.StrokeLinecap("round"),
          ih.StrokeLinejoin("round"),
        ],
        [],
      ),
    ],
  )
