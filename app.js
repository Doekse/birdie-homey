'use strict';

const BirdieApp = require('./lib/BirdieApp');

module.exports = class MyApp extends BirdieApp {
  /**
   * onInit is called when the driver is initialized.
   */
  async onInit() {
    await super.onInit();
    this.log('Birdie App has been initialized');
  }
};
