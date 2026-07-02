'use strict';

const SERVICES = Object.freeze({
  ENVIRONMENTAL: '4c9b9a7b370d473b8109f4dfeb661012',
  BATTERY: '30b69cc203ce4e58aa95b8bffffb4694',
  CONFIGURATION: '1db703c723544ffbbab52ae18e414791',
  CURRENT_TIME: '6a2a22dff59d4ceaaa62ac2ee0507ed2',
});

const CHARACTERISTICS = Object.freeze({
  CO2: '8fd61dc9bb7448c8924ad95c57c2f42f',
  TEMPERATURE: '0b91651ccadb490c92ca45cc8f40f1c9',
  HUMIDITY: '0842ee994d8740c589c28e5b23f37c59',
  BIRDIE_STATE: '6fdbae35d2414a74bbc3992010010601',
  BATTERY_LEVEL: '4769d60c49b14e4bbc0c149c5e757bdd',
  IAQ_THRESHOLD: '5f46fade19a94dd5991e22729e3ebc44',
  COOL_DOWN_PERIOD: '2f0c3872c2be4416961014a103ed1fc7',
  FIRMWARE_REVISION: '8798982b8e1a4102ab20b8f1b6a75495',
  HARDWARE_VERSION: 'a418b9351e124e2a9e3081c91ea6b5a0',
  CURRENT_TIME: '1dfdc91398014529bef4c5ceb0affeb9',
});

/** Device settings populated from BLE for display only; never written back to the device. */
const SETTINGS = Object.freeze([
  'deviceHwVersion',
  'deviceSwVersion',
]);

const BATTERY_LEVEL_MAP = Object.freeze({
  0: 100,
  1: 75,
  2: 50,
  3: 25,
  4: 0,
});

const BLE_RECONNECT_BASE_DELAY_MS = 5_000;
const BLE_RECONNECT_MAX_DELAY_MS = 5 * 60 * 1000;
const CONSECUTIVE_FAILURES = 3;

module.exports = {
  SERVICES,
  CHARACTERISTICS,
  SETTINGS,
  BATTERY_LEVEL_MAP,
  BLE_RECONNECT_BASE_DELAY_MS,
  BLE_RECONNECT_MAX_DELAY_MS,
  CONSECUTIVE_FAILURES,
};
