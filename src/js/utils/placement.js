export function getStackedPosition(index, spacing = 25, perRow = 5, perLayer = 25) {
  const x = index % perRow;
  const y = Math.floor(index / perRow) % perRow;
  const z = Math.floor(index / perLayer);
  return {
    x: (x - Math.floor(perRow / 2)) * spacing,
    y: (y - Math.floor(perRow / 2)) * -spacing,
    z: z * spacing * 2
  };
}
