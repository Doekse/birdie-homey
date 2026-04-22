'use strict';

const BirdieDevice = require('../../lib/BirdieDevice');

module.exports = class MyDevice extends BirdieDevice {
  /**
   * onInit is called when the driver is initialized.
   */
  async onInit() {
    await super.onInit();
    this.log('Birdie Pro Device has been initialized');
  }
};
