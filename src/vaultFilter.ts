/**
 * Purpose: Evaluates vault file paths and names against Obsidian-style include/exclude query patterns (-path:x -file:y term).
 */
export function shouldIncludeFile(file: { path: string; name: string; basename: string }, queryStr: string): boolean {
  if (!queryStr || !queryStr.trim()) return true;

  const tokens = queryStr.trim().split(/\s+/);
  const filePath = file.path.toLowerCase();
  const fileName = file.name.toLowerCase();
  const fileBasename = file.basename.toLowerCase();

  const positiveRules: string[] = [];
  const negativeRules: string[] = [];
  for (const token of tokens) {
    if (!token) continue;
    if (token.startsWith("-")) negativeRules.push(token);
    else positiveRules.push(token);
  }

  for (const rule of negativeRules) {
    if (rule.startsWith("-path:")) {
      const term = rule.slice(6).toLowerCase();
      if (term && filePath.includes(term)) return false;
    } else if (rule.startsWith("-file:")) {
      const term = rule.slice(6).toLowerCase();
      if (term && (fileBasename.includes(term) || fileName.includes(term) || filePath.includes(term))) return false;
    } else {
      const term = rule.slice(1).toLowerCase();
      if (term && (filePath.includes(term) || fileBasename.includes(term) || fileName.includes(term))) return false;
    }
  }

  if (positiveRules.length > 0) {
    let matchesPositive = false;
    for (const rule of positiveRules) {
      if (rule.startsWith("path:")) {
        const term = rule.slice(5).toLowerCase();
        if (term && filePath.includes(term)) {
          matchesPositive = true;
          break;
        }
      } else if (rule.startsWith("file:")) {
        const term = rule.slice(5).toLowerCase();
        if (term && (fileBasename.includes(term) || fileName.includes(term))) {
          matchesPositive = true;
          break;
        }
      } else {
        const term = rule.toLowerCase();
        if (term && (filePath.includes(term) || fileBasename.includes(term))) {
          matchesPositive = true;
          break;
        }
      }
    }
    if (!matchesPositive) return false;
  }

  return true;
}
