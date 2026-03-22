import { describe, expect, it } from 'vitest';
import type { ToolName } from './ToolDirectory';

describe('ToolDirectory types', () => {
  it('ToolName accepts valid tool names', () => {
    const tools: ToolName[] = [
      'editor', 'focus', 'graph', 'sieve', 'board',
      'gulper', 'heap', 'inspirations',
    ];
    expect(tools).toHaveLength(8);
  });

  it('all tools are unique', () => {
    const tools: ToolName[] = [
      'editor', 'focus', 'graph', 'sieve', 'board',
      'gulper', 'heap', 'inspirations',
    ];
    expect(new Set(tools).size).toBe(tools.length);
  });
});
