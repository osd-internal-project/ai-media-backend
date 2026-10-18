import { planParents } from './workflow-capabilities';

describe('planParents', () => {
  it('allows any model when there is no parent', () => {
    expect(planParents(undefined, [], 3)).toEqual({ ok: true, mode: 'reference' });
  });

  it('sends image parents to seedream as references', () => {
    expect(planParents('seedream1', ['image'], 2)).toEqual({
      ok: true,
      mode: 'reference',
    });
  });

  it('rejects a video parent on an image model', () => {
    expect(planParents('seedream2', ['video'], 0)).toMatchObject({ ok: false });
  });

  it('rejects a video parent on seedance1 (frames only)', () => {
    expect(planParents('seedance1', ['video'], 0)).toMatchObject({ ok: false });
  });

  it('uses frames for seedance1 and caps at first + last', () => {
    expect(planParents('seedance1', ['image'], 1)).toEqual({
      ok: true,
      mode: 'frames',
    });
    expect(planParents('seedance1', ['image', 'image'], 1)).toMatchObject({
      ok: false,
    });
  });

  it('uses frames for seedance2 with image-only parents and no uploads', () => {
    expect(planParents('seedance2', ['image'], 0)).toEqual({
      ok: true,
      mode: 'frames',
    });
  });

  it('switches seedance2 to references when a video parent or upload is present', () => {
    expect(planParents('seedance2', ['image', 'video'], 0)).toEqual({
      ok: true,
      mode: 'reference',
    });
    expect(planParents('seedance2', ['image'], 1)).toEqual({
      ok: true,
      mode: 'reference',
    });
  });

  it('rejects more inputs than the model allows', () => {
    expect(planParents('seedream1', ['image', 'image'], 7)).toMatchObject({
      ok: false,
    });
  });

  it('rejects parents for a model without a known capability', () => {
    expect(planParents('omnihuman', ['image'], 0)).toMatchObject({ ok: false });
  });
});
