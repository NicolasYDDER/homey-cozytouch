# Changelog

All notable changes to this project will be documented in this file.

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
