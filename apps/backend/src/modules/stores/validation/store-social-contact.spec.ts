import { type ClassConstructor, plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { BadRequestException } from '@nestjs/common';
import { CreateStoreDto } from '../dtos/create-store.dto';
import { UpdateStoreDto } from '../dtos/update-store.dto';
import { EntrepreneurStoreDto } from '../../../auth/dto/register-entrepreneur.dto';
import {
  normalizeSocialValue,
  normalizeStoreSocialContact,
  type SocialField,
} from './store-social-contact';

export const invalidSocialContacts: [SocialField, unknown][] = [
  ['instagramUrl', 'http://instagram.com/local/'],
  ['instagramUrl', 'https://instagram.com.attacker.test/local/'],
  ['instagramUrl', 'https://instagram.com@attacker.test/local/'],
  ['instagramUrl', 'https://user:password@instagram.com/local/'],
  ['instagramUrl', 'https://instagram.com:443/local/'],
  ['instagramUrl', 'https://instagram.com./local/'],
  ['instagramUrl', 'https://instagram.com/local/?next=https://attacker.test'],
  ['instagramUrl', 'https://instagram.com/local/#bio'],
  ['instagramUrl', 'https://instagram.com/p/123'],
  ['instagramUrl', 'https://instagram.com/reels/'],
  ['instagramUrl', 'https://instagram.com/%70/'],
  ['instagramUrl', 'https://instagram.com/a/../local/'],
  ['instagramUrl', 'https://instagram.com/a\\local/'],
  ['instagramUrl', 'https://instagram.com/a\nlocal/'],
  ['instagramUrl', 'https://instagram.com/a..b/'],
  ['instagramUrl', `https://instagram.com/${'a'.repeat(31)}/`],
  ['instagramUrl', 'javascript:alert(1)'],
  ['instagramUrl', 42],
  ['instagramUrl', ''],
  ['facebookUrl', 'https://facebook.com/l.php?u=https://attacker.test'],
  ['facebookUrl', 'https://facebook.com/login/'],
  ['facebookUrl', 'https://facebook.com/profile.php?id=123&next=evil'],
  ['facebookUrl', 'https://facebook.com/profile.php?id=123&id=456'],
  ['facebookUrl', 'https://facebook.com/profile.php?id=0'],
  ['facebookUrl', 'https://facebook.com/profile.php?id=abc'],
  ['facebookUrl', 'https://facebook.com/local?tracking=1'],
  ['facebookUrl', 'https://facebook.com.attacker.test/local'],
  ['facebookUrl', 'https://facebook.com:8443/local'],
  ['facebookUrl', 'https://facebook.com/groups/123'],
  ['facebookUrl', 'https://facebook.com/something.php'],
  ['facebookUrl', { url: 'https://facebook.com/local' }],
  ['whatsappComercial', '8888-8888'],
  ['whatsappComercial', '0050688888888'],
  ['whatsappComercial', '+0050688888888'],
  ['whatsappComercial', 'https://wa.me/50688888888'],
  ['whatsappComercial', '50688888888ext1'],
  ['whatsappComercial', '++50688888888'],
  ['whatsappComercial', '1'.repeat(16)],
  ['whatsappComercial', '1234567'],
  ['whatsappComercial', 50688888888],
];

describe('Store commercial contact validation and canonicalization', () => {
  it.each([
    [
      'instagramUrl',
      'https://instagram.com/negocio_local',
      'https://www.instagram.com/negocio_local/',
    ],
    [
      'instagramUrl',
      'HTTPS://WWW.INSTAGRAM.COM/local.1/',
      'https://www.instagram.com/local.1/',
    ],
    [
      'facebookUrl',
      'https://facebook.com/Negocio.Local',
      'https://www.facebook.com/Negocio.Local/',
    ],
    [
      'facebookUrl',
      'https://facebook.com/profile.php?id=123456',
      'https://www.facebook.com/profile.php?id=123456',
    ],
    ['whatsappComercial', '+506 8888-8888', '50688888888'],
    ['whatsappComercial', '50688888888', '50688888888'],
  ] as [SocialField, string, string][])(
    'normalizes %s: %s',
    (field, value, expected) => {
      expect(normalizeSocialValue(field, value)).toBe(expected);
    },
  );
  it.each(invalidSocialContacts)(
    'rejects %s %# without reflecting unsafe input',
    (field, value) => {
      expect(normalizeSocialValue(field, value)).toBeUndefined();
      expect(() => normalizeStoreSocialContact({ [field]: value })).toThrow(
        BadRequestException,
      );
    },
  );
  it('keeps omission and null distinct and never derives WhatsApp', () => {
    expect(normalizeStoreSocialContact({ instagramUrl: undefined })).toEqual(
      {},
    );
    expect(normalizeStoreSocialContact({ instagramUrl: null })).toEqual({
      instagramUrl: null,
    });
    expect(normalizeStoreSocialContact({})).not.toHaveProperty(
      'whatsappComercial',
    );
  });
  it.each([CreateStoreDto, UpdateStoreDto, EntrepreneurStoreDto])(
    'inherits optional validation into %s',
    (Dto) => {
      const fields = {
        nombre: 'Negocio',
        direccion: 'Nicoya',
        ...(Dto === CreateStoreDto ? { idEmprendedor: 1 } : {}),
      };
      for (const contact of [
        {},
        { instagramUrl: null, facebookUrl: null, whatsappComercial: null },
        {
          instagramUrl: 'https://instagram.com/local/',
          whatsappComercial: '+506 8888-8888',
        },
      ]) {
        expect(
          validateSync(
            plainToInstance(Dto as ClassConstructor<object>, {
              ...fields,
              ...contact,
            }),
          ),
        ).toEqual([]);
      }
      const errors = validateSync(
        plainToInstance(Dto as ClassConstructor<object>, {
          ...fields,
          facebookUrl: 'https://attacker.test/',
        }),
      );
      expect(errors.map((error) => error.property)).toContain('facebookUrl');
    },
  );
});
