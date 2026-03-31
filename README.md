# Atlantic Cozytouch for Homey Pro

Control your Atlantic heating, hot water, and air conditioning devices through the Cozytouch cloud platform on your Homey Pro.

> **Disclaimer**: This app is not affiliated with or endorsed by Atlantic/Groupe Atlantic. It relies on a reverse-engineered cloud API that may change without notice.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Installation](#installation)
3. [How the App Works](#how-the-app-works)
4. [Atlantic Cozytouch API Reference](#atlantic-cozytouch-api-reference)
5. [Compatible Devices](#compatible-devices)
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
┌─────────────────┐     HTTPS/REST      ┌──────────────────────────┐
│   Homey Pro      │ ──────────────────► │  Atlantic Cozytouch API  │
│                  │ ◄────────────────── │  apis.groupe-atlantic.com│
│  ┌────────────┐  │    JSON responses   └──────────────────────────┘
│  │ CozyTouch  │  │                                │
│  │   App      │  │                      ┌─────────┴─────────┐
│  │  ┌─────┐   │  │                      │  Cozytouch Bridge │
│  │  │ API │   │  │                      │  (in your home)   │
│  │  └─────┘   │  │                      └─────────┬─────────┘
│  │  ┌─────┐   │  │                         │    │    │
│  │  │Drvrs│   │  │                      ┌──┘    │    └──┐
│  │  └─────┘   │  │                     Boiler  DHW    AC
│  └────────────┘  │
└─────────────────┘
```

### Lifecycle

1. **Pairing**: User enters Cozytouch email + password in the Homey pairing dialog. The app authenticates against the Atlantic API and retrieves a list of devices on the account. The user selects which devices to add.

2. **Authentication**: The app uses an OAuth2 password grant to obtain a Bearer token. Tokens are stored in memory and automatically refreshed on 401 responses.

3. **Polling**: Each device polls the Cozytouch API at a configurable interval (default: 60 seconds) to read current capability values (temperature, mode, status, etc.).

4. **Commands**: When the user changes a setting in Homey (e.g., target temperature), the app writes the new value through the API and polls the execution status until confirmed.

### Key Classes

| Class | File | Role |
|-------|------|------|
| `CozyTouchApp` | `app.js` | App entry point. Manages shared API instances, registers Flow cards. |
| `CozyTouchAPI` | `lib/CozyTouchAPI.js` | HTTP client for the Atlantic API. Handles auth, device discovery, reading capabilities, and writing commands. |
| `CozyTouchDevice` | `lib/CozyTouchDevice.js` | Base device class. Handles polling loop, auth retry, and capability sync. |
| `CozyTouchDriver` | `lib/CozyTouchDriver.js` | Base driver class. Handles the pairing flow (login + device list). |
| `HeaterDevice` | `drivers/heater/device.js` | Maps boiler/towel rack capabilities to Homey. |
| `WaterHeaterDevice` | `drivers/water_heater/device.js` | Maps water heater capabilities to Homey, including away mode. |
| `ClimateDevice` | `drivers/climate/device.js` | Maps heat pump/AC capabilities including HVAC modes, fan, and swing. |

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

## Compatible Devices

### Heater / Boiler Driver

Handles gas boilers, towel racks, and thermostats.

| Device Type | Model IDs | Known Products |
|-------------|-----------|----------------|
| Gas Boiler | 56, 61, 65, 1444 | Naema 2 Micro, Naema 2 Duo, Naia 2 Micro, Naia 2 Duo |
| Thermostat | 235, 418 | Atlantic thermostats |
| Towel Rack | 1381, 1382, 1388, 1543, 1546, 1547, 1551, 1622 | Kelud, Sauter Asama |

**Capabilities**: target temperature, current temperature, heating mode (off/manual/eco+/program), on/off

### Water Heater Driver

| Device Type | Model IDs | Known Products |
|-------------|-----------|----------------|
| Water Heater | 236, 389, 390, 1369, 1371, 1372, 1376, 1642, 1644, 1645, 1656, 1657, 1966 | Atlantic Zeneo, Calypso, Vizengo, Lineo |

**Capabilities**: target temperature (30-65C), current temperature, heating mode (off/manual/eco+/program), away mode, on/off

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
├── app.js                          # App entry point
├── app.json                        # Homey manifest (drivers, capabilities, flows)
├── package.json
│
├── lib/
│   ├── CozyTouchAPI.js             # Atlantic REST API client
│   ├── CozyTouchDevice.js          # Base device (polling, auth retry)
│   └── CozyTouchDriver.js          # Base driver (pairing flow)
│
├── drivers/
│   ├── heater/
│   │   ├── device.js               # Boiler/towel rack device
│   │   ├── driver.js               # Filters for boiler/rack/thermostat models
│   │   ├── assets/icon.svg
│   │   └── pair/login_credentials.html
│   │
│   ├── water_heater/
│   │   ├── device.js               # Water heater device (+ away mode)
│   │   ├── driver.js               # Filters for water heater models
│   │   ├── assets/icon.svg
│   │   └── pair/login_credentials.html
│   │
│   └── climate/
│       ├── device.js               # Heat pump / AC device (+ fan/swing)
│       ├── driver.js               # Filters for HP/AC models
│       ├── assets/icon.svg
│       └── pair/login_credentials.html
│
├── locales/
│   ├── en.json
│   └── fr.json
│
└── assets/                         # App store images (to be added)
```

### Data Flow

```
User Action (Homey UI / Flow)
        │
        ▼
  registerCapabilityListener()     ← drivers/{type}/device.js
        │
        ▼
  _setCapValue(capId, value)       ← lib/CozyTouchDevice.js
        │
        ▼
  setCapabilityValue(deviceId,     ← lib/CozyTouchAPI.js
    capabilityId, value)
        │
        ▼
  POST /magellan/executions/       ← Atlantic Cloud
    writecapability
        │
        ▼
  Poll execution status until      ← lib/CozyTouchAPI.js
    state === 3 (completed)
```

### Polling Flow

```
setInterval (every 60s)
        │
        ▼
  GET /magellan/capabilities/      ← Atlantic Cloud
    ?deviceId={id}
        │
        ▼
  _updateFromCapabilities()        ← drivers/{type}/device.js
        │
        ▼
  setCapabilityValue() for each    ← Homey UI updates
    mapped capability
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

ISC
