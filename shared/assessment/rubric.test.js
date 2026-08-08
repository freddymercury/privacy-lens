/**
 * Tests for the versioned assessment rubric (rubric.json) and the
 * rubric-driven behavior in core.js and llm.js
 */

const core = require('./core');
const llm = require('./llm');
const rubric = require('./rubric.json');

describe('rubric.json', () => {
  it('loads and has a semver version', () => {
    expect(typeof rubric.version).toBe('string');
    expect(rubric.version).toMatch(/^\d+\.\d+\.\d+$/);
  });

  it('defines exactly 4 risk levels with definitions', () => {
    expect(rubric.riskLevels).toHaveLength(4);
    expect(rubric.riskLevels.map(l => l.name)).toEqual(['High', 'Medium', 'Low', 'Unknown']);
    for (const level of rubric.riskLevels) {
      expect(typeof level.definition).toBe('string');
      expect(level.definition.length).toBeGreaterThan(0);
    }
  });

  it('defines the 6 privacy categories with anchors for High/Medium/Low', () => {
    expect(rubric.categories).toHaveLength(6);
    expect(rubric.categories.map(c => c.name)).toEqual([
      'Data Collection & Use',
      'Third-Party Sharing & Selling',
      'Data Storage & Security',
      'User Rights & Control',
      'AI & Automated Decision-Making',
      'Policy Changes & Updates',
    ]);
    for (const category of rubric.categories) {
      expect(typeof category.definition).toBe('string');
      expect(category.definition.length).toBeGreaterThan(0);
      for (const level of ['High', 'Medium', 'Low']) {
        expect(typeof category.anchors[level]).toBe('string');
        expect(category.anchors[level].length).toBeGreaterThan(0);
      }
    }
  });

  it('declares aggregation settings', () => {
    expect(rubric.aggregation).toEqual({
      categoryAcrossChunks: 'max',
      overall: 'max',
    });
  });
});

describe('core rubric integration', () => {
  it('derives PRIVACY_CATEGORIES from the rubric', () => {
    expect(core.PRIVACY_CATEGORIES).toEqual(rubric.categories.map(c => c.name));
  });

  it('derives RISK_LEVELS from the rubric', () => {
    expect(core.RISK_LEVELS).toEqual({
      HIGH: 'High',
      MEDIUM: 'Medium',
      LOW: 'Low',
      UNKNOWN: 'Unknown',
    });
  });

  it('exposes getRubric() and RUBRIC_VERSION', () => {
    expect(core.getRubric()).toEqual(rubric);
    expect(core.RUBRIC_VERSION).toBe(rubric.version);
  });

  it('keeps normalizeRiskLevel and getRiskPriority working', () => {
    expect(core.normalizeRiskLevel('high')).toBe('High');
    expect(core.normalizeRiskLevel('moderate')).toBe('Medium');
    expect(core.normalizeRiskLevel('something else')).toBe('Unknown');
    expect(core.getRiskPriority('High')).toBe(3);
    expect(core.getRiskPriority('Unknown')).toBe(0);
  });
});

describe('rubric-driven prompts', () => {
  it('includes category definitions and anchor criteria in the assessment prompt', () => {
    const prompt = llm.createAssessmentPrompt('We collect your email address.', 'example.com');

    for (const category of rubric.categories) {
      expect(prompt).toContain(category.name);
      expect(prompt).toContain(category.definition);
      expect(prompt).toContain(category.anchors.High);
      expect(prompt).toContain(category.anchors.Medium);
      expect(prompt).toContain(category.anchors.Low);
    }
    for (const level of rubric.riskLevels) {
      expect(prompt).toContain(level.definition);
    }
  });

  it('asks for a verbatim evidence quote per category', () => {
    const prompt = llm.createAssessmentPrompt('We collect your email address.');

    expect(prompt).toContain('"evidence"');
    expect(prompt).toContain('Verbatim quote');
  });

  it('includes anchors and evidence instructions in the chunk prompt', () => {
    const prompt = llm.createChunkAssessmentPrompt('Chunk text here.', 1, 3, 'example.com');

    expect(prompt).toContain('CHUNK 1/3');
    for (const category of rubric.categories) {
      expect(prompt).toContain(category.anchors.High);
    }
    expect(prompt).toContain('"evidence"');
  });

  it('does not contain the old hardcoded one-line risk definitions', () => {
    const prompt = llm.createAssessmentPrompt('Some policy text.');

    expect(prompt).not.toContain('Severe concerns (selling data, minimal control)');
    expect(prompt).not.toContain('User-friendly, privacy-conscious');
  });
});

describe('parseAssessmentResponse evidence handling', () => {
  it('passes evidence quotes through', () => {
    const response = JSON.stringify({
      categories: {
        'Data Collection & Use': {
          risk: 'high',
          explanation: 'Collects email',
          evidence: 'We collect your email address.',
        },
      },
      overallRisk: 'High',
      summary: 'Test summary',
    });

    const parsed = llm.parseAssessmentResponse(response);

    expect(parsed.categories['Data Collection & Use']).toEqual({
      risk: 'High',
      explanation: 'Collects email',
      evidence: 'We collect your email address.',
    });
    expect(parsed.riskLevel).toBe('High');
  });

  it('tolerates missing evidence', () => {
    const response = JSON.stringify({
      categories: {
        'Data Collection & Use': {
          risk: 'Low',
          explanation: 'Minimal collection',
        },
      },
      overallRisk: 'Low',
      summary: 'Test summary',
    });

    const parsed = llm.parseAssessmentResponse(response);

    expect(parsed.categories['Data Collection & Use']).toEqual({
      risk: 'Low',
      explanation: 'Minimal collection',
    });
    expect(parsed.categories['Data Collection & Use'].evidence).toBeUndefined();
  });
});

describe('combineChunkAssessments aggregation', () => {
  const makeChunks = () => ([
    {
      categories: {
        'Data Collection & Use': { risk: 'Low', explanation: 'low chunk', evidence: 'low evidence' },
        'Third-Party Sharing & Selling': { risk: 'High', explanation: 'high chunk 1', evidence: 'high evidence 1' },
      },
      riskLevel: 'High',
      summary: 'Chunk 1 summary',
    },
    {
      categories: {
        'Data Collection & Use': { risk: 'Medium', explanation: 'medium chunk', evidence: 'medium evidence' },
        'Third-Party Sharing & Selling': { risk: 'Low', explanation: 'low sharing chunk', evidence: 'low sharing evidence' },
        'Data Storage & Security': { risk: 'Medium', explanation: 'medium security', evidence: 'security evidence' },
      },
      riskLevel: 'Medium',
      summary: 'Chunk 2 summary',
    },
    {
      categories: {
        'Third-Party Sharing & Selling': { risk: 'Low', explanation: 'low sharing chunk 2', evidence: 'low sharing evidence 2' },
        'User Rights & Control': { risk: 'Low', explanation: 'low rights', evidence: 'rights evidence' },
      },
      riskLevel: 'Low',
      summary: 'Chunk 3 summary',
    },
  ]);

  it('uses max-wins by default and keeps evidence from the winning chunk', () => {
    const combined = llm.combineChunkAssessments(makeChunks());

    // Highest risk per category wins
    expect(combined.categories['Data Collection & Use'].risk).toBe('Medium');
    expect(combined.categories['Data Collection & Use'].evidence).toBe('medium evidence');
    expect(combined.categories['Third-Party Sharing & Selling'].risk).toBe('High');
    expect(combined.categories['Third-Party Sharing & Selling'].explanation).toBe('high chunk 1');
    expect(combined.categories['Third-Party Sharing & Selling'].evidence).toBe('high evidence 1');

    // Untouched categories stay Unknown
    expect(combined.categories['AI & Automated Decision-Making'].risk).toBe('Unknown');

    // Overall is the max of combined category risks
    expect(combined.riskLevel).toBe('High');
  });

  it('honors the "majority" overall strategy (most common non-Unknown category risk)', () => {
    // Combined categories: Medium, Low, Medium, Low, Unknown, Unknown -> tie Medium/Low,
    // tie-break toward higher risk -> Medium (max would give High)
    const combined = llm.combineChunkAssessments(makeChunks(), { overall: 'majority' });

    expect(combined.riskLevel).toBe('Medium');
  });

  it('honors the "majority" categoryAcrossChunks strategy', () => {
    // Third-Party Sharing: High, Low, Low across chunks -> majority Low (max would give High)
    const combined = llm.combineChunkAssessments(makeChunks(), { categoryAcrossChunks: 'majority' });

    expect(combined.categories['Third-Party Sharing & Selling'].risk).toBe('Low');
    // Evidence comes from a chunk that voted for the majority risk
    expect(combined.categories['Third-Party Sharing & Selling'].evidence).toBe('low sharing evidence');
  });

  it('tolerates chunk categories without evidence', () => {
    const chunks = [
      {
        categories: {
          'Data Collection & Use': { risk: 'High', explanation: 'no evidence here' },
        },
        riskLevel: 'High',
        summary: 'Chunk summary',
      },
    ];

    const combined = llm.combineChunkAssessments(chunks);

    expect(combined.categories['Data Collection & Use'].risk).toBe('High');
    expect(combined.categories['Data Collection & Use'].evidence).toBeUndefined();
  });
});
