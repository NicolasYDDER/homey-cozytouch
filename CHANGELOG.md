# Changelog

All notable changes to this project will be documented in this file.

## [1.3.6] - 2026-09-03

### Added
- **AQUEO ACI HYB support** ([issue #9](https://github.com/NicolasYDDER/homey-cozytouch/issues/9) — modelId 390 «VM 150L 2200M», also 389 «VS 300L 3000M»): the capability dump added in 1.3.5 showed this tank answers on **none** of the IDs the app read (it reports 87, 231, 266, 165, 227, 105301/105304 among 86 capabilities). Magellan capability IDs are now resolved per `productId` from the device store — see `WATER_HEATER_CAP_IDS_BY_PRODUCT` — so the tile shows temperature, setpoint, mode, boost and away, and each control writes the ID this product actually implements:
  - mode on cap **87** (same values as cap 1: 0=manual, 3=eco+, 4=prog);
  - setpoint on cap **231**, with its range from cap **105301/105304** (cap 160/161 are absent here), falling back to cap **22** — the same setpoint mirrored — if the product refuses the first one;
  - current temperature from cap **266** (top of tank);
  - boost on cap **165**, away on cap **227** (0=off, 1=on, 2=booked but not started, shown as on).
- The **away mode toggle now works on this tank**: capability 10, which the API answers with `UnknownCapabilityId` for every product, is not what this product uses. This is the error [issue #9](https://github.com/NicolasYDDER/homey-cozytouch/issues/9) was opened with.

### Changed
- **No Off in the picker for a tank that has no off command**: the AQUEO has no on/off capability at all — it is always on and its mode is what drives it. Rather than offering a command the API refuses, the mode picker offers Manual / Eco / Program only, and the `Set heating mode` Flow card returns the usual "mode not supported" error for Off.
- **A declared setpoint range is only applied when it can be degrees** (between 20 °C and 90 °C, min below max). The limit capabilities of an unmapped product may hold something else entirely, and a nonsense range would lock the slider.
- **The capability dump reaches 120 entries** instead of 60: this tank reports 86 capabilities and its setpoint limits sit at the very end of the list, so they were truncated out of the first report.

### Note
- Capability IDs were mapped from the list the device reports, cross-checked against [gduteil/cozytouch](https://github.com/gduteil/cozytouch) (`capability.py`, `model.py`), the Home Assistant integration this app already credits, which names modelId 390 explicitly. Nothing was guessed from value shapes alone.
- Reported by the tank but not exposed yet: energy (cap 59, in Wh), electric backup running (99), Wi-Fi signal (179), tank capacity (258), V40 water available/capacity (268/270), hot water available in % (271), off-peak hours (283) and the weekly program (245–251).

## [1.3.5] - 2026-09-03

### Fixed
- **A Cozytouch (Magellan) water heater showing no values at all** (AQUEO ACI HYB VM 150L 2200M, modelId 390 / productId 7): Magellan answers per *product*, so this tank implements neither capability 2 (target temperature) nor capability 3 (on/off) and returns `NoCapabilityImplementationFound` for both, while away mode (capability 10) does not exist in the API at all (`UnknownCapabilityId`). The device still looked healthy in Homey — every read returned nothing and the tile stayed empty. Three things caused values to be lost or hidden, and each is fixed:
  - Capability IDs are matched whether the API returns them as numbers or as strings, and a capability sent without a value now reads as missing instead of `NaN`.
  - When the per-device capability endpoint answers with an empty list, the app falls back to the capabilities embedded in the setup view (`setupviewv2`), which is where some products report their values. The log says which source was used.
  - A tank that reports no on/off capability is no longer read as **Off**: it shows the mode it actually reports (same fix applied to Magellan radiators). Selecting a mode on such a tank no longer fails on the missing on/off write either — the mode is what runs it.
- **Unreadable command errors**: a refused write now reports *"This control does not exist on this device model."* instead of raw API JSON, and logs the capability, the product and the IDs the device does report.

### Added
- **Capability dump for Magellan devices**: the first capability read of every device is logged once per app run, with the identifiers support is keyed on — `Magellan capabilities (modelId 390, productId 7, capabilities endpoint): 1 "Mode"=0, 117=52.5, …`. Mapping an unsupported product previously required guessing from a log that contained none of this.
- **A device that maps to nothing says so**: a poll where not one mapped capability matched logs what the device does report and puts a warning on the tile, instead of showing an empty device that looks connected. The warning clears as soon as a value is read.
- **Tests** (`tests/magellan-capabilities.test.js`, plus a Magellan water heater block in `tests/water-heater.test.js`): ID matching across types, the dump format, the two Atlantic capability errors versus auth/transport failures, and the productId 7 behaviour (mode kept without on/off, mode still sent when on/off is refused, a real failure still propagated).

### Known limitation
- **Away mode on a Cozytouch (Magellan) tank** still cannot be set: the app writes capability 10, which the API does not know. On Magellan, away is a setup-level property (`PUT /magellan/v2/setups/{setupId}`) whose payload is not mapped yet. The toggle now reports that the control does not exist on the device rather than failing silently with API JSON.

## [1.3.4] - 2026-08-18

### Fixed
- **Calypso connecté could not be added** ([issue #5](https://github.com/NicolasYDDER/homey-cozytouch/issues/5) — Calypso 240L, latest model): the tank showed up in app settings as `TYPE : INCONNU` and pairing ended on "no compatible device found", because Magellan `modelId` 1658 was missing from the water heater family (1656 and 1657 were already there). Discovery classifies it as `WATER_HEATER`, so it now appears in the **Water Heater** list. The same account's Overkiz side answers `No such user account : GACOMA_Production_1244489` — that gateway only exists on Cozytouch/Magellan, which is why the device has to be paired over that protocol.
- **Boost on a Cozytouch (Magellan) water heater** (surfaced by [issue #5](https://github.com/NicolasYDDER/homey-cozytouch/issues/5)): the driver adds the `cozytouch_boost` capability to every tank, but the Magellan handler had no `setBoost()`, so the tile toggle and the `Turn boost on or off` Flow card would have thrown `this._handler.setBoost is not a function` on the first Magellan tank ever paired. Boost is now written to capability 5 and read back on every poll.
- **Mode picker on a Cozytouch (Magellan) water heater** (surfaced by [issue #5](https://github.com/NicolasYDDER/homey-cozytouch/issues/5)): it offered **Auto**, which has no value in capability 1 (0=manual, 3=eco+, 4=prog), so selecting it only switched the tank on and left the mode untouched — while **Program**, which those tanks do support, was missing and could not even be displayed when the tank was in it. The picker is now per protocol: Magellan tanks get Off / Manual / Eco / Program, Overkiz tanks keep Off / Manual / Eco / Auto (no Auto on Égéo / MBL). The Magellan handler rejects a mode it has no value for instead of silently sending only "on".

### Changed
- **Pairing says what it found**: when a driver has no matching device, the error now lists the discovered devices with the identifier support is keyed on — e.g. `Calypso connecté (modelId 1658)` or `Chauffe-eau (io:AtlanticDomesticHotWaterProductionMBLComponent)`. Previously both the alert and the app log only said "no compatible devices found", so a report like [issue #5](https://github.com/NicolasYDDER/homey-cozytouch/issues/5) could not say which product was missing without a full diagnostic log.

### Added
- **Water heater tests** (`tests/water-heater.test.js`): model-family classification (including 1658 and a no-model-in-two-families check), handler-surface parity across the three water heater handlers so a missing method like `setBoost` fails in CI instead of on a user's tile, mode-picker values against the `cozytouch_heating_mode` enum, and the new discovery report formatting.

## [1.3.3] - 2026-08-18

### Added
- **Boost and away mode in Flows** (issue #2): the water heater's boost and away/absence toggles were only reachable from the device tile, because Homey does not generate Flow cards for app-defined capabilities. Added `Turn boost on or off` / `Turn away mode on or off` actions, `Boost turned on/off` and `Away mode turned on/off` triggers, and `Boost is on` / `Away mode is on` conditions. Together with the existing `Set heating mode` card and Homey's built-in `Set the target temperature`, everything the Égéo can do from the tile is now available in a Flow.
- **Flow wiring test** (`tests/flow-cards.test.js`): asserts every action/condition in the manifest has a run listener and every trigger is mapped to the capability that fires it, so a card can no longer ship dead.

### Fixed
- **Flow triggers never fired**: `measure_temperature_changed`, `heating_mode_changed`, `pass_cozytouch_level_changed` and `zone_control_hvac_mode_changed` were declared in `app.json` but no code ever called `getDeviceTriggerCard().trigger()`, so they appeared in the Flow editor and did nothing. The base device now fires the matching card whenever a capability value changes (skipping the first read after a restart, which is the device reporting where it already was).
- **"Set heating mode" on a water heater**: the card's dropdown lists every mode used by the heating drivers, including `prog`, which no tank implements, and `auto`, which Égéo (MBL) tanks do not expose. Program now returns a readable error instead of silently sending nothing, and Auto on MBL falls back to Eco — the same `autoMode` command on the device.

### Note
- Homey generates its own **Temperature changed** trigger from `measure_temperature`, so the Flow editor lists two similar triggers. The app's card is kept (and now works) so existing Flows using it keep running.

## [1.3.2] - 2026-08-18

### Added
- **Contributor credit**: Cédric Andrietti is now listed under `contributors.developers` in `app.json`, so the App Store page credits the Pass Cozytouch, Shogun Zone Control, Ipala and global sync work contributed in [PR #7](https://github.com/NicolasYDDER/homey-cozytouch/pull/7).

## [1.3.1] - 2026-08-18

### Fixed
- **Flow card validation warning**: added the missing `titleFormatted` to all four Flow triggers (`measure_temperature_changed`, `heating_mode_changed`, `pass_cozytouch_level_changed`, `zone_control_hvac_mode_changed`). `homey app validate --level publish` warned only about the first one, but none of the triggers declared it. Each formatted title embeds `[[device]]` — the trigger's only argument — because Homey rejects a `titleFormatted` that references none of the card's args ("Missing all args"). The trigger titles now read e.g. "Temperature of *device* changed" in the Flow editor.

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
