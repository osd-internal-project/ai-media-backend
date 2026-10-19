import {
  isAllowedUpload,
  isExtensionAllowed,
  toUploadGenerateType,
} from './upload-rules';

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

describe('m4a from macOS browsers (audio/x-m4a)', () => {
  it('is an allowed audio upload', () => {
    expect(isAllowedUpload('audio/x-m4a', 1024)).toBe(true);
  });

  it('accepts only the .m4a extension', () => {
    expect(isExtensionAllowed('audio/x-m4a', '.m4a')).toBe(true);
    expect(isExtensionAllowed('audio/x-m4a', '.html')).toBe(false);
  });
});
