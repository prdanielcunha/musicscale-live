/**
 * Native Soundcraft Si HiQnet diagnostics (no Mixing Station / commercial bridge).
 * Vendor reference: HARMAN HiQnet Third Party Programmer Documentation.
 *
 * Never transmits any parameter-set, scene, reset or mute messages. It is a
 * safe first stage for the dual-homed OBPC Industrial production PC:
 *   Wi-Fi SOM 192.168.0.158 -> console 192.168.0.148
 *   Ethernet OBPC -> Internet / MusicScale Live tablet
 */
import { createSocket } from 'node:dgram';
import { networkInterfaces } from 'node:os';
import { createServer } from 'node:net';

export const SOUNDCRAFT_INDUSTRIAL = Object.freeze({
  model: 'Soundcraft Si Expression 3',
  firmware: '1.8 Build 0012',
  consoleIp: '192.168.0.148',
  expectedConsoleMac: '00:17:24:82:29:64',
  consoleHiqnetAddress: 10596,
  preferredWifiIp: '192.168.0.158',
  localHiqnetAddress: 1337,
  port: 3804
});

export interface HiqnetHeader {
  version: number;
  headerLength: number;
  messageLength: number;
  sourceDevice: number;
  sourceObject: number;
  destinationDevice: number;
  destinationObject: number;
  messageId: number;
  flags: number;
  hopCount: number;
  sequence: number;
}

function validDeviceId(value: number): boolean {
  return Number.isInteger(value) && value >= 0 && value <= 65535;
}
export function encodeHiqnetHeader(input: {
  sourceDevice: number;
  destinationDevice: number;
  messageId: number;
  payload?: Buffer;
  flags?: number;
  sequence?: number;
}): Buffer {
  for (const key of [input.sourceDevice, input.destinationDevice, input.messageId]) {
    if (!validDeviceId(key)) throw new Error('invalid_hiqnet_id');
  }
  const payload = input.payload || Buffer.alloc(0);
  if (payload.length > 2048) throw new Error('hiqnet_oversize');
  const packet = Buffer.alloc(25 + payload.length);
  packet.writeUInt8(2, 0);            // HiQnet v2
  packet.writeUInt8(25, 1);           // Header is 25 bytes with no session extension
  packet.writeUInt32BE(packet.length, 2);
  packet.writeUInt16BE(input.sourceDevice, 6);
  packet.writeUInt32BE(0, 8);         // Device manager
  packet.writeUInt16BE(input.destinationDevice, 12);
  packet.writeUInt32BE(0, 14);
  packet.writeUInt16BE(input.messageId, 18);
  packet.writeUInt16BE(input.flags || 0, 20);
  packet.writeUInt8(5, 22);
  packet.writeUInt16BE(input.sequence || 1, 23);
  payload.copy(packet, 25);
  return packet;
}

export function decodeHiqnetHeader(packet: Buffer): HiqnetHeader {
  if (packet.length < 25 || packet.length > 4096 || packet[0] !== 2) {
    throw new Error('invalid_hiqnet_header');
  }
  const headerLength = packet.readUInt8(1);
  const messageLength = packet.readUInt32BE(2);
  if (headerLength < 25 || headerLength > messageLength || messageLength > packet.length) {
    throw new Error('invalid_hiqnet_length');
  }
  return {
    version: 2, headerLength, messageLength,
    sourceDevice: packet.readUInt16BE(6), sourceObject: packet.readUInt32BE(8),
    destinationDevice: packet.readUInt16BE(12), destinationObject: packet.readUInt32BE(14),
    messageId: packet.readUInt16BE(18), flags: packet.readUInt16BE(20),
    hopCount: packet.readUInt8(22), sequence: packet.readUInt16BE(23)
  };
}

function ipv4Buffer(address: string): Buffer {
  const octets = address.split('.').map(Number);
  if (octets.length !== 4 || octets.some(o => !Number.isInteger(o) || o < 0 || o > 255)) {
    throw new Error('invalid_ip_address');
  }
  return Buffer.from(octets);
}
function macBuffer(mac: string): Buffer {
  const parts = mac.split(':');
  if (parts.length !== 6 || parts.some(p => !/^[0-9a-f]{2}$/i.test(p))) {
    throw new Error('invalid_mac_address');
  }
  return Buffer.from(parts.map(p => parseInt(p, 16)));
}

export interface SoundcraftNetworkInterface {
  name: string;
  address: string;
  netmask: string;
  mac: string;
}
export function findSoundcraftInterface(): SoundcraftNetworkInterface | null {
  // Never pick Ethernet just because it has Internet. Always choose the SOM subnet.
  const all = networkInterfaces();
  const available: SoundcraftNetworkInterface[] = [];
  for (const [name, entries] of Object.entries(all)) {
    for (const entry of entries || []) {
      if (entry.family !== 'IPv4' || entry.internal || !entry.address.startsWith('192.168.0.')) continue;
      available.push({ name, address: entry.address, netmask: entry.netmask, mac: entry.mac });
    }
  }
  return available.find(n => n.address === SOUNDCRAFT_INDUSTRIAL.preferredWifiIp) ||
    available.find(n => n.netmask === '255.255.255.0' &&
      n.address !== SOUNDCRAFT_INDUSTRIAL.consoleIp) || null;
}

export function buildHiqnetDiscoQuery(input: SoundcraftNetworkInterface): Buffer {
  // HiQnet DiscoInfo(Q) contains our route: device id, cost, serial number,
  // max message, keepalive, network ID and network interface information.
  const mac = macBuffer(input.mac);
  const serial = Buffer.concat([Buffer.alloc(10), mac]);
  const payload = Buffer.alloc(2 + 1 + 2 + serial.length + 4 + 2 + 1 + 6 + 1 + 4 + 4 + 4);
  let o = 0;
  payload.writeUInt16BE(SOUNDCRAFT_INDUSTRIAL.consoleHiqnetAddress, o); o += 2;
  payload.writeUInt8(0, o); o += 1;           // Route cost
  payload.writeUInt16BE(16, o); o += 2;
  serial.copy(payload, o); o += serial.length;
  payload.writeUInt32BE(4096, o); o += 4;
  payload.writeUInt16BE(10000, o); o += 2;
  payload.writeUInt8(1, o); o += 1;           // Network ID: TCP/IP
  mac.copy(payload, o); o += 6;
  payload.writeUInt8(1, o); o += 1;           // DHCP flag
  ipv4Buffer(input.address).copy(payload, o); o += 4;
  ipv4Buffer(input.netmask).copy(payload, o); o += 4;
  ipv4Buffer('0.0.0.0').copy(payload, o);
  return encodeHiqnetHeader({
    sourceDevice: SOUNDCRAFT_INDUSTRIAL.localHiqnetAddress,
    destinationDevice: SOUNDCRAFT_INDUSTRIAL.consoleHiqnetAddress,
    messageId: 0x0000,
    payload
  });
}

export interface SoundcraftProbe {
  stage: 'interface-missing' | 'port-busy' | 'network-timeout' | 'hiqnet-received';
  consoleIp: string;
  wifiIp: string | null;
  wifiInterface: string | null;
  reachable: boolean;
  controlCertified: false;
  packetsReceived: number;
  consoleDeviceId?: number;
  consoleMacVerified?: boolean;
  tcpFromConsole?: boolean;
  explanation: string;
}

/** On-demand, time-bounded discovery. Read only, no periodic broadcast or control messages. */
export async function probeSoundcraftSi(timeoutMs = 2600): Promise<SoundcraftProbe> {
  const wifi = findSoundcraftInterface();
  const base: Omit<SoundcraftProbe, 'stage' | 'reachable' | 'packetsReceived' | 'explanation'> = {
    consoleIp: SOUNDCRAFT_INDUSTRIAL.consoleIp,
    wifiIp: wifi?.address || null,
    wifiInterface: wifi?.name || null,
    controlCertified: false
  };
  if (!wifi) return {
    ...base, stage: 'interface-missing', reachable: false, packetsReceived: 0,
    explanation: 'Wi-Fi SOM não encontrada; confira o adaptador 192.168.0.158.'
  };
  let udp = createSocket('udp4');
  let tcpConnection = false;
  let packetsReceived = 0;
  let matched = false;
  let claimedDevice: number | undefined;
  let server;
  try {
    // Soundcraft establishes TCP connections back to the controlling application.
    // Limit the listening interface to Wi-Fi SOM; never open 3804 on the Internet-facing Ethernet.
    server = createServer(socket => {
      if (socket.remoteAddress === SOUNDCRAFT_INDUSTRIAL.consoleIp ||
        socket.remoteAddress === '::ffff:' + SOUNDCRAFT_INDUSTRIAL.consoleIp) {
        tcpConnection = true;
      }
      socket.destroy(); // Diagnostic only: do not negotiate control yet.
    });
    await new Promise<void>((resolve, reject) => {
      server!.once('error', reject);
      server!.listen(SOUNDCRAFT_INDUSTRIAL.port, wifi.address, () => {
        server!.off('error', reject);
        resolve();
      });
    });
    await new Promise<void>((resolve, reject) => {
      udp.once('error', reject);
      udp.bind(SOUNDCRAFT_INDUSTRIAL.port, wifi.address, () => {
        udp.off('error', reject);
        resolve();
      });
    });
    udp.setBroadcast(true);
    udp.on('message', (buffer, rinfo) => {
      if (rinfo.address !== SOUNDCRAFT_INDUSTRIAL.consoleIp) return;
      try {
        const header = decodeHiqnetHeader(buffer);
        packetsReceived += 1;
        if (header.sourceDevice === SOUNDCRAFT_INDUSTRIAL.consoleHiqnetAddress) {
          matched = true;
          claimedDevice = header.sourceDevice;
        }
      } catch { /* Ignore unrelated traffic */ }
    });
    const query = buildHiqnetDiscoQuery(wifi);
    await new Promise<void>((resolve, reject) => {
      udp.send(query, SOUNDCRAFT_INDUSTRIAL.port, '192.168.0.255', error => error ? reject(error) : resolve());
    });
    await new Promise(resolve => setTimeout(resolve, timeoutMs));
    return {
      ...base,
      stage: matched ? 'hiqnet-received' : 'network-timeout',
      reachable: matched, packetsReceived,
      consoleDeviceId: claimedDevice,
      tcpFromConsole: tcpConnection,
      explanation: matched
        ? 'HiQnet recebido no Wi-Fi SOM; leitura de parâmetros e controle ainda exigem homologação.'
        : 'Sem resposta HiQnet: confira firewall Windows, autorização HiQnet 1337 e Wi-Fi SOM.'
    };
  } catch (error) {
    return {
      ...base, stage: 'port-busy', reachable: false, packetsReceived,
      explanation: error instanceof Error ? error.message : 'Não foi possível iniciar descoberta HiQnet.'
    };
  } finally {
    udp.close();
    if (server?.listening) await new Promise<void>(resolve => server!.close(() => resolve()));
  }
}
