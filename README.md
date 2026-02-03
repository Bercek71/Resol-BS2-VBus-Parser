# Resol VBus – DeltaSol BS/2 with ESPHome

ESPHome configuration for **Resol DeltaSol BS/2** (and compatible controllers) using the native **VBus** component. The ESP32 reads the VBus protocol over UART, filters packets by destination/source/command, and exposes all decoded values as **sensors** and **binary sensors** (e.g. for Home Assistant via the ESPHome API).

No MQTT or bridge is required: the device acts as a direct sensor source.

---

## Supported device

- **DeltaSol BS/2** – VBus source address **0x4278** (destination `0x10`, command `0x100`).  
  The same packet layout may apply to other Resol controllers that use this address; identify your device by checking the source address in the VBus stream (e.g. with logger at VERBOSE).

---

## 1. Hardware

- **ESP32** with a UART RX pin connected to the VBus line.
- **Level shifting** is required: VBus signal is about **8 V**; connect only through a level shifter or optocoupler circuit down to 3.3 V. Do **not** connect the Resol unit’s GND to the ESP32 GND (VBus is a differential signal; connecting grounds can damage the Resol port).
- Default in the config: **RX = GPIO16**, **9600 baud**, 8N1.

Example circuits (resistor divider or optocoupler) are described in the [ESPHome VBus documentation](https://esphome.io/components/vbus.html).

---

## 2. Configuration and flash

1. Open **`DeltaSol-BS2-ESP-Config.yaml`** (or your copy).
2. Set **WiFi**: `wifi.ssid`, `wifi.password`.
3. Set **API** and **OTA** if needed (see section 4); add `encryption:` under `api:` and/or `password:` under `ota:`.
4. Compile and flash with ESPHome:
   ```bash
   esphome run DeltaSol-BS2-ESP-Config.yaml
   ```
5. Add the device in Home Assistant via **ESPHome** (discovery or manual add by hostname/IP). All entities are exposed through the ESPHome API.

---

## 3. Exposed entities

### Sensors

| Entity              | Description                          | Unit / type        |
|---------------------|--------------------------------------|--------------------|
| Temperature 1–4     | Four temperature sensors (payload)   | °C                 |
| Pump Speed Relay 1–2| Pump speed 0–100 %                   | %                  |
| Operating Hours 1–2 | Operating hours per relay            | h (total_increasing) |
| Heat Quantity       | Heat quantity                        | Wh (total_increasing) |
| Status              | Status byte                          | diagnostic         |
| Programme           | Programme byte                       | diagnostic         |
| Device Firmware Version | Controller firmware version   | diagnostic         |

### Binary sensors

| Entity                   | Description                    |
|--------------------------|--------------------------------|
| Sensor 1–4 Defective     | Temperature sensor fault flags |
| Emergency Store Temp     | Emergency store temperature    |
| Collector Emergency Temp | Collector emergency temperature|
| Relay 1/2 Manual Mode    | Manual mode for relay 1 and 2  |

Decoding uses the DeltaSol BS/2 payload layout: 16-bit signed LE /10 for temperatures, 8-bit for pump and status bytes, 16-bit LE for operating hours, and the documented heat quantity encoding (bytes 20–21 × 1e6 Wh).

---

## 4. API and OTA

The config enables ESPHome **API** (for Home Assistant and the dashboard) and **OTA** (over-the-air updates). Configure them in the YAML:

- **API**: If you use an encryption key in Home Assistant, add `encryption:` with your key under `api:`.
- **OTA**: Add a `password:` under `ota:` so only you can flash updates.

Edit these blocks in **`DeltaSol-BS2-ESP-Config.yaml`** (or your chosen config file) and recompile/flash.

---

## 5. Config file

| File | Purpose |
|------|--------|
| `DeltaSol-BS2-ESP-Config.yaml` | ESPHome config: WiFi, API, OTA, UART, VBus component, DeltaSol BS/2 sensors and binary sensors. Copy and rename as needed; set `name:`, WiFi, and API/OTA as required. |
