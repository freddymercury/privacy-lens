import {
  transformServerResponse,
  transformBulkServerResponses,
  normalizeRiskLevel,
  transformPrepackagedData,
  formatCategoryName,
  addSourceInfoToAssessment
} from '../transform.js';

describe('normalizeRiskLevel', () => {
  test('lowercases string risk levels', () => {
    expect(normalizeRiskLevel('HIGH')).toBe('high');
    expect(normalizeRiskLevel('Medium')).toBe('medium');
  });

  test('handles object-shaped risk levels', () => {
    expect(normalizeRiskLevel({ risk: 'HIGH' })).toBe('high');
    expect(normalizeRiskLevel({ risk: 42 })).toBe('unknown');
  });

  test('returns unknown for unexpected structures', () => {
    expect(normalizeRiskLevel(undefined)).toBe('unknown');
    expect(normalizeRiskLevel(null)).toBe('unknown');
    expect(normalizeRiskLevel({})).toBe('unknown');
  });
});

describe('transformServerResponse', () => {
  const serverResponse = {
    status: 'success',
    timestamp: 1700000000000,
    assessment: {
      riskLevel: 'HIGH',
      categories: { dataCollection: { risk: 'high' } },
      policyUrl: 'https://example.com/privacy'
    }
  };

  test('throws on invalid server response', () => {
    expect(() => transformServerResponse('example.com', null)).toThrow('Invalid server response format');
    expect(() => transformServerResponse('example.com', {})).toThrow('Invalid server response format');
  });

  test('produces the IndexedDB record shape', () => {
    const record = transformServerResponse('example.com', serverResponse);

    expect(record.domain).toBe('example.com');
    expect(record.assessment.riskLevel).toBe('high');
    expect(record.assessment.policyUrl).toBe('https://example.com/privacy');
    expect(record.assessment.categories).toEqual(serverResponse.assessment.categories);
    expect(record.metadata.source).toBe('server');
    expect(record.metadata.serverTimestamp).toBe(1700000000000);
    expect(typeof record.metadata.timestamp).toBe('number');
  });

  test('defaults policyUrl to null when absent', () => {
    const record = transformServerResponse('example.com', {
      status: 'success',
      assessment: { riskLevel: 'low' }
    });
    expect(record.assessment.policyUrl).toBeNull();
  });

  test('falls back to local timestamp when server timestamp missing', () => {
    const before = Date.now();
    const record = transformServerResponse('example.com', {
      status: 'success',
      assessment: { riskLevel: 'low' }
    });
    expect(record.metadata.serverTimestamp).toBeGreaterThanOrEqual(before);
  });
});

describe('transformBulkServerResponses', () => {
  test('transforms all valid responses and skips invalid ones', () => {
    const result = transformBulkServerResponses({
      'good.com': { status: 'success', assessment: { riskLevel: 'low' } },
      'bad.com': { status: 'error' },
      'also-good.com': { status: 'success', assessment: { riskLevel: 'high' } }
    });

    expect(result).toHaveLength(2);
    expect(result.map((r) => r.domain)).toEqual(['good.com', 'also-good.com']);
  });

  test('returns empty array for empty input', () => {
    expect(transformBulkServerResponses({})).toEqual([]);
  });
});

describe('transformPrepackagedData', () => {
  test('throws on invalid pre-packaged format', () => {
    expect(() => transformPrepackagedData({})).toThrow('Invalid pre-packaged database format');
    expect(() => transformPrepackagedData({ assessments: 'nope' })).toThrow('Invalid pre-packaged database format');
  });

  test('marks source as prepackaged and normalizes risk levels', () => {
    const result = transformPrepackagedData({
      assessments: {
        'example.com': {
          assessment: { riskLevel: 'MEDIUM', categories: {} },
          metadata: { timestamp: 123, version: '1.0.0' }
        }
      }
    });

    expect(result).toHaveLength(1);
    expect(result[0].domain).toBe('example.com');
    expect(result[0].assessment.riskLevel).toBe('medium');
    expect(result[0].assessment.policyUrl).toBeNull();
    expect(result[0].metadata.source).toBe('prepackaged');
    expect(result[0].metadata.timestamp).toBe(123);
  });
});

describe('formatCategoryName', () => {
  test('splits camelCase into words with capitalization', () => {
    expect(formatCategoryName('dataCollection')).toBe('Data Collection');
    expect(formatCategoryName('userControl')).toBe('User Control');
  });

  test('handles empty input', () => {
    expect(formatCategoryName('')).toBe('');
    expect(formatCategoryName(null)).toBe('');
  });
});

describe('addSourceInfoToAssessment', () => {
  test('returns null for null input', () => {
    expect(addSourceInfoToAssessment(null)).toBeNull();
  });

  test('adds source info when metadata present', () => {
    const enriched = addSourceInfoToAssessment({
      domain: 'example.com',
      metadata: { source: 'prepackaged', timestamp: 1700000000000 }
    });

    expect(enriched.sourceInfo.source).toBe('prepackaged');
    expect(enriched.sourceInfo.timestamp).toBe(1700000000000);
    expect(typeof enriched.sourceInfo.formattedDate).toBe('string');
  });

  test('does not add source info without metadata', () => {
    const enriched = addSourceInfoToAssessment({ domain: 'example.com' });
    expect(enriched.sourceInfo).toBeUndefined();
  });

  test('does not mutate the original object', () => {
    const original = { domain: 'example.com', metadata: { source: 'server', timestamp: 1 } };
    addSourceInfoToAssessment(original);
    expect(original.sourceInfo).toBeUndefined();
  });
});
