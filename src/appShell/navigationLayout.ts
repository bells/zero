export function navigationOverflow(scrollLeft: number, clientWidth: number, scrollWidth: number) {
  const end = Math.max(0, scrollWidth - clientWidth);
  return {
    overflowing: end > 1,
    previous: scrollLeft > 1,
    next: scrollLeft < end - 1,
  };
}
