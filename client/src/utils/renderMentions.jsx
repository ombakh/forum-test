export function renderMentions(text) {
  const source = String(text ?? '');
  if (!source) {
    return '';
  }

  const nodes = [];
  const mentionPattern = /@([a-z0-9_]{2,20})\b/gi;
  let lastIndex = 0;
  let match;

  while ((match = mentionPattern.exec(source)) !== null) {
    const start = match.index;
    const end = start + match[0].length;
    const previousCharacter = start > 0 ? source[start - 1] : '';

    if (previousCharacter && /[a-z0-9_]/i.test(previousCharacter)) {
      continue;
    }

    if (start > lastIndex) {
      nodes.push(source.slice(lastIndex, start));
    }

    nodes.push(
      <span key={`mention-${start}-${match[1].toLowerCase()}`} className="mention-token">
        {match[0]}
      </span>
    );

    lastIndex = end;
  }

  if (lastIndex < source.length) {
    nodes.push(source.slice(lastIndex));
  }

  return nodes.length > 0 ? nodes : source;
}
