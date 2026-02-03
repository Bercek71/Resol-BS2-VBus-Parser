#!/usr/bin/env python3
"""
VBUS bridge: subscribe to raw VBUS hex on MQTT, decode Resol BS 2 (0x4278),
publish collector and boiler temperatures to MQTT for Home Assistant.
"""

import os
import sys
import logging

import paho.mqtt.client as mqtt

# Resol BS 2 (source 0x4278) decoding
PAYLOAD_MIN_LEN = 41  # bytes 0..40


def decode_collector(payload: bytes, offset_adj: float = 33.9) -> float:
    """Collector: payload[0] - offset_adj."""
    if len(payload) < 1:
        return float("nan")
    return payload[0] - offset_adj


def decode_boiler(payload: bytes, offset: int = 36, byte_offset: int = 2) -> float:
    """Boiler: (payload[offset] + byte_offset) / 10.0."""
    if offset < 0 or offset >= len(payload):
        return float("nan")
    return (payload[offset] + byte_offset) / 10.0


def on_connect(client, userdata, flags, reason_code, properties=None):
    if reason_code != 0:
        logging.error("MQTT connect failed: %s", reason_code)
        return
    logging.info("Connected to MQTT broker")
    client.subscribe(os.environ.get("VBUS_RAW_TOPIC", "vita/vbus/raw"))


def on_message(client, userdata, msg):
    try:
        hex_payload = msg.payload.decode("ascii").strip().replace(" ", "")
        payload = bytes.fromhex(hex_payload)
    except (ValueError, UnicodeDecodeError) as e:
        logging.warning("Invalid raw payload: %s", e)
        return
    if len(payload) < PAYLOAD_MIN_LEN:
        logging.warning("Payload too short: %d bytes", len(payload))
        return
    collector = decode_collector(payload)
    boiler = decode_boiler(payload)
    topic_prefix = os.environ.get("VBUS_OUTPUT_TOPIC_PREFIX", "vita")
    ct_topic = f"{topic_prefix}/collector_temperature"
    bt_topic = f"{topic_prefix}/boiler_temperature"
    client.publish(ct_topic, f"{collector:.1f}", qos=0, retain=False)
    client.publish(bt_topic, f"{boiler:.1f}", qos=0, retain=False)
    logging.debug("Published collector=%.1f °C, boiler=%.1f °C", collector, boiler)


def main():
    logging.basicConfig(
        level=os.environ.get("LOG_LEVEL", "INFO").upper(),
        format="%(asctime)s [%(levelname)s] %(message)s",
    )
    broker = os.environ.get("MQTT_BROKER", "localhost")
    port = int(os.environ.get("MQTT_PORT", "1883"))
    username = os.environ.get("MQTT_USERNAME", "")
    password = os.environ.get("MQTT_PASSWORD", "")

    client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
    client.on_connect = on_connect
    client.on_message = on_message
    if username:
        client.username_pw_set(username, password or None)

    try:
        client.connect(broker, port, 60)
    except Exception as e:
        logging.error("Cannot connect to MQTT broker %s:%s: %s", broker, port, e)
        sys.exit(1)
    client.loop_forever()


if __name__ == "__main__":
    main()
