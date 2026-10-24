/** Lossless wire representation. Eligibility is supplied by the server, never inferred here. */
export function compactAdaptiveState(state: any) {
  const { responseScale: _scale, gateways: _gateways, path, ...rest } = state;
  const { activeNodes, ...pathRest } = path;
  return {
    ...rest,
    representation: 'compact-v1',
    path: { ...pathRest, activeNodeIds: activeNodes.map((node: any) => node.nodeId) }
  };
}

export function mergeAdaptiveState(current: any, update: any) {
  if (update?.representation !== 'compact-v1') return update;
  if (
    !current?.graphFingerprint ||
    current.graphFingerprint !== update.graphFingerprint ||
    current.graphVersion !== update.graphVersion
  )
    throw new Error('adaptive_definition_mismatch');
  if (!Array.isArray(update.path?.nodes) || !Array.isArray(update.path?.activeNodeIds))
    throw new Error('adaptive_state_invalid');
  const nodes = new Map(update.path.nodes.map((node: any) => [node.nodeId, node]));
  const activeNodes = update.path.activeNodeIds.map((id: string) => nodes.get(id));
  if (
    activeNodes.some((node: any) => !node) ||
    new Set(update.path.activeNodeIds).size !== activeNodes.length
  )
    throw new Error('adaptive_state_invalid');
  const { representation: _representation, path, ...rest } = update;
  const { activeNodeIds: _activeNodeIds, ...pathRest } = path;
  return {
    ...rest,
    responseScale: current.responseScale,
    gateways: current.gateways,
    path: { ...pathRest, activeNodes }
  };
}
