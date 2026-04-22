'use strict';

const Homey = require('homey');

/**
 * App wrapper reserved for shared app-level logic.
 *
 * This keeps the app entry point minimal while creating a stable
 * place for cross-driver coordination as support grows.
 */
module.exports = class BirdieApp extends Homey.App {
  /**
   * Logs app startup to confirm lifecycle initialization.
   */
  async onInit() {
    this.log('BirdieApp has been initialized');
  }

  /**
   * Explicitly handles app teardown to keep cloud lifecycle transitions visible.
   */
  async onUninit() {
    this.log('BirdieApp is being uninitialized');
  }
};
