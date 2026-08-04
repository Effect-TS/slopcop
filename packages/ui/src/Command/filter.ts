export type Filter = (
  value: string,
  query: string,
  keywords: ReadonlyArray<string>,
) => number

export type FilterInput<Item, Value extends string> = Readonly<{
  item: Item
  value: Value
  sourceIndex: number
  searchText: string
  keywords: ReadonlyArray<string>
  isDisabled: boolean
  groupKey?: string
}>

export type FilteredItem<Item, Value extends string> = FilterInput<
  Item,
  Value
> &
  Readonly<{
    rank: number
  }>

export type FilteredGroup<Item, Value extends string> = Readonly<{
  key: string
  rank: number
  sourceIndex: number
  items: ReadonlyArray<FilteredItem<Item, Value>>
}>

export type FilterResult<Item, Value extends string> = Readonly<{
  items: ReadonlyArray<FilteredItem<Item, Value>>
  groups: ReadonlyArray<FilteredGroup<Item, Value>>
}>

export type ResolveConfig<Item, Value extends string> = Readonly<{
  items: ReadonlyArray<FilterInput<Item, Value>>
  query: string
  shouldFilter: boolean
  filter: Filter
}>

const normalize = (value: string): string => value.trim().toLocaleLowerCase()

const wordStartsWith = (value: string, query: string): boolean =>
  value
    .split(/[\s/_:\-.]+/u)
    .some((word) => word.length > 0 && word.startsWith(query))

const isOrderedSubsequence = (value: string, query: string): boolean => {
  if (query.length === 0) {
    return true
  }

  let queryIndex = 0

  for (const character of value) {
    if (character === query[queryIndex]) {
      queryIndex += 1
      if (queryIndex === query.length) {
        return true
      }
    }
  }

  return false
}

const rankOne = (value: string, query: string): number => {
  const normalizedValue = normalize(value)
  const normalizedQuery = normalize(query)

  if (normalizedQuery.length === 0) {
    return 1
  }
  if (normalizedValue === normalizedQuery) {
    return 1
  }
  if (normalizedValue.startsWith(normalizedQuery)) {
    return 0.9
  }
  if (wordStartsWith(normalizedValue, normalizedQuery)) {
    return 0.8
  }
  if (normalizedValue.includes(normalizedQuery)) {
    return 0.7
  }
  if (isOrderedSubsequence(normalizedValue, normalizedQuery)) {
    return 0.5
  }

  return 0
}

export const defaultFilter: Filter = (value, query, keywords) => {
  const values = [value, ...keywords]
  let bestRank = 0

  for (const candidate of values) {
    bestRank = Math.max(bestRank, rankOne(candidate, query))
  }

  return bestRank
}

const compareItems = <Item, Value extends string>(
  left: FilteredItem<Item, Value>,
  right: FilteredItem<Item, Value>,
): number => {
  if (right.rank !== left.rank) {
    return right.rank - left.rank
  }
  return left.sourceIndex - right.sourceIndex
}

const compareGroups = <Item, Value extends string>(
  left: FilteredGroup<Item, Value>,
  right: FilteredGroup<Item, Value>,
): number => {
  if (right.rank !== left.rank) {
    return right.rank - left.rank
  }
  return left.sourceIndex - right.sourceIndex
}

const sortWhenSearching = <Entry>(
  entries: ReadonlyArray<Entry>,
  query: string,
  compare: (left: Entry, right: Entry) => number,
): ReadonlyArray<Entry> =>
  normalize(query).length === 0 ? entries : [...entries].sort(compare)

export const resolveFilteredItems = <Item, Value extends string>({
  items,
  query,
  shouldFilter,
  filter,
}: ResolveConfig<Item, Value>): FilterResult<Item, Value> => {
  const visibleItems: Array<FilteredItem<Item, Value>> = []

  for (const input of items) {
    const rank = shouldFilter
      ? filter(input.searchText, query, input.keywords)
      : 1

    if (rank > 0) {
      visibleItems.push({ ...input, rank })
    }
  }

  const sortedItems = sortWhenSearching(visibleItems, query, compareItems)
  const grouped = new Map<string, Array<FilteredItem<Item, Value>>>()

  for (const item of sortedItems) {
    const key = item.groupKey ?? ""
    const existing = grouped.get(key)
    if (existing) {
      existing.push(item)
    } else {
      grouped.set(key, [item])
    }
  }

  const groups: Array<FilteredGroup<Item, Value>> = []
  for (const [key, groupItems] of grouped) {
    const first = groupItems[0]
    if (first) {
      groups.push({
        key,
        rank: Math.max(...groupItems.map((item) => item.rank)),
        sourceIndex: Math.min(...groupItems.map((item) => item.sourceIndex)),
        items: groupItems,
      })
    }
  }

  return {
    items: sortedItems,
    groups: sortWhenSearching(groups, query, compareGroups),
  }
}
