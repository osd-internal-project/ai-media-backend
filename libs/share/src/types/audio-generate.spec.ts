import { validateAudioRequest } from './audio-generate';

const valid = { prompt: 'a calm voice says hello', format: 'mp3' as const };

describe('validateAudioRequest', () => {
  it('accepts a minimal request', () => {
    expect(validateAudioRequest(valid)).toBeNull();
  });

  it('accepts TOS keys, http urls and speaker ids as references', () => {
    expect(
      validateAudioRequest({
        ...valid,
        references: [
          { url: 'org/project/upload/voice.mp3' },
          { url: 'https://cdn.example.com/a.wav' },
          { speaker: 'zh_female_1' },
        ],
      }),
    ).toBeNull();
  });

  it.each([
    [{ ...valid, prompt: '  ' }, 'prompt is required'],
    [
      { ...valid, prompt: 'x'.repeat(3001) },
      'prompt must be at most 3000 characters',
    ],
    [{ ...valid, format: 'pcm' }, 'format must be one of mp3, wav, ogg_opus'],
    [
      { ...valid, references: [{}, {}, {}, {}] },
      'at most 3 audio references',
    ],
    [
      { ...valid, references: [{ url: 'a.mp3', speaker: 'x' }] },
      'reference 1 needs exactly one of url or speaker',
    ],
    [
      { ...valid, references: [{ url: 'asset://abc' }] },
      'reference 1 url must be http(s)',
    ],
    [
      { ...valid, references: [{ speaker: 'x' }], image: ['a.png'] },
      'use either audio references or a reference image, not both',
    ],
    [{ ...valid, image: ['a.png', 'b.png'] }, 'at most 1 reference image'],
    [{ ...valid, sampleRate: 0 }, 'sampleRate must be a positive integer'],
    [
      { ...valid, pitchRate: Number.NaN },
      'speechRate, loudnessRate and pitchRate must be numbers',
    ],
  ])('rejects case %#', (body, message) => {
    expect(validateAudioRequest(body as never)).toBe(message);
  });
});
