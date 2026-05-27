'use strict';

/**
 * Creates a Homey timeline notification.
 *
 * @param {import('homey/lib/Homey')} homey
 * @param {string} excerpt - Notification message (use **word** for bold)
 * @returns {Promise<void>}
 */
async function createTimelineNotification(homey, excerpt) {
  await homey.notifications.createNotification({ excerpt });
}

/**
 * Creates a timeline notification at most once per device, keyed by store.
 *
 * @param {import('homey/lib/Device')} device
 * @param {import('homey/lib/Homey')} homey
 * @param {string} excerpt
 * @param {string} storeKey - Device store flag set after the notification is sent
 * @returns {Promise<boolean>} True if a notification was created
 */
async function createTimelineNotificationOnce(device, homey, excerpt, storeKey) {
  if (await device.getStoreValue(storeKey)) {
    return false;
  }

  await createTimelineNotification(homey, excerpt);
  await device.setStoreValue(storeKey, true);
  return true;
}

module.exports = {
  createTimelineNotification,
  createTimelineNotificationOnce,
};
