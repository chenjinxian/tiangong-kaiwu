import { describe, expect, it } from 'vitest';
import type { IModel } from '@itwin/imodels-client-management';
import { normalizeImodelState, toImodelSummary } from '../internal/imodels.mapper.js';

function raw(state: string | undefined): IModel {
  return {
    id: 'im-1',
    displayName: 'Part Studio 1',
    state,
  } as unknown as IModel;
}

describe('normalizeImodelState', () => {
  it.each([
    ['initialized', 'initialized'],
    ['notInitialized', 'notInitialized'],
    ['NotInitialized', 'notInitialized'],
    ['failed', 'initializationFailed'],
    ['initializationFailed', 'initializationFailed'],
    ['missingFiles', 'missingFiles'],
    ['retryScheduled', 'retryScheduled'],
    ['somethingElse', 'unknown'],
    [undefined, 'unknown'],
  ] as const)('maps %s -> %s', (input, expected) => {
    expect(normalizeImodelState(input)).toBe(expected);
  });
});

describe('toImodelSummary state', () => {
  it('preserves state and derives initialized', () => {
    const summary = toImodelSummary(raw('initializationFailed'));
    expect(summary.state).toBe('initializationFailed');
    expect(summary.initialized).toBe(false);
  });

  it('derives initialized only for initialized', () => {
    expect(toImodelSummary(raw('initialized')).initialized).toBe(true);
    expect(toImodelSummary(raw('retryScheduled')).initialized).toBe(false);
  });
});
