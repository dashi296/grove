export type EditorMode = "markdown";

export type MarkdownCommand = "bold" | "italic" | "heading" | "link" | "code";

export type MarkdownSelection = {
  start: number;
  end: number;
};

export type MarkdownEditorState = {
  value: string;
  selection: MarkdownSelection;
};

export type MarkdownCommandResult = MarkdownEditorState;

export type MarkdownEditorAdapter = {
  getState: () => MarkdownEditorState;
  setValue: (value: string) => void;
  setSelection: (selection: MarkdownSelection) => void;
  dispatchCommand: (command: MarkdownCommand) => MarkdownCommandResult;
};

export function createEditorMode(): EditorMode {
  return "markdown";
}

export function createMarkdownEditorAdapter(
  initialState: MarkdownEditorState,
): MarkdownEditorAdapter {
  let state = normalizeMarkdownEditorState(initialState);

  return {
    getState: () => state,
    setValue: (value) => {
      state = normalizeMarkdownEditorState({
        value,
        selection: clampSelection(state.selection, value.length),
      });
    },
    setSelection: (selection) => {
      state = normalizeMarkdownEditorState({
        value: state.value,
        selection,
      });
    },
    dispatchCommand: (command) => {
      state = applyMarkdownCommand(state, command);
      return state;
    },
  };
}

export function applyMarkdownCommand(
  state: MarkdownEditorState,
  command: MarkdownCommand,
): MarkdownCommandResult {
  const normalizedState = normalizeMarkdownEditorState(state);

  if (command === "heading") {
    return applyHeadingCommand(normalizedState);
  }

  if (command === "link") {
    return wrapSelection(normalizedState, "[", "]()", 1, 1);
  }

  if (command === "bold") {
    return wrapSelection(normalizedState, "**", "**", 2, 2);
  }

  if (command === "italic") {
    return wrapSelection(normalizedState, "*", "*", 1, 1);
  }

  return wrapSelection(normalizedState, "`", "`", 1, 1);
}

function normalizeMarkdownEditorState(state: MarkdownEditorState): MarkdownEditorState {
  return {
    value: state.value,
    selection: clampSelection(state.selection, state.value.length),
  };
}

function clampSelection(selection: MarkdownSelection, valueLength: number): MarkdownSelection {
  const start = Math.min(Math.max(selection.start, 0), valueLength);
  const end = Math.min(Math.max(selection.end, 0), valueLength);

  return start <= end ? { start, end } : { start: end, end: start };
}

function wrapSelection(
  state: MarkdownEditorState,
  prefix: string,
  suffix: string,
  selectionStartOffset: number,
  selectionEndOffset: number,
): MarkdownCommandResult {
  const { value, selection } = state;
  const selectedText = value.slice(selection.start, selection.end);
  const nextValue = `${value.slice(0, selection.start)}${prefix}${selectedText}${suffix}${value.slice(selection.end)}`;
  const nextSelectionStart = selection.start + selectionStartOffset;
  const nextSelectionEnd = selection.end + selectionEndOffset;

  return {
    value: nextValue,
    selection: {
      start: nextSelectionStart,
      end: nextSelectionEnd,
    },
  };
}

function applyHeadingCommand(state: MarkdownEditorState): MarkdownCommandResult {
  const lineStart = state.value.lastIndexOf("\n", state.selection.start - 1) + 1;
  const lineEndIndex = state.value.indexOf("\n", state.selection.start);
  const lineEnd = lineEndIndex === -1 ? state.value.length : lineEndIndex;
  const line = state.value.slice(lineStart, lineEnd);
  const existingHeading = /^(#{1,6}\s+)/.exec(line);
  const removedLength = existingHeading?.[0].length ?? 0;
  const nextLine = existingHeading === null ? `# ${line}` : `# ${line.slice(removedLength)}`;
  const nextValue = `${state.value.slice(0, lineStart)}${nextLine}${state.value.slice(lineEnd)}`;
  const selectionDelta = existingHeading === null ? 2 : 2 - removedLength;

  return {
    value: nextValue,
    selection: {
      start: Math.max(lineStart + 2, state.selection.start + selectionDelta),
      end: Math.max(lineStart + 2, state.selection.end + selectionDelta),
    },
  };
}
