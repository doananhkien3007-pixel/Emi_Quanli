import type { Order } from './model';

export function normalizeSearchText(value: unknown) {
  return String(value ?? '')
    .toLocaleLowerCase('vi')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function editDistanceWithin(left: string, right: string, limit: number) {
  if (Math.abs(left.length - right.length) > limit) return false;

  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  const beforePrevious = [...previous];

  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    let rowMinimum = leftIndex;

    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitution = previous[rightIndex - 1] + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1);
      let distance = Math.min(previous[rightIndex] + 1, current[rightIndex - 1] + 1, substitution);

      if (
        leftIndex > 1 &&
        rightIndex > 1 &&
        left[leftIndex - 1] === right[rightIndex - 2] &&
        left[leftIndex - 2] === right[rightIndex - 1]
      ) {
        distance = Math.min(distance, beforePrevious[rightIndex - 2] + 1);
      }

      current[rightIndex] = distance;
      rowMinimum = Math.min(rowMinimum, distance);
    }

    if (rowMinimum > limit) return false;
    beforePrevious.splice(0, beforePrevious.length, ...previous);
    previous.splice(0, previous.length, ...current);
  }

  return previous[right.length] <= limit;
}

function tokenMatches(queryToken: string, candidateToken: string) {
  if (candidateToken.includes(queryToken)) return true;
  if (queryToken.length < 3) return false;
  const tolerance = queryToken.length >= 6 ? 2 : 1;
  return editDistanceWithin(queryToken, candidateToken, tolerance);
}

export function matchesOrderSearch(order: Order, query: string) {
  const normalizedQuery = normalizeSearchText(query);
  if (!normalizedQuery) return true;

  const values = [
    order.id,
    order.customer,
    order.phone,
    order.address,
    order.product,
    order.spxCode,
    order.status,
    order.note,
    ...order.items.flatMap(item => [item.product, item.color, item.size]),
  ];
  const normalizedValues = values.map(normalizeSearchText).filter(Boolean);
  const combined = normalizedValues.join(' ');
  const compactQuery = normalizedQuery.replaceAll(' ', '');

  if (combined.includes(normalizedQuery) || normalizedValues.some(value => value.replaceAll(' ', '').includes(compactQuery))) {
    return true;
  }

  const candidateTokens = combined.split(' ').filter(Boolean);
  return normalizedQuery.split(' ').every(queryToken => candidateTokens.some(candidateToken => tokenMatches(queryToken, candidateToken)));
}
