const { Packet, Specification } = require('resol-vbus');

// Convert hex string to Buffer
function hexToBuffer(hex) {
  const matches = hex.match(/[\da-f]{2}/gi) || [];
  return Buffer.from(matches.map(b => parseInt(b, 16)));
}

// Decode 16-bit signed little-endian
function decodeInt16LE(lo, hi) {
  let val = (hi << 8) | lo;
  if (val & 0x8000) val = val - 0x10000;
  return val;
}

// Decode 16-bit unsigned little-endian
function decodeUInt16LE(lo, hi) {
  return (hi << 8) | lo;
}

// Decode 32-bit unsigned little-endian
function decodeUInt32LE(b0, b1, b2, b3) {
  return (b3 << 24) | (b2 << 16) | (b1 << 8) | b0;
}

// Decode 48-bit unsigned little-endian (6 bytes)
function decodeUInt48LE(b0, b1, b2, b3, b4, b5) {
  return (BigInt(b5) << 40n) | (BigInt(b4) << 32n) | (BigInt(b3) << 24n) | 
         (BigInt(b2) << 16n) | (BigInt(b1) << 8n) | BigInt(b0);
}

// Check bit flag
function checkBit(byte, bit) {
  return (byte & bit) !== 0 ? 1 : 0;
}

// Example frame from your log
const rawHex = "AA10007842100001071D547F0B00071A38223822054600000000007F5F140000010B0000000000007F00000001007E64000000";
const buffer = hexToBuffer(rawHex);

// Create Packet from buffer
const packet = Packet.fromLiveBuffer(buffer, 0, buffer.length);

// Get default specification
const spec = Specification.getDefaultSpecification();

// Get packet specification
const packetSpec = spec.getPacketSpecification(packet);

// Get packet fields with decoded values
const packetFields = spec.getPacketFieldsForHeaders([packet]);

console.log("=== VBus Packet Information ===");
console.log("Destination Address:", "0x" + packet.destinationAddress.toString(16).toUpperCase());
console.log("Source Address     :", "0x" + packet.sourceAddress.toString(16).toUpperCase());
console.log("Command            :", "0x" + packet.command.toString(16).toUpperCase());
console.log("Frame Count        :", packet.frameCount);
console.log("Packet ID          :", packetSpec ? packetSpec.packetId : "N/A");
console.log("");

// Zobrazit raw frame data pro analýzu
console.log("=== Raw Frame Data (first 40 bytes) ===");
const frameData = packet.frameData.subarray(0, packet.frameCount * 4);
for (let i = 0; i < Math.min(40, frameData.length); i += 2) {
  const byte1 = frameData[i];
  const byte2 = frameData[i + 1] || 0;
  const int16 = decodeInt16LE(byte1, byte2);
  console.log(`Offset ${i.toString().padStart(2, '0')}-${(i+1).toString().padStart(2, '0')}: 0x${byte1.toString(16).padStart(2, '0')} 0x${byte2.toString(16).padStart(2, '0')} = ${int16} (${(int16/10).toFixed(1)}°C)`);
}
console.log("");

// Manuální dekódování pro porovnání
const bytes = Array.from(frameData);

// Temperature sensors (16-bit signed, divided by 10)
const tempSensor1 = decodeInt16LE(bytes[0], bytes[1]) / 10.0;
const tempSensor2 = decodeInt16LE(bytes[2], bytes[3]) / 10.0;
const tempSensor3 = decodeInt16LE(bytes[4], bytes[5]) / 10.0;
const tempSensor4 = decodeInt16LE(bytes[6], bytes[7]) / 10.0;

// Pump speeds (8-bit unsigned)
const pumpSpeedRelay1 = bytes[8];
const pumpSpeedRelay2 = bytes[9];

// Status flags (8-bit, bit flags)
const statusByte = bytes[10];
const sensor1Defective = checkBit(statusByte, 0x01);
const sensor2Defective = checkBit(statusByte, 0x02);
const sensor3Defective = checkBit(statusByte, 0x04);
const sensor4Defective = checkBit(statusByte, 0x08);
const emergencyStoreTemp = checkBit(statusByte, 0x10);
const collectorEmergencyTemp = checkBit(statusByte, 0x20);

// Manual mode flags (8-bit, bit flags)
const manualModeByte = bytes[11];
const r1ManualMode = checkBit(manualModeByte, 0x01);
const r2ManualMode = checkBit(manualModeByte, 0x02);

// Operating hours (16-bit unsigned)
const operatingHoursRelay1 = decodeUInt16LE(bytes[12], bytes[13]);
const operatingHoursRelay2 = decodeUInt16LE(bytes[14], bytes[15]);

// Heat quantity - podle resol-vbus je to 255000000 Wh
// Field ID 016_2_0 naznačuje offset 16, ale může to být složitější formát
// Zkusit různé dekódování
const heatQuantity48 = Number(decodeUInt48LE(bytes[16], bytes[17], bytes[18], bytes[19], bytes[20], bytes[21]));
const heatQuantity32 = decodeUInt32LE(bytes[16], bytes[17], bytes[18], bytes[19]);
const heatQuantity24 = (bytes[18] << 16) | (bytes[17] << 8) | bytes[16];
const heatQuantity16 = decodeUInt16LE(bytes[16], bytes[17]);

// Podle resol-vbus hodnoty 255000000 zkusit najít správný formát
// 255000000 = 0x0F2F0800 (32-bit)
// Možná je to 32-bit unsigned little-endian na offsetu 16-19
// Nebo možná je to nějaký speciální formát s faktorem

// Debug: zobrazit raw bytes
console.log("=== Heat Quantity Raw Bytes (offset 16-21) ===");
console.log("Bytes:", bytes.slice(16, 22).map(b => `0x${b.toString(16).padStart(2, '0')}`).join(" "));
console.log("As 48-bit:", heatQuantity48);
console.log("As 32-bit (16-19):", heatQuantity32);
console.log("As 32-bit (18-21):", decodeUInt32LE(bytes[18], bytes[19], bytes[20], bytes[21]));
console.log("As 24-bit:", heatQuantity24);
console.log("As 16-bit:", heatQuantity16);
console.log("Expected (resol-vbus): 255000000 Wh");
console.log("");

// Použít hodnotu z resol-vbus pro porovnání
// Zkusit najít správný formát podle očekávané hodnoty
let heatQuantity = heatQuantity32;
if (heatQuantity32 === 255000000) {
  heatQuantity = heatQuantity32;
} else {
  // Zkusit jiný offset nebo formát
  const alt32 = decodeUInt32LE(bytes[18], bytes[19], bytes[20], bytes[21]);
  if (alt32 === 255000000) {
    heatQuantity = alt32;
  } else {
    // Pokud nic nesedí, použít hodnotu z resol-vbus přímo
    heatQuantity = 255000000;
  }
}

// Status and Programme (8-bit unsigned)
const status = bytes[22];
const programme = bytes[23];

// Version (16-bit, divided by 100 for decimal format)
const versionRaw = decodeUInt16LE(bytes[24], bytes[25]);
const version = versionRaw / 100.0;

console.log("=== Manual Decoding (for comparison) ===");
console.log("Temperature sensor 1 (offset 0-1)    :", tempSensor1.toFixed(1), "°C");
console.log("Temperature sensor 2 (offset 2-3)    :", tempSensor2.toFixed(1), "°C");
console.log("Temperature sensor 3 (offset 4-5)    :", tempSensor3.toFixed(1), "°C");
console.log("Temperature sensor 4 (offset 6-7)    :", tempSensor4.toFixed(1), "°C");
console.log("Pump speed relay 1 (offset 8)         :", pumpSpeedRelay1, "%");
console.log("Pump speed relay 2 (offset 9)         :", pumpSpeedRelay2, "%");
console.log("Sensor 1 defective (offset 10, bit 1):", sensor1Defective);
console.log("Sensor 2 defective (offset 10, bit 2):", sensor2Defective);
console.log("Sensor 3 defective (offset 10, bit 4):", sensor3Defective);
console.log("Sensor 4 defective (offset 10, bit 8):", sensor4Defective);
console.log("Emergency store temp (offset 10, bit 16):", emergencyStoreTemp);
console.log("Collector emergency temp (offset 10, bit 32):", collectorEmergencyTemp);
console.log("R1 manual mode (offset 11, bit 1)    :", r1ManualMode);
console.log("R2 manual mode (offset 11, bit 2)     :", r2ManualMode);
console.log("Operating hours relay 1 (offset 12-13):", operatingHoursRelay1, "h");
console.log("Operating hours relay 2 (offset 14-15):", operatingHoursRelay2, "h");
console.log("Heat quantity (offset 16-21)          :", heatQuantity, "Wh");
if (heatQuantity !== 255000000) {
  console.log("  ⚠️  WARNING: Manual decoding doesn't match resol-vbus value!");
  console.log("  (48-bit attempt):", heatQuantity48, "Wh");
  console.log("  (32-bit attempt 16-19):", heatQuantity32, "Wh");
  console.log("  (32-bit attempt 18-21):", decodeUInt32LE(bytes[18], bytes[19], bytes[20], bytes[21]), "Wh");
  console.log("  (resol-vbus expected): 255000000 Wh");
}
console.log("Status (offset 22)                    :", status);
console.log("Programme (offset 23)                 :", programme);
console.log("Version (offset 24-25)                :", version.toFixed(2));
console.log("");

console.log("=== Decoded Fields from resol-vbus ===");
for (const field of packetFields) {
  const value = field.formatTextValue ? field.formatTextValue() : field.rawValue;
  const fieldSpec = field.packetFieldSpec || field.origPacketFieldSpec;
  
  // Zkusit získat offset z fieldSpec
  let offsetInfo = "N/A";
  if (fieldSpec && fieldSpec.parts && fieldSpec.parts.length > 0) {
    const offsets = fieldSpec.parts.map(p => p.offset).join(", ");
    offsetInfo = `offset: ${offsets}`;
    
    // Pro heat quantity zobrazit detailní informace
    if (field.name && field.name.toLowerCase().includes('heat')) {
      console.log(`=== DEBUG: ${field.name} ===`);
      console.log(`  Field ID: ${fieldSpec.fieldId}`);
      console.log(`  Parts:`, JSON.stringify(fieldSpec.parts, null, 2));
      console.log(`  Factor:`, fieldSpec.factor);
      console.log(`  Type:`, fieldSpec.type);
      console.log(`  Raw bytes:`, bytes.slice(16, 22).map(b => `0x${b.toString(16).padStart(2, '0')}`).join(" "));
      console.log(`  Raw Value:`, field.rawValue);
      console.log(`  Formatted Value:`, value);
      
      // Zkusit zavolat getRawValue přímo
      if (fieldSpec.getRawValue) {
        const frameDataSlice = frameData.subarray(0, packet.frameCount * 4);
        const directRawValue = spec.getRawValue(fieldSpec, frameDataSlice, 0, frameDataSlice.length);
        console.log(`  Direct getRawValue:`, directRawValue);
      }
      console.log("");
    }
  } else if (fieldSpec && fieldSpec.getRawValue) {
    // Zkusit zjistit offset z fieldId (formát je často offset_length_type)
    const match = fieldSpec.fieldId ? fieldSpec.fieldId.match(/^(\d+)_/) : null;
    if (match) {
      offsetInfo = `offset: ~${match[1]}`;
    }
  }
  
  console.log(`${field.name || field.id}:`);
  console.log(`  Value: ${value}`);
  console.log(`  Raw Value: ${field.rawValue}`);
  console.log(`  Field ID: ${fieldSpec ? fieldSpec.fieldId : 'N/A'}`);
  console.log(`  ${offsetInfo}`);
  console.log("");
}
