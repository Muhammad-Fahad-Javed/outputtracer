// Start with widely separated hues so pairs and trios are easy to read.
const palette = [
  "#56B4E9", "#E69F00", "#CC79A7", "#45D6A7", "#F0E442",
  "#A99CF4", "#F78472", "#78C66A", "#F29DD7", "#B7A17E",
  "#45C8CF", "#CF95FF", "#FFBC87", "#82A2FB", "#9CCF40",
  "#E775AA", "#ABDECC", "#EBD080", "#B3AFE1", "#FBAFBD",
] as const;

/** Reserve colors for current members before assigning any former contributors. */
export function contributionColors(memberIds: readonly string[], authorIds: readonly string[]): ReadonlyMap<string, string> {
  const members = new Set(memberIds);
  const authors = new Set(authorIds);
  const order = [...[...members].sort(), ...[...authors].filter(id => !members.has(id)).sort()];
  return new Map(order.map((id, index) => [
    id,
    palette[index] ?? `hsl(${(index * 137.508) % 360} 68% 72%)`,
  ]));
}
