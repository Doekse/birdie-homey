'use strict';

const Homey = require('homey');
const {
  SERVICES,
  CHARACTERISTICS,
  BATTERY_LEVEL_MAP,
  BLE_RECONNECT_BASE_DELAY_MS,
  BLE_RECONNECT_MAX_DELAY_MS,
  CONSECUTIVE_FAILURES,
} = require('./constants');

module.exports = class BirdieDevice extends Homey.Device {

  /**
   * Establishes a persistent BLE connection and subscribes to GATT
   * notifications so the device pushes values as they change.
   */
  async onInit() {
    this._peripheral = null;
    this._configChars = null;
    this._reconnectTimer = null;
    this._reconnectAttempt = 0;
    this._consecutiveConnectFailures = 0;
    this._destroyed = false;

    this.connectAndSubscribe().catch((error) => {
      this.error('Initial connection failed', error);
    });
  }

  /**
   * Tears down the BLE session and cancels any pending reconnect so the
   * app process does not retain references to a removed device.
   */
  async onDeleted() {
    await this.teardownConnection();
  }

  /**
   * Handles lifecycle shutdown so cloud instance recycling does not leave
   * open BLE resources or reconnect timers behind.
   */
  async onUninit() {
    await this.teardownConnection();
  }

  /**
   * Single entry point for the connect → discover → subscribe lifecycle.
   * On success the device stays connected and receives push updates; on
   * failure it schedules an automatic reconnect with exponential backoff.
   */
  async connectAndSubscribe() {
    if (this._destroyed) return;

    const peripheralUuid = this.getStoreValue('peripheralUuid') || this.getData()?.id;
    if (!peripheralUuid) {
      this.error('Missing peripheralUuid in store/data; cannot connect');
      return;
    }

    try {
      this.log('Connecting to peripheral', peripheralUuid);
      const advertisement = await this.homey.ble.find(peripheralUuid);
      const peripheral = await advertisement.connect();
      this._peripheral = peripheral;
      this._reconnectAttempt = 0;
      this._consecutiveConnectFailures = 0;

      const services = await this.discoverServiceMap(peripheral);

      const envService = services[SERVICES.ENVIRONMENTAL];
      const envChars = envService
        ? await this.discoverCharacteristicMap(envService)
        : null;

      const batService = services[SERVICES.BATTERY];
      const batChars = batService
        ? await this.discoverCharacteristicMap(batService)
        : null;

      const configService = services[SERVICES.CONFIGURATION];
      const configChars = configService
        ? await this.discoverCharacteristicMap(configService)
        : null;
      this._configChars = configChars;

      const timeService = services[SERVICES.CURRENT_TIME];
      const timeChars = timeService
        ? await this.discoverCharacteristicMap(timeService)
        : null;

      if (envChars) await this.subscribeEnvironmental(envChars);
      if (batChars) await this.subscribeBattery(batChars);
      if (timeChars) await this.writeCurrentTime(timeChars);

      await this.pollAllData(envChars, batChars, configChars);

      this.setAvailable().catch(() => {});

      peripheral.once('disconnect', () => {
        this.log('Peripheral disconnected');
        this._peripheral = null;
        this._configChars = null;
        if (!this._destroyed) {
          this.scheduleReconnect();
        }
      });
    } catch (error) {
      this.error('Connection/subscription failed', error);
      this._peripheral = null;
      this._configChars = null;
      this._consecutiveConnectFailures += 1;
      if (this._consecutiveConnectFailures >= CONSECUTIVE_FAILURES) {
        await this.setUnavailable(this.homey.__('errors.birdie_pro_connect_failed')).catch(() => {});
      } else {
        this.log(
          `Connect failed (${this._consecutiveConnectFailures}/${CONSECUTIVE_FAILURES}); keeping device available while retrying`,
        );
      }
      this.scheduleReconnect();
    }
  }

  /** Subscribes to push notifications for all environmental characteristics. */
  async subscribeEnvironmental(chars) {
    await this.subscribeCharacteristic(chars, CHARACTERISTICS.CO2, (buf) => {
      this.updateCapabilityIfPresent('measure_co2', buf.readUInt16LE(0));
    });

    await this.subscribeCharacteristic(chars, CHARACTERISTICS.TEMPERATURE, (buf) => {
      this.updateCapabilityIfPresent('measure_temperature', buf.readInt16LE(0) / 1000);
    });

    await this.subscribeCharacteristic(chars, CHARACTERISTICS.HUMIDITY, (buf) => {
      this.updateCapabilityIfPresent('measure_humidity', buf.readUInt16LE(0) / 1000);
    });

    await this.subscribeCharacteristic(chars, CHARACTERISTICS.BIRDIE_STATE, (buf) => {
      this.updateCapabilityIfPresent('alarm_co2', buf.readUInt8(0) === 1);
    });
  }

  /** Subscribes to battery level notifications. */
  async subscribeBattery(chars) {
    await this.subscribeCharacteristic(chars, CHARACTERISTICS.BATTERY_LEVEL, (buf) => {
      const encoded = buf.readUInt8(0);
      const pct = BATTERY_LEVEL_MAP[encoded] ?? null;
      this.updateCapabilityIfPresent('measure_battery', pct);
    });
  }

  /**
   * Enables GATT notifications for a single characteristic.
   * The initial value is read separately via pollAllData.
   */
  async subscribeCharacteristic(characteristicMap, uuid, onData) {
    const characteristic = characteristicMap[uuid];
    if (!characteristic) return;

    await characteristic.subscribeToNotifications((buf) => {
      try {
        onData(buf);
      } catch (error) {
        this.error(`Notification handler error for ${uuid}`, error);
      }
    });
  }

  /**
   * Reads every known characteristic once to seed Homey with current values.
   * Called after subscriptions are set up so the device tile is populated
   * immediately, and can be re-invoked for an on-demand refresh.
   */
  async pollAllData(envChars, batChars, configChars) {
    const reads = [];

    if (envChars) {
      reads.push(this.readCharacteristic(envChars, CHARACTERISTICS.CO2, (buf) => {
        this.updateCapabilityIfPresent('measure_co2', buf.readUInt16LE(0));
      }));
      reads.push(this.readCharacteristic(envChars, CHARACTERISTICS.TEMPERATURE, (buf) => {
        this.updateCapabilityIfPresent('measure_temperature', buf.readInt16LE(0) / 1000);
      }));
      reads.push(this.readCharacteristic(envChars, CHARACTERISTICS.HUMIDITY, (buf) => {
        this.updateCapabilityIfPresent('measure_humidity', buf.readUInt16LE(0) / 1000);
      }));
      reads.push(this.readCharacteristic(envChars, CHARACTERISTICS.BIRDIE_STATE, (buf) => {
        this.updateCapabilityIfPresent('alarm_co2', buf.readUInt8(0) === 1);
      }));
    }

    if (batChars) {
      reads.push(this.readCharacteristic(batChars, CHARACTERISTICS.BATTERY_LEVEL, (buf) => {
        const encoded = buf.readUInt8(0);
        const pct = BATTERY_LEVEL_MAP[encoded] ?? null;
        this.updateCapabilityIfPresent('measure_battery', pct);
      }));
    }

    if (configChars) {
      reads.push(this.readCharacteristic(configChars, CHARACTERISTICS.IAQ_THRESHOLD, async (buf) => {
        await this.setSettings({ co2_threshold: buf.readUInt16LE(0) });
      }));
      reads.push(this.readCharacteristic(configChars, CHARACTERISTICS.COOL_DOWN_PERIOD, async (buf) => {
        await this.setSettings({ cool_down_period: buf.readUInt8(0) });
      }));
    }

    let failedReads = 0;
    await Promise.all(reads.map((read) => read.catch((error) => {
      failedReads += 1;
      this.error('Initial poll read failed', error);
    })));
    if (failedReads > 0) {
      this.error(`Initial poll: ${failedReads} read(s) failed`);
    }
  }

  /** Reads a single characteristic and passes the buffer to a callback. */
  async readCharacteristic(characteristicMap, uuid, onData) {
    const characteristic = characteristicMap[uuid];
    if (!characteristic) return;

    const buf = await characteristic.read();
    await onData(buf);
  }

  /**
   * Keeps Homey settings and Birdie configuration in sync so automations can
   * adjust device behavior without a separate BLE management tool.
   */
  async onSettings({ newSettings, changedKeys }) {
    if (!changedKeys?.length) return;
    if (!this._configChars) {
      throw new Error('Birdie is not connected over BLE');
    }

    for (const key of changedKeys) {
      if (key === 'co2_threshold') {
        const value = this.parseIntegerSetting(newSettings.co2_threshold, {
          min: 0,
          max: 65535,
          label: 'CO2 Threshold',
        });
        await this.writeUInt16Setting(CHARACTERISTICS.IAQ_THRESHOLD, value);
      }

      if (key === 'cool_down_period') {
        const value = this.parseIntegerSetting(newSettings.cool_down_period, {
          min: 0,
          max: 255,
          label: 'Cool Down Period',
        });
        await this.writeUInt8Setting(CHARACTERISTICS.COOL_DOWN_PERIOD, value);
      }
    }
  }

  /**
   * Validates numeric settings before writing to BLE so malformed input does
   * not leave Homey and device configuration out of sync.
   */
  parseIntegerSetting(value, { min, max, label }) {
    const numeric = Number(value);
    if (!Number.isInteger(numeric) || numeric < min || numeric > max) {
      throw new Error(`${label} must be an integer between ${min} and ${max}`);
    }
    return numeric;
  }

  async writeUInt16Setting(uuid, value) {
    const characteristic = this._configChars?.[uuid];
    if (!characteristic) {
      throw new Error(`Missing configuration characteristic: ${uuid}`);
    }

    const payload = Buffer.alloc(2);
    payload.writeUInt16LE(value, 0);
    await characteristic.write(payload);
  }

  async writeUInt8Setting(uuid, value) {
    const characteristic = this._configChars?.[uuid];
    if (!characteristic) {
      throw new Error(`Missing configuration characteristic: ${uuid}`);
    }

    const payload = Buffer.alloc(1);
    payload.writeUInt8(value, 0);
    await characteristic.write(payload);
  }

  /**
   * Writes a 4-byte LE Unix timestamp per the Birdie Pro BLE spec (§5.1).
   */
  async writeCurrentTime(chars) {
    const timeChar = chars[CHARACTERISTICS.CURRENT_TIME];
    if (!timeChar) return;

    const payload = Buffer.alloc(4);
    payload.writeUInt32LE(Math.floor(Date.now() / 1000), 0);
    await timeChar.write(payload);
  }

  /** Exponential backoff reconnect to handle transient BLE outages. */
  scheduleReconnect() {
    if (this._destroyed) return;
    this.clearReconnect();

    const delay = Math.min(
      BLE_RECONNECT_BASE_DELAY_MS * 2 ** this._reconnectAttempt,
      BLE_RECONNECT_MAX_DELAY_MS,
    );
    this._reconnectAttempt += 1;
    this.log(`Scheduling reconnect in ${delay}ms (attempt ${this._reconnectAttempt})`);

    this._reconnectTimer = this.homey.setTimeout(() => {
      this.connectAndSubscribe().catch((error) => {
        this.error('Reconnect failed', error);
      });
    }, delay);
  }

  clearReconnect() {
    if (this._reconnectTimer) {
      this.homey.clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
  }

  async disconnectPeripheral() {
    if (this._peripheral) {
      await this._peripheral.disconnect().catch(() => {});
      this._peripheral = null;
    }
  }

  /**
   * Centralizes shutdown behavior to keep removal and uninit paths consistent.
   */
  async teardownConnection() {
    this._destroyed = true;
    this.clearReconnect();
    await this.disconnectPeripheral();
    this._configChars = null;
  }

  /**
   * Builds a case-insensitive service lookup to keep UUID format differences
   * from breaking characteristic reads.
   */
  async discoverServiceMap(peripheral) {
    const discovered = await peripheral.discoverServices();
    return discovered.reduce((map, service) => {
      if (service?.uuid) {
        map[service.uuid.toLowerCase()] = service;
      }
      return map;
    }, {});
  }

  async discoverCharacteristicMap(service) {
    const discovered = await service.discoverCharacteristics();
    return discovered.reduce((map, characteristic) => {
      if (characteristic?.uuid) {
        map[characteristic.uuid.toLowerCase()] = characteristic;
      }
      return map;
    }, {});
  }

  /**
   * Prevents capability errors when the driver manifest and runtime data
   * are temporarily out of sync during development.
   */
  updateCapabilityIfPresent(capabilityId, value) {
    if (value === null || value === undefined || !this.hasCapability(capabilityId)) {
      return;
    }

    this.setCapabilityValue(capabilityId, value).catch((error) => {
      this.error(`Failed to update ${capabilityId}`, error);
    });
  }

};
