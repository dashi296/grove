export type ParsedWikiLink = {
  target: string;
  alias: string | null;
};

export type WikiLinkNote = {
  id: string;
  title: string;
  content: string;
};

export type ResolvedWikiLink = ParsedWikiLink & {
  fromId: string;
  toId: string | null;
  isResolved: boolean;
};

export type ResolvedNoteLinks = {
  noteId: string;
  links: readonly ResolvedWikiLink[];
  backlinks: readonly ResolvedWikiLink[];
};

const WIKI_LINK_PATTERN = /\[\[([^[\]\r\n]+?)\]\]/gu;

export function parseWikiLinks(content: string): ParsedWikiLink[] {
  const wikiLinks: ParsedWikiLink[] = [];

  for (const match of content.matchAll(WIKI_LINK_PATTERN)) {
    const rawLink = match[1]?.trim() ?? "";

    if (rawLink.length === 0) {
      continue;
    }

    const [rawTarget, ...rawAliasParts] = rawLink.split("|");
    const target = rawTarget?.trim() ?? "";

    if (target.length === 0) {
      continue;
    }

    const aliasValue = rawAliasParts.join("|").trim();

    wikiLinks.push({
      target,
      alias: aliasValue.length === 0 ? null : aliasValue,
    });
  }

  return wikiLinks;
}

export function resolveWikiLinks(notes: readonly WikiLinkNote[]): ResolvedNoteLinks[] {
  const canonicalNoteIdsByTitle = new Map<string, string>();

  for (const note of notes) {
    const canonicalTitle = note.title.trim().toLocaleLowerCase();

    if (canonicalTitle.length === 0 || canonicalNoteIdsByTitle.has(canonicalTitle)) {
      continue;
    }

    canonicalNoteIdsByTitle.set(canonicalTitle, note.id);
  }

  const outgoingLinksByNoteId = new Map<string, ResolvedWikiLink[]>();
  const backlinksByNoteId = new Map<string, ResolvedWikiLink[]>();

  for (const note of notes) {
    const resolvedLinks = parseWikiLinks(note.content).map((wikiLink) => {
      const resolvedNoteId =
        canonicalNoteIdsByTitle.get(wikiLink.target.toLocaleLowerCase()) ?? null;

      return {
        ...wikiLink,
        fromId: note.id,
        toId: resolvedNoteId,
        isResolved: resolvedNoteId !== null,
      };
    });

    outgoingLinksByNoteId.set(note.id, resolvedLinks);

    for (const resolvedLink of resolvedLinks) {
      if (resolvedLink.toId === null) {
        continue;
      }

      const backlinks = backlinksByNoteId.get(resolvedLink.toId) ?? [];
      backlinksByNoteId.set(resolvedLink.toId, [...backlinks, resolvedLink]);
    }
  }

  return notes.map((note) => ({
    noteId: note.id,
    links: outgoingLinksByNoteId.get(note.id) ?? [],
    backlinks: backlinksByNoteId.get(note.id) ?? [],
  }));
}
