import { useCallback, useEffect, useRef, useState } from "react";

import {
  clearCompletedPathChangeOperations,
  createPathChangeOperation,
  getNextRunnablePathChangeOperationId,
  retryOperationStep,
  runNextOperationStep,
} from "./folderWorkspaceState";
import type {
  FolderWorkspaceMutation,
  FolderWorkspaceOperationStepId,
  FolderWorkspacePathChangeExecutor,
  FolderWorkspacePathChangeOperation,
} from "./folderWorkspaceState";

export type PathChangeQueueState = {
  pathChangeOperations: readonly FolderWorkspacePathChangeOperation[];
  runningOperationIds: readonly string[];
  queuePathChangeOperation: (mutation: FolderWorkspaceMutation) => void;
  retryPathChangeStep: (operationId: string, stepId: FolderWorkspaceOperationStepId) => void;
  clearCompletedPathChanges: () => void;
  resetPathChangeQueue: () => void;
  runNextPathChangeStep: (operationId: string) => Promise<void>;
};

export function usePathChangeQueue(
  executor: FolderWorkspacePathChangeExecutor,
): PathChangeQueueState {
  const [pathChangeOperations, setPathChangeOperations] = useState<
    readonly FolderWorkspacePathChangeOperation[]
  >([]);
  const [runningOperationIds, setRunningOperationIds] = useState<readonly string[]>([]);
  const runningOperationIdSet = useRef(new Set<string>());
  const nextOperationNumber = useRef(1);

  const queuePathChangeOperation = useCallback((mutation: FolderWorkspaceMutation): void => {
    const operation = createPathChangeOperation(
      `path-change-${nextOperationNumber.current}`,
      mutation,
    );

    if (operation === null) {
      return;
    }

    nextOperationNumber.current += 1;
    setPathChangeOperations((currentOperations) => [operation, ...currentOperations]);
  }, []);

  const retryPathChangeStep = useCallback(
    (operationId: string, stepId: FolderWorkspaceOperationStepId): void => {
      setPathChangeOperations((currentOperations) =>
        retryOperationStep(currentOperations, operationId, stepId),
      );
    },
    [],
  );

  const clearCompletedPathChanges = useCallback((): void => {
    setPathChangeOperations(clearCompletedPathChangeOperations);
  }, []);

  const resetPathChangeQueue = useCallback((): void => {
    runningOperationIdSet.current.clear();
    nextOperationNumber.current = 1;
    setRunningOperationIds([]);
    setPathChangeOperations([]);
  }, []);

  const runNextPathChangeStep = useCallback(
    async (operationId: string): Promise<void> => {
      const operation = pathChangeOperations.find((currentOperation) => {
        return currentOperation.id === operationId;
      });

      if (operation === undefined || runningOperationIdSet.current.has(operationId)) {
        return;
      }

      runningOperationIdSet.current.add(operationId);
      setRunningOperationIds((currentOperationIds) => [...currentOperationIds, operationId]);

      try {
        const nextOperation = await runNextOperationStep(operation, executor);

        setPathChangeOperations((currentOperations) =>
          currentOperations.map((currentOperation) => {
            return currentOperation.id === operationId ? nextOperation : currentOperation;
          }),
        );
      } finally {
        runningOperationIdSet.current.delete(operationId);
        setRunningOperationIds((currentOperationIds) =>
          currentOperationIds.filter((currentOperationId) => currentOperationId !== operationId),
        );
      }
    },
    [executor, pathChangeOperations],
  );

  useEffect(() => {
    const nextRunnableOperationId = getNextRunnablePathChangeOperationId(
      pathChangeOperations,
      runningOperationIds,
    );

    if (nextRunnableOperationId === null) {
      return;
    }

    void runNextPathChangeStep(nextRunnableOperationId);
  }, [pathChangeOperations, runNextPathChangeStep, runningOperationIds]);

  return {
    pathChangeOperations,
    runningOperationIds,
    queuePathChangeOperation,
    retryPathChangeStep,
    clearCompletedPathChanges,
    resetPathChangeQueue,
    runNextPathChangeStep,
  };
}
