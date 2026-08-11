import * as Slider from "@foldkit/ui/slider"
import * as Subscription from "foldkit/subscription"
import { GotConfidenceSliderMessage, type Message } from "./message"
import type { Model } from "./model"

const confidenceSliderSubscriptions = Subscription.lift({
  confidenceSliderPointer: Slider.subscriptions.dragPointer,
  confidenceSliderEscape: Slider.subscriptions.dragEscape,
})<Model, Message>({
  toChildModel: (model) => model.confidenceSlider,
  toParentMessage: (message) => GotConfidenceSliderMessage({ message }),
})

export const subscriptions = Subscription.aggregate<Model, Message>()(
  confidenceSliderSubscriptions,
)
