# Atlantic Cozytouch for Homey Pro

Control your Atlantic heating, hot water, and air conditioning devices through the Cozytouch cloud platform on your Homey Pro.

> **Disclaimer**: This app is not affiliated with or endorsed by Atlantic/Groupe Atlantic. It relies on a reverse-engineered cloud API that may change without notice.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Installation](#installation)
3. [How the App Works](#how-the-app-works)
4. [App Configuration Page](#app-configuration-page)
5. [Atlantic Cozytouch API Reference](#atlantic-cozytouch-api-reference)
6. [Overkiz API Reference](#overkiz-api-reference)
7. [Compatible Devices](#compatible-devices)
6. [Architecture Overview](#architecture-overview)
7. [Capability ID Reference](#capability-id-reference)
8. [Homey Flow Integration](#homey-flow-integration)
9. [Troubleshooting](#troubleshooting)
10. [Adding Support for New Devices](#adding-support-for-new-devices)

---

## Prerequisites

- **Homey Pro** (firmware >= 5.0) or Homey Pro (Early 2023)
- An **Atlantic Cozytouch account** (the same credentials you use in the Cozytouch mobile app)
- At least one Atlantic device paired to your Cozytouch bridge/gateway
- Homey CLI installed for development: `npm install -g homey`

---

## Installation

### From source (development)

```bash
git clone <this-repo>
cd homey-cozytouch
npm install
homey app run        # Deploy to your Homey for testing
homey app install    # Install permanently
```

### From Homey App Store

Not yet published. Planned for a future release.

---

## How the App Works

### High-Level Flow

```
                                    ┌──────────────────────────┐
                    ┌──────────────►│  CozyTouch (Magellan)    │
                    │  HTTPS/REST   │  apis.groupe-atlantic.com│
┌─────────────────┐ │               └──────────────────────────┘
│   Homey Pro      │─┤                         │
│                  │ │               ┌─────────┴─────────┐
│  ┌────────────┐  │ │               │  Cozytouch Bridge │
│  │ CozyTouch  │  │ │               └─────────┬─────────┘
│  │   App      │  │ │                  │    │    │
│  │  ┌─────┐   │  │ │               Kelud  AC  Boiler (newer)
│  │  │ API │   │  │ │
│  │  │x 2  │   │  │ │               ┌──────────────────────────┐
│  │  └─────┘   │  │ └──────────────►│  Overkiz                 │
│  │  ┌─────┐   │  │    HTTPS/REST   │  ha110-1.overkiz.com     │
│  │  │Drvrs│   │  │                 └──────────────────────────┘
│  │  └─────┘   │  │                          │
│  └────────────┘  │                ┌─────────┴─────────┐
└─────────────────┘                 │  Cozytouch Bridge │
                                    └─────────┬─────────┘
                                       │    │    │
                                    Calypso Zeneo Thermor (older)
```

### Dual Protocol Architecture

Atlantic uses **two separate cloud backends**:

| Protocol | Endpoint | Devices | Auth |
|----------|----------|---------|------|
| **CozyTouch (Magellan)** | `apis.groupe-atlantic.com` | Newer: boilers, towel racks, AC | OAuth2 password grant |
| **Overkiz** | `ha110-1.overkiz.com` | Older: water heaters, Thermor/Sauter | Atlantic token -> JWT -> Overkiz login |

The app authenticates to **both** and discovers devices from each during pairing.

### Lifecycle

1. **Configuration**: User saves Cozytouch credentials in the App Configuration Page. On startup, the app restores sessions for both protocols.

2. **Pairing**: User enters credentials. The app queries both CozyTouch and Overkiz APIs to discover devices. Each device is tagged with its protocol.

3. **Polling**: Each device polls its respective API at a configurable interval (default: 60 seconds). CozyTouch devices read numeric capabilities, Overkiz devices read named states.

4. **Commands**: When the user changes a setting, the app routes the command to the correct API. CozyTouch uses `writecapability`, Overkiz uses `exec/apply`.

### Key Classes

| Class | File | Role |
|-------|------|------|
| `CozyTouchApp` | `app.js` | App entry point. Manages dual API instances, credential persistence, Flow cards. |
| `CozyTouchAPI` | `lib/CozyTouchAPI.js` | HTTP client for the Magellan API (newer devices). |
| `OverkizAPI` | `lib/OverkizAPI.js` | HTTP client for the Overkiz API (older devices). 3-step auth. |
| `CozyTouchDevice` | `lib/CozyTouchDevice.js` | Base device class. Protocol-aware polling and command routing. |
| `CozyTouchDriver` | `lib/CozyTouchDriver.js` | Base driver class. Combined discovery from both APIs. |
| `HeaterDevice` | `drivers/heater/device.js` | Boiler with dual-protocol state/command mapping. |
| `WaterHeaterDevice` | `drivers/water_heater/device.js` | Water heater with DHW mode, boost, and away mode. |
| `TowelRackDevice` | `drivers/towel_rack/device.js` | Towel rack with dual-protocol support (Magellan + Overkiz). |
| `ClimateDevice` | `drivers/climate/device.js` | Heat pump/AC with HVAC modes, fan, and swing. |
| API routes | `api.js` | Settings page backend: status, test connection, credential management. |

---

## App Configuration Page

The app provides a settings page accessible from **Homey Settings > Apps > Atlantic Cozytouch**.

### API Endpoints (Settings Backend)

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/status` | Returns current auth status for both protocols |
| `POST` | `/api/test-connection` | Tests credentials against both APIs, returns device lists |
| `POST` | `/api/save-credentials` | Saves credentials to Homey settings storage |
| `DELETE` | `/api/clear-credentials` | Removes saved credentials |

### Features

- **Credential management**: Save, update, and clear Cozytouch credentials
- **Connection testing**: Test both CozyTouch and Overkiz protocols with a single click
- **Status monitoring**: Real-time green/red/gray indicators for each protocol
- **Device discovery**: View all devices found on each protocol after a connection test
- **Auto-restore**: Credentials persist across app restarts; sessions are automatically re-established

### Settings Storage

Credentials are stored using `homey.settings` (encrypted local storage on the Homey Pro). The key is `credentials` with the structure `{ username, password }`.

---

## Atlantic Cozytouch API Reference

The Atlantic Cozytouch cloud API is **not publicly documented**. The following is based on reverse engineering from the [cozytouch Home Assistant integration](https://github.com/gduteil/cozytouch).

### Base URL

```
https://apis.groupe-atlantic.com
```

### Authentication

The API uses OAuth2 Resource Owner Password Credentials (ROPC) grant.

**Request:**
```http
POST /users/token HTTP/1.1
Host: apis.groupe-atlantic.com
Authorization: Basic Q3RfMUpWeVRtSUxYOEllZkE3YVVOQmpGblpVYToyRWNORHpfZHkzNDJVSnFvMlo3cFNKTnZVdjBh
Content-Type: application/x-www-form-urlencoded

grant_type=password&scope=openid&username=GA-PRIVATEPERSON/user@email.com&password=yourpassword
```

**Response:**
```json
{
  "token_type": "Bearer",
  "access_token": "eyJhbGciOiJSUzI1NiIs..."
}
```

**Key details:**
- The `Authorization: Basic` header uses a fixed client ID (Base64-encoded client credentials).
- The username must be prefixed with `GA-PRIVATEPERSON/`.
- The returned `access_token` is used as a Bearer token for all subsequent requests.

### Endpoints

#### Device Discovery

```http
GET /magellan/cozytouch/setupviewv2
Authorization: Bearer {access_token}
```

Returns an array with one setup object containing all devices, zones, and account metadata.

**Response structure:**
```json
[
  {
    "id": "setup-id",
    "address": { "country": "FR", ... },
    "devices": [
      {
        "deviceId": 12345,
        "name": "My Boiler",
        "modelId": 56,
        "productId": 100,
        "gatewaySerialNumber": "XXXX-XXXX-XXXX",
        "zoneId": 1,
        "tags": [{ "label": "...", "value": "..." }],
        "capabilities": [...]
      }
    ],
    "zones": [...]
  }
]
```

#### Read Capabilities (Polling)

```http
GET /magellan/capabilities/?deviceId={deviceId}
Authorization: Bearer {access_token}
```

Returns an array of capability objects for the device:

```json
[
  {
    "capabilityId": 7,
    "value": "21.5",
    "name": "Current Temperature",
    "type": "temperature",
    "category": "sensor"
  },
  {
    "capabilityId": 2,
    "value": "19.0",
    "name": "Target Temperature",
    "type": "temperature",
    "category": "sensor"
  }
]
```

#### Write Capability (Send Command)

```http
POST /magellan/executions/writecapability
Authorization: Bearer {access_token}
Content-Type: application/json

{
  "capabilityId": 2,
  "deviceId": 12345,
  "value": "22.0"
}
```

**Response** (HTTP 201):
```json
{
  "executionId": "exec-uuid"
}
```

#### Check Execution Status

```http
GET /magellan/executions/{executionId}
Authorization: Bearer {access_token}
```

**Response:**
```json
{
  "executionId": "exec-uuid",
  "state": 3
}
```

States: `3` = completed. The app polls up to 5 times (1 second apart) waiting for completion.

#### Away Mode (Setup-Level)

```http
PUT /magellan/v2/setups/{setupId}
Authorization: Bearer {access_token}
Content-Type: application/json

{ ... away mode timestamp data ... }
```

---

## Overkiz API Reference

The Overkiz API is used for older Atlantic/Thermor/Sauter devices. It is the same platform used by Somfy TaHoma.

### Base URL

```
https://ha110-1.overkiz.com/enduser-mobile-web/enduserAPI
```

### Authentication (3-step)

**Step 1: Get Atlantic access token** (same as CozyTouch)

```http
POST https://apis.groupe-atlantic.com/users/token
Authorization: Basic Q3RfMUpWeVRtSUxYOEllZkE3YVVOQmpGblpVYToyRWNORHpfZHkzNDJVSnFvMlo3cFNKTnZVdjBh
Content-Type: application/x-www-form-urlencoded

grant_type=password&scope=openid&username=GA-PRIVATEPERSON/user@email.com&password=yourpassword
```

**Step 2: Exchange for JWT**

```http
GET https://apis.groupe-atlantic.com/magellan/accounts/jwt
Authorization: Bearer {access_token_from_step_1}
```

Returns a JWT token.

**Step 3: Login to Overkiz**

```http
POST /login
Content-Type: application/json

{"jwt": "eyJhbGciOiJSUzI1NiIs..."}
```

### Endpoints

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/setup` | Full setup with all devices, gateways, zones |
| `GET` | `/setup/devices` | Device list only |
| `GET` | `/setup/devices/{url}/states` | Current states for a device |
| `POST` | `/setup/devices/states/refresh` | Force state refresh |
| `POST` | `/exec/apply` | Execute a command |
| `GET` | `/exec/current/{id}` | Get execution status |
| `POST` | `/events/register` | Register event listener |
| `POST` | `/events/{id}/fetch` | Fetch state change events |

### Key DHW States (Water Heater - CETHI_V4)

| State Name | Description |
|------------|-------------|
| `core:TargetTemperatureState` | Target water temperature |
| `io:MiddleWaterTemperatureState` | Mid-tank water temperature |
| `io:DHWModeState` | DHW operating mode (manualEcoInactive/manualEcoActive/autoMode) |
| `core:BoostModeDurationState` | Boost duration in days (>0 = active) |
| `io:AwayModeDurationState` | Away duration ("0" or "always" = away active) |
| `core:MinimalTemperatureManualModeState` | Min allowed temperature |
| `core:MaximalTemperatureManualModeState` | Max allowed temperature |

### Key DHW Commands (CETHI_V4)

| Command | Parameters | Description |
|---------|-----------|-------------|
| `setTargetTemperature` | `[temperature]` | Set target water temperature |
| `setDHWMode` | `["manualEcoInactive"]` | Set DHW mode (manual/eco/auto) |
| `setCurrentOperatingMode` | `[{relaunch, absence}]` | Control boost and away mode |
| `setBoostModeDuration` | `[7]` | Set boost duration in days |
| `refreshBoostModeDuration` | `[]` | Refresh boost state |

### Key Towel Dryer Commands (IC3)

| Command | Parameters | Description |
|---------|-----------|-------------|
| `setTowelDryerOperatingMode` | `["external"]` | Set mode (standby/external/internal) |
| `setTargetTemperature` | `[temperature]` | Set target temperature |

### Key Towel Dryer States (IC3)

| State Name | Description |
|------------|-------------|
| `core:OperatingModeState` | Current mode (standby/external/internal/auto) |
| `core:TargetTemperatureState` | Target temperature |
| `core:TemperatureState` | Current room temperature |

---

## Compatible Devices

### Tested Devices

The following devices have been validated with real hardware:

| Device | Reference | Protocol | Driver | Status |
|--------|-----------|----------|--------|--------|
| **Atlantic Kelud** 500W Anthracite Etroit | Towel rack | CozyTouch (Magellan) | `towel_rack` | Fully working (mode, temperature) |
| **Sauter Asama** (I2G_Actuator) | Towel dryer | Overkiz | `towel_rack` | Fully working (mode, temperature) |
| **Atlantic Calypso** (Ballon Thermodynamique) | Thermodynamic water heater | Overkiz | `water_heater` | Fully working (mode, temperature, boost, away) |

### Heater / Boiler Driver

Handles gas boilers and thermostats.

| Device Type | Model IDs | Known Products |
|-------------|-----------|----------------|
| Gas Boiler | 56, 61, 65, 1444 | Naema 2 Micro, Naema 2 Duo, Naia 2 Micro, Naia 2 Duo |
| Thermostat | 235, 418 | Atlantic thermostats |

**Capabilities**: target temperature, current temperature, heating mode (off/manual/eco+/program), on/off

### Towel Rack Driver

Handles electric towel dryers via both protocols.

| Device Type | Model IDs (Magellan) | Overkiz controllableName | Known Products |
|-------------|---------------------|--------------------------|----------------|
| Towel Rack | 1381, 1382, 1386, 1388, 1543, 1546, 1547, 1551, 1622 | `io:AtlanticElectricalTowelDryer_IC3_IOComponent` | Kelud, Sauter Asama, Kaoli |

**Magellan commands**: Cap 7 (HVAC mode: 0=off, 4=heat), Cap 184 (preset: 0=manual, 1=prog), Cap 40 (target temperature)

**Overkiz commands**: `setTowelDryerOperatingMode` (standby/external/internal), `setTargetTemperature`

**Capabilities**: target temperature, current temperature, heating mode (off/manual/program), on/off

### Water Heater Driver

| Device Type | Model IDs (Magellan) | Overkiz controllableName | Known Products |
|-------------|---------------------|--------------------------|----------------|
| Water Heater | 236, 389, 390, 1369, 1371, 1372, 1376, 1642, 1644, 1645, 1656, 1657, 1966 | `io:AtlanticDomesticHotWaterProductionV2_CETHI_V4_IOComponent` | Atlantic Calypso, Zeneo, Vizengo, Lineo |

**Overkiz commands**: `setDHWMode` (manualEcoInactive/manualEcoActive/autoMode), `setTargetTemperature`, `setCurrentOperatingMode` (away/boost), `setBoostModeDuration`

**Capabilities**: target temperature (30-65C), current temperature, heating mode (off/manual/eco/auto), boost toggle, away mode, on/off

> **Note**: The CETHI_V4 water heater has no real on/off command. "Off" is simulated via away mode. Shower count is only controllable from the Cozytouch phone app.

### Climate Driver (Heat Pump / AC)

| Device Type | Model IDs | Known Products | Modes |
|-------------|-----------|----------------|-------|
| Heat Pump | 76 | Loria Duo R32 (standard) | Off, Heat |
| Heat Pump | 211 | Loria Duo R32 (advanced) | Off, Heat, Auto |
| Air Conditioning | 557-561 | Takao M3 series | Off, Auto, Cool, Heat, Fan Only, Dry |

**Capabilities**: target temperature (with separate heat/cool setpoints), current temperature, HVAC mode, fan speed (AC only: auto/low/medium/high), swing position (AC only: up/middle-up/middle-down/down), on/off

### Hub/Gateway (Not Directly Controlled)

| Model IDs | Notes |
|-----------|-------|
| 556, 1353 | Cozytouch bridge - detected but not exposed as Homey device |

### AC Controllers (Detected, Not Yet Mapped)

| Model IDs | Notes |
|-----------|-------|
| 562-570 | AC controller modules - detected during discovery but not yet fully mapped |

---

## Architecture Overview

### File Structure

```
homey-cozytouch/
├── app.js                              # App entry point, credential restore, Flow cards
├── app.json                            # Homey manifest (drivers, capabilities, flows)
├── api.js                              # Settings page API routes
├── package.json
│
├── lib/
│   ├── CozyTouchAPI.js                 # CozyTouch/Magellan REST API client
│   ├── OverkizAPI.js                   # Overkiz REST API client (3-step auth)
│   ├── CozyTouchDevice.js              # Base device: handler dispatch, polling, auth
│   ├── CozyTouchDriver.js              # Base driver: pairing, combined discovery
│   └── constants/
│       ├── cozytouch-mappings.js       # CAP_IDS + mode maps per device type
│       └── overkiz-mappings.js         # STATES, COMMANDS, level/DHW maps, helpers
│
├── settings/
│   └── index.html                      # App config page (credentials, status)
│
├── drivers/
│   ├── heater/
│   │   ├── device.js                   # Thin shell: creates handler, wires listeners
│   │   ├── driver.js                   # Filters for boiler/thermostat models
│   │   ├── handlers/
│   │   │   ├── cozytouch.js            # CozyTouch cap IDs, mode values, API writes
│   │   │   └── overkiz.js              # Overkiz states, commands, heating levels
│   │   ├── assets/icon.svg
│   │   └── pair/login_credentials.html
│   │
│   ├── water_heater/
│   │   ├── device.js                   # Thin shell + away mode listener
│   │   ├── driver.js                   # Filters for water heater models
│   │   ├── handlers/
│   │   │   ├── cozytouch.js            # CozyTouch cap IDs, away mode, mode values
│   │   │   └── overkiz.js              # Overkiz DHW commands, absence mode
│   │   ├── assets/icon.svg
│   │   └── pair/login_credentials.html
│   │
│   ├── climate/
│   │   ├── device.js                   # Thin shell + fan/swing listeners
│   │   ├── driver.js                   # Filters for heat pump/AC models
│   │   ├── handlers/
│   │   │   ├── cozytouch.js            # HVAC modes per model, fan, swing
│   │   │   └── overkiz.js              # Simple heat on/off
│   │   ├── assets/icon.svg
│   │   └── pair/login_credentials.html
│   │
│   └── towel_rack/
│       ├── device.js                   # Thin shell: delegates to handler
│       ├── driver.js                   # Filters for towel rack models
│       ├── handlers/
│       │   ├── cozytouch.js            # HVAC mode (0/4) + prog preset (cap 184)
│       │   └── overkiz.js              # setTowelDryerOperatingMode command
│       ├── assets/icon.svg
│       └── pair/login_credentials.html
│
├── locales/
│   ├── en.json
│   └── fr.json
│
└── assets/
    └── icon.svg                        # App icon
```

### Data Flow

```
User Action (Homey UI / Flow)
        │
        ▼
  registerCapabilityListener()     ← drivers/{type}/device.js
        │
        ▼
  this._handler.setMode(value)     ← delegates to protocol handler
        │
        ├─── CozyTouch handler ──► ctx.setCapValue(capId, value)
        │                                   │
        │                                   ▼
        │                          POST /magellan/executions/writecapability
        │
        └─── Overkiz handler ───► ctx.executeCommand(cmd, params)
                                            │
                                            ▼
                                   POST /exec/apply
```

### Polling Flow

```
setInterval (every 60s)
        │
        ▼
  this._handler.updateState()     ← lib/CozyTouchDevice.js
        │
        ├─── CozyTouch handler ──► GET /magellan/capabilities/?deviceId={id}
        │                                   │
        │                                   ▼
        │                          ctx.setCapability() for each mapped cap
        │
        └─── Overkiz handler ───► GET /setup/devices/{url}/states
                                            │
                                            ▼
                                   ctx.setCapability() for each mapped state
```

---

## Capability ID Reference

These numeric IDs are used internally by the Atlantic API to identify device properties. They are sent as `capabilityId` in API requests.

### Common Capabilities (All Devices)

| Cap ID | Name | Type | Description |
|--------|------|------|-------------|
| 1 | Mode | int | Heating mode or HVAC mode (meaning varies by device type) |
| 2 | Target Temperature | float | Temperature setpoint (heating) |
| 3 | On/Off | bool | Power switch (1=on, 0=off) |
| 7 | Current Temperature | float | Measured temperature sensor |
| 160 | Min Temperature | float | Minimum allowed setpoint |
| 161 | Max Temperature | float | Maximum allowed setpoint |

### Water Heater Specific

| Cap ID | Name | Type | Description |
|--------|------|------|-------------|
| 5 | Boost | bool | Boost mode toggle |
| 6 | Eco | bool | Eco mode toggle |
| 10 | Away Mode | bool | Away/vacation mode |

### Climate Specific (Heat Pump / AC)

| Cap ID | Name | Type | Description |
|--------|------|------|-------------|
| 4 | Fan Mode | int | Fan speed: 0=auto, 1=low, 2=medium, 3=high |
| 8 | Target Temp Cool | float | Temperature setpoint for cooling modes |
| 9 | Swing Mode | int | Air direction: 0=up, 1=mid-up, 2=mid-down, 3=down |
| 11 | Quiet Mode | bool | Silent operation toggle |
| 12 | Program | int | Program schedule: 0=basic, 1=programmed |
| 13 | Program Override | bool | Temporary override of scheduled program |
| 14 | Activity | bool | Activity indicator (1=active) |
| 162 | Min Temp Cool | float | Minimum cooling setpoint |
| 163 | Max Temp Cool | float | Maximum cooling setpoint |

### Heating Mode Values (Cap ID 1 - Boilers & Water Heaters)

| API Value | Mode | Description |
|-----------|------|-------------|
| 0 | Manual | Manual temperature control |
| 3 | Eco+ | Energy-saving mode |
| 4 | Program | Follow scheduled program |

### HVAC Mode Values (Cap ID 1 - Climate Devices)

Varies by model. Below are the known mappings:

**Default (most heat pumps):**

| API Value | Mode |
|-----------|------|
| 0 | Off |
| 4 | Heat |

**Model 211 (Loria advanced):**

| API Value | Mode |
|-----------|------|
| 0 | Off |
| 1 | Heat |
| 2 | Auto |

**Models 557-561 (Takao AC):**

| API Value | Mode |
|-----------|------|
| 0 | Off |
| 1 | Auto |
| 3 | Cool |
| 4 | Heat |
| 7 | Fan Only |
| 8 | Dry |

---

## Homey Flow Integration

### Triggers

| Trigger | Description | Token |
|---------|-------------|-------|
| Temperature changed | Fires when measured temperature changes | `temperature` (number) |
| Heating mode changed | Fires when heating mode changes | `mode` (string) |

### Actions

| Action | Description | Parameters |
|--------|-------------|------------|
| Set heating mode | Change the heating mode | `mode`: off, manual, eco_plus, prog |
| Set HVAC mode | Change the HVAC mode (climate only) | `mode`: off, heat, cool, auto, dry, fan_only |

### Conditions

| Condition | Description | Parameters |
|-----------|-------------|------------|
| Heating mode is... | Check current heating mode | `mode`: off, manual, eco_plus, prog |

### Flow Examples

**"When I leave home, set water heater to away mode":**
- Trigger: Homey location (left home zone)
- Action: Set capability `cozytouch_away_mode` to `true`

**"Set heating to eco+ at night":**
- Trigger: Time is 22:00
- Action: Set heating mode to `eco_plus`

---

## Troubleshooting

### "Authentication failed"
- Verify your email and password work in the official Cozytouch mobile app.
- The username must be the email used for your Cozytouch account.
- The API prefixes your username with `GA-PRIVATEPERSON/` automatically.

### "Unable to connect to Cozytouch"
- Check your Homey's internet connection.
- The Atlantic API (`apis.groupe-atlantic.com`) may be temporarily down.
- Tokens expire; the app auto-refreshes on HTTP 401, but a restart may help.

### Device shows as unavailable
- The poll interval may be too short, causing rate limiting. Try increasing it to 120s in device settings.
- The device may be offline in the Cozytouch bridge.

### Temperature values seem wrong
- Capability IDs may differ for your specific device model. Check Homey developer logs (`homey app log`) to see raw capability data.
- Some models report temperature in tenths of degrees.

### My device is not discovered
- Only devices with known `modelId` mappings are shown. Check [Compatible Devices](#compatible-devices).
- To add a new model, see [Adding Support for New Devices](#adding-support-for-new-devices).

---

## Adding Support for New Devices

### Step 1: Identify the Model ID

Enable debug logging or check the Homey app logs during pairing. The setup response contains all devices with their `modelId` and `productId`.

### Step 2: Add the Model ID

In `lib/CozyTouchAPI.js`, add the new `modelId` to the appropriate array in `MODEL_TYPES`:

```javascript
const MODEL_TYPES = {
  GAZ_BOILER: [56, 61, 65, 1444],           // Add new boiler models here
  WATER_HEATER: [236, 389, 390, ...],       // Add new water heater models here
  // etc.
};
```

### Step 3: Add HVAC Modes (if climate device)

If the device has non-standard HVAC modes, add a mapping in `HVAC_MODES`:

```javascript
const HVAC_MODES = {
  // ...
  999: { 0: 'off', 1: 'heat', 5: 'cool' },  // New model
};
```

### Step 4: Map Capabilities

If the device uses non-standard capability IDs, update the `CAP_IDS` object in the relevant `device.js` file. Use the raw capability data from the API (visible in logs) to identify the correct IDs.

### Step 5: Test

```bash
homey app run
```

Monitor the logs to verify capabilities are being read and written correctly.

---

## Credits

- API reverse engineering based on [gduteil/cozytouch](https://github.com/gduteil/cozytouch) (Home Assistant integration)
- Built with the [Homey Apps SDK v3](https://apps-sdk-v3.developer.athom.com/)

## License

Copyright 2026 NicolasYDDER

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

> <http://www.apache.org/licenses/LICENSE-2.0>

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

See [LICENSE](LICENSE) for the full text.
