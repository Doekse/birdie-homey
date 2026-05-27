'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const moldRisk = require('../lib/Utils/moldRisk');

const {
  BAND_IDS,
  INITIALIZING_MS,
  scoreRh,
  scoreTemp,
  scoreCo2,
  computeBaseRisk,
  accumulateRiskScore,
  mushroomsFromScore,
  riskBandFromScore,
  isInitializing,
  compareRiskBands,
  hasFinishedInitializing,
  isMoldRiskAlarmActive,
} = moldRisk;

describe('scoreRh', () => {
  it('returns 0 below 40%', () => {
    assert.equal(scoreRh(0), 0);
    assert.equal(scoreRh(39), 0);
  });

  it('returns 1 from 40% through 60%', () => {
    assert.equal(scoreRh(40), 1);
    assert.equal(scoreRh(60), 1);
  });

  it('returns 2 from 61% through 70%', () => {
    assert.equal(scoreRh(61), 2);
    assert.equal(scoreRh(70), 2);
  });

  it('returns 3 above 70%', () => {
    assert.equal(scoreRh(71), 3);
    assert.equal(scoreRh(100), 3);
  });
});

describe('scoreTemp', () => {
  it('returns 2 below 16 °C', () => {
    assert.equal(scoreTemp(15.9), 2);
    assert.equal(scoreTemp(-5), 2);
  });

  it('returns 1 from 16 °C up to but not including 18 °C', () => {
    assert.equal(scoreTemp(16), 1);
    assert.equal(scoreTemp(17.9), 1);
  });

  it('returns 0 from 18 °C through 22 °C', () => {
    assert.equal(scoreTemp(18), 0);
    assert.equal(scoreTemp(22), 0);
  });

  it('returns 1 above 22 °C through 24 °C', () => {
    assert.equal(scoreTemp(22.1), 1);
    assert.equal(scoreTemp(24), 1);
  });

  it('returns 2 above 24 °C', () => {
    assert.equal(scoreTemp(24.1), 2);
    assert.equal(scoreTemp(30), 2);
  });
});

describe('scoreCo2', () => {
  it('returns 0 below 800 ppm', () => {
    assert.equal(scoreCo2(0), 0);
    assert.equal(scoreCo2(799), 0);
  });

  it('returns 1 from 800 ppm through 1200 ppm', () => {
    assert.equal(scoreCo2(800), 1);
    assert.equal(scoreCo2(1200), 1);
  });

  it('returns 2 above 1200 ppm', () => {
    assert.equal(scoreCo2(1201), 2);
    assert.equal(scoreCo2(5000), 2);
  });
});

describe('computeBaseRisk', () => {
  it('sums RH, temperature, and CO₂ sub-scores', () => {
    assert.equal(
      computeBaseRisk({ rh: 50, temp: 20, co2: 600 }),
      scoreRh(50) + scoreTemp(20) + scoreCo2(600),
    );
    assert.equal(computeBaseRisk({ rh: 50, temp: 20, co2: 600 }), 1);
  });
});

describe('accumulateRiskScore', () => {
  it('matches CSV calculation examples (BaseRisk 5)', () => {
    const base = 5;
    assert.equal(accumulateRiskScore(0, base), 1);
    assert.equal(accumulateRiskScore(1, base), 2);
    assert.equal(accumulateRiskScore(2, base), 3);
    assert.equal(accumulateRiskScore(3, base), 4);
  });

  it('clamps at 0 when delta would go negative', () => {
    assert.equal(accumulateRiskScore(0, 0), 0);
    assert.equal(accumulateRiskScore(1, 0), 0);
  });

  it('clamps at 100 when delta would exceed maximum', () => {
    assert.equal(accumulateRiskScore(98, 7), 100);
    assert.equal(accumulateRiskScore(100, 7), 100);
  });
});

describe('mushroomsFromScore', () => {
  it('maps score ranges to mushroom index 1–12 per model table', () => {
    assert.equal(mushroomsFromScore(0), 1);
    assert.equal(mushroomsFromScore(8), 1);
    assert.equal(mushroomsFromScore(9), 2);
    assert.equal(mushroomsFromScore(24), 3);
    assert.equal(mushroomsFromScore(25), 4);
    assert.equal(mushroomsFromScore(48), 6);
    assert.equal(mushroomsFromScore(100), 12);
  });
});

describe('riskBandFromScore', () => {
  it('assigns low through very_high at documented boundaries', () => {
    assert.equal(riskBandFromScore(0), BAND_IDS.LOW);
    assert.equal(riskBandFromScore(24), BAND_IDS.LOW);
    assert.equal(riskBandFromScore(25), BAND_IDS.MODERATE);
    assert.equal(riskBandFromScore(48), BAND_IDS.MODERATE);
    assert.equal(riskBandFromScore(49), BAND_IDS.HIGH);
    assert.equal(riskBandFromScore(72), BAND_IDS.HIGH);
    assert.equal(riskBandFromScore(73), BAND_IDS.VERY_HIGH);
    assert.equal(riskBandFromScore(100), BAND_IDS.VERY_HIGH);
  });
});

describe('compareRiskBands', () => {
  it('detects step up and step down between risk bands', () => {
    assert.deepEqual(
      compareRiskBands(BAND_IDS.LOW, BAND_IDS.MODERATE),
      { increased: true, decreased: false },
    );
    assert.deepEqual(
      compareRiskBands(BAND_IDS.HIGH, BAND_IDS.MODERATE),
      { increased: false, decreased: true },
    );
  });

  it('returns neither when the band is unchanged', () => {
    assert.deepEqual(
      compareRiskBands(BAND_IDS.MODERATE, BAND_IDS.MODERATE),
      { increased: false, decreased: false },
    );
  });

  it('ignores transitions involving calculating', () => {
    assert.deepEqual(
      compareRiskBands(BAND_IDS.CALCULATING, BAND_IDS.LOW),
      { increased: false, decreased: false },
    );
    assert.deepEqual(
      compareRiskBands(BAND_IDS.LOW, BAND_IDS.CALCULATING),
      { increased: false, decreased: false },
    );
  });
});

describe('hasFinishedInitializing', () => {
  it('is true when leaving calculating for a settled band', () => {
    assert.equal(hasFinishedInitializing(BAND_IDS.CALCULATING, BAND_IDS.LOW), true);
    assert.equal(hasFinishedInitializing(BAND_IDS.CALCULATING, BAND_IDS.VERY_HIGH), true);
  });

  it('is false for other band transitions', () => {
    assert.equal(hasFinishedInitializing(BAND_IDS.LOW, BAND_IDS.MODERATE), false);
    assert.equal(hasFinishedInitializing(BAND_IDS.CALCULATING, BAND_IDS.CALCULATING), false);
    assert.equal(hasFinishedInitializing(BAND_IDS.LOW, BAND_IDS.CALCULATING), false);
  });
});

describe('isMoldRiskAlarmActive', () => {
  it('is active when the band meets or exceeds the threshold', () => {
    assert.equal(isMoldRiskAlarmActive(BAND_IDS.MODERATE, BAND_IDS.MODERATE), true);
    assert.equal(isMoldRiskAlarmActive(BAND_IDS.HIGH, BAND_IDS.MODERATE), true);
    assert.equal(isMoldRiskAlarmActive(BAND_IDS.VERY_HIGH, BAND_IDS.HIGH), true);
  });

  it('is inactive below the threshold', () => {
    assert.equal(isMoldRiskAlarmActive(BAND_IDS.LOW, BAND_IDS.MODERATE), false);
    assert.equal(isMoldRiskAlarmActive(BAND_IDS.MODERATE, BAND_IDS.HIGH), false);
    assert.equal(isMoldRiskAlarmActive(BAND_IDS.HIGH, BAND_IDS.VERY_HIGH), false);
  });

  it('is inactive while calculating or for invalid thresholds', () => {
    assert.equal(isMoldRiskAlarmActive(BAND_IDS.CALCULATING, BAND_IDS.MODERATE), false);
    assert.equal(isMoldRiskAlarmActive(BAND_IDS.HIGH, BAND_IDS.CALCULATING), false);
  });
});

describe('isInitializing', () => {
  it('is true before 14 days have elapsed', () => {
    const startedAt = Date.parse('2026-01-01T00:00:00Z');
    const day13 = startedAt + 13 * 24 * 60 * 60 * 1000;
    assert.equal(isInitializing(startedAt, day13), true);
  });

  it('is false once 14 full days have passed', () => {
    const startedAt = Date.parse('2026-01-01T00:00:00Z');
    const day14 = startedAt + INITIALIZING_MS;
    const day15 = startedAt + 15 * 24 * 60 * 60 * 1000;
    assert.equal(isInitializing(startedAt, day14), false);
    assert.equal(isInitializing(startedAt, day15), false);
  });
});
