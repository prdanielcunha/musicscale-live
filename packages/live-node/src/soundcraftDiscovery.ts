/**
 * Passive diagnostic for Soundcraft Si HiQnet network discovery.
 * The Si family announces/responds to UDP discovery and initiates TCP to the
 * controller; a TCP client to the console alone is not a valid connection test.
 * Strictly no param writes, scene recalls, resync or other audio commands.
 */
import { createSocket, type Socket as UdpSocket } from 'node:dgram';
import { createServer, type Server, type Socket } from 'node:net';
import { networkInterfaces } from 'node:os';
import { decodeHiqnet } from './soundcraftHiqnet';

const HIQNET_PORT = 3804;
const READ_TIMEOUT_MS = 6000;
const MAX_BYTES = 65536;

export interface SoundcraftDiscoveryResult {
  targetIp: string;
  consoleAddress: number;
  clientAddress: number;
  adapterIp: string | null;
  adapterMask: string | null;
  udpFrameSeen: boolean;
  tcpConsoleConnected: boolean;
  hiqnetFrameConfirmed: boolean;
  lastMessageId: number | null;
  reason: string;
  physicalVerificationRequired: true;
  audioWriteAvailable: false;
}

function octets(s: string): number[] {
  const p = s.split('.');
  if (p.length !== 4 || p.some(x => !/^\d{1,3}$/.test(x) || Number(x) > 255)) throw new Error('invalid_ipv4');
  return p.map(Number);
}
export function sameSubnet(a: string, b: string, mask: string): boolean {
  const aa = octets(a), bb = octets(b), mm = octets(mask);
  return aa.every((x,i) => ((x & mm[i]!) === (bb[i]! & mm[i]!)));
}
export function subnetBroadcast(address: string, mask: string): string {
  const aa = octets(address), mm = octets(mask);
  return aa.map((x,i) => (x | (255 - mm[i]!))).join('.');
}
export function findMixerAdapter(target: string): { address: string; mask: string; mac: string } | null {
  const candidates: Array<{address:string;mask:string;mac:string}> = [];
  for (const adapters of Object.values(networkInterfaces())) {
    for (const net of adapters || []) {
      if (net.family !== 'IPv4' || net.internal || !net.netmask) continue;
      try {
        if (sameSubnet(net.address, target, net.netmask))
          candidates.push({ address: net.address, mask: net.netmask, mac: net.mac });
      } catch { /* malformed OS interface */ }
    }
  }
  return candidates.find(x => x.address.startsWith('192.168.0.')) || candidates[0] || null;
}
export function buildDiscoQuery(input: {
  clientAddress: number;
  localIp: string;
  localMask: string;
  localMac: string;
  sequence?: number;
}): Buffer {
  const { clientAddress, localIp, localMask, localMac } = input;
  if (!Number.isInteger(clientAddress) || clientAddress < 1 || clientAddress > 65534) {
    throw new Error('invalid_hiqnet_client_address');
  }
  const mac = Buffer.from(localMac.replace(/[:-]/g, ''), 'hex');
  if (mac.length !== 6) throw new Error('invalid_hiqnet_mac');
  const payload = Buffer.alloc(2+1+2+16+4+2+1+6+1+4+4+4);
  let offset = 0;
  payload.writeUInt16BE(clientAddress, offset); offset += 2;
  payload[offset++] = 1; // cost
  payload.writeUInt16BE(16, offset); offset += 2;
  payload.write('MusicScaleLive', offset, 'ascii'); offset += 16;
  payload.writeUInt32BE(65535, offset); offset += 4;
  payload.writeUInt16BE(10000, offset); offset += 2;
  payload[offset++] = 1; // NetworkInfo ID TCP/IP
  mac.copy(payload, offset); offset += 6;
  payload[offset++] = 1; // DHCP capability, informational
  for (const ip of [localIp, localMask, '0.0.0.0']) {
    for (const n of octets(ip)) payload[offset++] = n;
  }
  const frame = Buffer.alloc(25 + payload.length);
  frame[0] = 2;
  frame[1] = 25;
  frame.writeUInt32BE(frame.length, 2);
  frame.writeUInt16BE(clientAddress, 6);
  frame.writeUInt16BE(65535, 12);
  frame.writeUInt16BE(0, 18); // DiscoInfo Query
  frame.writeUInt16BE(0, 20); // UDP discovery, no guaranteed flag
  frame[22] = 5;
  frame.writeUInt16BE((input.sequence || 0) & 0xffff, 23);
  payload.copy(frame, 25);
  return frame;
}

export class SoundcraftDiscovery {
  private udp: UdpSocket | null = null;
  private tcp: Server | null = null;
  private clientSockets = new Set<Socket>();
  private last: SoundcraftDiscoveryResult | null = null;
  private busy = false;

  snapshot(): SoundcraftDiscoveryResult | null { return this.last; }

  async close() {
    this.busy = false;
    for (const socket of this.clientSockets) socket.destroy();
    this.clientSockets.clear();
    const tcp = this.tcp, udp = this.udp;
    this.tcp = null;
    this.udp = null;
    await Promise.all([
      new Promise<void>(resolve => { if (tcp?.listening) tcp.close(() => resolve()); else resolve(); }),
      new Promise<void>(resolve => { if (udp) { try { udp.close(() => resolve()); } catch { resolve(); } } else resolve(); })
    ]);
  }

  async inspect(targetIp: string, consoleAddress: number, clientAddress = 24501): Promise<SoundcraftDiscoveryResult> {
    octets(targetIp);
    if (!Number.isInteger(consoleAddress) || consoleAddress < 1 || consoleAddress > 65534 ||
        clientAddress === consoleAddress) throw new Error('invalid_hiqnet_device');
    if (this.busy) throw new Error('soundcraft_probe_running');
    await this.close();
    this.busy = true;
    const adapter = findMixerAdapter(targetIp);
    const result: SoundcraftDiscoveryResult = {
      targetIp, consoleAddress, clientAddress,
      adapterIp: adapter?.address || null,
      adapterMask: adapter?.mask || null,
      udpFrameSeen: false, tcpConsoleConnected: false, hiqnetFrameConfirmed: false,
      lastMessageId: null,
      reason: adapter ? 'Nenhuma resposta HiQnet válida recebida ainda.' :
        'Nenhum adaptador do computador está na mesma sub-rede da mesa.',
      physicalVerificationRequired: true,
      audioWriteAvailable: false
    };
    this.last = result;
    if (!adapter) { this.busy = false; return result; }
    try {
      // Bind on the console-facing interface. Never claim success just because
      // the TCP listener started or a UDP datagram was transmitted.
      const tcp = createServer(socket => {
        if (socket.remoteAddress !== targetIp && socket.remoteAddress !== '::ffff:' + targetIp) {
          socket.destroy(); return;
        }
        result.tcpConsoleConnected = true;
        this.clientSockets.add(socket);
        let buffer = Buffer.alloc(0);
        socket.setTimeout(3500, () => socket.destroy());
        socket.on('data', data => {
          if (buffer.length + data.length > MAX_BYTES) { socket.destroy(); return; }
          buffer = Buffer.concat([buffer,data]);
          while (buffer.length >= 25) {
            if (buffer[0] !== 2) { socket.destroy(); return; }
            const size = buffer.readUInt32BE(2);
            if (size < 25 || size > MAX_BYTES) { socket.destroy(); return; }
            if (buffer.length < size) break;
            const frameBytes = buffer.subarray(0, size);
            buffer = buffer.subarray(size);
            try {
              const frame = decodeHiqnet(frameBytes);
              if (frame.sourceDevice !== consoleAddress || frame.destDevice !== clientAddress) continue;
              result.lastMessageId = frame.message;
              result.hiqnetFrameConfirmed = true;
              result.reason = 'HiQnet identificado em TCP reverso. Somente diagnóstico, nenhum áudio alterado.';
            } catch { /* ignore unauthenticated or malformed packets */ }
          }
        });
        socket.on('close', () => this.clientSockets.delete(socket));
        socket.on('error', () => socket.destroy());
      });
      this.tcp = tcp;
      await new Promise<void>((resolve,reject)=>{
        tcp.once('error', reject);
        tcp.listen(HIQNET_PORT, adapter.address, resolve);
      });
      const udp = createSocket({ type:'udp4', reuseAddr:true });
      this.udp = udp;
      udp.on('message',(data,info)=>{
        if (info.address !== targetIp) return;
        try {
          const frame = decodeHiqnet(data);
          if (frame.sourceDevice !== consoleAddress || frame.message !== 0) return;
          result.udpFrameSeen = true;
          result.reason = 'Mesa respondeu ao UDP. Aguardando a conexão TCP reversa.';
        } catch { /* malformed unsolicited broadcast */ }
      });
      udp.on('error',()=>undefined);
      await new Promise<void>((resolve,reject)=>{
        udp.once('error',reject);
        udp.bind(HIQNET_PORT, adapter.address,resolve);
      });
      udp.setBroadcast(true);
      const query = buildDiscoQuery({
        clientAddress, localIp: adapter.address,
        localMask:adapter.mask,localMac:adapter.mac
      });
      const broadcast = subnetBroadcast(adapter.address,adapter.mask);
      await new Promise<void>((resolve,reject)=>{
        udp.send(query,HIQNET_PORT,broadcast,error=>error?reject(error):resolve());
      });
      await new Promise(resolve=>setTimeout(resolve,READ_TIMEOUT_MS));
      if (!result.hiqnetFrameConfirmed) {
        result.reason = result.tcpConsoleConnected
          ? 'A mesa conectou por TCP, mas não confirmou uma mensagem HiQnet válida.'
          : result.udpFrameSeen
            ? 'Mesa vista em UDP; falta a sessão TCP de retorno. Confira firewall 3804/TCP.'
            : 'Sem resposta HiQnet. Confira Wi-Fi do PC, firewall e endereço autorizado.';
      }
      this.last = {...result};
      return {...result};
    } catch (error) {
      result.reason = 'Diagnóstico não concluído: ' + (error instanceof Error ? error.message : 'erro de rede');
      return {...result};
    } finally {
      await this.close();
      this.last = {...result};
    }
  }
}
