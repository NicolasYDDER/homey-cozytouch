# Atlantic Cozytouch - User Guide

This guide will help you set up and use the Atlantic Cozytouch app on your Homey Pro.

---

## Table of Contents

1. [Before You Start](#before-you-start)
2. [Setting Up Your Cozytouch Account](#setting-up-your-cozytouch-account)
3. [App Configuration Page](#app-configuration-page)
4. [Adding Your First Device](#adding-your-first-device)
5. [Understanding Device Types](#understanding-device-types)
6. [Understanding Protocols (Cozytouch vs Overkiz)](#understanding-protocols)
7. [Controlling Your Devices](#controlling-your-devices)
8. [Device Settings](#device-settings)
9. [Creating Automations (Flows)](#creating-automations-flows)
10. [Managing Devices](#managing-devices)
11. [Frequently Asked Questions](#frequently-asked-questions)

---

## Before You Start

Make sure you have the following ready:

- **Homey Pro** with firmware 5.0 or later
- **Atlantic Cozytouch bridge** installed and connected to your home Wi-Fi
- **Atlantic devices** (boiler, water heater, heat pump, or AC) already paired to your Cozytouch bridge via the official Cozytouch mobile app
- **Cozytouch account credentials** (the email and password you use to log in to the Cozytouch mobile app)

> **Important**: Your Atlantic devices must first be set up and working in the official Cozytouch app before they can be added to Homey.

---

## Setting Up Your Cozytouch Account

If you don't have a Cozytouch account yet:

1. Download the **Cozytouch** app from the App Store (iOS) or Google Play (Android)
2. Create an account with your email address
3. Follow the in-app instructions to pair your Cozytouch bridge
4. Add your Atlantic devices to the bridge
5. Verify that you can see and control your devices from the Cozytouch app

Once your devices are visible and controllable in the Cozytouch app, you're ready to add them to Homey.

---

## App Configuration Page

The app includes a configuration page where you can manage your credentials, test API connections, and see the status of both communication protocols.

### Accessing the Configuration Page

1. Open the **Homey app** or go to **my.homey.app**
2. Navigate to **Settings** (gear icon)
3. Under **Apps**, find and tap **Atlantic Cozytouch**
4. The configuration page opens

### Credentials Management

The configuration page has three main actions:

#### Save Credentials

1. Enter your **Cozytouch email** in the Email field
2. Enter your **Cozytouch password** in the Password field
3. Tap **Save Credentials**

Your credentials are stored locally on the Homey Pro and are used to authenticate against both the CozyTouch and Overkiz cloud APIs. Once saved, they persist across app restarts.

> **Note**: These are the same credentials you use in the official Cozytouch mobile app.

#### Test Connection

Tap **Test Connection** to verify your credentials work with both backends. The test will:

1. Attempt to authenticate against **CozyTouch (Magellan)** API
2. Attempt to authenticate against **Overkiz** API
3. Discover devices on each protocol
4. Display a summary with device lists

After the test, the **Connection Status** panel shows:
- A **green dot** for each protocol that connected successfully
- The **number of devices** found on each protocol
- A **device table** listing each discovered device and its type

This is useful for troubleshooting: if a device you expect isn't showing up during pairing, run the test to see which protocol it appears on (or if it appears at all).

#### Clear Credentials

Tap **Clear** to remove saved credentials from Homey. Existing paired devices will continue to work until the app is restarted, but new pairing will require entering credentials again.

### Connection Status Panel

The status panel shows two boxes side by side:

| Protocol | Endpoint | Typical Devices |
|----------|----------|----------------|
| **CozyTouch (Magellan)** | apis.groupe-atlantic.com | Newer boilers, towel racks, AC units |
| **Overkiz** | ha110-1.overkiz.com | Older water heaters, Thermor/Sauter devices |

Each box shows:
- **Status dot**: Green = connected, Red = error, Gray = not configured
- **Token status**: Whether the current authentication token is active
- **Device list**: After a connection test, shows discovered devices

---

## Adding Your First Device

### Step 1 - Open the Devices Page

1. Open the **Homey app** on your phone or go to **my.homey.app** in your browser
2. Navigate to **Devices**
3. Tap the **+** button in the top-right corner to add a new device

### Step 2 - Select the Atlantic Cozytouch App

1. In the "Add Device" screen, search for **Atlantic Cozytouch**
2. Select the app from the list

### Step 3 - Choose the Device Type

You will see three device types to choose from:

| Type | What to choose |
|------|---------------|
| **Heater / Boiler** | For gas boilers (Naema, Naia), towel racks (Kelud, Asama), and thermostats |
| **Water Heater** | For domestic hot water tanks (Zeneo, Calypso, Vizengo, Lineo) |
| **Heat Pump / AC** | For heat pumps (Loria) and air conditioning units (Takao) |

Select the type that matches your device and tap **Next**.

> **Tip**: If you have multiple device types (e.g. a boiler and a water heater), you will need to repeat this process for each type.

### Step 4 - Enter Your Credentials

1. Enter the **email address** you use for your Cozytouch account
2. Enter your **password**
3. Tap **Login**

The app will connect to the Cozytouch cloud and search for compatible devices on your account.

> **Note**: Your credentials are stored locally on your Homey and are only used to communicate with the Atlantic API. They are never shared with third parties.

### Step 5 - Select Your Devices

1. A list of compatible devices found on your account will appear
2. **Check the box** next to each device you want to add
3. Tap **Next** to confirm

### Step 6 - Done!

Your devices are now added to Homey. They will appear on the Devices page and start polling for current data immediately.

---

## Understanding Device Types

### Heater / Boiler

Controls gas boilers and electric heaters. Available controls:

- **On/Off** - Turn the device on or off
- **Target Temperature** - Set the desired temperature (range depends on your device, typically 5-30 C)
- **Current Temperature** - Displays the measured room temperature
- **Heating Mode** - Choose between:
  - **Off** - Device is turned off
  - **Manual** - Maintain the target temperature you set
  - **Eco+** - Energy-saving mode (reduced temperature)
  - **Program** - Follow the weekly schedule configured in the Cozytouch app

### Water Heater

Controls domestic hot water tanks. Available controls:

- **On/Off** - Turn the water heater on or off
- **Target Temperature** - Set the desired water temperature (typically 30-65 C)
- **Current Temperature** - Displays the current water temperature
- **Heating Mode** - Same modes as the heater (Off, Manual, Eco+, Program)
- **Away Mode** - Toggle vacation mode on or off. When enabled, the water heater reduces energy consumption while you're away

### Heat Pump / AC

Controls heat pumps and air conditioning units. Available controls:

- **On/Off** - Turn the unit on or off
- **Target Temperature** - Set the desired temperature (automatically switches between heat and cool setpoints based on the active mode)
- **Current Temperature** - Displays the measured temperature
- **HVAC Mode** - Choose between (availability depends on your model):
  - **Off** - Unit is turned off
  - **Heat** - Heating mode
  - **Cool** - Cooling mode (AC units only)
  - **Auto** - Automatic switching between heating and cooling
  - **Dry** - Dehumidification mode (AC units only)
  - **Fan Only** - Fan circulation without heating or cooling (AC units only)
- **Fan Speed** (AC units only) - Auto, Low, Medium, or High
- **Swing Position** (AC units only) - Up, Middle Up, Middle Down, or Down

---

## Understanding Protocols

Atlantic uses **two separate cloud backends** depending on the age and type of the device. The app handles both transparently, but it's useful to understand this when troubleshooting.

### CozyTouch (Magellan) Protocol

- **Endpoint**: `apis.groupe-atlantic.com`
- **Used by**: Newer devices — recent gas boilers, towel racks (Kelud), thermostats, AC units (Takao)
- **How it works**: Direct REST API with numeric capability IDs for reading and writing values

### Overkiz Protocol

- **Endpoint**: `ha110-1.overkiz.com`
- **Used by**: Older devices — water heaters (Calypso, Zeneo, Vizengo), Thermor and Sauter branded products
- **How it works**: 3-step authentication (Atlantic token -> JWT exchange -> Overkiz login), then command/state based API with named states and commands
- **Also used by**: Somfy TaHoma, Hitachi Hi Kumo (same platform, different vendors)

### How the App Handles Both

When you pair a device:
1. The app authenticates to **both** backends using your single set of Cozytouch credentials
2. It discovers devices from **both** protocols
3. Each device is tagged internally with which protocol it uses
4. All subsequent polling and commands are routed to the correct backend automatically

You don't need to know or choose which protocol your device uses — it's fully automatic. However, if you're wondering why a device appears or doesn't appear, run the **Test Connection** from the [App Configuration Page](#app-configuration-page) to see which protocol each device is on.

### Thermor and Sauter Compatibility

Thermor and Sauter are brands owned by Groupe Atlantic. Their products use the **same Cozytouch platform** and the same Overkiz backend. If your Thermor or Sauter device works with the Cozytouch mobile app, it should be discovered by this Homey app.

---

## Controlling Your Devices

### From the Homey App

1. Go to **Devices** and tap on your Cozytouch device
2. Use the **on/off toggle** to turn the device on or off
3. Use the **temperature slider** to adjust the target temperature
4. Tap on **Heating Mode** or **HVAC Mode** to change the operating mode
5. For AC units, tap on **Fan Speed** or **Swing Position** to adjust airflow

### From the Homey Dashboard (Web)

1. Go to **my.homey.app**
2. Click on your device tile
3. Use the same controls as in the mobile app

### With Voice Commands

If you have a voice assistant connected to Homey (Google Home, Amazon Alexa, Apple Siri), you can use voice commands:

- *"Set the living room temperature to 21 degrees"*
- *"Turn off the water heater"*
- *"Turn on the heating"*

> **Note**: Mode changes (Eco+, Program, etc.) are not available through voice commands. Use Homey Flows or the app instead.

---

## Device Settings

Each device has configurable settings you can access through the Homey app:

1. Go to **Devices**
2. Tap on the device
3. Tap the **gear icon** (Settings)

### Poll Interval

- **Default**: 60 seconds
- **Range**: 10 to 300 seconds
- **What it does**: Controls how often Homey fetches the latest data from the Cozytouch cloud

**Recommendations:**
- **60 seconds** - Good balance between responsiveness and API usage (recommended)
- **30 seconds** - More responsive, but uses more API calls
- **120-300 seconds** - Less responsive, but reduces load if you have many devices

> **Warning**: Setting the poll interval too low (under 30 seconds) with many devices may cause rate limiting from the Atlantic API, which could temporarily make your devices unavailable.

---

## Creating Automations (Flows)

The app integrates with Homey's Flow system to create powerful automations.

### Available Triggers

These can start a Flow:

| Trigger | Description | Example Use |
|---------|-------------|-------------|
| **Temperature changed** | Fires when the measured temperature changes | Alert when temperature drops below 15 C |
| **Heating mode changed** | Fires when the heating mode changes | Log mode changes |

### Available Actions

These can be used as Flow actions:

| Action | Description |
|--------|-------------|
| **Set heating mode** | Change to Off, Manual, Eco+, or Program |
| **Set HVAC mode** | Change to Off, Heat, Cool, Auto, Dry, or Fan Only |

### Available Conditions

These can be used to add logic to your Flows:

| Condition | Description |
|-----------|-------------|
| **Heating mode is...** | Check if the current mode matches a specific value |

### Example Flows

#### "Eco mode at night"

```
WHEN    Time is 22:00
THEN    Set heating mode to Eco+ (for device: Living Room Boiler)
```

#### "Comfort mode in the morning"

```
WHEN    Time is 06:30
AND     Day is Monday, Tuesday, Wednesday, Thursday, Friday
THEN    Set heating mode to Manual (for device: Living Room Boiler)
```

#### "Turn off heating when leaving home"

```
WHEN    Homey location: I left my Home zone
THEN    Set heating mode to Off (for device: Living Room Boiler)
THEN    Set Away Mode to On (for device: Water Heater)
```

#### "Alert on low temperature"

```
WHEN    Temperature changed (for device: Living Room Boiler)
AND     Temperature is less than 15
THEN    Send push notification: "Warning: Living room temperature is low!"
```

#### "Summer AC automation"

```
WHEN    Temperature changed (for device: Living Room AC)
AND     Temperature is greater than 27
THEN    Set HVAC mode to Cool (for device: Living Room AC)
```

---

## Managing Devices

### Renaming a Device

1. Go to **Devices** and tap on the device
2. Tap the **gear icon** (Settings)
3. Change the **Name** field
4. Tap **Save**

### Moving a Device to a Room

1. Go to **Devices** and tap on the device
2. Tap the **gear icon** (Settings)
3. Under **Zone**, select the room
4. Tap **Save**

### Removing a Device

1. Go to **Devices** and tap on the device
2. Tap the **gear icon** (Settings)
3. Scroll down and tap **Remove Device**
4. Confirm the removal

> **Note**: Removing a device from Homey does not affect your Cozytouch account. The device will still be controllable through the Cozytouch app.

### Adding Devices from a Second Account

If you have devices on multiple Cozytouch accounts, simply repeat the [Adding Your First Device](#adding-your-first-device) process with the other account's credentials. The app supports multiple accounts simultaneously.

---

## Frequently Asked Questions

### My device shows as "Unavailable"

This usually means Homey cannot reach the Cozytouch cloud. Check:
- Is your Homey connected to the internet?
- Is the Cozytouch app on your phone working?
- Try waiting a few minutes - the connection may recover automatically
- As a last resort, remove and re-add the device

### The temperature doesn't update

The temperature updates at each poll interval (default: 60 seconds). If it still doesn't update:
- Check that the device is online in the Cozytouch mobile app
- Check the device settings for the poll interval value
- Restart the app from Homey Settings > Apps > Atlantic Cozytouch > Restart

### I changed the temperature but nothing happened

After you change a setting, the app sends the command to the cloud and waits for confirmation (up to 5 seconds). If the command fails:
- The Cozytouch bridge may be offline
- The device may not accept the value (e.g. temperature out of range)
- Check the Cozytouch mobile app to verify the current state

### I changed my Cozytouch password

If you change your Cozytouch account password:
1. Go to the **App Configuration Page** (Settings > Apps > Atlantic Cozytouch)
2. Enter your new password and tap **Save Credentials**
3. Tap **Test Connection** to verify it works
4. Restart the app from Settings > Apps > Atlantic Cozytouch > Restart

### My device type isn't listed

The app currently supports gas boilers, water heaters, towel racks, heat pumps, and AC units. If your Atlantic device is connected to Cozytouch but doesn't appear during pairing, it may not be supported yet. Please [open an issue](https://github.com/NicolasYDDER/homey-cozytouch/issues) with your device model name and we'll look into adding support.

### My device only appears on one protocol

This is normal. Atlantic uses two backends (CozyTouch and Overkiz) for different device generations. Run **Test Connection** from the App Configuration Page to see which protocol your device is on. The app handles both automatically.

### Can I use this app with Thermor or Sauter devices?

Yes! Thermor and Sauter are brands owned by Groupe Atlantic and use the same Cozytouch platform and the same Overkiz backend. If your device works with the Cozytouch app, it should work with this Homey app.

### Does this work without an internet connection?

No. The app communicates with Atlantic's cloud servers. If your internet connection is down, you won't be able to control devices through Homey. You can still use the physical controls on the devices themselves.

### Is my data secure?

Your Cozytouch credentials are stored locally on your Homey Pro. They are only sent to Atlantic's servers (`apis.groupe-atlantic.com`) for authentication. No data is sent to any third party.
