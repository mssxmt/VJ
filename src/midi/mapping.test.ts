import { describe, it, expect } from 'vitest'
import { parseMidiMessage, mappingKey, serializeMappings, deserializeMappings } from './mapping'

describe('parseMidiMessage', () => {
  it('parses control change', () => {
    // 0xB0 = CC on channel 0; controller 7; value 64
    expect(parseMidiMessage(new Uint8Array([0xb0, 7, 64]))).toEqual({
      type: 'cc',
      channel: 0,
      controller: 7,
      value01: 64 / 127,
    })
  })
  it('parses note on with velocity', () => {
    expect(parseMidiMessage(new Uint8Array([0x91, 60, 127]))).toEqual({
      type: 'note',
      channel: 1,
      note: 60,
      value01: 1,
    })
  })
  it('treats note-on velocity 0 as note-off (null)', () => {
    expect(parseMidiMessage(new Uint8Array([0x90, 60, 0]))).toBeNull()
  })
  it('ignores unrelated messages', () => {
    expect(parseMidiMessage(new Uint8Array([0xf8]))).toBeNull() // clock
  })
})

describe('mapping persistence', () => {
  it('round-trips through JSON', () => {
    const m = new Map([
      [mappingKey({ type: 'cc', channel: 0, controller: 7, value01: 0 }), 'effects.glitch'],
    ])
    expect(deserializeMappings(serializeMappings(m))).toEqual(m)
  })
})
