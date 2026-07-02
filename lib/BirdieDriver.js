'use strict';

const Homey = require('homey');

const BIRDIE_NAME_PREFIX = 'Birdie Pro';

module.exports = class BirdieDriver extends Homey.Driver {

  async onInit() {
    this._registerFlowConditionCards();
  }

  /**
   * @private
   */
  _registerFlowConditionCards() {
    this.homey.flow.getConditionCard('measure_mold_risk_is').registerRunListener(async (args) => {
      const band = await args.device.getStoreValue('moldRiskBand');
      return band === args.band;
    });

    this.homey.flow.getConditionCard('alarm_mold_risk').registerRunListener(async (args, state) => {
      const active = await args.device.getCapabilityValue('alarm_mold_risk');
      return state.inverted ? !active : active === true;
    });
  }

  /**
   * Matches devices by advertised local name because the Birdie Pro does not
   * include service UUIDs in its advertisement packets.
   */
  async onPairListDevices() {
    this.log('[debug] Starting BLE discovery…');
    const advertisements = await this.homey.ble.discover();
    this.log(`[debug] Discovery complete — ${advertisements.length} advertisement(s) found`);

    const seenPeripheralUuids = new Set();

    const devices = advertisements
      .filter((advertisement) => {
        if (!advertisement?.uuid) {
          this.log('[debug] Skipping advertisement with no uuid');
          return false;
        }

        if (seenPeripheralUuids.has(advertisement.uuid)) {
          this.log(`[debug] Skipping duplicate: ${advertisement.uuid}`);
          return false;
        }

        const name = advertisement.localName?.trim() || '';

        if (!name.startsWith(BIRDIE_NAME_PREFIX)) {
          return false;
        }

        this.log(`[debug] Matched ${advertisement.uuid} (${name})`);
        seenPeripheralUuids.add(advertisement.uuid);
        return true;
      })
      .map((advertisement) => ({
        name: advertisement.localName.trim(),
        data: {
          id: advertisement.uuid,
        },
        store: {
          peripheralUuid: advertisement.uuid,
        },
      }));

    this.log(`[debug] Returning ${devices.length} device(s) for pairing`);
    return devices;
  }

  /**
   * Keeps driver shutdown explicit so cloud instance recycling is traceable.
   */
  async onUninit() {
    this.log('BirdieDriver is being uninitialized');
  }

};
