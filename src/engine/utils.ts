export function shuffleInPlace<T>(values: T[]): T[] {
  for (let index = values.length - 1; index > 0; index--) {
    const other = Math.floor(Math.random() * (index + 1));
    [values[index], values[other]] = [values[other], values[index]];
  }
  return values;
}

export function shuffledCopy<T>(values: readonly T[]): T[] {
  return shuffleInPlace([...values]);
}

export function randomSortCopy<T>(values: readonly T[]): T[] {
  return [...values].sort(() => Math.random() - 0.5);
}

export function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function formatSeasonLabel(year: number): string {
  return `${String(year).slice(-2)}-${String(year + 1).slice(-2)}`;
}
