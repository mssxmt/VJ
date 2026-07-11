export interface MidiMsg {
  type: 'cc' | 'note'
  channel: number
  controller?: number
  note?: number
  value01: number
}

/** Parse a raw MIDI message into a normalized control event, or null if irrelevant. */
export function parseMidiMessage(data: Uint8Array): MidiMsg | null {
  if (data.length < 3) return null
  const status = data[0] & 0xf0
  const channel = data[0] & 0x0f
  if (status === 0xb0) return { type: 'cc', channel, controller: data[1], value01: data[2] / 127 }
  if (status === 0x90 && data[2] > 0) {
    return { type: 'note', channel, note: data[1], value01: data[2] / 127 }
  }
  return null
}

/** Stable key identifying a physical control, e.g. "cc:0:7" or "note:1:60". */
export function mappingKey(msg: MidiMsg): string {
  return msg.type === 'cc' ? `cc:${msg.channel}:${msg.controller}` : `note:${msg.channel}:${msg.note}`
}

export function serializeMappings(m: Map<string, string>): string {
  return JSON.stringify(Object.fromEntries(m))
}

export function deserializeMappings(json: string): Map<string, string> {
  try {
    return new Map(Object.entries(JSON.parse(json) as Record<string, string>))
  } catch {
    return new Map()
  }
}
