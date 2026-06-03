'use strict';

const BirdieDriver = require('../../lib/BirdieDriver');

module.exports = class MyDriver extends BirdieDriver {
  /**
   * onInit is called when the driver is initialized.
   */
  async onInit() {
    await super.onInit();
    this.log('Birdie Pro Driver has been initialized');
  }
};
