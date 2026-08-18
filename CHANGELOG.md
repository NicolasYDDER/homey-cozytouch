# Changelog

All notable changes to this project will be documented in this file.

## [1.3.1] - 2026-08-18

### Fixed
- **Flow card validation warning**: added the missing `titleFormatted` to all four Flow triggers (`measure_temperature_changed`, `heating_mode_changed`, `pass_cozytouch_level_changed`, `zone_control_hvac_mode_changed`). `homey app validate --level publish` warned only about the first one, but none of the triggers declared it. Since each trigger's only argument is the device — which Homey renders itself — the formatted titles match the plain titles, as with the existing actions and conditions.

## [1.3.0] - 2026-08-17

### Added
- **Pass Cozytouch support** (issue #1): new `pass_cozytouch` driver for Atlantic Pass Cozytouch wall modules (`io:AtlanticElectricalHeaterIOComponent`, ref. 602251). Exposes a heating-level picker (`cozytouch_pass_level`: off / frost protection / eco / comfort-2 / comfort-1 / comfort) and on/off via `setHeatingLevel` — no setpoint, since the module itself has none.
- **Shogun Zone Control support** (issue #1): new `zone_control` driver for the Overkiz Pass APC stack — main unit (`AtlanticPassAPCZoneControlMainComponent` / `AtlanticPassAPCZoneControl`) plus each heating/cooling zone (`AtlanticPassAPCZoneControlZoneComponent` / `AtlanticPassAPCHeatingAndCoolingZone`). Zones expose target/measured temperature, zone mode (off / manual / prog) and on/off; zone temperature sensors stay linked instead of being paired as separate devices.
- **Sauter / Thermor Ipala support** (issue #1): adjustable-setpoint radiators (`io:AtlanticElectricalHeaterWithAdjustableTemperatureSetpointIOComponent`) now work under the existing `heater` driver via a dedicated handler using IO-accepted operating params (`standby` / `basic` / `internal` → Off / Manual / Program). Room temperature is read from the linked sensor endpoint rather than the actuator.
- **Global sync interval**: one app setting (`sync_interval`, default 60 s, range 30–300) replaces the per-device poll timers. Each cycle runs Overkiz `refreshStates` and then polls every paired device, so changes made from a wall remote reach Homey without opening the Cozytouch app. Configurable under **Device sync** on the app settings page.
- **Flow cards for the new devices**: `Pass Cozytouch mode changed` / `Set Pass Cozytouch mode`, `Zone Control HVAC mode changed` / `Set Zone Control HVAC mode` / `Set Zone Control zone mode`, and `Zone Control HVAC mode is` / `Zone mode is` conditions.
- **Device detection tests**: `tests/device-detection.test.js` covers the Overkiz widget/controllable detection helpers and the new mode mappings (anonymized dumps).

### Changed
- **Pairing reuses your Cozytouch credentials**: the six per-driver custom login pages were replaced with Homey's `login_credentials` template, with titles and field labels set from `app.json`. Credentials are saved as soon as cloud auth succeeds — even if the driver you started from has no matching devices — so subsequent pairings skip the login screen entirely. When a driver finds no devices, the flow now continues to the device list and reports `pair.no_devices` there instead of showing a JS alert that stranded users on the login screen.
- **Clear credentials** in app settings now uses `Homey.confirm` (`window.confirm` is blocked in the settings webview) and clears only the app settings, so the next pairing shows the login form again.
- **Heater driver renamed** to "Radiator / Heating" — the previous boiler-oriented label was misleading for a driver that mainly covers radiators.
- **Shogun zones mirror the main unit's HVAC mode** as a read-only native `thermostat_mode`, so Homey tiles render the correct heat/cool colors, with clearer zone vs. HVAC labels.
- Per-device `poll_interval` device setting removed; polling is driven entirely by the global sync cycle.
- README and USERGUIDE updated for the new drivers, the Device sync section, the tested-device tables, and the known Overkiz cloud/remote state lag (including `QUOTA_EXCEEDED` guidance to keep the interval at 60–120 s).

### Fixed
- **Pass and Zone Control icons on mobile**: explicit black strokes/fills, tighter framing and thicker lines so the icons render correctly and larger on Homey mobile tiles.
- **French translations** for zone control labels: "Mode de zone" → "Mode de la zone", "Désactivé" → "Désactiver".
- Temperature Flow triggers are now filtered by capability, so they no longer appear for devices without a temperature reading.

## [1.2.5] - 2026-04-27

### Fixed
- **Atlantic Égéo water heater control**: Égéo devices (widget `AtlanticDomesticHotWaterProductionMBLComponent`, `modbuslink://` protocol) previously returned `UNSUPPORTED_OPERATION: No such command : setCurrentOperatingMode` on any mode/boost/away change, leaving users able to read temperature but not issue any command. Added a dedicated MBL handler using `setDHWMode`, `setBoostMode`, `setTargetDHWTemperature`, and the multi-step absence sequence (`setDateTime` → `setAbsenceStartDate` → `setAbsenceEndDate` → `setAbsenceMode prog`), plus reads from `modbuslink:*` states. The mode picker also drops Auto for these devices since the widget has no dedicated auto mode (Eco already maps to `autoMode`).

## [1.2.4] - 2026-04-27

### Changed
- **Water heater UX**: removed the on/off toggle from the water heater widget. A water heater is designed to run continuously, and the toggle was confusing users into putting it into complete standby. The heating mode picker (Off / Manual / Eco / Auto) is now the single control — selecting "Off" still reaches full standby for users who want it. Existing paired devices have the `onoff` capability removed automatically on first load.
- **Faster feedback after commands**: the water heater now triggers an extra state refresh a few seconds after any command, so the UI reflects the new value without waiting for the next poll interval. This only affects commands sent from Homey — changes made directly from the Cozytouch app still depend on the configured poll interval.

## [1.2.3] - 2026-04-26

### Fixed
- **Settings page endless loading on web/desktop Homey**: The settings HTML was missing the `/homey.js` bridge script. Homey Pro auto-injects it, but the web/desktop Homey client does not — so `onHomeyReady` was never called and the page spun indefinitely. Added the script tag explicitly so the settings page works on all Homey clients.

## [1.2.2] - 2026-04-05

### Changed
- Replaced placeholder driver images with Pexels stock photos for a cleaner store listing.

## [1.2.1] - 2026-04-05

### Fixed
- **Settings page infinite loop**: Fixed `Homey.ready(callback)` pattern that prevented the settings page from signaling readiness to Homey, causing the app configuration page to reload indefinitely. Now uses the correct `onHomeyReady` SDK v3 pattern.
- **Serenis Premium identification**: Towel rack driver now detects Overkiz `HeatingSystem` devices (e.g. Serenis Premium) and routes them to the heater handler instead of the towel dryer handler, which uses incompatible commands.

## [1.2.0] - 2026-03-31

### Added
- **Towel rack Magellan support**: Kelud towel racks are now fully controllable via the CozyTouch (Magellan) API using correct HVAC mode values (0=off, 4=heat)
- **Towel rack Overkiz support**: Asama (I2G_Actuator) towel dryers now use the correct `setTowelDryerOperatingMode` command (external/internal/standby) instead of the generic `setHeatingLevel`
- **Water heater CETHI_V4 support**: Calypso water heater now uses correct Overkiz commands (`setCurrentOperatingMode`, `setDHWMode`, `setTargetTemperature`) instead of unsupported `setDHWOnOffState`
- **Auto mode** for water heater: added "Auto" option to heating mode picker, mapped to Overkiz `autoMode`
- **Boost toggle** for water heater: new capability to activate/deactivate boost heating via `setBoostModeDuration` + `setCurrentOperatingMode`
- **Capability migration**: existing paired devices automatically receive new capabilities (boost) without re-pairing

### Changed
- Towel rack driver now discovers devices from both protocols (Magellan + Overkiz), matching the heater driver pattern
- Water heater mode picker restricted to relevant modes only (Off, Manual, Eco, Auto) -- "Program" removed for water heaters
- Water heater on/off simulated via away mode (`setCurrentOperatingMode` with absence flag) since CETHI_V4 has no real on/off command
- Water heater away mode uses `setCurrentOperatingMode` instead of unsupported `setAbsenceMode`/`cancelAbsence`
- Boost state read from `core:BoostModeDurationState` and away state from `io:AwayModeDurationState`

### Fixed
- `_safeSetCapability` now checks `hasCapability()` before setting values, preventing crashes when capabilities are missing on older paired devices
- Towel rack CozyTouch handler: HVAC mode values corrected from `0/1/2` to `0/4` (matching the reference HA integration and official Cozytouch app)
- Towel rack Overkiz handler: state reading uses `core:OperatingModeState` instead of `io:TargetHeatingLevelState`
- Shared constants (`cozytouch-mappings.js`) updated with correct towel rack capability IDs (7, 40, 117 instead of 1, 2, 7)

## [1.1.0] - 2026-03-30

### Added
- Handler-based architecture: protocol logic separated into per-driver `handlers/` directories
- Shared constants in `lib/constants/` (cozytouch-mappings.js, overkiz-mappings.js)
- Base class `CozyTouchDevice` with handler dispatch pattern
- Overkiz API support as second protocol
- App settings page with dual-protocol status indicators
- Flow cards with `titleFormatted` support

### Changed
- All `device.js` files simplified to thin shells delegating to handlers
- Zero protocol branching in device files

## [1.0.0] - 2026-03-28

### Added
- Initial release
- CozyTouch (Magellan) API support
- Heater, water heater, climate, and towel rack drivers
- App configuration page with credential management
- User guide and technical documentation
