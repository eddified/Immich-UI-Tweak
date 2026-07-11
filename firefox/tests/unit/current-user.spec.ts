import { describe, expect, it } from 'vitest';
import {
  parseCurrentUserIdFromMeJson,
  parseUserIdFromProfileImageUrl,
} from '../../src/shared/immich-user';

describe('parseUserIdFromProfileImageUrl', () => {
  it('extracts uuid from absolute profile-image path', () => {
    expect(
      parseUserIdFromProfileImageUrl(
        'https://demo.immich.app/api/users/3604f14f-ab23-4aee-a6d5-92a15d8f5b2c/profile-image?updatedAt=1',
      ),
    ).toBe('3604f14f-ab23-4aee-a6d5-92a15d8f5b2c');
  });

  it('resolves relative src against base', () => {
    expect(
      parseUserIdFromProfileImageUrl(
        '/api/users/AAAAAAAA-BBBB-CCCC-DDDD-EEEEEEEEEEEE/profile-image',
        'https://x.example/photos',
      ),
    ).toBe('aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee');
  });
});

describe('parseCurrentUserIdFromMeJson', () => {
  it('uses parseUserJson when name is present', () => {
    expect(
      parseCurrentUserIdFromMeJson({
        id: 'u1',
        name: 'Me',
        profileImagePath: '',
        avatarColor: 'gray',
      }),
    ).toBe('u1');
  });

  it('falls back to id in data wrapper', () => {
    expect(parseCurrentUserIdFromMeJson({ data: { id: '0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f' } })).toBe(
      '0f0f0f0f-0f0f-4f0f-8f0f-0f0f0f0f0f0f',
    );
  });
});
