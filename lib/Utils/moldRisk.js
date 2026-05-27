'use strict';

const INITIALIZING_MS = 14 * 24 * 60 * 60 * 1000;
const FIRST_TICK_DELAY_MS = 120_000;
const TICK_INTERVAL_MS = 3_600_000;
const BAND_IDS = Object.freeze({
  CALCULATING: 'calculating',
  LOW: 'low',
  MODERATE: 'moderate',
  HIGH: 'high',
  VERY_HIGH: 'very_high',
});

/** Ordered risk bands for increase/decrease Flow triggers (excludes calculating). */
const RISK_BAND_ORDER = Object.freeze([
  BAND_IDS.LOW,
  BAND_IDS.MODERATE,
  BAND_IDS.HIGH,
  BAND_IDS.VERY_HIGH,
]);

/**
 * Relative humidity sub-score (0–3) per Birdie mold risk model v1.
 * @param {number} rh - Relative humidity (%)
 * @returns {number}
 */
function scoreRh(rh) {
  if (rh < 40) return 0;
  if (rh <= 60) return 1;
  if (rh <= 70) return 2;
  return 3;
}

/**
 * Temperature sub-score (0–2) per Birdie mold risk model v1.
 * CSV row "16>" is interpreted as below 16 °C (condensation / cold risk), not above 16.
 * @param {number} celsius - Air temperature (°C)
 * @returns {number}
 */
function scoreTemp(celsius) {
  if (celsius < 16) return 2;
  if (celsius < 18) return 1;
  if (celsius <= 22) return 0;
  if (celsius <= 24) return 1;
  return 2;
}

/**
 * CO₂ sub-score (0–2) per Birdie mold risk model v1.
 * @param {number} ppm - CO₂ concentration (ppm)
 * @returns {number}
 */
function scoreCo2(ppm) {
  if (ppm < 800) return 0;
  if (ppm <= 1200) return 1;
  return 2;
}

/**
 * Hourly base risk from environmental inputs (0–7).
 * @param {{ rh: number, temp: number, co2: number }} inputs
 * @returns {number}
 */
function computeBaseRisk({ rh, temp, co2 }) {
  return scoreRh(rh) + scoreTemp(temp) + scoreCo2(co2);
}

/**
 * @param {number} value
 * @param {number} min
 * @param {number} max
 * @returns {number}
 */
function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

/**
 * Accumulates mold risk score: prev + (baseRisk - 4), clamped to 0–100.
 * @param {number} prev - Previous RiskScore (0–100)
 * @param {number} baseRisk - BaseRisk for this hour (0–7)
 * @returns {number}
 */
function accumulateRiskScore(prev, baseRisk) {
  return clamp(prev + (baseRisk - 4), 0, 100);
}

/**
 * Mushroom index (1–12) from accumulated RiskScore per model band table.
 * @param {number} score - RiskScore (0–100)
 * @returns {number}
 */
function mushroomsFromScore(score) {
  if (score <= 0) return 1;
  return Math.min(12, Math.ceil(score / 8));
}

/**
 * Risk band id from accumulated score (not the initializing `calculating` band).
 * @param {number} score - RiskScore (0–100)
 * @returns {'low' | 'moderate' | 'high' | 'very_high'}
 */
function riskBandFromScore(score) {
  if (score <= 24) return BAND_IDS.LOW;
  if (score <= 48) return BAND_IDS.MODERATE;
  if (score <= 72) return BAND_IDS.HIGH;
  return BAND_IDS.VERY_HIGH;
}

/**
 * Whether the device is still in the 14-day initializing period.
 * @param {number} startedAtMs - Epoch ms when mold risk initializing started
 * @param {number} [nowMs] - Current time (defaults to Date.now())
 * @returns {boolean}
 */
function isInitializing(startedAtMs, nowMs = Date.now()) {
  return nowMs - startedAtMs < INITIALIZING_MS;
}

/**
 * Whether a band id is a settled risk level (not `calculating` while initializing).
 * @param {string} bandId
 * @returns {boolean}
 */
function isRiskBand(bandId) {
  return RISK_BAND_ORDER.includes(bandId);
}

/**
 * Detects band step up/down for measure_mold_risk_increased/decreased triggers.
 * Ignores transitions involving `calculating` or unknown ids.
 *
 * @param {string} prevBandId
 * @param {string} nextBandId
 * @returns {{ increased: boolean, decreased: boolean }}
 */
function compareRiskBands(prevBandId, nextBandId) {
  if (!isRiskBand(prevBandId) || !isRiskBand(nextBandId)) {
    return { increased: false, decreased: false };
  }
  const prevIdx = RISK_BAND_ORDER.indexOf(prevBandId);
  const nextIdx = RISK_BAND_ORDER.indexOf(nextBandId);
  return {
    increased: nextIdx > prevIdx,
    decreased: nextIdx < prevIdx,
  };
}

/**
 * Whether the device left the initializing period and reported a settled risk band.
 *
 * @param {string} prevBandId
 * @param {string} nextBandId
 * @returns {boolean}
 */
function hasFinishedInitializing(prevBandId, nextBandId) {
  return prevBandId === BAND_IDS.CALCULATING && isRiskBand(nextBandId);
}

/**
 * Whether the current band meets or exceeds the user-selected threshold.
 * Unsettled bands (e.g. `calculating`) never trigger the alarm.
 *
 * @param {string} bandId - Current mold risk band
 * @param {string} thresholdBandId - Minimum band from device setting (`moderate` | `high` | `very_high`)
 * @returns {boolean}
 */
function isMoldRiskAlarmActive(bandId, thresholdBandId) {
  if (!isRiskBand(bandId) || !isRiskBand(thresholdBandId)) {
    return false;
  }
  return RISK_BAND_ORDER.indexOf(bandId) >= RISK_BAND_ORDER.indexOf(thresholdBandId);
}

module.exports = {
  INITIALIZING_MS,
  FIRST_TICK_DELAY_MS,
  TICK_INTERVAL_MS,
  BAND_IDS,
  scoreRh,
  scoreTemp,
  scoreCo2,
  computeBaseRisk,
  accumulateRiskScore,
  mushroomsFromScore,
  riskBandFromScore,
  isInitializing,
  isRiskBand,
  compareRiskBands,
  hasFinishedInitializing,
  isMoldRiskAlarmActive,
};
