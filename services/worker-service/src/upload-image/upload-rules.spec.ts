import { toUploadGenerateType } from './upload-rules';

describe('toUploadGenerateType', () => {
  it.each([
    ['image', 'image'],
    ['video', 'video'],
    ['audio', 'audio'],
    ['omnihumen', 'image'],
    [undefined, 'image'],
  ])('%s → %s', (input, expected) => {
    expect(toUploadGenerateType(input)).toBe(expected);
  });
});
