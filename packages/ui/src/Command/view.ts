import { Option } from "effect"
import type { ChildAttribute, Html, HtmlBuilder } from "foldkit/html"
import { childAttributes } from "foldkit/html"
import { defineView, type View as SubmodelView } from "foldkit/submodel"
import {
  defaultFilter,
  type Filter,
  type FilterInput,
  type FilteredItem,
  resolveFilteredItems,
} from "./filter.ts"
import type { Model } from "./model.ts"
import {
  type Message,
  ActivatedItem,
  DeactivatedItem,
  RequestedItemSelection,
  UpdatedQuery,
} from "./message.ts"
import { inputId, itemId, listId } from "./update.ts"

type Child = Html | string

export type ItemRenderContext = Readonly<{
  isActive: boolean
  isDisabled: boolean
  query: string
  rank: number
}>

export type ItemConfig = Readonly<{
  content: Child
  className?: string
  attributes?: ReadonlyArray<ChildAttribute>
}>

export type GroupConfig = Readonly<{
  heading: Child
  className?: string
  attributes?: ReadonlyArray<ChildAttribute>
  headingClassName?: string
  headingAttributes?: ReadonlyArray<ChildAttribute>
}>

export type EmptyConfig = Readonly<{
  content: Child
  className?: string
  attributes?: ReadonlyArray<ChildAttribute>
}>

export type LoadingConfig = Readonly<{
  content: Child
  label?: string
  progress?: number
  className?: string
  attributes?: ReadonlyArray<ChildAttribute>
}>

export type AriaName =
  | Readonly<{ ariaLabel: string; ariaLabelledBy?: never }>
  | Readonly<{ ariaLabel?: never; ariaLabelledBy: string }>

export type ViewInputs<Item, Value extends string = string> = AriaName &
  Readonly<{
    items: ReadonlyArray<Item>
    itemToValue: (item: Item, index: number) => Value
    itemToSearchText: (item: Item, index: number) => string
    itemToConfig: (item: Item, context: ItemRenderContext) => ItemConfig
    itemToKeywords?: (item: Item, index: number) => ReadonlyArray<string>
    isItemDisabled?: (item: Item, index: number) => boolean
    itemGroupKey?: (item: Item, index: number) => string
    groupToConfig?: (groupKey: string) => GroupConfig | undefined
    filter?: Filter
    shouldFilter?: boolean
    listAriaLabel?: string
    className?: string
    attributes?: ReadonlyArray<ChildAttribute>
    inputWrapperClassName?: string
    inputWrapperAttributes?: ReadonlyArray<ChildAttribute>
    inputClassName?: string
    inputAttributes?: ReadonlyArray<ChildAttribute>
    inputPlaceholder?: string
    listClassName?: string
    listAttributes?: ReadonlyArray<ChildAttribute>
    groupClassName?: string
    groupAttributes?: ReadonlyArray<ChildAttribute>
    separatorClassName?: string
    separatorAttributes?: ReadonlyArray<ChildAttribute>
    empty?: EmptyConfig
    loading?: LoadingConfig
    toView: (render: RenderInfo<Value>) => Html
  }>

export type ItemInfo<Value extends string = string> = Readonly<{
  value: Value
  sourceIndex: number
  rank: number
  isActive: boolean
  isDisabled: boolean
  item: ReadonlyArray<ChildAttribute>
  content: Child
}>

export type GroupInfo<Value extends string = string> = Readonly<{
  key: string
  group: ReadonlyArray<ChildAttribute>
  heading: ReadonlyArray<ChildAttribute>
  headingContent: Child | undefined
  separator: ReadonlyArray<ChildAttribute>
  items: ReadonlyArray<ItemInfo<Value>>
}>

export type RenderInfo<Value extends string = string> = Readonly<{
  root: ReadonlyArray<ChildAttribute>
  inputWrapper: ReadonlyArray<ChildAttribute>
  input: ReadonlyArray<ChildAttribute>
  list: ReadonlyArray<ChildAttribute>
  groups: ReadonlyArray<GroupInfo<Value>>
  empty:
    | Readonly<{
        attributes: ReadonlyArray<ChildAttribute>
        content: Child
      }>
    | undefined
  loading:
    | Readonly<{
        attributes: ReadonlyArray<ChildAttribute>
        content: Child
      }>
    | undefined
  query: string
  hasVisibleItems: boolean
}>

const isNonEmptyReadonlyArray = <A>(items: ReadonlyArray<A>): boolean =>
  items.length > 0

const classNameFor = (
  parts: ReadonlyArray<string | undefined>,
): string | undefined => {
  const className = parts.filter((part) => part !== undefined).join(" ")
  return className.length > 0 ? className : undefined
}

const getFirstEnabled = <Item, Value extends string>(
  items: ReadonlyArray<FilteredItem<Item, Value>>,
): FilteredItem<Item, Value> | undefined =>
  items.find((item) => !item.isDisabled)

const resolveEffectiveActiveItem = <Item, Value extends string>(
  model: Model,
  items: ReadonlyArray<FilteredItem<Item, Value>>,
): FilteredItem<Item, Value> | undefined => {
  if (Option.isSome(model.maybeActiveValue)) {
    const activeValue = model.maybeActiveValue.value
    const active = items.find(
      (item) => item.value === activeValue && !item.isDisabled,
    )
    if (active) {
      return active
    }
  }

  return getFirstEnabled(items)
}

const moveBy = <Item, Value extends string>(
  enabledItems: ReadonlyArray<FilteredItem<Item, Value>>,
  active: FilteredItem<Item, Value> | undefined,
  delta: 1 | -1,
  loop: boolean,
): FilteredItem<Item, Value> | undefined => {
  if (enabledItems.length === 0) {
    return undefined
  }

  if (!active) {
    return delta === 1 ? enabledItems[0] : enabledItems[enabledItems.length - 1]
  }

  const currentIndex = enabledItems.findIndex(
    (item) => item.value === active.value,
  )
  if (currentIndex === -1) {
    return delta === 1 ? enabledItems[0] : enabledItems[enabledItems.length - 1]
  }

  const nextIndex = currentIndex + delta
  if (nextIndex >= 0 && nextIndex < enabledItems.length) {
    return enabledItems[nextIndex]
  }

  if (!loop) {
    return active
  }

  return delta === 1 ? enabledItems[0] : enabledItems[enabledItems.length - 1]
}

const activatedKeyboardMessage = <Item, Value extends string>(
  item: FilteredItem<Item, Value> | undefined,
  active: FilteredItem<Item, Value> | undefined,
): Option.Option<Message> =>
  item && item.value !== active?.value
    ? Option.some(
        ActivatedItem({
          value: item.value,
          sourceIndex: item.sourceIndex,
          activationTrigger: "Keyboard",
          screenX: Option.none(),
          screenY: Option.none(),
        }),
      )
    : Option.none()

const resolveInputNameAttributes = <Item, Value extends string>(
  viewInputs: ViewInputs<Item, Value>,
  h: HtmlBuilder<Message>,
) =>
  "ariaLabel" in viewInputs && viewInputs.ariaLabel !== undefined
    ? [h.AriaLabel(viewInputs.ariaLabel)]
    : [h.AriaLabelledBy(viewInputs.ariaLabelledBy)]

const commandViewImpl = defineView<Model, Message, ViewInputs<unknown, string>>(
  (model, viewInputs, h) => {
    const {
      items,
      itemToValue,
      itemToSearchText,
      itemToConfig,
      itemToKeywords,
      isItemDisabled,
      itemGroupKey,
      groupToConfig,
      filter = defaultFilter,
      shouldFilter = true,
      listAriaLabel = "Suggestions",
      className,
      attributes = [],
      inputWrapperClassName,
      inputWrapperAttributes: extraInputWrapperAttributes = [],
      inputClassName,
      inputAttributes = [],
      inputPlaceholder,
      listClassName,
      listAttributes = [],
      groupClassName,
      groupAttributes = [],
      separatorClassName,
      separatorAttributes = [],
      empty,
      loading,
      toView,
    } = viewInputs

    const filterInputs = items.map((item, index) => {
      const base = {
        item,
        value: itemToValue(item, index),
        sourceIndex: index,
        searchText: itemToSearchText(item, index),
        keywords: itemToKeywords ? itemToKeywords(item, index) : [],
        isDisabled: isItemDisabled ? isItemDisabled(item, index) : false,
      }
      const groupKey = itemGroupKey ? itemGroupKey(item, index) : undefined
      return groupKey === undefined ? base : { ...base, groupKey }
    }) satisfies ReadonlyArray<FilterInput<unknown, string>>

    const result = resolveFilteredItems({
      items: filterInputs,
      query: model.query,
      shouldFilter,
      filter,
    })
    const activeItem = resolveEffectiveActiveItem(model, result.items)
    const enabledItems = result.items.filter((item) => !item.isDisabled)

    const chooseFirstForQuery = (query: string): Option.Option<string> => {
      const nextResult = resolveFilteredItems({
        items: filterInputs,
        query,
        shouldFilter,
        filter,
      })
      const first = getFirstEnabled(nextResult.items)
      return first ? Option.some(first.value) : Option.none()
    }

    const handleInputKeyDown = (
      key: string,
      modifiers: {
        ctrlKey: boolean
        altKey: boolean
        metaKey: boolean
      },
    ): Option.Option<Message> => {
      if (key === "ArrowDown") {
        return activatedKeyboardMessage(
          moveBy(enabledItems, activeItem, 1, model.loop),
          activeItem,
        )
      }
      if (key === "ArrowUp") {
        return activatedKeyboardMessage(
          moveBy(enabledItems, activeItem, -1, model.loop),
          activeItem,
        )
      }
      if (key === "Home") {
        return activatedKeyboardMessage(enabledItems[0], activeItem)
      }
      if (key === "End") {
        return activatedKeyboardMessage(
          enabledItems[enabledItems.length - 1],
          activeItem,
        )
      }
      if (key === "Enter") {
        return activeItem
          ? Option.some(RequestedItemSelection({ value: activeItem.value }))
          : Option.none()
      }
      if (
        model.vimBindings &&
        modifiers.ctrlKey &&
        !modifiers.altKey &&
        !modifiers.metaKey
      ) {
        if (key === "n" || key === "j") {
          return activatedKeyboardMessage(
            moveBy(enabledItems, activeItem, 1, model.loop),
            activeItem,
          )
        }
        if (key === "p" || key === "k") {
          return activatedKeyboardMessage(
            moveBy(enabledItems, activeItem, -1, model.loop),
            activeItem,
          )
        }
      }

      return Option.none()
    }

    const maybeActiveDescendant = activeItem
      ? [h.AriaActiveDescendant(itemId(model.id, activeItem.sourceIndex))]
      : []

    const rootAttributes = [
      h.Id(model.id),
      ...(result.items.length === 0 ? [h.DataAttribute("empty", "")] : []),
      ...(loading ? [h.DataAttribute("loading", "")] : []),
      ...(className ? [h.Class(className)] : []),
      ...attributes,
    ]

    const inputWrapperAttributesResolved = [
      ...(inputWrapperClassName ? [h.Class(inputWrapperClassName)] : []),
      ...extraInputWrapperAttributes,
    ]

    const inputAttributesResolved = [
      h.Id(inputId(model.id)),
      h.Role("combobox"),
      h.AriaAutocomplete("list"),
      h.AriaExpanded(true),
      h.AriaControls(listId(model.id)),
      ...resolveInputNameAttributes(viewInputs, h),
      ...maybeActiveDescendant,
      h.Autocomplete("off"),
      h.Value(model.query),
      h.OnInput((query) =>
        UpdatedQuery({ query, maybeActiveValue: chooseFirstForQuery(query) }),
      ),
      h.OnKeyDownPreventDefault(handleInputKeyDown),
      ...(inputPlaceholder ? [h.Placeholder(inputPlaceholder)] : []),
      ...(inputClassName ? [h.Class(inputClassName)] : []),
      ...inputAttributes,
    ]

    const listAttributesResolved = [
      h.Id(listId(model.id)),
      h.Role("listbox"),
      h.Tabindex(-1),
      h.AriaLabel(listAriaLabel),
      ...maybeActiveDescendant,
      ...(listClassName ? [h.Class(listClassName)] : []),
      ...listAttributes,
    ]

    const groups = result.groups.map((group, groupIndex) => {
      const groupConfig = groupToConfig ? groupToConfig(group.key) : undefined
      const resolvedGroupClassName = classNameFor([
        groupClassName,
        groupConfig?.className,
      ])
      const headingId = `${model.id}-group-${group.key}-heading`
      const groupInfoItems = group.items.map((entry) => {
        const isActive = activeItem?.value === entry.value
        const config = itemToConfig(entry.item, {
          isActive,
          isDisabled: entry.isDisabled,
          query: model.query,
          rank: entry.rank,
        })

        return {
          value: entry.value,
          sourceIndex: entry.sourceIndex,
          rank: entry.rank,
          isActive,
          isDisabled: entry.isDisabled,
          item: childAttributes([
            h.Id(itemId(model.id, entry.sourceIndex)),
            h.Role("option"),
            h.AriaSelected(isActive),
            ...(isActive
              ? [h.DataAttribute("active", ""), h.DataAttribute("selected", "")]
              : []),
            ...(entry.isDisabled
              ? [h.AriaDisabled(true), h.DataAttribute("disabled", "")]
              : [
                  h.OnClick(RequestedItemSelection({ value: entry.value })),
                  ...(isActive
                    ? []
                    : [
                        h.OnPointerMove((screenX, screenY, pointerType) =>
                          pointerType === "touch"
                            ? Option.none()
                            : Option.some(
                                ActivatedItem({
                                  value: entry.value,
                                  sourceIndex: entry.sourceIndex,
                                  activationTrigger: "Pointer",
                                  screenX: Option.some(screenX),
                                  screenY: Option.some(screenY),
                                }),
                              ),
                        ),
                      ]),
                  h.OnPointerLeave((pointerType) =>
                    pointerType === "touch"
                      ? Option.none()
                      : Option.some(DeactivatedItem()),
                  ),
                ]),
            ...(config.className ? [h.Class(config.className)] : []),
            ...(config.attributes ?? []),
          ]),
          content: config.content,
        }
      })

      return {
        key: group.key,
        group: childAttributes([
          h.Role("group"),
          ...(groupConfig ? [h.AriaLabelledBy(headingId)] : []),
          ...(resolvedGroupClassName ? [h.Class(resolvedGroupClassName)] : []),
          ...(groupConfig?.attributes ?? []),
          ...groupAttributes,
        ]),
        heading: childAttributes(
          groupConfig
            ? [
                h.Id(headingId),
                h.Role("presentation"),
                ...(groupConfig.headingClassName
                  ? [h.Class(groupConfig.headingClassName)]
                  : []),
                ...(groupConfig.headingAttributes ?? []),
              ]
            : [],
        ),
        headingContent: groupConfig?.heading,
        separator: childAttributes(
          groupIndex > 0 &&
            (separatorClassName || isNonEmptyReadonlyArray(separatorAttributes))
            ? [
                h.Role("separator"),
                ...(separatorClassName ? [h.Class(separatorClassName)] : []),
                ...separatorAttributes,
              ]
            : [],
        ),
        items: groupInfoItems,
      }
    })

    const emptyInfo =
      result.items.length === 0 && empty
        ? {
            attributes: childAttributes([
              h.Role("presentation"),
              ...(empty.className ? [h.Class(empty.className)] : []),
              ...(empty.attributes ?? []),
            ]),
            content: empty.content,
          }
        : undefined

    const loadingInfo = loading
      ? {
          attributes: childAttributes([
            h.Role("progressbar"),
            h.AriaLabel(loading.label ?? "Loading"),
            h.AriaValuemin(0),
            h.AriaValuemax(100),
            ...(loading.progress === undefined
              ? []
              : [h.AriaValuenow(loading.progress)]),
            ...(loading.className ? [h.Class(loading.className)] : []),
            ...(loading.attributes ?? []),
          ]),
          content: loading.content,
        }
      : undefined

    return toView({
      root: childAttributes(rootAttributes),
      inputWrapper: childAttributes(inputWrapperAttributesResolved),
      input: childAttributes(inputAttributesResolved),
      list: childAttributes(listAttributesResolved),
      groups,
      empty: emptyInfo,
      loading: loadingInfo,
      query: model.query,
      hasVisibleItems: result.items.length > 0,
    })
  },
)

export const view = <Item, Value extends string = string>(): SubmodelView<
  Model,
  Message,
  ViewInputs<Item, Value>
> =>
  commandViewImpl as unknown as SubmodelView<
    Model,
    Message,
    ViewInputs<Item, Value>
  >
