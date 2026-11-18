import { describe, expect, it } from 'vitest';
import { ApiError } from '@/lib/api/client';
import { reportFailure, useBackend } from '@/lib/api/backend';

const problem = (status: number, slug: string) => new ApiError(status, { type: `https://procurement.dev/problems/${slug}` });

describe('backend outage flag', () => {
  it('is raised by an unreachable API or a server error, not by client errors', () => {
    useBackend.setState({ down: false });
    reportFailure(problem(404, 'not-found'));
    reportFailure(problem(409, 'version-conflict'));
    expect(useBackend.getState().down).toBe(false);
    reportFailure(problem(503, 'unreachable'));
    expect(useBackend.getState().down).toBe(true);
    useBackend.setState({ down: false });
    reportFailure(new TypeError('fetch failed'));
    expect(useBackend.getState().down).toBe(true);
    useBackend.setState({ down: false });
    reportFailure(problem(500, 'internal'));
    expect(useBackend.getState().down).toBe(true);
  });
});
