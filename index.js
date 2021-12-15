let Service;
let Characteristic;
const ApcAccess = require('apcaccess');

class APCAccess {
  constructor(log, config) {
    this.log = log;
    this.latestJSON = false;

    this.client = new ApcAccess();
    this.client
      .connect(config.host || 'localhost', config.port || '3551')
      .then(() => {
        this.log('Connected!');
        // set up watcher
        setInterval(this.getLatestJSON.bind(this), (config.interval || 1) * 1000);
      })
      .catch((err) => {
        this.log("Couldn't connect to service:", err);
      });

    this.state = {
      contact: 0,
      lowBattery: 0,
    };

    // The following can't be defined on boot, so define them optionally in config
    this.contactSensor = new Service.ContactSensor(config.name || 'APCAccess UPS');
    this.informationService = new Service.AccessoryInformation();
    this.informationService
      .setCharacteristic(
        Characteristic.Manufacturer,
        config.manufacturer || 'American Power Conversion',
      )
      .setCharacteristic(Characteristic.Model, config.model || 'APCAccess UPS')
      .setCharacteristic(Characteristic.SerialNumber, config.serial || '0118-999-88199-9119-725-3');
    // End of vanity values ;)

    this.batteryService = new Service.BatteryService();

    this.contactSensor
      .getCharacteristic(Characteristic.ContactSensorState)
      .on('get', this.getContactState.bind(this));
    this.batteryService
      .getCharacteristic(Characteristic.BatteryLevel)
      .on('get', this.getBatteryLevel.bind(this));
    this.batteryService
      .getCharacteristic(Characteristic.ChargingState)
      .on('get', this.getChargingState.bind(this));
    this.batteryService
      .getCharacteristic(Characteristic.StatusLowBattery)
      .on('get', this.getStatusLowBattery.bind(this));
  }

  getServices() {
    // Required by Homebridge; expose services this accessory claims to have
    return [this.informationService, this.contactSensor, this.batteryService];
  }

  getLatestJSON() {
    this.client.getStatusJson().then((result) => {
      this.latestJSON = result;
      this.doPolledChecks();
    });
  }

  getBatteryLevel(callback) {
    // BCHARGE
    const percentage = parseInt(this.latestJSON.BCHARGE, 10);
    this.log('Battery Level: ', percentage);
    callback(null, percentage);
  }

  getChargingState(callback) {
    // STATFLAG
    const percentage = parseInt(this.latestJSON.BCHARGE, 10);
    const value = this.latestJSON.STATFLAG & 0x80
      ? 'NOT_CHARGEABLE'
      : this.latestJSON.STATFLAG & 0x10 || percentage === 100
        ? 'NOT_CHARGING'
        : 'CHARGING';
    this.log('Charging state: ', value);
    callback(null, Characteristic.ChargingState[value]);
  }

  getStatusLowBattery(callback) {
    // STATFLAG
    const value = this.latestJSON.STATFLAG & 0x40 ? 'BATTERY_LEVEL_LOW' : 'BATTERY_LEVEL_NORMAL';
    this.log('Low Battery? ', value);
    callback(null, Characteristic.StatusLowBattery[value]);
  }

  getContactState(callback) {
    const value = [this.latestJSON.STATFLAG & 0x08 ? 'CONTACT_DETECTED' : 'CONTACT_NOT_DETECTED'];
    callback(null, Characteristic.ContactSensorState[value]);
  }

  doPolledChecks() {
    const contactValue = [
      this.latestJSON.STATFLAG & 0x08 ? 'CONTACT_DETECTED' : 'CONTACT_NOT_DETECTED',
    ];
    const contactBool = Characteristic.ContactSensorState[contactValue];
    const lowBattValue = this.latestJSON.STATFLAG & 0x40 ? 'BATTERY_LEVEL_LOW' : 'BATTERY_LEVEL_NORMAL';
    const lowBattBool = Characteristic.StatusLowBattery[lowBattValue];
    // push
    if (this.state.contact !== contactBool) {
      console.log('Pushing contact state change; ', contactBool, this.state.contact);
      this.contactSensor
        .getCharacteristic(Characteristic.ContactSensorState)
        .updateValue(contactBool);
      this.state.contact = contactBool;
    }
    if (this.state.lowBattery !== lowBattBool) {
      console.log('Pushing low battery state change; ', lowBattBool, this.state.lowBattery);
      this.contactSensor
        .getCharacteristic(Characteristic.StatusLowBattery)
        .updateValue(lowBattBool);
      this.state.lowBattery = lowBattBool;
    }
  }
}

module.exports = (homebridge) => {
  Service = homebridge.hap.Service;
  Characteristic = homebridge.hap.Characteristic;
  homebridge.registerAccessory('homebridge-apcaccess', 'APCAccess', APCAccess);
};
