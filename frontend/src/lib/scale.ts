/** A round axis maximum just above the largest value. */
export const niceMax = (values: number[], step = 0.1, floor = step) =>
  Math.max(floor, Math.ceil((Math.max(...values, 0) + 1e-9) / step) * step)
