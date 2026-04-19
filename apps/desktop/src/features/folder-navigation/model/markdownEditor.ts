import { applyMarkdownCommand } from "@grove/editor";
import type { MarkdownCommand, MarkdownSelection } from "@grove/editor";

export type MarkdownEditorCommandDispatch = {
  content: string;
  selection: MarkdownSelection;
  command: MarkdownCommand;
};

export type MarkdownEditorCommandDispatchResult = {
  content: string;
  selection: MarkdownSelection;
};

export function dispatchMarkdownEditorCommand({
  content,
  selection,
  command,
}: MarkdownEditorCommandDispatch): MarkdownEditorCommandDispatchResult {
  const result = applyMarkdownCommand(
    {
      value: content,
      selection,
    },
    command,
  );

  return {
    content: result.value,
    selection: result.selection,
  };
}
