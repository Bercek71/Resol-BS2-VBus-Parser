FROM python:3.12-slim

WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY main.py .

ENV MQTT_BROKER=localhost
ENV MQTT_PORT=1883
ENV VBUS_RAW_TOPIC=vita/vbus/raw
ENV VBUS_OUTPUT_TOPIC_PREFIX=vita

CMD ["python", "-u", "main.py"]
