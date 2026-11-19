export function scheduleSearch(commit: () => void, delay = 300): () => void {
  const timer = setTimeout(commit, delay);
  return () => clearTimeout(timer);
}
