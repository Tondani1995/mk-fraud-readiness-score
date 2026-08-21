import {
  resolveAdaptivePath,
  type AdaptiveControlResponses,
  type AdaptiveGatewayAnswers,
  type AdaptiveGraph,
  type AdaptiveResolvedPath
} from './engine';

export type OptimisticScreen = 'gateway' | 'question' | 'review';

export type OptimisticNavigation = {
  path: AdaptiveResolvedPath;
  nextId: string | null;
  nextScreen: OptimisticScreen;
};

export function resolveOptimisticNavigation(input: {
  graph: AdaptiveGraph;
  gatewayAnswers: AdaptiveGatewayAnswers;
  controlResponses: AdaptiveControlResponses;
  guidanceByQuestion?: Record<string, { goodEvidenceLooksLike: string; exampleArtifacts: string[]; likelyEvidenceOwner: string }>;
}): OptimisticNavigation {
  const path = resolveAdaptivePath(input);
  const nextNode = path.currentNextNode ? path.nodes.find((node) => node.nodeId === path.currentNextNode) : null;
  return {
    path,
    nextId: path.currentNextNode,
    nextScreen: nextNode?.kind === 'gateway' ? 'gateway' : nextNode ? 'question' : 'review'
  };
}
